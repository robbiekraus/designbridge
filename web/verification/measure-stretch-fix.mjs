#!/usr/bin/env node
// Prüft den STRETCH-Fix (experiment/stretch-sizing) an einem ECHTEN Figma-Import.
//
// WOZU: Die Plugin-Tests laufen gegen einen Stub OHNE Layout-Engine — sie können nur prüfen,
// dass die Sizing-Felder gesetzt werden, nie dass es wirkt. Ob der Fix greift, zeigt allein ein
// echter Import. Dieses Skript misst genau die Vorhersage aus der Diagnose:
//
//   KPI-Zeile       1802 px   (vorher 411)
//   jede KPI-Karte   583 px   (vorher 119)  = (1802 - 54) / 3, identisch zum HTML-Wert 260 * 2,2422
//
// Trifft die Vorhersage nicht zu, ist die Diagnose falsch — dann NICHT nachjustieren, bis die
// Ursache neu belegt ist.
//
// Benutzung (aus dem Repo-Root oder web/):
//   node web/verification/measure-stretch-fix.mjs <FILE_KEY>
//   node web/verification/measure-stretch-fix.mjs 5aqGy2xzYmSLkyM95yPNgy
//
// FIGMA_TOKEN wird aus der .env im Repo-Root gelesen (oder aus der Umgebung).
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(__dirname, '../..');

function figmaToken() {
  if (process.env.FIGMA_TOKEN) return process.env.FIGMA_TOKEN;
  const envPath = path.join(REPO, '.env');
  if (!fs.existsSync(envPath)) throw new Error('Kein FIGMA_TOKEN und keine .env gefunden.');
  const line = fs.readFileSync(envPath, 'utf8').split('\n').find((l) => l.startsWith('FIGMA_TOKEN='));
  if (!line) throw new Error('FIGMA_TOKEN steht nicht in der .env.');
  return line.slice('FIGMA_TOKEN='.length).trim();
}

const fileKey = process.argv[2];
if (!fileKey) {
  console.error('Aufruf: node web/verification/measure-stretch-fix.mjs <FIGMA_FILE_KEY>');
  process.exit(1);
}

const res = await fetch(`https://api.figma.com/v1/files/${fileKey}`, {
  headers: { 'X-Figma-Token': figmaToken() },
});
if (!res.ok) throw new Error(`${res.status} beim Laden von ${fileKey}`);
const file = await res.json();

const page = (file.document.children || []).find((p) => (p.name || '').includes('DesignBridge'));
if (!page) throw new Error('Keine Seite „🌉 DesignBridge" — wurde der Import überhaupt ausgeführt?');

const w = (n) => (n.absoluteBoundingBox ? Math.round(n.absoluteBoundingBox.width) : null);
const h = (n) => (n.absoluteBoundingBox ? Math.round(n.absoluteBoundingBox.height) : null);

// ── 1. Die Vorhersage: KPI-Zeile + KPI-Karten ────────────────────────────────
// Die KPI-Karten sind keine Instanzen, sondern Rahmen im Template. Sie sicher zu finden geht
// über ihren Text: jede trägt genau einen der drei Titel.
const KPI_TITLES = ['Carbon Emissions', 'Energy Consumption', 'Biogenic Emissions'];
const tplSection = page.children.find((s) => s.name === 'DB/Templates');
if (!tplSection) throw new Error('Sektion DB/Templates fehlt.');

function textsOf(node, acc = []) {
  if (node.type === 'TEXT' && node.characters) acc.push(node.characters.trim());
  for (const c of node.children || []) textsOf(c, acc);
  return acc;
}
/** Die drei KPI-Karten sind die DIREKTEN Kinder der KPI-Zeile — nicht tiefer suchen.
 *  (Eine Ebene tiefer säße der Inhalts-Rahmen, der beim Fehlerbild ÜBERSTEHT: 267 px in einer
 *  auf 119 px geklemmten Karte. Gemessen werden muss die Karte selbst, nicht ihr Inhalt.) */
