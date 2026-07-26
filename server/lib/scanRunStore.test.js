import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import os from 'os';
import path from 'path';
import {
  recordScan,
  recordInterpretations,
  getRun,
  getLatestRun,
  listRuns,
  clearRuns,
  MAX_RUNS,
} from './scanRunStore.js';

function scanResult(extra = {}) {
  return {
    summary: 'x',
    tokens: {},
    atoms: [],
    molecules: [],
    organisms: [{ name: 'Sidebar' }],
    templates: [],
    warnings: [],
    composition: null,
    meta: { import_id: 'imp-1' },
    ...extra,
  };
}

test('scanRunStore: leer nach clearRuns', () => {
  clearRuns();
  assert.equal(getLatestRun(), null);
  assert.deepEqual(listRuns(), []);
});

test('scanRunStore: ein Scan wird im Fixture-Format abgelegt', () => {
  clearRuns();
  recordScan('imp-1', { source: 'image', raw: scanResult() });

  const run = getRun('imp-1');
  // Exakt die Form von storybook-harness/fixtures/prod-scan-raw.json — sonst taugt der
  // Mitschnitt nicht als Eingabe für emit-in-browser.html / figma-payload-from-raw.mjs.
  assert.deepEqual(Object.keys(run.bundle).sort(), [
    'interpretFailed', 'interpretations', 'raw', 'repoCatalogData', 'source',
  ]);
  assert.equal(run.bundle.source, 'image');
  assert.deepEqual(run.bundle.interpretations, {});
  assert.deepEqual(run.bundle.interpretFailed, []);
  assert.equal(run.bundle.repoCatalogData, null);
  assert.equal(run.bundle.raw.organisms[0].name, 'Sidebar');
});

test('scanRunStore: Interpretationen werden über MEHRERE Aufrufe gemerged', () => {
  // Der Web-Pool schickt die Bausteine in Chunks (POOL_CONCURRENCY 6) — jeder Chunk ist
  // ein eigener POST auf /api/interpret/components. Überschreiben statt mergen würde
  // alles bis auf den letzten Chunk verlieren.
  clearRuns();
  recordScan('imp-1', { source: 'image', raw: scanResult() });
  recordInterpretations('imp-1', {
    interpretations: [{ name: 'Sidebar', html: '<div>a</div>', model: 'm1' }],
    failed: ['Kaputt A'],
  });
  recordInterpretations('imp-1', {
    interpretations: [{ name: 'Header', html: '<div>b</div>', model: 'm1' }],
    failed: ['Kaputt B'],
  });

  const { bundle } = getRun('imp-1');
  assert.deepEqual(Object.keys(bundle.interpretations).sort(), ['Header', 'Sidebar']);
  assert.deepEqual(bundle.interpretations.Sidebar, { html: '<div>a</div>', model: 'm1', demo: false });
  assert.deepEqual(bundle.interpretFailed.sort(), ['Kaputt A', 'Kaputt B']);
});

test('scanRunStore: ein späterer Retry ersetzt einen zuvor gescheiterten Baustein', () => {
  clearRuns();
  recordScan('imp-1', { source: 'image', raw: scanResult() });
  recordInterpretations('imp-1', { interpretations: [], failed: ['Sidebar'] });
  recordInterpretations('imp-1', {
    interpretations: [{ name: 'Sidebar', html: '<div>ok</div>', model: 'm1' }],
    failed: [],
  });

  const { bundle } = getRun('imp-1');
  assert.equal(bundle.interpretations.Sidebar.html, '<div>ok</div>');
  assert.deepEqual(bundle.interpretFailed, [], 'geglückter Retry räumt den Fehlschlag weg');
});

test('scanRunStore: repoCatalogData und demo werden mitgeführt', () => {
  clearRuns();
  recordScan('imp-2', { source: 'repo', raw: scanResult() });
  recordInterpretations('imp-2', {
    interpretations: [{ name: 'Card', html: '<div/>', model: null }],
    failed: [],
    repoCatalogData: { entries: [{ name: 'Card' }], theme: {} },
    demo: true,
  });

  const { bundle } = getRun('imp-2');
  assert.equal(bundle.repoCatalogData.entries.length, 1);
  assert.equal(bundle.interpretations.Card.demo, true);
});

