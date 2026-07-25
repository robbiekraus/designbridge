// Tests für die DS-Komponenten-Bibliothek im Plugin (Spec: docs/superpowers/specs/
// 2026-07-25-katalog-als-figma-library-design.md).
//
// Drei Ebenen, drei Abschnitte:
//   1. parsePayload — das neue `catalog`-Feld + die neuen PlanRef-Felder overrideText/scale.
//   2. buildCatalogComponents — Einzel-COMPONENT vs. COMPONENT_SET, Create-or-update.
//   3. renderComponentRef (über renderPlan) — Instanz + rescale + Text-Override + Fallback-Pfade.
//
// Wie in den bestehenden Plugin-Tests: handgerollte, minimale figma-Stubs, kein neues Package.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseImportPayload } from '../src/writer/parsePayload';
import type { PlanBox, PlanNode } from '../src/writer/parsePayload';

// ─── Stubs ────────────────────────────────────────────────────────────────────

type AnyNode = Record<string, unknown> & { type: string; name: string; children: AnyNode[] };

function makeNode(type: string): AnyNode {
  const node = {
    type,
    name: '',
    children: [] as AnyNode[],
    fills: [] as unknown[],
    strokes: [] as unknown[],
    removed: false,
    width: 10,
    height: 10,
    x: 0,
    y: 0,
    layoutPositioning: 'AUTO',
    layoutAlign: 'INHERIT',
    layoutGrow: 0,
    clipsContent: true,
    characters: '',
    fontName: { family: 'Inter', style: 'Regular' } as unknown,
    textAutoResize: 'WIDTH_AND_HEIGHT',
    rescaledBy: [] as number[],
    appendChild(child: AnyNode) {
      node.children.push(child);
    },
    insertChild(index: number, child: AnyNode) {
      node.children.splice(index, 0, child);
    },
    remove() {
      node.removed = true;
    },
    resize(w: number, h: number) {
      node.width = w;
      node.height = h;
    },
    rescale(f: number) {
      (node.rescaledBy as number[]).push(f);
    },
    findAll(pred: (n: AnyNode) => boolean): AnyNode[] {
      const out: AnyNode[] = [];
      const walk = (n: AnyNode) => {
        for (const c of n.children) {
          if (pred(c)) out.push(c);
          walk(c);
        }
      };
      walk(node);
      return out;
    },
    setFillStyleIdAsync: async () => {},
  } as unknown as AnyNode;
  return node;
}

function installFigmaStub(): { sets: AnyNode[] } {
  const sets: AnyNode[] = [];
  (globalThis as unknown as { figma: unknown }).figma = {
    createFrame: () => makeNode('FRAME'),
    createText: () => makeNode('TEXT'),
    loadFontAsync: async () => {},
    createNodeFromSvg: () => makeNode('VECTOR_GROUP'),
    createComponentFromNode: (node: AnyNode) => {
      (node as { type: string }).type = 'COMPONENT';
      return node;
    },
    combineAsVariants: (nodes: AnyNode[], parent: AnyNode) => {
      const set = makeNode('COMPONENT_SET');
      for (const n of nodes) set.children.push(n);
      parent.appendChild(set);
      sets.push(set);
      return set;
    },
  };
  return { sets };
}

function box(overrides: Partial<PlanBox> = {}): PlanBox {
  return {
    type: 'box', layout: 'row', padding: [0, 0, 0, 0], radius: 0, fill: null, stroke: null,
    strokeWeight: 1, gap: 0, width: null, height: null, primaryAlign: 'MIN', counterAlign: 'CENTER',
    children: [], ...overrides,
  };
}

function textNode(content: string): PlanNode {
  return {
    type: 'text', content, fontSize: 14, fontWeight: 400,
    color: { token: null, hex: '#000000' }, align: 'left', lineHeight: null, absolute: null,
  };
}

// ─── 1. parsePayload ──────────────────────────────────────────────────────────

