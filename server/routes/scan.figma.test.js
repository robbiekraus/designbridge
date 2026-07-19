import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import scanRouter, { figmaStatusHandler } from './scan.js';

// Router in einer frischen App auf einem Ephemeral-Port hochziehen — Muster:
// server/routes/scan.test.js (withScanServer). Verdrahtung wie server/index.js:
// scanRouter unter /api/scan (Haupt-Import-Pfad) + figmaStatusHandler präzise
// unter /api/figma/status (kein Doppel-Mount des ganzen Routers).
async function withScanServer(fn) {
  const app = express();
  app.use(express.json());
  app.use('/api/scan', scanRouter);
  app.get('/api/figma/status', figmaStatusHandler);
  const server = app.listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    await fn(base);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const fixture = JSON.parse(
  fs.readFileSync(path.join(__dirname, '../lib/__fixtures__/figma-file.json'), 'utf8')
);

// Stubbt api.figma.com; alles andere geht an das echte fetch (analog
// stubGeminiDailyQuota-Muster in scan.test.js).
function stubFigmaApi(prevFetch, { fileStatus = 200, fileBody = fixture, variablesStatus = 403 } = {}) {
  return async (url, opts) => {
    const u = String(url);
    if (u.includes('/v1/files/') && u.includes('/variables/local')) {
      return { ok: variablesStatus < 400, status: variablesStatus, json: async () => ({ meta: { variables: {} } }) };
    }
    if (u.includes('api.figma.com/v1/files/')) {
      return { ok: fileStatus < 400, status: fileStatus, json: async () => fileBody };
    }
    return prevFetch(url, opts);
  };
}

function withEnv(vars, fn) {
  const prev = {};
  for (const k of Object.keys(vars)) prev[k] = process.env[k];
  for (const [k, v] of Object.entries(vars)) {
    if (v === undefined) delete process.env[k]; else process.env[k] = v;
  }
  return (async () => {
    try {
      await fn();
    } finally {
      for (const [k, v] of Object.entries(prev)) {
        if (v === undefined) delete process.env[k]; else process.env[k] = v;
      }
    }
  })();
}

test('POST /api/scan/figma mit ungültiger URL → 400 + deutsche Meldung', async () => {
  await withScanServer(async (base) => {
    const res = await fetch(`${base}/api/scan/figma`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ url: 'https://example.com/not-figma' }),
    });
    assert.equal(res.status, 400);
    const data = await res.json();
    assert.match(data.error, /gültige Figma-Datei-URL/);
  });
});

test('POST /api/scan/figma ohne Token (kein FIGMA_TOKEN, kein Feld) → 400', async () => {
  await withEnv({ FIGMA_TOKEN: undefined }, async () => {
    await withScanServer(async (base) => {
      const res = await fetch(`${base}/api/scan/figma`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ url: 'https://www.figma.com/design/abc123/My-File' }),
      });
      assert.equal(res.status, 400);
      const data = await res.json();
      assert.match(data.error, /FIGMA_TOKEN/);
    });
  });
});

test('POST /api/scan/figma Happy Path (Token im Feld) → 200 + kanonischer Vertrag', async () => {
  await withEnv({ FIGMA_TOKEN: undefined }, async () => {
    const prevFetch = global.fetch;
    global.fetch = stubFigmaApi(prevFetch);
    try {
      await withScanServer(async (base) => {
        const res = await fetch(`${base}/api/scan/figma`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ url: 'https://www.figma.com/design/abc123/My-File', token: 'field-token' }),
        });
        assert.equal(res.status, 200);
        const data = await res.json();
        assert.equal(data.meta.model, 'figma-ingest');
        assert.ok(Array.isArray(data.atoms));
        assert.ok(Array.isArray(data.molecules));
        assert.ok(Array.isArray(data.organisms));
        assert.ok(Array.isArray(data.templates));
        assert.ok(data.tokens.colors.length > 0);
      });
    } finally {
      global.fetch = prevFetch;
    }
  });
});

test('POST /api/scan/figma nutzt FIGMA_TOKEN aus der Umgebung, wenn kein Feld gesetzt ist', async () => {
  await withEnv({ FIGMA_TOKEN: 'env-token' }, async () => {
    const prevFetch = global.fetch;
    let sawToken = null;
    global.fetch = async (url, opts) => {
      const u = String(url);
      if (u.includes('api.figma.com')) sawToken = opts.headers['X-Figma-Token'];
      return stubFigmaApi(prevFetch)(url, opts);
    };
    try {
      await withScanServer(async (base) => {
        const res = await fetch(`${base}/api/scan/figma`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ url: 'https://www.figma.com/design/abc123/My-File' }),
        });
        assert.equal(res.status, 200);
        assert.equal(sawToken, 'env-token');
      });
    } finally {
      global.fetch = prevFetch;
    }
  });
});

test('POST /api/scan/figma: 403 von Figma → 403 + deutsche Meldung', async () => {
  const prevFetch = global.fetch;
  global.fetch = stubFigmaApi(prevFetch, { fileStatus: 403 });
  try {
    await withScanServer(async (base) => {
      const res = await fetch(`${base}/api/scan/figma`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ url: 'https://www.figma.com/design/abc123/My-File', token: 'bad' }),
      });
      assert.equal(res.status, 403);
      const data = await res.json();
      assert.match(data.error, /Token ungültig/);
    });
  } finally {
    global.fetch = prevFetch;
  }
});

test('POST /api/scan/figma: 404 von Figma → 404', async () => {
  const prevFetch = global.fetch;
  global.fetch = stubFigmaApi(prevFetch, { fileStatus: 404 });
  try {
    await withScanServer(async (base) => {
      const res = await fetch(`${base}/api/scan/figma`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ url: 'https://www.figma.com/design/abc123/My-File', token: 'tok' }),
      });
      assert.equal(res.status, 404);
    });
  } finally {
    global.fetch = prevFetch;
  }
});

test('POST /api/scan/figma: 429 von Figma → 429', async () => {
  const prevFetch = global.fetch;
  global.fetch = stubFigmaApi(prevFetch, { fileStatus: 429 });
  try {
    await withScanServer(async (base) => {
      const res = await fetch(`${base}/api/scan/figma`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ url: 'https://www.figma.com/design/abc123/My-File', token: 'tok' }),
      });
      assert.equal(res.status, 429);
    });
  } finally {
    global.fetch = prevFetch;
  }
});

test('POST /api/scan/figma: sonstiger Fehler → 502', async () => {
  const prevFetch = global.fetch;
  global.fetch = stubFigmaApi(prevFetch, { fileStatus: 500 });
  try {
    await withScanServer(async (base) => {
      const res = await fetch(`${base}/api/scan/figma`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ url: 'https://www.figma.com/design/abc123/My-File', token: 'tok' }),
      });
      assert.equal(res.status, 502);
    });
  } finally {
    global.fetch = prevFetch;
  }
});

test('GET /api/figma/status meldet tokenConfigured anhand von FIGMA_TOKEN', async () => {
  await withEnv({ FIGMA_TOKEN: 'some-token' }, async () => {
    await withScanServer(async (base) => {
      const res = await fetch(`${base}/api/figma/status`);
      assert.equal(res.status, 200);
      const data = await res.json();
      assert.equal(data.tokenConfigured, true);
    });
  });
  await withEnv({ FIGMA_TOKEN: undefined }, async () => {
    await withScanServer(async (base) => {
      const res = await fetch(`${base}/api/figma/status`);
      const data = await res.json();
      assert.equal(data.tokenConfigured, false);
    });
  });
});
