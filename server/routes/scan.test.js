import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import * as tar from 'tar';
import scanRouter from './scan.js';
import { liftRepoInventory, applyBaselinePaths } from '../lib/decompose/repoDecomposer.js';

// Router in einer frischen App auf einem Ephemeral-Port hochziehen — testet die
// echte Middleware-Kette inkl. Multer, ohne den Produktions-Server zu starten.
async function withScanServer(fn) {
  const app = express();
  app.use(express.json());
  app.use('/api/scan', scanRouter);
  const server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    await fn(base);
  } finally {
    await new Promise(resolve => server.close(resolve));
  }
}

// --- Quota-Bremse Task 2: gemeinsame Helfer für die 3 isDailyQuota→429-Tests ---
// Kein echter Netzwerk-Call zu Gemini/GitHub: global.fetch wird nur für die
// jeweilige Ziel-URL abgefangen, alles andere läuft über die echte fetch-Referenz.

const DAILY_QUOTA_BODY = {
  error: {
    message: 'Resource has been exhausted (e.g. check quota).',
    details: [{
      '@type': 'type.googleapis.com/google.rpc.QuotaFailure',
      violations: [{ quotaId: 'GenerateRequestsPerDayPerProjectPerModel-FreeTier' }],
    }],
  },
};

function stubGeminiDailyQuota(prevFetch, extra = () => null) {
  return async (url, opts) => {
    const u = String(url);
    if (u.includes('generativelanguage.googleapis.com')) {
      return { ok: false, status: 429, json: async () => DAILY_QUOTA_BODY };
    }
    const viaExtra = await extra(u, opts);
    if (viaExtra) return viaExtra;
    return prevFetch(url, opts);
  };
}