test('scanRunStore: Interpretationen ohne vorherigen Scan legen keinen Geisterlauf an', () => {
  // /api/interpret/components kann nach einem Serverneustart mit einer import_id kommen,
  // deren Scan nicht mehr im Puffer liegt. Dann gibt es nichts Sinnvolles aufzuzeichnen.
  clearRuns();
  recordInterpretations('unbekannt', { interpretations: [{ name: 'X', html: '<i/>' }], failed: [] });
  assert.equal(getRun('unbekannt'), null);
  assert.deepEqual(listRuns(), []);
});

test('scanRunStore: Ringpuffer haelt nur die letzten MAX_RUNS Laeufe', () => {
  clearRuns();
  for (let i = 0; i < MAX_RUNS + 3; i++) {
    recordScan(`imp-${i}`, { source: 'image', raw: scanResult() });
  }
  assert.equal(listRuns().length, MAX_RUNS);
  assert.equal(getRun('imp-0'), null, 'aeltester Lauf ist rausgefallen');
  assert.ok(getRun(`imp-${MAX_RUNS + 2}`), 'juengster Lauf ist da');
});

test('scanRunStore: getLatestRun liefert den zuletzt aufgezeichneten Scan', () => {
  clearRuns();
  recordScan('a', { source: 'image', raw: scanResult() });
  recordScan('b', { source: 'url', raw: scanResult() });
  assert.equal(getLatestRun().id, 'b');
});

test('scanRunStore: listRuns ist eine Uebersicht ohne die grossen Nutzdaten', () => {
  clearRuns();
  recordScan('a', { source: 'image', raw: scanResult() });
  recordInterpretations('a', { interpretations: [{ name: 'Sidebar', html: '<i/>' }], failed: [] });

  const [entry] = listRuns();
  assert.deepEqual(Object.keys(entry).sort(), ['at', 'components', 'id', 'interpretations', 'source']);
  assert.equal(entry.components, 1);
  assert.equal(entry.interpretations, 1);
});

test('scanRunStore: schreibt bei gesetztem SCAN_RUN_DIR eine Datei je Lauf', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'db-scanruns-'));
  const prev = process.env.SCAN_RUN_DIR;
  process.env.SCAN_RUN_DIR = dir;
  try {
    clearRuns();
    recordScan('imp-datei', { source: 'image', raw: scanResult() });
    recordInterpretations('imp-datei', {
      interpretations: [{ name: 'Sidebar', html: '<div>a</div>', model: 'm1' }],
      failed: [],
    });

    const files = fs.readdirSync(dir).filter((f) => f.endsWith('.json'));
    assert.equal(files.length, 1, 'ein Lauf → eine Datei, jeder Aufruf aktualisiert sie');
    const written = JSON.parse(fs.readFileSync(path.join(dir, files[0]), 'utf8'));
    assert.equal(written.source, 'image');
    assert.equal(written.interpretations.Sidebar.html, '<div>a</div>');
  } finally {
    process.env.SCAN_RUN_DIR = prev;
    if (prev === undefined) delete process.env.SCAN_RUN_DIR;
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('scanRunStore: ein nicht schreibbares SCAN_RUN_DIR bricht den Scan nicht ab', () => {
  const prev = process.env.SCAN_RUN_DIR;
  process.env.SCAN_RUN_DIR = '/proc/gibt-es-nicht/und-ist-nicht-anlegbar';
  try {
    clearRuns();
    assert.doesNotThrow(() => recordScan('imp-x', { source: 'image', raw: scanResult() }));
    assert.ok(getRun('imp-x'), 'der Lauf liegt trotzdem im Speicher');
  } finally {
    process.env.SCAN_RUN_DIR = prev;
    if (prev === undefined) delete process.env.SCAN_RUN_DIR;
  }
});

test('scanRunStore: eine kaputte Aufzeichnung darf den Scan nie zum Absturz bringen', () => {
  clearRuns();
  assert.doesNotThrow(() => recordScan(null, { source: 'image', raw: scanResult() }));
  assert.doesNotThrow(() => recordScan('imp-1', null));
  assert.doesNotThrow(() => recordInterpretations('imp-1', null));
});
