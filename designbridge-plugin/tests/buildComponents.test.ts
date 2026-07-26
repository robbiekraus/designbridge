// Unit tests for the per-kind created/updated breakdown in buildComponents.ts
// (Fix 5 — Zähl-Wording Plugin vs. App, docs/superpowers/specs/2026-07-17-testrunde6-fixes-design.md).
//
// buildComponents.ts talks to the `figma` global directly, and no figma-API mock
// exists in this plugin yet (see parsePlan.test.ts's note). We install a minimal
// hand-rolled mock here — just enough surface for the PLACEHOLDER path
// (createFrame/createText/loadFontAsync/createComponentFromNode) since the
// per-kind tally is exercised identically on both the placeholder and the
// template/variant path (same `result.createdByKind[comp.kind] += 1` call site
// shape) — no new package, no jsdom.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { ImportComponent } from '../src/writer/parsePayload';

// ─── Minimal figma mock (placeholder-path surface only) ────────────────────────

function makeNode(type: string): any {
  const node: any = {
    type,
    name: '',
    children: [] as any[],
    fills: [] as unknown[],
    x: 0,
    y: 0,
    width: 10,
    height: 10,
    removed: false,
    appendChild(child: any) {
      node.children.push(child);
    },
    insertChild(index: number, child: any) {
      node.children.splice(index, 0, child);
    },
    remove() {
      node.removed = true;
    },
    resize(w: number, h: number) {
      node.width = w;
      node.height = h;
    },
    // Nur für den component-ref-Pfad (Writer-Ordering-Test): eine gefundene COMPONENT
    // wird instanziiert. Die Instanz trägt ihren Ursprung, damit der Test prüfen kann,
    // dass wirklich die echte Komponente und nicht der Fallback gerendert wurde.
    createInstance() {
      const inst = makeNode('INSTANCE');
      inst.name = node.name;
      inst.mainComponent = node;
      return inst;
    },
    findAll() {
      return [];
    },
  };
  return node;
}

(globalThis as any).figma = {
  createFrame: () => makeNode('FRAME'),
  createText: () => makeNode('TEXT'),
  loadFontAsync: async () => undefined,
  createNodeFromSvg: () => makeNode('VECTOR_GROUP'),
  createComponentFromNode: (node: any) => {
    node.type = 'COMPONENT';
    return node;
  },
  combineAsVariants: (nodes: any[], parent: any) => {
    const set = makeNode('COMPONENT_SET');
    for (const n of nodes) set.children.push(n);
    parent.appendChild(set);
    return set;
  },
};

// Imported AFTER the figma mock is installed — buildComponents only touches
// `figma` inside async function bodies, not at module top-level, so import
// order relative to the mock doesn't strictly matter, but this mirrors how
// the real plugin runtime provides the global before any writer code runs.
import { buildComponents, type SectionFrames } from '../src/writer/buildComponents';

function placeholderComponent(name: string, kind: ImportComponent['kind']): ImportComponent {
  return {
    name,
    kind,
    confidence: null,
    source: null,
    notes: null,
    placeholder: true,
    variants: [{ name: 'default', plan: null }],
  };
}

function makeSections(): SectionFrames {
  return {
    catalog: makeNode('SECTION'),
    atom: makeNode('SECTION'),
    molecule: makeNode('SECTION'),
    organism: makeNode('SECTION'),
    template: makeNode('SECTION'),
  } as unknown as SectionFrames;
}

// Robs Figma-Datei UuoCS1lCmtRPfAE10Mjter (26.07.): das gescannte Atom „Button" kam als Set mit
// 3 Varianten an, alle auf derselben Koordinate (Set-Box 73×32) — Figma markiert das rot.
// Gleiche Ursache wie bei den DS-Komponenten: vor combineAsVariants wird keine Position gesetzt.
test('Varianten eines gescannten Component Sets überlappen einander nicht', async () => {
  const emptyBox = () => ({
    type: 'box' as const, layout: 'row' as const, padding: [0, 0, 0, 0] as [number, number, number, number],
    radius: 0, fill: null, stroke: null, strokeWeight: 1, gap: 0, width: null, height: null,
    primaryAlign: 'MIN' as const, counterAlign: 'CENTER' as const, children: [],
  });
  const components: ImportComponent[] = [{
    name: 'Button', kind: 'atom', confidence: null, source: null, notes: null, placeholder: false,
    variants: [
      { name: 'primary', plan: emptyBox() },
      { name: 'secondary', plan: emptyBox() },
      { name: 'ghost', plan: emptyBox() },
    ],
  }];
  const sections = makeSections();

  await buildComponents(components, sections, new Map());

  const set = (sections.atom as any).children[0];
  assert.equal(set.type, 'COMPONENT_SET');
  assert.equal(set.children.length, 3);
  for (let i = 0; i < set.children.length; i++) {
    for (let j = i + 1; j < set.children.length; j++) {
      const a = set.children[i];
      const b = set.children[j];
      const overlaps = a.x < b.x + b.width && b.x < a.x + a.width
        && a.y < b.y + b.height && b.y < a.y + a.height;
      assert.equal(overlaps, false, `„${a.name}" (${a.x},${a.y}) überlappt „${b.name}" (${b.x},${b.y})`);
    }
  }
});

