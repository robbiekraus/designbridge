#!/usr/bin/env node
// Den letzten auf Prod aufgezeichneten Scan holen und dort ablegen, wo die
// Verifikations-Werkzeuge ihn erwarten.
//
// WOZU: Bisher war ein Fehlerbild aus einem ECHTEN Scan nicht nachstellbar — der Scan war nach
// der Antwort weg, und ein neuer kostet Credits. Der Server hält jetzt die letzten Läufe in
// einem Ringpuffer (server/lib/scanRunStore.js) und gibt sie über /api/scan/runs heraus,
// in exakt dem Format von storybook-harness/fixtures/prod-scan-raw.json.
//
// Benutzung (aus web/):
//   node verification/fetch-scan-run.mjs                    # letzter Lauf von Prod
//   node verification/fetch-scan-run.mjs --list             # welche Läufe liegen im Puffer?
//   node verification/fetch-scan-run.mjs <import_id>        # ein bestimmter Lauf
//   node verification/fetch-scan-run.mjs --base http://localhost:3047
//
// Danach direkt einsetzbar:
//   node verification/figma-payload-from-raw.mjs verification/prod-scan-raw.json
//   und emit-in-browser.html / splice-slots-in-browser.html finden die Datei von selbst.
//
// ⚠️ Der Puffer ist flüchtig: nach einem Railway-Neustart ist er leer (dieselbe Falle wie beim
// Figma-Payload-Store). Also holen, solange der Scan frisch ist.
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const DEFAULT_BASE = 'https://designbridge-production.up.railway.app';
const __dirname = path.dirname(fileURLToPath(import.meta.url));

const args = process.argv.slice(2);
const baseIdx = args.indexOf('--base');
const base = (baseIdx >= 0 ? args[baseIdx + 1] : DEFAULT_BASE).replace(/\/$/, '');
const rest = args.filter((a, i) => a !== '--base' && i !== baseIdx + 1 && a !== '--list');
const wantsList = args.includes('--list');
const importId = rest[0] ?? null;

async function getJson(url) {
  const res = await fetch(url);
  // Kein .catch(()=>({})): eine nicht-JSON-Antwort ist hier IMMER ein Befund, kein leeres
  // Ergebnis. Ein Server ohne diese Route liefert die SPA-index.html mit Status 200 — die
  // erste Fassung dieses Skripts hat daraus stillschweigend ein `{}` geschrieben und damit
  // die vorhandene prod-scan-raw.json überbügelt.
  const text = await res.text();
  let body;
  try {
    body = JSON.parse(text);
  } catch {
    throw new Error(res.ok
      ? `${url} hat kein JSON geliefert (${text.slice(0, 60).replace(/\s+/g, ' ')}…).\n`
        + '  Läuft dort schon eine Version MIT /api/scan/runs? (seit 27.07.)'
      : `${res.status} ${url}`);
  }
  if (!res.ok) throw new Error(`${res.status} ${url}\n${body.error ?? ''}`);
  return body;
}

/** Bundle-Form prüfen, BEVOR eine bestehende Datei überschrieben wird. */
function assertBundle(bundle, url) {
  const missing = ['source', 'raw', 'interpretations'].filter((k) => !(k in bundle));
  if (missing.length || !bundle.raw) {
    throw new Error(`${url} sieht nicht wie ein Scan-Mitschnitt aus `
      + `(fehlt: ${missing.join(', ') || 'raw ist leer'}). Nichts geschrieben.`);
  }
}

try {
  if (wantsList) {
    const { runs } = await getJson(`${base}/api/scan/runs`);
    if (!Array.isArray(runs)) throw new Error(`${base}/api/scan/runs kennt keine Läufe-Liste.`);
    if (!runs.length) {
      console.log('Keine Läufe im Puffer. (Nach einem Neustart ist er leer.)');
    } else {
      for (const r of runs) {
        console.log(`${r.at}  ${r.source.padEnd(5)}  ${String(r.components).padStart(3)} Bausteine  `
          + `${String(r.interpretations).padStart(3)} interpretiert  ${r.id}`);
      }
    }
    process.exit(0);
  }

  const url = importId ? `${base}/api/scan/runs/${importId}` : `${base}/api/scan/runs/latest`;
  const bundle = await getJson(url);
  assertBundle(bundle, url);

  const out = path.join(__dirname, 'prod-scan-raw.json');
  fs.writeFileSync(out, JSON.stringify(bundle, null, 2));

  const raw = bundle.raw ?? {};
  const count = ['atoms', 'molecules', 'organisms', 'templates']
    .reduce((n, k) => n + (Array.isArray(raw[k]) ? raw[k].length : 0), 0);
  console.log(`✓ ${path.relative(process.cwd(), out)}`);
  console.log(`  Quelle: ${bundle.source} · ${count} Bausteine · `
    + `${Object.keys(bundle.interpretations ?? {}).length} interpretiert · `
    + `${(bundle.interpretFailed ?? []).length} fehlgeschlagen`);
} catch (err) {
  console.error('✗', err.message);
  process.exit(1);
}
