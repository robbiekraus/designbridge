// Storybook-Paket aus einem EINGEFRORENEN Scan-Ergebnis neu emittieren — ohne einen einzigen
// KI-Call. Der Zweck (Spec 2026-07-25-komposition-gegroundeter-bausteine-design.md §Verifikation):
// die KI-Interpretation kostet Gemini-Kontingent, der Emit darüber nicht. Ein Rohdaten-JSON
// (`{raw, interpretations}`, wie der Web-Client es hält) wird eingefroren, danach ist jeder weitere
// Vorher/Nachher-Vergleich am Emit kostenlos und deterministisch reproduzierbar.
//
// Aufruf (aus dem web/-Verzeichnis, nach `npm install`):
//   node verification/reemit-from-raw.mjs verification/fixtures/composition-raw.json
//   node verification/reemit-from-raw.mjs <raw.json> <ziel.zip>
//
// Ohne Ziel-Pfad landet das Paket als `storybook-harness/fixtures/<name-des-json>.zip`.
//
// GRENZE DIESER KETTE (wichtig beim Beurteilen des Ergebnisses): der Emit läuft hier über jsdom, das
// keine Layout-Engine hat. `gap` wird von jsdoms getComputedStyle NICHT aufgelöst → in Fixture-Builds
// fehlen die `gap-[Npx]`-Klassen, die Karten sitzen enger als in der echten App. In der Live-App
// mountet htmlToPlan im ECHTEN Browser, dort kommen die Abstände mit. Also: Struktur, Hülle, Texte
// und Grounding sind hier aussagekräftig, die Abstände sind es nicht.
// Ingest ins Harness danach: `npm run storybook:ingest -- <zip>` (im storybook-harness/).
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

const rawPath = process.argv[2];
if (!rawPath) {
  console.error('Nutzung: node verification/reemit-from-raw.mjs <raw.json> [ziel.zip]');
  process.exit(1);
}

const result = JSON.parse(await readFile(rawPath, 'utf8'));
if (!result?.raw) {
  console.error(`${rawPath} enthält kein raw-Feld — erwartet wird das result-Objekt {raw, interpretations}.`);
  process.exit(1);
}

const files = storybookFiles(result);

const defaultOut = path.resolve(
  dirname,
  '../../storybook-harness/fixtures',
  `${path.basename(rawPath, '.json').replace(/-raw$/, '')}-export.zip`,
);
const outPath = process.argv[3] ? path.resolve(process.argv[3]) : defaultOut;

const zip = new JSZip();
for (const [p, content] of Object.entries(files)) zip.file(p, content);
const buffer = await zip.generateAsync({ type: 'nodebuffer' });
await mkdir(path.dirname(outPath), { recursive: true });
await writeFile(outPath, buffer);

// Kurzbericht: pro Komponente die erste JSX-Zeile mit einem gegroundeten Tag — daran ist auf einen
// Blick sichtbar, ob komponiert wird (`<Card className="flex flex-col …">`) oder eingeschmolzen
// (`<Card>Text Text Text</Card>`).
console.log(`Paket geschrieben: ${outPath}`);
for (const [file, content] of Object.entries(files)) {
  if (!file.startsWith('components/')) continue;
  const line = String(content).split('\n').find((l) => /<(Card|Button|Badge|Input|Label|Avatar)\b/.test(l));
  console.log(`  ${file}: ${line ? line.trim() : '(kein gegroundeter Baustein)'}`);
}
