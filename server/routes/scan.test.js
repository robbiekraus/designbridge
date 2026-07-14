import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import scanRouter from './scan.js';
import { liftRepoInventory } from '../lib/decompose/repoDecomposer.js';

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

test('liftRepoInventory hebt Scan-Inventar-Code (Verdrahtung /repo)', async () => {
  const files = [{ path: 'src/components/ui/button.tsx', content: 'export const Button=()=><button/>;' }];
  const inv = [{ name: 'Button', path: 'src/components/ui/button.tsx', source: 'rules' }];
  await liftRepoInventory(files, inv);
  assert.equal(inv[0].sourceCode, files[0].content);
  assert.equal(inv[0].lang, 'tsx');
});
