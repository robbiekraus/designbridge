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
    'Dashboard Grid Layout', 'Metrics Overview', 'Sidebar + Content Shell',
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