// Lokaler HTTP-Server statt echter Internet-Domain — deterministisch, kein
// Netzwerk-Flakiness (Muster analog withScanServer).
async function withLocalHtmlServer(html, fn) {
  const server = http.createServer((req, res) => {
    res.writeHead(200, { 'content-type': 'text/html' });
    res.end(html);
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const url = `http://127.0.0.1:${server.address().port}/`;
  try {
    await fn(url);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

// Winzige echte .tar.gz-Fixture (node-tar ist bereits Projekt-Dependency) statt
// eines echten codeload.github.com-Downloads.
function buildFixtureTarball() {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'designbridge-test-repo-'));
  const repoDir = path.join(tmp, 'repo-main');
  fs.mkdirSync(path.join(repoDir, 'components', 'ui'), { recursive: true });
  fs.writeFileSync(path.join(repoDir, 'components', 'ui', 'button.tsx'), 'export const Button = () => <button />;');
  const outFile = path.join(tmp, 'out.tar.gz');
  tar.c({ gzip: true, cwd: tmp, sync: true, file: outFile }, ['repo-main']);
  return fs.readFileSync(outFile);
}

test('POST /api/scan/image mit Nicht-Bild antwortet 400 + JSON (kein HTML-500)', async () => {
  await withScanServer(async base => {
    const form = new FormData();
    form.append('image', new Blob(['%PDF-1.4 dummy'], { type: 'application/pdf' }), 'report.pdf');

    const res = await fetch(`${base}/api/scan/image`, { method: 'POST', body: form });

    assert.equal(res.status, 400);
    assert.match(res.headers.get('content-type') ?? '', /application\/json/);
    const data = await res.json();
    assert.match(data.error, /Only PNG, JPG and WebP/);
  });
});

test('POST /api/scan/image ohne API-Key + ohne DEMO_FALLBACK → 503 mit deutscher Meldung (kein roher SDK-Fehler)', async () => {
  const prevKey = process.env.ANTHROPIC_API_KEY;
  const prevDemo = process.env.DEMO_FALLBACK;
  delete process.env.ANTHROPIC_API_KEY;
  delete process.env.DEMO_FALLBACK;
  try {
    await withScanServer(async base => {
      const form = new FormData();
      form.append('image', new Blob([Uint8Array.from([0x89, 0x50, 0x4e, 0x47])], { type: 'image/png' }), 'shot.png');

      const res = await fetch(`${base}/api/scan/image`, { method: 'POST', body: form });

      assert.equal(res.status, 503);
      assert.match(res.headers.get('content-type') ?? '', /application\/json/);
      const data = await res.json();
      assert.match(data.error, /ANTHROPIC_API_KEY/);
      assert.doesNotMatch(data.error, /Could not resolve authentication/);
    });
  } finally {
    if (prevKey !== undefined) process.env.ANTHROPIC_API_KEY = prevKey;
    if (prevDemo !== undefined) process.env.DEMO_FALLBACK = prevDemo;
  }
});

test('POST /api/scan/image mit DEMO_FALLBACK=1 ohne API-Key → demo:true + meta.model demo-fixture (nie unmarkierte Konserven)', async () => {
  const prevAnthropic = process.env.ANTHROPIC_API_KEY;
  const prevGemini = process.env.GEMINI_API_KEY;
  const prevDemo = process.env.DEMO_FALLBACK;
  delete process.env.ANTHROPIC_API_KEY;
  delete process.env.GEMINI_API_KEY;
  process.env.DEMO_FALLBACK = '1';
  try {
    await withScanServer(async base => {
      const form = new FormData();
      form.append('image', new Blob([Uint8Array.from([0x89, 0x50, 0x4e, 0x47])], { type: 'image/png' }), 'shot.png');

      const res = await fetch(`${base}/api/scan/image`, { method: 'POST', body: form });

      assert.equal(res.status, 200);
      const data = await res.json();
      assert.equal(data.meta.demo, true);
      assert.equal(data.meta.model, 'demo-fixture');
      assert.equal(data.meta.fallback, true);
    });
  } finally {
    if (prevAnthropic !== undefined) process.env.ANTHROPIC_API_KEY = prevAnthropic;
    if (prevGemini !== undefined) process.env.GEMINI_API_KEY = prevGemini;
    if (prevDemo !== undefined) process.env.DEMO_FALLBACK = prevDemo; else delete process.env.DEMO_FALLBACK;
  }
});

test('liftRepoInventory hebt Scan-Inventar-Code (Verdrahtung /repo)', async () => {
  const files = [{ path: 'src/components/ui/button.tsx', content: 'export const Button=()=><button/>;' }];
  const inv = [{ name: 'Button', path: 'src/components/ui/button.tsx', source: 'rules' }];
  await liftRepoInventory(files, inv);
  assert.equal(inv[0].sourceCode, files[0].content);
  assert.equal(inv[0].lang, 'tsx');
});

test('applyBaselinePaths mappt path per Name zurück → KI-merged Items behalten Code (FF1)', async () => {
  // deepenRepoWithAi liefert Items OHNE path (Schema kennt kein path).
  const files = [{ path: 'src/ui/button.tsx', content: 'export const Button=()=><button/>;' }];
  const baseline = [{ name: 'Button', path: 'src/ui/button.tsx', source: 'rules' }];
  const merged = [{ name: 'Button', source: 'rules+ai', confidence: 'high' }];

  applyBaselinePaths(merged, baseline);
  await liftRepoInventory(files, merged);

  assert.equal(merged[0].path, 'src/ui/button.tsx');
  assert.equal(merged[0].sourceCode, files[0].content);
  assert.equal(merged[0].lang, 'tsx');
});

test('applyBaselinePaths lässt KI-ergänzte Items ohne Baseline-Match unberührt', () => {
  const merged = [{ name: 'FrischErfunden', source: 'ai' }];
  applyBaselinePaths(merged, [{ name: 'Button', path: 'src/ui/button.tsx' }]);
  assert.equal(merged[0].path, undefined);
});

test('applyBaselinePaths überschreibt einen bereits vorhandenen path nicht', () => {
  const merged = [{ name: 'Button', path: 'echter/pfad.tsx' }];
  applyBaselinePaths(merged, [{ name: 'Button', path: 'baseline/pfad.tsx' }]);
  assert.equal(merged[0].path, 'echter/pfad.tsx');
});

test('POST /api/scan/url mit toter Domain → 502 + deutsche Meldung ohne »fetch failed«', async () => {
  await withScanServer(async base => {
    const res = await fetch(`${base}/api/scan/url`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ url: 'https://diese-domain-gibt-es-nicht-xyz987.de' }),
    });

    assert.equal(res.status, 502);
    const body = await res.json();
    assert.match(body.error, /nicht erreichbar/);
    assert.doesNotMatch(body.error, /fetch failed/);
  });
});

// --- Quota-Bremse Task 2: isDailyQuota-Fehler → 429 + daily_quota:true ---

