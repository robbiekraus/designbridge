import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import interpretRouter from './interpret.js';
import { putPage } from '../lib/pageStore.js';

// Router in einer frischen App auf einem Ephemeral-Port hochziehen — Muster:
// server/routes/scan.test.js (withScanServer).
async function withInterpretServer(fn) {
  const app = express();
  app.use(express.json());
  app.use('/api/interpret', interpretRouter);
  const server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    await fn(base);
  } finally {
    await new Promise(resolve => server.close(resolve));
  }
}

test('POST /api/interpret/components mit DEMO_FALLBACK=1 ohne API-Key → demo:true (nie unmarkierte Konserven)', async () => {
  const prevAnthropic = process.env.ANTHROPIC_API_KEY;
  const prevGemini = process.env.GEMINI_API_KEY;
  const prevDemo = process.env.DEMO_FALLBACK;
  delete process.env.ANTHROPIC_API_KEY;
  delete process.env.GEMINI_API_KEY;
  process.env.DEMO_FALLBACK = '1';
  try {
    await withInterpretServer(async base => {
      const importId = putPage('<html><body><input placeholder="Suche" /></body></html>', '');
      const res = await fetch(`${base}/api/interpret/components`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ import_id: importId, components: [{ name: 'Suche' }] }),
      });

      assert.equal(res.status, 200);
      const data = await res.json();
      assert.equal(data.demo, true);
      assert.ok(Array.isArray(data.interpretations));
      assert.ok(data.interpretations.some(i => i.name === 'Suche'));
    });
  } finally {
    if (prevAnthropic !== undefined) process.env.ANTHROPIC_API_KEY = prevAnthropic;
    if (prevGemini !== undefined) process.env.GEMINI_API_KEY = prevGemini;
    if (prevDemo !== undefined) process.env.DEMO_FALLBACK = prevDemo; else delete process.env.DEMO_FALLBACK;
  }
});

test('POST /api/interpret/components ohne gültigen import_id → 410 (Quelle nicht mehr verfügbar)', async () => {
  await withInterpretServer(async base => {
    const res = await fetch(`${base}/api/interpret/components`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ import_id: 'unbekannt', components: [{ name: 'Suche' }] }),
    });

    assert.equal(res.status, 410);
  });
});

// Quota-Bremse Task 2: isDailyQuota-Fehler aus dem Gemini-Adapter → 429 +
// daily_quota:true statt des generischen 502. Kein echter Netzwerk-Call:
// global.fetch wird nur für die Gemini-URL abgefangen, alles andere (der
// eigene HTTP-Request an den Testserver) läuft über die echte fetch-Referenz.
test('POST /api/interpret/components: Gemini-Tages-Quota-429 → 429 + daily_quota:true (kein 502, keine Demo-Fixture)', async () => {
  const prevAnthropic = process.env.ANTHROPIC_API_KEY;
  const prevGemini = process.env.GEMINI_API_KEY;
  const prevProvider = process.env.AI_PROVIDER;
  const prevDemo = process.env.DEMO_FALLBACK;
  const prevFetch = global.fetch;
  delete process.env.ANTHROPIC_API_KEY;
  process.env.GEMINI_API_KEY = 'fake-key';
  process.env.AI_PROVIDER = 'gemini';
  delete process.env.DEMO_FALLBACK;
  global.fetch = async (url, opts) => {
    if (String(url).includes('generativelanguage.googleapis.com')) {
      return {
        ok: false,
        status: 429,
        json: async () => ({
          error: {
            message: 'Resource has been exhausted (e.g. check quota).',
            details: [{
              '@type': 'type.googleapis.com/google.rpc.QuotaFailure',
              violations: [{ quotaId: 'GenerateRequestsPerDayPerProjectPerModel-FreeTier' }],
            }],
          },
        }),
      };
    }
    return prevFetch(url, opts);
  };
  try {
    await withInterpretServer(async base => {
      const importId = putPage('<html><body><input placeholder="Suche" /></body></html>', '');
      const res = await fetch(`${base}/api/interpret/components`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ import_id: importId, components: [{ name: 'Suche' }] }),
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
    if (prevDemo !== undefined) process.env.DEMO_FALLBACK = prevDemo; else delete process.env.DEMO_FALLBACK;
  }
});