function kpiCardsOf(rowNode) {
  if (!rowNode) return [];
  return (rowNode.children || [])
    .filter((c) => c.type !== 'TEXT')
    .map((c) => {
      const t = textsOf(c);
      return { title: KPI_TITLES.find((title) => t.includes(title)) ?? c.name ?? '?', node: c };
    });
}
/** Kleinster Rahmen, der ALLE drei Titel enthält = die KPI-Zeile. */
function findKpiRow(node) {
  for (const c of node.children || []) {
    const t = textsOf(c);
    if (KPI_TITLES.every((title) => t.includes(title))) return findKpiRow(c) || c;
  }
  return null;
}

const row = findKpiRow(tplSection);
const cards = kpiCardsOf(row);

const EXPECT_ROW = 1802;
const EXPECT_CARD = 583;
const TOL = 12; // px — Rundung/Padding-Rauschen, nicht mehr

console.log('── VORHERSAGE-PRÜFUNG ──────────────────────────────');
let ok = true;
if (!row) {
  console.log('  KPI-Zeile: NICHT GEFUNDEN');
  ok = false;
} else {
  const d = Math.abs(w(row) - EXPECT_ROW);
  const pass = d <= TOL;
  ok = ok && pass;
  console.log(`  KPI-Zeile      ${String(w(row)).padStart(5)} px   erwartet ${EXPECT_ROW}   ${pass ? '✅' : '❌ (vorher 411)'}`);
}
for (const c of cards) {
  const d = Math.abs(w(c.node) - EXPECT_CARD);
  const pass = d <= TOL;
  ok = ok && pass;
  console.log(`  ${c.title.padEnd(20)} ${String(w(c.node)).padStart(5)} px   erwartet ${EXPECT_CARD}   ${pass ? '✅' : '❌ (vorher 119)'}`);
}
if (cards.length !== 3) {
  console.log(`  ⚠️  ${cards.length} statt 3 KPI-Karten gefunden — Struktur prüfen.`);
  ok = false;
}

// ── 2. Gegenprobe: Überläufe + Regressionswächter ────────────────────────────
let over = 0;
let tiny = 0;
let nodes = 0;
const bySection = {};
function walk(n, parent, section) {
  nodes++;
  if (n.type === 'TEXT' && n.style?.fontSize && n.style.fontSize < 10) tiny++;
  const b = n.absoluteBoundingBox;
  if (parent?.absoluteBoundingBox && b && parent.clipsContent !== false) {
    const pb = parent.absoluteBoundingBox;
    const dx = Math.round(b.x + b.width - (pb.x + pb.width));
    const dy = Math.round(b.y + b.height - (pb.y + pb.height));
    if (dx > 2 || dy > 2) {
      over++;
      bySection[section] = (bySection[section] || 0) + 1;
    }
  }
  for (const c of n.children || []) walk(c, n, section);
}
for (const s of page.children) walk(s, null, s.name);

console.log('\n── GEGENPROBE ──────────────────────────────────────');
console.log(`  Knoten gesamt:          ${nodes}`);
console.log(`  Überläufe (clippend):   ${over}   ${over === 0 ? '✅' : '(vorher 9)'}`);
for (const [k, v] of Object.entries(bySection)) console.log(`      ${v}x  ${k}`);
console.log(`  Miniatur-Text (<10px):  ${tiny}   ${tiny === 0 ? '✅' : '❌'}`);

// Regressionswächter: Atoms/Molecules/DS dürfen sich NICHT verändert haben.
const GUARD = {
  'DB/Atoms': 4,
  'DB/Molecules': 7,
  'DB/Organisms': 10,
  'DB/Design System': 16,
};
console.log('\n── REGRESSIONSWÄCHTER (Sektionsumfang) ─────────────');
for (const [name, expect] of Object.entries(GUARD)) {
  const sec = page.children.find((s) => s.name === name);
  const got = sec ? (sec.children || []).filter((c) => c.type !== 'TEXT').length : 0;
  const pass = got === expect;
  ok = ok && pass;
  console.log(`  ${name.padEnd(20)} ${String(got).padStart(3)} / ${expect}  ${pass ? '✅' : '❌'}`);
}

console.log(`\n${ok ? '✅ VORHERSAGE GETROFFEN — Fix greift.' : '❌ VORHERSAGE VERFEHLT — Diagnose neu belegen, NICHT nachjustieren.'}`);
process.exit(ok ? 0 : 1);
