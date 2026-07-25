// Baut die EINGEFRORENE Prod-Fixture fürs Storybook-Harness: scannt ein echtes
// Bild auf Prod (/api/scan/image), interpretiert alle Bausteine (/api/interpret/
// components, wie die App: 1 Baustein pro Request, begrenzte Konkurrenz gegen
// 502-Timeouts), fährt den ECHTEN Emit-Pfad (storybookFiles) darüber und
// schreibt das Ergebnis als storybook-harness/fixtures/prod-export.zip.
//
// Aufruf (aus dem web/-Verzeichnis, nach `npm install`):
//   node verification/build-prod-storybook-fixture.mjs <pfad-zum-screenshot> [prod-url]
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { JSDOM } from 'jsdom';
import JSZip from 'jszip';

const dirname = path.dirname(fileURLToPath(import.meta.url));

const dom = new JSDOM('<!doctype html><html><body></body></html>');
globalThis.document = dom.window.document;
globalThis.getComputedStyle = dom.window.getComputedStyle.bind(dom.window);
globalThis.window = dom.window;

const { storybookFiles } = await import('../src/lib/emit/buildStorybookZip.js');
const { componentsNeedingInterpretation, attachInterpretations } = await import('../src/lib/interpret.js');

const imagePath = process.argv[2];
const prodUrl = (process.argv[3] ?? 'https://designbridge-production.up.railway.app').replace(/\/$/, '');
if (!imagePath) {
  console.error('Nutzung: node verification/build-prod-storybook-fixture.mjs <pfad-zum-screenshot> [prod-url]');
  process.exit(1);
}

const mimeByExt = { '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp' };
const ext = path.extname(imagePath).toLowerCase();
const mimetype = mimeByExt[ext] ?? 'image/png';

console.log(`[1/4] Scanne ${path.basename(imagePath)} auf ${prodUrl} …`);
const buf = await readFile(imagePath);
const form = new FormData();
form.append('image', new Blob([buf], { type: mimetype }), path.basename(imagePath));
const scanRes = await fetch(`${prodUrl}/api/scan/image`, { method: 'POST', body: form });
const raw = await scanRes.json();
if (!scanRes.ok) throw new Error(`Scan fehlgeschlagen: ${raw.error ?? scanRes.status}`);

let result = { source: 'image', raw, interpretations: {} };
const todo = componentsNeedingInterpretation(result);
console.log(`[2/4] ${todo.length} Bausteine brauchen KI-Interpretation (Rest deckt ein lokales Template ab) …`);

// 1 Baustein pro Request, Konkurrenz 4 — wie der Web-Client (Timeout-Risiko bei Batches, s. interpret.js).
// Plus genau eine Auto-Retry-Runde für Fehlschläge (gleiches Verhalten wie runInterpretation im Client —
// vereinzelte JSON-Parse-Fehler des Modells sind meist beim zweiten Versuch weg).
const CONCURRENCY = 4;
async function runRound(items) {
  const failed = [];
  let idx = 0;
  async function worker() {
    for (;;) {
      const item = items[idx++];
      if (!item) return;
      const res = await fetch(`${prodUrl}/api/interpret/components`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ import_id: raw.meta.import_id, components: [item] }),
      });
      const data = await res.json();
      if (res.ok) {
        result = attachInterpretations(result, data);
        console.log(`  ✓ ${item.name}`);
      } else {
        console.warn(`  ⚠ ${item.name}: ${data.error ?? res.status}`);
        failed.push(item);
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, items.length) }, worker));
  return failed;
}

const round1Failed = await runRound(todo);
if (round1Failed.length) {
  console.log(`  Auto-Retry für ${round1Failed.length} Baustein(e): ${round1Failed.map((c) => c.name).join(', ')}`);
  const round2Failed = await runRound(round1Failed);
  if (round2Failed.length) {
    console.warn(`  Endgültig fehlgeschlagen (Fallback = generischer Stub): ${round2Failed.map((c) => c.name).join(', ')}`);
  }
}

console.log('[3/4] Baue Storybook-Paket (echter Emit-Pfad) …');
const files = storybookFiles(result);
const zip = new JSZip();
for (const [p, content] of Object.entries(files)) zip.file(p, content);
const buffer = await zip.generateAsync({ type: 'nodebuffer' });

const outDir = path.resolve(dirname, '../../storybook-harness/fixtures');
await mkdir(outDir, { recursive: true });
const outPath = path.join(outDir, 'prod-export.zip');
await writeFile(outPath, buffer);

// Rohdaten mit einfrieren (Spec 2026-07-25-komposition-gegroundeter-bausteine-design.md
// §Verifikation 4): der KI-Teil dieses Scans kostet Gemini-Kontingent, der Emit darüber nicht.
// Mit dem eingefrorenen result-Objekt baut `reemit-from-raw.mjs` das Paket jederzeit KOSTENLOS neu
// — nötig für jeden Vorher/Nachher-Vergleich am Emitter, ohne erneut zu scannen.
const rawOutPath = path.join(outDir, 'prod-scan-raw.json');
await writeFile(rawOutPath, `${JSON.stringify(result, null, 2)}\n`);

console.log(`[4/4] Fixture geschrieben: ${outPath}`);
console.log(`      Rohdaten eingefroren: ${rawOutPath} (Neu-Emit ohne KI: node verification/reemit-from-raw.mjs ${rawOutPath})`);
console.log(`Enthaltene Dateien:\n  ${Object.keys(files).join('\n  ')}`);