function payload(extra: Record<string, unknown>): string {
  return JSON.stringify({ designbridge: 'figma-import', colors: [], text: [], components: [], ...extra });
}

test('catalog: Einträge mit Namen und Varianten werden geparst', () => {
  const parsed = parseImportPayload(payload({
    catalog: [{
      name: 'DS/Button', catalogName: 'Button', source: 'shadcn-default',
      variants: [
        { name: 'variant=default, size=default', plan: { type: 'box', children: [] } },
        { name: 'variant=secondary, size=default', plan: { type: 'box', radius: 6, children: [] } },
      ],
    }],
  }));
  assert.equal(parsed.catalog.length, 1);
  assert.equal(parsed.catalog[0].name, 'DS/Button');
  assert.equal(parsed.catalog[0].variants.length, 2);
  assert.equal(parsed.catalog[0].variants[1].plan?.radius, 6);
});

test('catalog: fehlt ganz → leeres Array (abwärtskompatibel)', () => {
  assert.deepEqual(parseImportPayload(payload({ colors: [{ name: 'a', hex: '#fff' }] })).catalog, []);
});

test('catalog: Eintrag ohne Namen oder ohne gültige Variante wird verworfen', () => {
  const parsed = parseImportPayload(payload({
    catalog: [
      { variants: [{ name: 'default', plan: { type: 'box', children: [] } }] },      // kein Name
      { name: 'DS/Leer', variants: [] },                                            // keine Varianten
      { name: 'DS/Kaputt', variants: [{ name: 'default', plan: { type: 'text' } }] }, // Plan keine Box
      { name: 'DS/Gut', variants: [{ name: 'default', plan: { type: 'box', children: [] } }] },
    ],
  }));
  assert.deepEqual(parsed.catalog.map((e) => e.name), ['DS/Gut']);
});

test('catalog allein (ohne components/colors/text) ist ein gültiger Import', () => {
  const parsed = parseImportPayload(payload({
    catalog: [{ name: 'DS/Card', variants: [{ name: 'default', plan: { type: 'box', children: [] } }] }],
  }));
  assert.equal(parsed.catalog.length, 1);
});

test('component-ref: overrideText und scale werden übernommen', () => {
  const parsed = parseImportPayload(payload({
    components: [{
      name: 'T', kind: 'atom', placeholder: false,
      variants: [{ name: 'default', plan: { type: 'box', children: [
        { type: 'component-ref', name: 'DS/Button', variant: 'variant=secondary', overrideText: 'Details', scale: 2.25,
          fallback: { type: 'box', children: [] } },
      ] } }],
    }],
  }));
  const ref = parsed.components[0].variants[0].plan?.children[0] as Extract<PlanNode, { type: 'component-ref' }>;
  assert.equal(ref.overrideText, 'Details');
  assert.equal(ref.scale, 2.25);
});

test('component-ref: kaputte overrideText/scale-Werte werden weggelassen, nicht durchgereicht', () => {
  const parsed = parseImportPayload(payload({
    components: [{
      name: 'T', kind: 'atom', placeholder: false,
      variants: [{ name: 'default', plan: { type: 'box', children: [
        { type: 'component-ref', name: 'DS/Button', variant: null, overrideText: 42, scale: 'zwei', fallback: null },
        { type: 'component-ref', name: 'DS/Badge', variant: null, scale: 0, fallback: null },
        { type: 'component-ref', name: 'DS/Input', variant: null, scale: Number.POSITIVE_INFINITY, fallback: null },
      ] } }],
    }],
  }));
  const refs = parsed.components[0].variants[0].plan?.children as Array<Extract<PlanNode, { type: 'component-ref' }>>;
  assert.equal(refs[0].overrideText, undefined);
  assert.equal(refs[0].scale, undefined);
  assert.equal(refs[1].scale, undefined); // 0 ist kein gültiger Maßstab
  assert.equal(refs[2].scale, undefined); // Infinity ebenso nicht
});

