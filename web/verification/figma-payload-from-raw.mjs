// Figma-Payload aus einem EINGEFRORENEN Scan-Ergebnis emittieren und prüfen — ohne einen einzigen
// KI-Call (Schwester von reemit-from-raw.mjs, gleiche Begründung: der Emit kostet kein Gemini-
// Kontingent, die Interpretation schon).
//
// Zweck (Spec 2026-07-25-katalog-als-figma-library-design.md §Abnahme 1): belegt an ECHTEN
// Prod-Rohdaten, dass
//   · die DS-Bibliothek (`catalog`) im Payload liegt,
//   · gescannte Bausteine ◇-Instanzen davon referenzieren (`DS/…`),
//   · JEDER dieser Refs einen `fallback` hat (altes Plugin → heutiges Bild),
//   · jeder Ref auf einen Namen UND eine Variante zeigt, die die Bibliothek wirklich enthält,
//   · und der `scale`-Wert zum Skalierungsfaktor des Bausteins passt.
//
// Aufruf (aus web/, nach npm install):
//   node verification/figma-payload-from-raw.mjs ../storybook-harness/fixtures/prod-scan-raw.json
//   node verification/figma-payload-from-raw.mjs <raw.json> [payload.json]
//
// GRENZE (wie bei reemit-from-raw.mjs): jsdom hat keine Layout-Engine → Maße/Abstände sind hier nicht
// aussagekräftig, Struktur/Namen/Refs/Grounding sind es.
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { JSDOM } from 'jsdom';

const dom = new JSDOM('<!doctype html><html><body></body></html>');
globalThis.document = dom.window.document;
globalThis.getComputedStyle = dom.window.getComputedStyle.bind(dom.window);
globalThis.window = dom.window;
globalThis.Element = dom.window.Element;

const { emitFigmaComponents, emitFigmaLibrary } = await import('../src/lib/emit/emitFigmaComponents.js');
const { emitFigma } = await import('../src/lib/emit/emitFigma.js');
const { normalizeTokens } = await import('../src/lib/emit/normalizeTokens.js');

const rawPath = process.argv[2];
if (!rawPath) {
  console.error('Nutzung: node verification/figma-payload-from-raw.mjs <raw.json> [payload.json]');
  process.exit(1);
}

const result = JSON.parse(await readFile(rawPath, 'utf8'));
if (!result?.raw) {
  console.error(`${rawPath} enthält kein raw-Feld — erwartet wird {raw, interpretations}.`);
  process.exit(1);
}

const components = emitFigmaComponents(result);
const library = emitFigmaLibrary(result);
const payload = JSON.parse(emitFigma(normalizeTokens(result.raw.tokens), components, library));

// ─── Auswertung ───────────────────────────────────────────────────────────────

function walk(node, visit) {
  if (!node || typeof node !== 'object') return;
  visit(node);
  if (node.type === 'component-ref') return walk(node.fallback, visit);
  for (const c of node.children || []) walk(c, visit);
}

const libraryByName = new Map(library.map((e) => [e.name, e]));
const dsRefs = [];
const scanRefs = [];
for (const comp of components) {
  for (const v of comp.variants) {
    walk(v.plan, (n) => {
      if (n.type !== 'component-ref') return;
      (n.name.startsWith('DS/') ? dsRefs : scanRefs).push({ owner: comp.name, ref: n });
    });
  }
}

const problems = [];
for (const { owner, ref } of dsRefs) {
  if (!ref.fallback) problems.push(`${owner}: Ref „${ref.name}" ohne fallback (altes Plugin sähe nichts)`);
  const entry = libraryByName.get(ref.name);
  if (!entry) {
    problems.push(`${owner}: Ref zeigt auf „${ref.name}", das in der Bibliothek fehlt`);
    continue;
  }
  if (ref.variant !== null && !entry.variants.some((v) => v.name === ref.variant)) {
    problems.push(`${owner}: Variante „${ref.variant}" von „${ref.name}" fehlt in der Bibliothek`);
  }
  if (ref.variant === null && entry.variants.length > 1) {
    problems.push(`${owner}: Ref auf „${ref.name}" ohne Variante, obwohl die Bibliothek ${entry.variants.length} hat`);
  }
}

const scales = new Set(dsRefs.map(({ ref }) => ref.scale ?? 1));
const byName = new Map();
for (const { ref } of dsRefs) byName.set(ref.name, (byName.get(ref.name) ?? 0) + 1);

console.log(`Quelle: ${rawPath}`);
console.log(`Bausteine: ${components.length} · Bibliothek: ${library.length} Einträge`);
for (const e of library) console.log(`  ${e.name.padEnd(16)} ${e.variants.length} Variante(n)  [${e.source ?? '—'}]`);
console.log(`DS-Instanz-Refs: ${dsRefs.length}` + (dsRefs.length ? ` → ${[...byName].map(([n, c]) => `${n}×${c}`).join(', ')}` : ''));
console.log(`Scan-interne Refs (unberührt): ${scanRefs.length}`);
console.log(`Maßstäbe der Instanzen: ${[...scales].map((s) => s.toFixed(2)).join(', ') || '—'}`);
const withText = dsRefs.filter(({ ref }) => typeof ref.overrideText === 'string');
console.log(`Mit Text-Override: ${withText.length}` + (withText.length ? ` (z. B. „${withText[0].ref.overrideText}")` : ''));

if (problems.length) {
  console.log(`\n❌ ${problems.length} Problem(e):`);
  for (const p of problems) console.log(`  · ${p}`);
} else {
  console.log('\n✅ Jeder DS-Ref hat einen Fallback und zeigt auf eine existierende Komponente/Variante.');
}

const outPath = process.argv[3];
if (outPath) {
  await writeFile(path.resolve(outPath), JSON.stringify(payload, null, 2) + '\n');
  console.log(`\nPayload geschrieben: ${outPath}`);
}

process.exit(problems.length ? 1 : 0);