test('mixed payload (3 atom, 9 organism, 1 template), all new: createdByKind matches', async () => {
  const components: ImportComponent[] = [
    ...['A1', 'A2', 'A3'].map((n) => placeholderComponent(n, 'atom')),
    ...['C1', 'C2', 'C3', 'C4', 'C5', 'C6', 'C7', 'C8', 'C9'].map((n) => placeholderComponent(n, 'organism')),
    placeholderComponent('P1', 'template'),
  ];
  const sections = makeSections();

  const result = await buildComponents(components, sections, new Map());

  assert.equal(result.created, 13);
  assert.equal(result.updated, 0);
  assert.deepEqual(result.createdByKind, { atom: 3, molecule: 0, organism: 9, template: 1 });
  assert.deepEqual(result.updatedByKind, { atom: 0, molecule: 0, organism: 0, template: 0 });
  assert.equal(result.placeholders, 13);
});

test('re-running against existing components tallies updatedByKind per kind', async () => {
  const components: ImportComponent[] = [
    placeholderComponent('A1', 'atom'),
    placeholderComponent('A2', 'atom'),
    placeholderComponent('P1', 'template'),
  ];
  const sections = makeSections();
  // Pre-seed one atom and the template as already existing (by name) —
  // buildComponents' findByName() match drives the created/updated branch.
  const existingA1 = makeNode('COMPONENT');
  existingA1.name = 'A1';
  sections.atom.appendChild(existingA1);
  const existingP1 = makeNode('COMPONENT');
  existingP1.name = 'P1';
  sections.template.appendChild(existingP1);

  const result = await buildComponents(components, sections, new Map());

  assert.equal(result.created, 1); // A2 only
  assert.equal(result.updated, 2); // A1 + P1
  assert.deepEqual(result.createdByKind, { atom: 1, molecule: 0, organism: 0, template: 0 });
  assert.deepEqual(result.updatedByKind, { atom: 1, molecule: 0, organism: 0, template: 1 });
});

// ─── Writer-Ordering (27.07.2026) ─────────────────────────────────────────────
// Befund aus dem E2E-Lauf: „Komponente „Popular Categories Card" nicht gefunden — Fallback
// gerendert". `Left Sidebar Navigation` splict zwei Organismen ein, die in der Payload NACH ihr
// stehen; `findComponentByName` sieht nur bereits gebaute Sektions-Kinder.
test('ein später in der Payload stehender Baustein wird trotzdem als Instanz aufgelöst', async () => {
  const emptyBox = () => ({
    type: 'box' as const, layout: 'column' as const, padding: [0, 0, 0, 0] as [number, number, number, number],
    radius: 0, fill: null, stroke: null, strokeWeight: 1, gap: 0, width: null, height: null,
    primaryAlign: 'MIN' as const, counterAlign: 'MIN' as const, children: [] as any[],
  });
  const parentPlan = { ...emptyBox(), children: [
    { type: 'component-ref' as const, name: 'Popular Categories Card', variant: null, fallback: emptyBox() },
  ] };
  const components: ImportComponent[] = [
    { name: 'Left Sidebar Navigation', kind: 'organism', confidence: null, source: null, notes: null,
      placeholder: false, variants: [{ name: 'default', plan: parentPlan }] },
    placeholderComponent('Popular Categories Card', 'organism'),
  ];
  const sections = makeSections();

  const result = await buildComponents(components, sections, new Map());

  assert.deepEqual(result.skipped, []);
  // Die Abhängigkeit steht jetzt VOR ihrem Elternteil in der Sektion.
  const built = (sections.organism as any).children.map((c: any) => c.name);
  assert.deepEqual(built, ['Popular Categories Card', 'Left Sidebar Navigation']);
  // Und im Elternteil hängt eine echte Instanz, kein Fallback-Frame.
  const parentSet = (sections.organism as any).children[1];
  const parentVariant = parentSet.children[0];
  const child = parentVariant.children[0];
  assert.equal(child.type, 'INSTANCE', 'Ref wurde als Instanz aufgelöst, nicht als Fallback-Frame');
  assert.equal(child.mainComponent.name, 'Popular Categories Card');
});