// ─── 2. buildCatalogComponents ────────────────────────────────────────────────

test('buildCatalogComponents: Eintrag mit einer Variante „default" wird eine einzelne COMPONENT', async () => {
  installFigmaStub();
  const { buildCatalogComponents } = await import('../src/writer/buildCatalog');
  const section = makeNode('FRAME');
  const res = await buildCatalogComponents(
    [{ name: 'DS/Card', variants: [{ name: 'default', plan: box({ radius: 8 }) }] }],
    section as unknown as FrameNode,
    new Map(),
  );
  assert.equal(res.created, 1);
  assert.equal(res.updated, 0);
  assert.deepEqual(res.skipped, []);
  assert.equal(section.children.length, 1);
  assert.equal(section.children[0].type, 'COMPONENT');
  assert.equal(section.children[0].name, 'DS/Card');
});

test('buildCatalogComponents: mehrere Varianten → COMPONENT_SET, Kinder tragen den ROHEN Varianten-Namen', async () => {
  const { sets } = installFigmaStub();
  const { buildCatalogComponents } = await import('../src/writer/buildCatalog');
  const section = makeNode('FRAME');
  const res = await buildCatalogComponents(
    [{ name: 'DS/Button', variants: [
      { name: 'variant=default, size=default', plan: box() },
      { name: 'variant=secondary, size=default', plan: box() },
    ] }],
    section as unknown as FrameNode,
    new Map(),
  );
  assert.equal(res.created, 1);
  assert.equal(sets.length, 1);
  assert.equal(sets[0].name, 'DS/Button');
  assert.deepEqual(sets[0].children.map((c) => c.name), ['variant=default, size=default', 'variant=secondary, size=default']);
});

test('buildCatalogComponents: bestehender Eintrag wird an seiner Position ersetzt (Update)', async () => {
  installFigmaStub();
  const { buildCatalogComponents } = await import('../src/writer/buildCatalog');
  const section = makeNode('FRAME');
  const heading = makeNode('TEXT');
  const old = makeNode('COMPONENT');
  old.name = 'DS/Card';
  section.children.push(heading, old);

  const res = await buildCatalogComponents(
    [{ name: 'DS/Card', variants: [{ name: 'default', plan: box() }] }],
    section as unknown as FrameNode,
    new Map(),
  );
  assert.equal(res.updated, 1);
  assert.equal(res.created, 0);
  assert.equal(old.removed, true);
  // Der Stub-remove() markiert nur (wie in buildComponents.test.ts) und löst den Node nicht aus dem
  // Eltern-Array — geprüft wird deshalb die POSITION der frischen Komponente: direkt nach der
  // Überschrift, also dort, wo die alte stand.
  assert.equal(section.children[1].name, 'DS/Card');
  assert.equal(section.children[1].removed, false);
});

test('buildCatalogComponents: kaputter Eintrag landet in skipped, der Rest wird gebaut', async () => {
  installFigmaStub();
  const { buildCatalogComponents } = await import('../src/writer/buildCatalog');
  const section = makeNode('FRAME');
  const res = await buildCatalogComponents(
    [
      { name: 'DS/Leer', variants: [{ name: 'default', plan: null }] },
      { name: 'DS/Card', variants: [{ name: 'default', plan: box() }] },
    ],
    section as unknown as FrameNode,
    new Map(),
  );
  assert.equal(res.created, 1);
  assert.ok(res.skipped.length >= 1);
  assert.ok(res.skipped.every((s) => s.startsWith('DS/Leer')), `nur der kaputte Eintrag: ${res.skipped.join(' | ')}`);
});

// ─── 3. renderComponentRef ────────────────────────────────────────────────────

function sectionsWith(component: AnyNode | null) {
  const mk = () => makeNode('FRAME');
  const sections = {
    catalog: mk(), atom: mk(), molecule: mk(), organism: mk(), template: mk(),
  };
  if (component) sections.catalog.children.push(component);
  return sections as unknown as import('../src/writer/buildComponents').SectionFrames;
}

