// Verdrahtungs-Test für den Scan-Mitschnitt (scanRunStore.js, 27.07.2026).
//
// Die Unit-Tests in lib/scanRunStore.test.js prüfen den Puffer selbst. Hier geht es um die
// Frage, die sie NICHT beantworten: kommt ein echter Scan über die echte Middleware-Kette
// im Puffer an, und liefert GET /api/scan/runs/latest ihn im Fixture-Format wieder heraus?
//
// Gefahren wird über /api/scan/url gegen einen lokalen HTTP-Server — kein KI-Call, keine
// Credits, kein Netz nach draußen.
import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import http from 'node:http';
import scanRouter from './scan.js';
import interpretRouter from './interpret.js';
import { clearRuns } from '../lib/scanRunStore.js';

async function withServers(fn) {
  const app = express();
  app.use(express.json());
  app.use('/api/scan', scanRouter);
  app.use('/api/interpret', interpretRouter);
  const api = app.listen(0, '127.0.0.1');
  await new Promise((r) => api.once('listening', r));

  // Die zu scannende Seite — bewusst mit einem erkennbaren Baustein.
  const site = http.createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/html' });
    res.end('<html><head><style>:root{--brand:#ff0000}</style></head>'
      + '<body><button class="btn">Klick</button><nav><a href="#">Eins</a></nav></body></html>');
  });
  site.listen(0, '127.0.0.1');
  await new Promise((r) => site.once('listening', r));

  try {
    await fn(`http://127.0.0.1:${api.address().port}`, `http://127.0.0.1:${site.address().port}/`);
  } finally {
    await new Promise((r) => api.close(r));
    await new Promise((r) => site.close(r));
  }
}

test('ein echter Scan landet im Mitschnitt und kommt über /runs/latest zurück', async () => {
  clearRuns();
  await withServers(async (api, siteUrl) => {
    const scanRes = await fetch(`${api}/api/scan/url`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: siteUrl }),
    });
    assert.equal(scanRes.status, 200);
    const scan = await scanRes.json();
    assert.ok(scan.meta.import_id, 'Scan liefert eine import_id');

    // Übersicht kennt den Lauf.
    const list = await (await fetch(`${api}/api/scan/runs`)).json();
    assert.equal(list.runs.length, 1);
    assert.equal(list.runs[0].id, scan.meta.import_id);
    assert.equal(list.runs[0].source, 'url');

    // Und der Mitschnitt hat exakt das Fixture-Format (prod-scan-raw.json).
    const bundle = await (await fetch(`${api}/api/scan/runs/latest`)).json();
    assert.deepEqual(Object.keys(bundle).sort(), [
      'interpretFailed', 'interpretations', 'raw', 'repoCatalogData', 'source',
    ]);
    assert.equal(bundle.source, 'url');
    assert.deepEqual(bundle.raw, scan, 'raw ist byte-gleich die Scan-Antwort');

    // Und per import_id direkt adressierbar.
    const byId = await (await fetch(`${api}/api/scan/runs/${scan.meta.import_id}`)).json();
    assert.deepEqual(byId, bundle);
  });
});

test('ohne aufgezeichneten Lauf antwortet /runs/latest mit 404 statt mit null', async () => {
  clearRuns();
  await withServers(async (api) => {
    const res = await fetch(`${api}/api/scan/runs/latest`);
    assert.equal(res.status, 404);
    assert.match((await res.json()).error, /Noch kein Scan/);
  });
});

test('„latest" wird nicht als import_id missverstanden', async () => {
  // Reihenfolge-Falle in Express: stünde '/runs/:id' vor '/runs/latest', schluckte der
  // Parameter das Wort und die Antwort wäre immer „Kein Mitschnitt zu dieser import_id".
  clearRuns();
  await withServers(async (api, siteUrl) => {
    await fetch(`${api}/api/scan/url`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: siteUrl }),
    });
    const res = await fetch(`${api}/api/scan/runs/latest`);
    assert.equal(res.status, 200);
    assert.equal((await res.json()).source, 'url');
  });
});

test('Interpretationen werden in den Lauf desselben Imports gemerged', async () => {
  clearRuns();
  await withServers(async (api, siteUrl) => {
    const scan = await (await fetch(`${api}/api/scan/url`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: siteUrl }),
    })).json();

    // DEMO_FALLBACK liefert die gebündelten Interpretationen ohne KI-Call — hier geht es
    // nur darum, dass die Antwort im Mitschnitt landet, nicht um ihren Inhalt.
    const prevDemo = process.env.DEMO_FALLBACK;
    process.env.DEMO_FALLBACK = '1';
    try {
      const res = await fetch(`${api}/api/interpret/components`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          import_id: scan.meta.import_id,
          components: [{ name: 'Nicht vorhanden', kind: 'atom' }],
        }),
      });
      assert.equal(res.status, 200, 'Demo-Fallback antwortet mit 200');
    } finally {
      if (prevDemo === undefined) delete process.env.DEMO_FALLBACK;
      else process.env.DEMO_FALLBACK = prevDemo;
    }

    // Der Lauf existiert weiter und trägt die (hier leere) Interpretations-Runde —
    // entscheidend ist, dass der Mitschnitt nicht durch den zweiten Aufruf zerfällt.
    const bundle = await (await fetch(`${api}/api/scan/runs/latest`)).json();
    assert.equal(bundle.source, 'url');
    assert.ok(bundle.raw, 'raw bleibt erhalten');
    assert.deepEqual(bundle.interpretFailed, ['Nicht vorhanden']);
  });
});