test('POST /api/scan/image: Gemini-Tages-Quota-429 → 429 + daily_quota:true (kein 500)', async () => {
  const prevAnthropic = process.env.ANTHROPIC_API_KEY;
  const prevGemini = process.env.GEMINI_API_KEY;
  const prevProvider = process.env.AI_PROVIDER;
  const prevDemo = process.env.DEMO_FALLBACK;
  const prevFetch = global.fetch;
  delete process.env.ANTHROPIC_API_KEY;
  process.env.GEMINI_API_KEY = 'fake-key';
  process.env.AI_PROVIDER = 'gemini';
  delete process.env.DEMO_FALLBACK;
  global.fetch = stubGeminiDailyQuota(prevFetch);
  try {
    await withScanServer(async base => {
      const form = new FormData();
      form.append('image', new Blob([Uint8Array.from([0x89, 0x50, 0x4e, 0x47])], { type: 'image/png' }), 'shot.png');

      const res = await fetch(`${base}/api/scan/image`, { method: 'POST', body: form });

      assert.equal(res.status, 429);
      const data = await res.json();
      assert.equal(data.daily_quota, true);
      assert.match(data.error, /Tages-Kontingent erschöpft/);
    });
  } finally {
    global.fetch = prevFetch;
    if (prevAnthropic !== undefined) process.env.ANTHROPIC_API_KEY = prevAnthropic;
    if (prevGemini !== undefined) process.env.GEMINI_API_KEY = prevGemini; else delete process.env.GEMINI_API_KEY;
    if (prevProvider !== undefined) process.env.AI_PROVIDER = prevProvider; else delete process.env.AI_PROVIDER;
    if (prevDemo !== undefined) process.env.DEMO_FALLBACK = prevDemo; else delete process.env.DEMO_FALLBACK;
  }
});

test('POST /api/scan/url/ai: Gemini-Tages-Quota-429 → 429 + daily_quota:true (kein 502)', async () => {
  const prevAnthropic = process.env.ANTHROPIC_API_KEY;
  const prevGemini = process.env.GEMINI_API_KEY;
  const prevProvider = process.env.AI_PROVIDER;
  const prevFetch = global.fetch;
  delete process.env.ANTHROPIC_API_KEY;
  process.env.GEMINI_API_KEY = 'fake-key';
  process.env.AI_PROVIDER = 'gemini';
  global.fetch = stubGeminiDailyQuota(prevFetch);
  try {
    await withLocalHtmlServer('<html><body><button>Klick</button></body></html>', async (siteUrl) => {
      await withScanServer(async base => {
        const res = await fetch(`${base}/api/scan/url/ai`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ url: siteUrl }),
        });

        assert.equal(res.status, 429);
        const data = await res.json();
        assert.equal(data.daily_quota, true);
        assert.match(data.error, /Tages-Kontingent erschöpft/);
      });
    });
  } finally {
    global.fetch = prevFetch;
    if (prevAnthropic !== undefined) process.env.ANTHROPIC_API_KEY = prevAnthropic;
    if (prevGemini !== undefined) process.env.GEMINI_API_KEY = prevGemini; else delete process.env.GEMINI_API_KEY;
    if (prevProvider !== undefined) process.env.AI_PROVIDER = prevProvider; else delete process.env.AI_PROVIDER;
  }
});

test('POST /api/scan/repo/ai: Gemini-Tages-Quota-429 → 429 + daily_quota:true (kein 502)', async () => {
  const prevAnthropic = process.env.ANTHROPIC_API_KEY;
  const prevGemini = process.env.GEMINI_API_KEY;
  const prevProvider = process.env.AI_PROVIDER;
  const prevFetch = global.fetch;
  delete process.env.ANTHROPIC_API_KEY;
  process.env.GEMINI_API_KEY = 'fake-key';
  process.env.AI_PROVIDER = 'gemini';
  const tarball = buildFixtureTarball();
  // branch explizit mitgeben → resolveDefaultBranch (GitHub-API) wird gar
  // nicht erst aufgerufen, nur der codeload-Tarball-Download muss gestubbt werden.
  global.fetch = stubGeminiDailyQuota(prevFetch, async (u) => {
    if (!u.includes('codeload.github.com')) return null;
    return {
      ok: true,
      status: 200,
      headers: { get: (h) => (h === 'content-length' ? String(tarball.length) : null) },
      arrayBuffer: async () => tarball,
    };
  });
  try {
    await withScanServer(async base => {
      const res = await fetch(`${base}/api/scan/repo/ai`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ url: 'https://github.com/testowner/testrepo', branch: 'main' }),
      });

      assert.equal(res.status, 429);
      const data = await res.json();
      assert.equal(data.daily_quota, true);
      assert.match(data.error, /Tages-Kontingent erschöpft/);
    });
  } finally {
    global.fetch = prevFetch;
    if (prevAnthropic !== undefined) process.env.ANTHROPIC_API_KEY = prevAnthropic;
    if (prevGemini !== undefined) process.env.GEMINI_API_KEY = prevGemini; else delete process.env.GEMINI_API_KEY;
    if (prevProvider !== undefined) process.env.AI_PROVIDER = prevProvider; else delete process.env.AI_PROVIDER;
  }
});
