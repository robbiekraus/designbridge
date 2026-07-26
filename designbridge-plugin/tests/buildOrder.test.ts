// Unit tests für die Bau-Reihenfolge nach Abhängigkeiten (Writer-Ordering, 27.07.2026).
//
// Befund aus Robs E2E-Lauf: „Komponente „Popular Categories Card" nicht gefunden — Fallback
// gerendert". Ursache: `Left Sidebar Navigation` splict zwei Organismen ein, die in der Payload
// NACH ihr stehen; `findComponentByName` (renderPlan.ts) durchsucht nur die bereits gebauten
// Sektions-Kinder und läuft ins Leere.
//
// Reine Funktion, kein figma-Global nötig.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { orderComponentsByDependency } from '../src/writer/buildOrder';
import type { ImportComponent, PlanBox, PlanNode } from '../src/writer/parsePayload';

// ─── Bauhelfer ────────────────────────────────────────────────────────────────

function box(children: PlanNode[] = []): PlanBox {
  return {
    type: 'box',
    layout: 'column',
    padding: [0, 0, 0, 0],
    radius: 0,
    fill: null,
    stroke: null,
    children,
    width: null,
    height: null,
    gap: 0,
    strokeWeight: 0,
    primaryAlign: 'MIN',
    counterAlign: 'MIN',
  };
}

function ref(name: string, fallback: PlanBox | null = null): PlanNode {
  return { type: 'component-ref', name, variant: null, fallback };
}

function comp(name: string, kind: ImportComponent['kind'], plan: PlanBox | null): ImportComponent {
  return {
    name,
    kind,
    confidence: null,
    source: null,
    notes: null,
    placeholder: false,
    variants: [{ name: 'default', plan }] as ImportComponent['variants'],
  };
}

const names = (list: ImportComponent[]): string[] => list.map((c) => c.name);

// ─── Tests ────────────────────────────────────────────────────────────────────

test('ohne Abhängigkeiten bleibt die Payload-Reihenfolge unverändert', () => {
  const list = [
    comp('A', 'organism', box()),
    comp('B', 'organism', box()),
    comp('C', 'atom', box()),
  ];
  assert.deepEqual(names(orderComponentsByDependency(list)), ['A', 'B', 'C']);
});

test('Robs Fall: eingesplicte Organismen werden VOR ihrem Elternteil gebaut', () => {
  const list = [
    comp('Left Sidebar Navigation', 'organism', box([
      ref('Popular Categories Card'),
      ref('Conversion History Card'),
    ])),
    comp('Popular Categories Card', 'organism', box()),
    comp('Conversion History Card', 'organism', box()),
  ];
  assert.deepEqual(names(orderComponentsByDependency(list)), [
    'Popular Categories Card',
    'Conversion History Card',
    'Left Sidebar Navigation',
  ]);
});

test('Refs auf Nicht-Payload-Namen (DS/…-Katalog) verschieben nichts', () => {
  // Die Katalog-Sektion wird ohnehin VOR allen Bausteinen gebaut (SectionFrames-Doc).
  const list = [
    comp('Card', 'molecule', box([ref('DS/Button'), ref('DS/Badge')])),
    comp('Header', 'organism', box()),
  ];
  assert.deepEqual(names(orderComponentsByDependency(list)), ['Card', 'Header']);
});

test('Abhängigkeiten in verschachtelten Kindern und in Fallbacks werden gefunden', () => {
  const list = [
    comp('Parent', 'template', box([
      box([box([ref('Deep Child')])]),
      // Ein Fallback-Baum kann selbst Refs tragen; wird er gerendert, müssen sie da sein.
      ref('DS/Card', box([ref('Fallback Child')])),
    ])),
    comp('Deep Child', 'organism', box()),
    comp('Fallback Child', 'molecule', box()),
  ];
  const out = names(orderComponentsByDependency(list));
  assert.ok(out.indexOf('Deep Child') < out.indexOf('Parent'), 'Deep Child vor Parent');
  assert.ok(out.indexOf('Fallback Child') < out.indexOf('Parent'), 'Fallback Child vor Parent');
});

test('Transitive Ketten werden vollständig aufgelöst', () => {
  const list = [
    comp('A', 'template', box([ref('B')])),
    comp('B', 'organism', box([ref('C')])),
    comp('C', 'molecule', box()),
  ];
  assert.deepEqual(names(orderComponentsByDependency(list)), ['C', 'B', 'A']);
});

test('Ein Zyklus bricht nicht ab und verliert keine Komponente', () => {
  // Kann der Emit theoretisch liefern (A splict B, B splict A). Einer der beiden MUSS
  // dann den Fallback rendern — das ist der Status quo, wichtig ist nur: kein Hänger,
  // kein Duplikat, kein Verlust.
  const list = [
    comp('A', 'organism', box([ref('B')])),
    comp('B', 'organism', box([ref('A')])),
    comp('C', 'atom', box()),
  ];
  const out = orderComponentsByDependency(list);
  assert.equal(out.length, 3);
  assert.deepEqual([...names(out)].sort(), ['A', 'B', 'C']);
});

test('Selbstreferenz ist kein Sonderfall', () => {
  const list = [comp('A', 'organism', box([ref('A')]))];
  assert.deepEqual(names(orderComponentsByDependency(list)), ['A']);
});

test('Jede Komponente kommt genau einmal vor, auch bei Namensdubletten', () => {
  // Zwei Bausteine gleichen Namens sind ein Payload-Fehler, dürfen aber nichts verschlucken.
  const list = [comp('A', 'atom', box()), comp('A', 'organism', box()), comp('B', 'atom', box([ref('A')]))];
  const out = orderComponentsByDependency(list);
  assert.equal(out.length, 3);
});

test('Platzhalter und Varianten ohne Plan werden mitgeführt', () => {
  const list = [
    comp('Parent', 'organism', box([ref('Ghost')])),
    { ...comp('Ghost', 'atom', null), placeholder: true },
  ];
  const out = names(orderComponentsByDependency(list));
  assert.deepEqual(out, ['Ghost', 'Parent']);
});
