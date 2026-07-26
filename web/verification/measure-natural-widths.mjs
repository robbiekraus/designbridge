// Messwerkzeug für den Skalierungspfad (Fund 26.07.2026) — OHNE einen einzigen KI-Call.
//
// WARUM DAS NÖTIG IST: der Figma-Emit skaliert jeden Baustein um `Zielbreite / natürliche
// Breite` (siehe scalePlan.js). Die natürliche Breite wird per getBoundingClientRect in
// einem 1024px breiten Messbehälter gemessen — und jsdom hat keine Layout-Engine, liefert
// dort also 0. Der Sicherheitsriegel in scaleFactor macht daraus den Faktor 1. Ergebnis:
// DER GESAMTE SKALIERUNGSPFAD IST IN DER VITEST-SUITE UNSICHTBAR. Deshalb dieses Werkzeug:
// es misst in einem ECHTEN Browser.
//
// Benutzung:
//   cd web
//   node verification/measure-natural-widths.mjs ../storybook-harness/fixtures/prod-scan-raw.json
//   # dann die ausgegebene Datei im Browser öffnen (Anleitung wird mitgedruckt)
//
// Die Seite legt ihr Ergebnis zusätzlich als `window.__ROWS` ab, damit ein Browser-Werkzeug
// es direkt auslesen kann statt per Screenshot.

import fs from 'node:fs';
import path from 'node:path';

const [rawPath, outPathArg] = process.argv.slice(2);
if (!rawPath) {
  console.error('Aufruf: node verification/measure-natural-widths.mjs <raw-scan.json> [out.html]');
  process.exit(1);
}
const outPath = outPathArg || 'verification/natural-widths.html';

const raw = JSON.parse(fs.readFileSync(rawPath, 'utf8'));
if (!raw.interpretations) {
  console.error(`${rawPath} enthält kein "interpretations"-Feld — ist das ein Roh-Scan?`);
  process.exit(1);
}

// bbox + gemessene Typo-Token einsammeln: die Token sind der einzige unabhängige Maßstab,
// den wir haben (die KI hat sie am echten Bild gemessen, inkl. Beispieltext).
const bboxOf = {};
for (const grp of ['atoms', 'molecules', 'organisms', 'templates']) {
  for (const it of raw.raw?.[grp] || []) bboxOf[it.name] = it.bbox;
}
const typography = (raw.raw?.tokens?.typography || []).map((t) => ({
  size: t.size,
  role: t.role,
  sample: t.sample,
}));

const items = Object.entries(raw.interpretations)
  .filter(([, e]) => e && typeof e.html === 'string')
  .map(([name, e]) => ({ name, html: e.html, bboxW: bboxOf[name]?.w ?? null }));