/** Ein COMPONENT-Stub, dessen Instanz einen Textknoten enthält (wie DS/Button). */
function componentWithText(name: string, withText = true) {
  const instances: AnyNode[] = [];
  const component = makeNode('COMPONENT');
  component.name = name;
  (component as unknown as { createInstance: () => AnyNode }).createInstance = () => {
    const inst = makeNode('INSTANCE');
    if (withText) {
      const t = makeNode('TEXT');
      (t as unknown as { characters: string }).characters = 'Button';
      inst.children.push(t);
    }
    instances.push(inst);
    return inst;
  };
  return { component, instances };
}

test('renderComponentRef: DS-Ref wird eine Instanz aus der Katalog-Sektion', async () => {
  installFigmaStub();
  const { renderPlan } = await import('../src/writer/renderPlan');
  const { component, instances } = componentWithText('DS/Button');
  const warnings: string[] = [];
  const frame = await renderPlan(
    box({ children: [{ type: 'component-ref', name: 'DS/Button', variant: null, fallback: box(), absolute: null }] }),
    new Map(), warnings, sectionsWith(component),
  );
  assert.equal(instances.length, 1);
  assert.equal((frame as unknown as AnyNode).children[0].type, 'INSTANCE');
  assert.deepEqual(warnings, []);
});

test('renderComponentRef: overrideText setzt den ersten Textknoten der Instanz', async () => {
  installFigmaStub();
  const { renderPlan } = await import('../src/writer/renderPlan');
  const { component, instances } = componentWithText('DS/Button');
  const warnings: string[] = [];
  await renderPlan(
    box({ children: [{ type: 'component-ref', name: 'DS/Button', variant: null, overrideText: 'Details',
      fallback: box(), absolute: null }] }),
    new Map(), warnings, sectionsWith(component),
  );
  assert.equal(instances[0].children[0].characters, 'Details');
  assert.deepEqual(warnings, []);
});

test('renderComponentRef: scale ruft rescale auf der Instanz', async () => {
  installFigmaStub();
  const { renderPlan } = await import('../src/writer/renderPlan');
  const { component, instances } = componentWithText('DS/Button');
  await renderPlan(
    box({ children: [{ type: 'component-ref', name: 'DS/Button', variant: null, scale: 2.24,
      fallback: box(), absolute: null }] }),
    new Map(), [], sectionsWith(component),
  );
  assert.deepEqual(instances[0].rescaledBy, [2.24]);
});

test('renderComponentRef: scale 1 rescaled NICHT (kein sinnloser Override auf der Instanz)', async () => {
  installFigmaStub();
  const { renderPlan } = await import('../src/writer/renderPlan');
  const { component, instances } = componentWithText('DS/Button');
  await renderPlan(
    box({ children: [{ type: 'component-ref', name: 'DS/Button', variant: null, scale: 1, fallback: box(), absolute: null }] }),
    new Map(), [], sectionsWith(component),
  );
  assert.deepEqual(instances[0].rescaledBy, []);
});

test('renderComponentRef: overrideText ohne Textknoten in der Instanz → Instanz weg, Fallback gerendert', async () => {
  installFigmaStub();
  const { renderPlan } = await import('../src/writer/renderPlan');
  const { component, instances } = componentWithText('DS/Button', false);
  const warnings: string[] = [];
  const frame = await renderPlan(
    box({ children: [{ type: 'component-ref', name: 'DS/Button', variant: null, overrideText: 'Details',
      fallback: box({ radius: 6, children: [textNode('Details')] }), absolute: null }] }),
    new Map(), warnings, sectionsWith(component),
  );
  const child = (frame as unknown as AnyNode).children[0];
  assert.equal(child.type, 'FRAME');          // Fallback-Frame, keine Instanz
  assert.equal(child.cornerRadius, 6);
  assert.equal(instances[0].removed, true);   // keine Waise
  assert.match(warnings.join(' '), /DS\/Button/);
});

