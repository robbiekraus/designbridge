// Mitschnitt der letzten Scans — damit ein Fehlerbild aus einem ECHTEN Scan nachstellbar ist.
//
// WARUM: Bisher wurde kein Scan festgehalten. Robs EcoMetrics-Scan (27.07.) zeigte einen Fehler,
// den die eingefrorene Fixture nicht enthält — der Scan war weg, der Fehler nicht mehr greifbar,
// und ein neuer Scan kostet echte API-Credits. Das ist mehrfach passiert.
//
// WAS BEWUSST NICHT: keine Datenbank, keine Persistenz über einen Neustart hinaus, keine
// Bilddaten. Nur das Roh-JSON, das die Verifikations-Werkzeuge ohnehin schon lesen.
//
// FORM: Ein Lauf wird EXAKT so abgelegt wie `storybook-harness/fixtures/prod-scan-raw.json`
// ({source, raw, interpretations, repoCatalogData, interpretFailed}). Nur so ist der Mitschnitt
// ein Drop-in-Ersatz für die Fixture in `web/verification/emit-in-browser.html`,
// `figma-payload-from-raw.mjs`, `splice-slots-in-browser.html` und `measure-natural-widths.mjs`.
//
// Der Aufzeichner darf NIE einen Scan kaputt machen: jeder Einstiegspunkt schluckt seine Fehler.
import fs from 'fs';
import path from 'path';

/** Ringpuffer-Größe. Klein halten — ein Lauf sind schnell ~100 KB JSON, und mehr als „der
 *  letzte und ein paar davor" braucht kein Mensch zum Nachstellen. */
export const MAX_RUNS = 5;

/** Map<importId, run>. Insertion Order = zeitliche Reihenfolge (Map-Garantie in JS). */
const runs = new Map();

function emptyBundle(source) {
  return {
    source,
    raw: null,
    interpretations: {},
    repoCatalogData: null,
    interpretFailed: [],
  };
}

/** Datei-Dump nur, wenn SCAN_RUN_DIR gesetzt ist. Auf Railway ist die Platte flüchtig — dort
 *  ist der Speicher-Puffer plus GET /api/scan/runs/latest der Weg, lokal die Datei. */
function dumpToDisk(run) {
  const dir = process.env.SCAN_RUN_DIR;
  if (!dir) return;
  try {
    fs.mkdirSync(dir, { recursive: true });
    // Ein Lauf → eine Datei; spätere Interpretations-Chunks aktualisieren dieselbe.
    const safeId = String(run.id).replace(/[^a-zA-Z0-9_-]/g, '_');
    fs.writeFileSync(path.join(dir, `scan-${safeId}.json`), JSON.stringify(run.bundle, null, 2));
  } catch (err) {
    // Kein throw: ein volles/schreibgeschütztes Verzeichnis darf den Scan nicht abbrechen.
    console.warn('[scanRunStore] Mitschnitt nicht schreibbar:', err.message);
  }
}

/** Ergebnis eines /api/scan/*-Aufrufs festhalten. Legt den Lauf an. */
export function recordScan(importId, data) {
  try {
    // Bewusst KEINE Destrukturierung in der Signatur: die liefe vor dem try und könnte
    // bei `null` werfen — der Aufzeichner darf einen Scan unter keinen Umständen abbrechen.
    const { source, raw } = data ?? {};
    if (!importId || !raw) return;
    const run = { id: String(importId), at: new Date().toISOString(), bundle: emptyBundle(source ?? null) };
    run.bundle.raw = raw;
    // Bei einer Wiederholung derselben import_id zuerst löschen, damit der Lauf ans
    // ENDE der Insertion Order rutscht (getLatestRun/Ringpuffer hängen daran).
    runs.delete(run.id);
    runs.set(run.id, run);
    while (runs.size > MAX_RUNS) runs.delete(runs.keys().next().value);
    dumpToDisk(run);
  } catch (err) {
    console.warn('[scanRunStore] recordScan fehlgeschlagen:', err.message);
  }
}

/** Antwort eines /api/interpret/components-Aufrufs in den Lauf mergen.
 *  Der Web-Pool schickt die Bausteine in Chunks — jeder Chunk ist ein eigener POST. Dieselbe
 *  Merge-Regel wie `attachInterpretations` in `web/src/lib/interpret.js`, damit der Mitschnitt
 *  denselben Endzustand trägt wie die App. */
export function recordInterpretations(importId, data) {
  try {
    if (!importId || !data) return;
    const run = runs.get(String(importId));
    // Kein Scan im Puffer (z. B. nach Serverneustart) → nichts anlegen: ein Lauf ohne `raw`
    // wäre für die Verifikations-Werkzeuge wertlos und stünde nur im Weg.
    if (!run) return;

    for (const it of data.interpretations ?? []) {
      if (!it?.name) continue;
      run.bundle.interpretations[it.name] = {
        html: it.html,
        model: it.model ?? null,
        demo: Boolean(data.demo),
      };
    }
    const failed = new Set(run.bundle.interpretFailed);
    for (const name of data.failed ?? []) failed.add(name);
    // Ein geglückter Retry räumt seinen früheren Fehlschlag weg.
    for (const name of Object.keys(run.bundle.interpretations)) failed.delete(name);
    run.bundle.interpretFailed = [...failed];

    if (data.repoCatalogData) run.bundle.repoCatalogData = data.repoCatalogData;
    dumpToDisk(run);
  } catch (err) {
    console.warn('[scanRunStore] recordInterpretations fehlgeschlagen:', err.message);
  }
}

export function getRun(importId) {
  return runs.get(String(importId)) ?? null;
}

export function getLatestRun() {
  let last = null;
  for (const run of runs.values()) last = run;
  return last;
}

/** Übersicht ohne die großen Nutzdaten — zum Aussuchen, welcher Lauf geholt werden soll. */
export function listRuns() {
  return [...runs.values()].map((run) => ({
    id: run.id,
    at: run.at,
    source: run.bundle.source,
    components: countComponents(run.bundle.raw),
    interpretations: Object.keys(run.bundle.interpretations).length,
  }));
}

function countComponents(raw) {
  if (!raw) return 0;
  return ['atoms', 'molecules', 'organisms', 'templates']
    .reduce((n, key) => n + (Array.isArray(raw[key]) ? raw[key].length : 0), 0);
}

export function clearRuns() {
  runs.clear();
}
