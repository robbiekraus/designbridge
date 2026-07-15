import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import scanRouter from './scan.js';
import { liftRepoInventory, applyBaselinePaths } from '../lib/decompose/repoDecomposer.js';

// Router in einer frischen App auf einem Ephemeral-Port hochziehen — testet die
// echte Middleware-Kette inkl. Multer, ohne den Produktions-Server zu starten.
async function withScanServer(fn) {
  const app = express();
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
