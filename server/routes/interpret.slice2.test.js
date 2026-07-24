import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import interpretRouter from './interpret.js';
import { putRepo } from '../lib/repoStore.js';

const dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(dirname, '../..');
const buttonSrc = readFileSync(path.join(root, 'server/fixtures/shadcn-repo/components/ui/button.tsx'), 'utf8');
const globals = readFileSync(path.join(root, 'server/fixtures/shadcn-repo/app/globals.css'), 'utf8');

async function withInterpretServer(fn) {
  const app = express();
  app.use(express.json());
  app.use('/api/interpret', interpretRouter);
  const server = app.listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    await fn(base);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

// Guard (Scheibe 2, Slice B): der Repo-Katalog-Bau läuft im Repo-Zweig der Route über ECHTE
// Repo-Dateien, ohne zu crashen. (Die repoCatalogData-Anhängung selbst ist Erfolgspfad und
// separat gedeckt: buildCatalogFromRepo-Unit + web-Emit-E2E.)
test('POST /api/interpret/components: Repo-Import mit shadcn-Dateien läuft durch (DEMO_FALLBACK, kein Crash)', async () => {
  const prevAnthropic = process.env.ANTHROPIC_API_KEY;
  const prevGemini = process.env.GEMINI_API_KEY;
  const prevDemo = process.env.DEMO_FALLBACK;
  delete process.env.ANTHROPIC_API_KEY;
  delete process.env.GEMINI_API_KEY;
  process.env.DEMO_FALLBACK = '1';
  try {
    await withInterpretServer(async (base) => {
      const importId = putRepo([
        { path: 'components/ui/button.tsx', content: buttonSrc },
        { path: 'app/globals.css', content: globals },
      ]);
      const res = await fetch(`${base}/api/interpret/components`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ import_id: importId, components: [{ name: 'Avatar' }] }),
      });
      assert.equal(res.status, 200);
      const data = await res.json();
      assert.equal(data.demo, true); // Repo-Konserve, mein Glue davor ist sauber gelaufen
    });
  } finally {
    if (prevAnthropic !== undefined) process.env.ANTHROPIC_API_KEY = prevAnthropic;
    if (prevGemini !== undefined) process.env.GEMINI_API_KEY = prevGemini;
    if (prevDemo !== undefined) process.env.DEMO_FALLBACK = prevDemo; else delete process.env.DEMO_FALLBACK;
  }
});
