import { test } from 'node:test';
import assert from 'node:assert/strict';
import { classifyByContainment, CONTAIN_RATIO, CANVAS_RATIO, SECTION_RATIO } from './taxonomy.js';

// Einfaches bbox-Modell für die Tests: ref = { x, y, w, h } als Flächen-Anteile 0..1.
const areaOf = (ref) => (ref ? ref.w * ref.h : 0);

function overlapArea(a, b) {
  const x1 = Math.max(a.x, b.x);
  const y1 = Math.max(a.y, b.y);
  const x2 = Math.min(a.x + a.w, b.x + b.w);
  const y2 = Math.min(a.y + a.h, b.y + b.h);
  const w = Math.max(0, x2 - x1);
  const h = Math.max(0, y2 - y1);
  return w * h;
}

// contains(a, b): b liegt zu >= CONTAIN_RATIO seiner Fläche in a UND a ist flächengrößer.
function contains(a, b) {
  const areaA = areaOf(a);
  const areaB = areaOf(b);
  if (areaA <= areaB) return false;
  if (areaB === 0) return false;
  return overlapArea(a, b) / areaB >= CONTAIN_RATIO;
}

test('classifyByContainment: ganzflächige Einheit mit 2 Kindern -> template', () => {
  const items = [
    { name: 'Screen', kind: 'organism', ref: { x: 0, y: 0, w: 1, h: 1 } },
    { name: 'Card A', kind: 'molecule', ref: { x: 0.05, y: 0.05, w: 0.3, h: 0.3 } },
    { name: 'Card B', kind: 'molecule', ref: { x: 0.5, y: 0.5, w: 0.3, h: 0.3 } },
  ];
  const result = classifyByContainment(items, { areaOf, contains });
  const screen = result.find((i) => i.name === 'Screen');
  assert.equal(screen.kind, 'template');
});

test('classifyByContainment: grosse Sektion (>= SECTION_RATIO) mit 2 Kindern -> organism', () => {
  const items = [
    { name: 'Section', kind: 'molecule', ref: { x: 0, y: 0, w: 0.4, h: 0.3 } }, // Fläche 0.12 >= 0.05
    { name: 'Child A', kind: 'atom', ref: { x: 0.02, y: 0.02, w: 0.1, h: 0.1 } },
    { name: 'Child B', kind: 'atom', ref: { x: 0.2, y: 0.15, w: 0.1, h: 0.1 } },
  ];
  const result = classifyByContainment(items, { areaOf, contains });
  const section = result.find((i) => i.name === 'Section');
  assert.equal(section.kind, 'organism');
});

test('classifyByContainment: kleine Kachel (< SECTION_RATIO) mit 2 Kindern -> bleibt molecule', () => {
  const items = [
    { name: 'KPI Tile', kind: 'molecule', ref: { x: 0, y: 0, w: 0.15, h: 0.15 } }, // Fläche 0.0225 < 0.05
    { name: 'Icon', kind: 'atom', ref: { x: 0.01, y: 0.01, w: 0.03, h: 0.03 } },
    { name: 'Label', kind: 'atom', ref: { x: 0.05, y: 0.1, w: 0.05, h: 0.02 } },
  ];
  const result = classifyByContainment(items, { areaOf, contains });
  const tile = result.find((i) => i.name === 'KPI Tile');
  assert.equal(tile.kind, 'molecule');
});

test('classifyByContainment: Atom ohne Enthaltung bleibt Atom (promote-only)', () => {
  const items = [
    { name: 'Lone Button', kind: 'atom', ref: { x: 0.4, y: 0.4, w: 0.1, h: 0.05 } },
  ];
  const result = classifyByContainment(items, { areaOf, contains });
  assert.equal(result[0].kind, 'atom');
});

test('classifyByContainment: genau EIN Template bei mehreren Kandidaten - flaechengroesster gewinnt', () => {
  const items = [
    { name: 'Screen', kind: 'organism', ref: { x: 0, y: 0, w: 1, h: 1 } },
    { name: 'Big Wrapper', kind: 'organism', ref: { x: 0, y: 0, w: 0.9, h: 0.9 } }, // Fläche 0.81 >= CANVAS_RATIO auch
    { name: 'Card A', kind: 'molecule', ref: { x: 0.05, y: 0.05, w: 0.3, h: 0.3 } },
    { name: 'Card B', kind: 'molecule', ref: { x: 0.5, y: 0.5, w: 0.3, h: 0.3 } },
  ];
  const result = classifyByContainment(items, { areaOf, contains });
  const templates = result.filter((i) => i.kind === 'template');
  assert.equal(templates.length, 1);
  assert.equal(templates[0].name, 'Screen');
});

test('classifyByContainment: leere Liste -> leer', () => {
  const result = classifyByContainment([], { areaOf, contains });
  assert.deepEqual(result, []);
});

test('Konstanten sind wie in der Spec gepinnt', () => {
  assert.equal(CONTAIN_RATIO, 0.75);
  assert.equal(CANVAS_RATIO, 0.80);
  assert.equal(SECTION_RATIO, 0.05);
});