test('renderComponentRef: wirft rescale, wird der Fallback gerendert statt eine kaputte Instanz zu behalten', async () => {
  installFigmaStub();
  const { renderPlan } = await import('../src/writer/renderPlan');
  const { component, instances } = componentWithText('DS/Button');
  (component as unknown as { createInstance: () => AnyNode }).createInstance = () => {
    const inst = makeNode('INSTANCE');
    (inst as unknown as { rescale: (f: number) => void }).rescale = () => {
      throw new Error('rescale nicht erlaubt');
    };
    instances.push(inst);
    return inst;
  };
  const warnings: string[] = [];
  const frame = await renderPlan(
    box({ children: [{ type: 'component-ref', name: 'DS/Button', variant: null, scale: 2,
      fallback: box({ radius: 6 }), absolute: null }] }),
    new Map(), warnings, sectionsWith(component),
  );
  assert.equal((frame as unknown as AnyNode).children[0].type, 'FRAME');
  assert.equal(instances[0].removed, true);
  assert.match(warnings.join(' '), /rescale nicht erlaubt/);
});

test('renderComponentRef: Varianten-Kind wird per ROHEM Namen gefunden (Katalog-Set)', async () => {
  installFigmaStub();
  const { renderPlan } = await import('../src/writer/renderPlan');
  const instances: AnyNode[] = [];
  const variantChild = makeNode('COMPONENT');
  variantChild.name = 'variant=secondary, size=default';
  (variantChild as unknown as { createInstance: () => AnyNode }).createInstance = () => {
    const inst = makeNode('INSTANCE');
    (inst as unknown as { marker: string }).marker = 'secondary';
    instances.push(inst);
    return inst;
  };
  const wrongChild = makeNode('COMPONENT');
  wrongChild.name = 'variant=default, size=default';
  (wrongChild as unknown as { createInstance: () => AnyNode }).createInstance = () => {
    const inst = makeNode('INSTANCE');
    (inst as unknown as { marker: string }).marker = 'default';
    instances.push(inst);
    return inst;
  };
  const set = makeNode('COMPONENT_SET');
  set.name = 'DS/Button';
  set.children.push(wrongChild, variantChild);
  (set as unknown as { defaultVariant: AnyNode }).defaultVariant = wrongChild;

  const warnings: string[] = [];
  await renderPlan(
    box({ children: [{ type: 'component-ref', name: 'DS/Button', variant: 'variant=secondary, size=default',
      fallback: box(), absolute: null }] }),
    new Map(), warnings, sectionsWith(set),
  );
  assert.equal(instances.length, 1);
  assert.equal((instances[0] as unknown as { marker: string }).marker, 'secondary');
  assert.deepEqual(warnings, []);
});

test('renderComponentRef: gescannte Bausteine matchen weiterhin über Variant=<name>', async () => {
  installFigmaStub();
  const { renderPlan } = await import('../src/writer/renderPlan');
  const instances: AnyNode[] = [];
  const variantChild = makeNode('COMPONENT');
  variantChild.name = 'Variant=secondary';
  (variantChild as unknown as { createInstance: () => AnyNode }).createInstance = () => {
    const inst = makeNode('INSTANCE');
    instances.push(inst);
    return inst;
  };
  const set = makeNode('COMPONENT_SET');
  set.name = 'Kpi Card';
  set.children.push(variantChild);
  (set as unknown as { defaultVariant: AnyNode }).defaultVariant = variantChild;
  const sections = sectionsWith(null);
  (sections.molecule as unknown as AnyNode).children.push(set);

  const warnings: string[] = [];
  await renderPlan(
    box({ children: [{ type: 'component-ref', name: 'Kpi Card', variant: 'secondary', fallback: box(), absolute: null }] }),
    new Map(), warnings, sections,
  );
  assert.equal(instances.length, 1);
  assert.deepEqual(warnings, []);
});