const page = `<!doctype html>
<meta charset="utf-8">
<title>Natürliche Breiten — Skalierungsmessung</title>
<body style="font:13px/1.5 -apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;padding:20px;color:#18181b">
<h2 style="font-size:16px;margin:0 0 4px">Skalierungsmessung: natürliche Breiten</h2>
<p style="color:#71717a;margin:0 0 16px">
  Quelle: <code>${path.basename(rawPath)}</code> · ${items.length} Bausteine ·
  Messbehälter 1024px (PREVIEW_VIRTUAL_WIDTH)
</p>
<div id="typo" style="margin-bottom:16px"></div>
<div style="overflow-x:auto"><table id="tab" style="border-collapse:collapse;font-size:12px"></table></div>
<h3 style="font-size:14px;margin:20px 0 4px">Rohdaten (window.__ROWS)</h3>
<pre id="out" style="background:#f4f4f5;padding:12px;border-radius:6px;overflow-x:auto">rechne …</pre>
<script>
const ITEMS = ${JSON.stringify(items)};
const TYPO = ${JSON.stringify(typography)};
const VIRTUAL_WIDTH = 1024, VIRTUAL_HEIGHT = 768;
// Bildbreite des eingefrorenen CRAFTUI-Scans. Steht NICHT in den Rohdaten (kein Feld) —
// bei einem anderen Scan hier anpassen, sonst sind die Ziel-Slots falsch.
const IMAGE_WIDTH = 2296;

function measure(htmlStr, { maxContent = false, containerWidth = VIRTUAL_WIDTH } = {}) {
  const c = document.createElement('div');
  c.style.position = 'absolute';
  c.style.top = '0px';
  c.style.left = '-99999px';
  c.style.width = containerWidth + 'px';
  c.style.height = VIRTUAL_HEIGHT + 'px';
  c.style.boxSizing = 'border-box';
  c.innerHTML = htmlStr;
  document.body.appendChild(c);
  const root = c.children[0];
  let width = 0, biggestFont = 0;
  if (root) {
    if (maxContent) root.style.width = 'max-content';
    width = Math.round(root.getBoundingClientRect().width);
    for (const el of [root, ...root.querySelectorAll('*')]) {
      const fs = parseFloat(getComputedStyle(el).fontSize) || 0;
      if (el.textContent && el.textContent.trim() && fs > biggestFont) biggestFont = fs;
    }
  }
  c.remove();
  return { width, biggestFont };
}

const rows = [];
for (const it of ITEMS) {
  const slot = it.bboxW != null ? it.bboxW * IMAGE_WIDTH : null;
  const heute = measure(it.html);
  const maxc = measure(it.html, { maxContent: true });
  const imSlot = slot ? measure(it.html, { containerWidth: Math.round(slot) }) : { width: 0, biggestFont: 0 };
  const f = (nat) => (slot && nat ? slot / nat : null);
  const font = (m, factor) => (m.biggestFont > 0 && factor ? Math.max(1, Math.round(m.biggestFont * factor)) : null);
  rows.push({
    name: it.name,
    slot: slot ? Math.round(slot) : null,
    natHeute: heute.width,
    natMaxContent: maxc.width,
    gestreckt: heute.width >= VIRTUAL_WIDTH,
    faktorHeute: f(heute.width) ? +f(heute.width).toFixed(3) : null,
    faktorMaxContent: f(maxc.width) ? +f(maxc.width).toFixed(3) : null,
    schriftHeute: font(heute, f(heute.width)),
    schriftMaxContent: font(maxc, f(maxc.width)),
    schriftImSlot: imSlot.biggestFont ? Math.round(imSlot.biggestFont) : null,
  });
}

const COLS = [
  ['Baustein', 'name'], ['Ziel-Slot', 'slot'], ['nat. heute', 'natHeute'],
  ['nat. max-content', 'natMaxContent'], ['gestreckt', 'gestreckt'],
  ['Schrift heute', 'schriftHeute'], ['Schrift max-content', 'schriftMaxContent'],
  ['Schrift im Slot', 'schriftImSlot'],
];
const tab = document.getElementById('tab');
tab.innerHTML =
  '<tr>' + COLS.map(([h]) => \`<th style="text-align:left;padding:4px 10px;border-bottom:1px solid #d4d4d8">\${h}</th>\`).join('') + '</tr>' +
  rows.map((r) => '<tr>' + COLS.map(([, k]) => {
    const v = r[k] === true ? 'JA' : r[k] === false ? '–' : (r[k] ?? '—');
    const warn = (k === 'schriftHeute' && r[k] != null && r[k] < 12) || (k === 'gestreckt' && r[k] === true);
    return \`<td style="padding:4px 10px;border-bottom:1px solid #f4f4f5;\${warn ? 'color:#dc2626;font-weight:600' : ''}">\${v}</td>\`;
  }).join('') + '</tr>').join('');

document.getElementById('typo').innerHTML =
  '<strong>Unabhängiger Maßstab — im Bild gemessene Typo-Token:</strong><br>' +
  (TYPO.length
    ? TYPO.map((t) => \`\${t.size}px &nbsp;<span style="color:#71717a">\${t.role} — „\${t.sample ?? ''}"</span>\`).join('<br>')
    : '<span style="color:#71717a">keine Typo-Token im Scan</span>');

document.getElementById('out').textContent = JSON.stringify(rows, null, 1);
window.__ROWS = rows;
window.__TYPO = TYPO;
</script>
</body>`;

fs.writeFileSync(outPath, page);
console.log(`Messseite geschrieben: ${outPath}`);
console.log(`  ${items.length} Bausteine · ${typography.length} Typo-Token als Maßstab`);
console.log('');
console.log('Im Browser ansehen (file:// funktioniert nicht überall zuverlässig):');
console.log(`  cd ${path.dirname(path.resolve(outPath))} && python3 -m http.server 8791`);
console.log(`  → http://localhost:8791/${path.basename(outPath)}`);
