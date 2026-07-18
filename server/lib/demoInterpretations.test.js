// server/lib/demoInterpretations.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FIXTURE = path.join(__dirname, '../fixtures/demo-interpretations.json');

test('Fixture existiert, ist valides JSON-Array', () => {
  const all = JSON.parse(fs.readFileSync(FIXTURE, 'utf8'));
  assert.ok(Array.isArray(all));
  assert.ok(all.length >= 12);
});

test('jeder Eintrag hat name/html/jsx, html ist script-frei', () => {
  const all = JSON.parse(fs.readFileSync(FIXTURE, 'utf8'));
  for (const e of all) {
    assert.equal(typeof e.name, 'string');
    assert.ok(e.name.length > 0);
    assert.ok(e.html.trim().length > 0, `${e.name}: html leer`);
    assert.equal(typeof e.jsx, 'string');
    assert.doesNotMatch(e.html, /<script/i, `${e.name}: script im html`);
    assert.doesNotMatch(e.html, /\son\w+=/i, `${e.name}: on*-Handler im html`);
  }
});

test('deckt die Nicht-Template-Bausteine der Demo-Dashboard-Fixture ab', () => {
  const all = JSON.parse(fs.readFileSync(FIXTURE, 'utf8'));
  const names = new Set(all.map((e) => e.name));
  for (const required of [
    'Avatar', 'Status Dot', 'Sidebar Navigation', 'Donut Chart', 'Bar Chart',
    'Data Table', 'Tooltip', 'Segmented Control', 'Category List Item',
    'Dashboard Layout',
  ]) {
    assert.ok(names.has(required), `fehlt: ${required}`);
  }
});

test('fixture covers newly-routed content cards distinctly', () => {
  const all = JSON.parse(fs.readFileSync(FIXTURE, 'utf8'));
  const byName = Object.fromEntries(all.map((i) => [i.name, i]));
  assert.ok(byName['Stat Card'] && byName['Line Chart Card']);
  assert.notEqual(byName['Stat Card'].html, byName['Line Chart Card'].html);
});

// Fix 14.07.: Der Tooltip-Schwanz war ein rotiertes Quadrat (transform:rotate) —
// der Konverter kennt kein transform, in Figma kam ein Viereck an. Vektor-Pflicht:
test('Tooltip-Schwanz ist ein SVG-Dreieck, kein CSS-Trick (rotate/border)', () => {
  const all = JSON.parse(fs.readFileSync(FIXTURE, 'utf8'));
  const tooltip = all.find((e) => e.name === 'Tooltip');
  assert.ok(tooltip, 'Tooltip-Eintrag fehlt');
  assert.match(tooltip.html, /<svg[^>]*>[\s\S]*<polygon/i, 'Schwanz muss SVG-polygon sein');
  assert.doesNotMatch(tooltip.html, /rotate\(/i, 'kein transform:rotate-Trick');
});
