// Tests für den Instanz-Modus von groundPlan (Spec: docs/superpowers/specs/2026-07-25-katalog-als-
// figma-library-design.md §Entscheidung 2/3/5). `groundPlan(plan, catalog, { instances: true })`
// macht aus Blatt-Katalog-Refs component-refs auf die DS-Library; Container, Icon-Blätter und
// Text-Wurzel-Einträge bleiben inline (heutiges Verhalten) — genau das prüft diese Datei.

import { describe, it, expect } from 'vitest';
import { groundPlan } from './groundPlan.js';
import { SHADCN_DEFAULT_CATALOG_OPTION } from '../catalog/shadcn-default.js';

const CATALOG = SHADCN_DEFAULT_CATALOG_OPTION;
const INSTANCES = { instances: true };

function text(content) {
  return { type: 'text', content, fontSize: 14, fontWeight: 400, color: { token: 'foreground', hex: '#09090b' } };
}

function box(o = {}) {
  return {
    type: 'box', layout: 'row', padding: [0, 0, 0, 0], radius: 0, fill: null, stroke: null,
    strokeWeight: 1, gap: 0, width: null, height: null, primaryAlign: 'MIN', counterAlign: 'MIN',
    children: [], ...o,
  };
}

function catalogRef(o = {}) {
  return {
    type: 'component-ref', name: o.name, catalog: 'shadcn-default',
    import: { name: o.name, from: `@/components/ui/${(o.name || '').toLowerCase()}` },
    variant: null, props: o.props ?? {},
    voidElement: Boolean(o.voidElement), container: Boolean(o.container),
    fallback: o.fallback,
    ...(o.absolute ? { absolute: o.absolute } : {}),
    ...(o.stretch ? { stretch: true } : {}),
    ...(o.grow ? { grow: true } : {}),
  };
}

describe('groundPlan — Instanz-Modus, Blatt-Refs', () => {
  it('Button-Blatt wird ein component-ref auf DS/Button mit Varianten-Schlüssel und Text-Override', () => {
    const node = catalogRef({ name: 'Button', props: { variant: 'secondary' }, fallback: box({ children: [text('Details')] }) });
    const out = groundPlan(box({ children: [node] }), CATALOG, INSTANCES);
    const ref = out.children[0];
    expect(ref.type).toBe('component-ref');
    expect(ref.name).toBe('DS/Button');
    expect(ref.variant).toBe('variant=secondary, size=default');
    expect(ref.overrideText).toBe('Details');
    expect(ref.catalogInstance).toBe(true);
    expect(ref.scale).toBeUndefined(); // scalePlan hängt das an, nicht groundPlan
  });

  it('der fallback ist EXAKT der Plan, den der Inline-Modus emittiert (Abwärtskompatibilität)', () => {
    const node = catalogRef({ name: 'Button', props: { variant: 'secondary' }, fallback: box({ children: [text('Details')] }) });
    const inline = groundPlan(box({ children: [node] }), CATALOG);
    const instanced = groundPlan(box({ children: [node] }), CATALOG, INSTANCES);
    expect(instanced.children[0].fallback).toEqual(inline.children[0]);
  });

  it('Badge-Blatt ebenso (eine Achse → Schlüssel ohne Komma)', () => {
    const node = catalogRef({ name: 'Badge', props: { variant: 'secondary' }, fallback: box({ children: [text('3.1%')] }) });
    const ref = groundPlan(box({ children: [node] }), CATALOG, INSTANCES).children[0];
    expect(ref.name).toBe('DS/Badge');
    expect(ref.variant).toBe('variant=secondary');
    expect(ref.overrideText).toBe('3.1%');
  });

  it('Eintrag ohne Achsen (Avatar) → variant null, damit das Plugin die einzelne COMPONENT nimmt', () => {
    const node = catalogRef({ name: 'Avatar', fallback: box({ children: [text('RK')] }) });
    const ref = groundPlan(box({ children: [node] }), CATALOG, INSTANCES).children[0];
    expect(ref.name).toBe('DS/Avatar');
    expect(ref.variant).toBe(null);
    expect(ref.overrideText).toBe('RK');
  });

  it('voidElement (Input) wird Instanz, bekommt aber NIE overrideText', () => {
    const node = catalogRef({ name: 'Input', voidElement: true, fallback: box({ children: [text('E-Mail')] }) });
    const ref = groundPlan(box({ children: [node] }), CATALOG, INSTANCES).children[0];
    expect(ref.name).toBe('DS/Input');
    expect(ref.overrideText).toBeUndefined();
  });

  it('absolute/stretch/grow sitzen auf dem Ref, nicht doppelt im fallback', () => {
    const abs = { x: 4, y: 8, width: 120, height: 36 };
    const node = catalogRef({ name: 'Button', absolute: abs, fallback: box({ children: [text('Los')] }) });
    const ref = groundPlan(box({ children: [node] }), CATALOG, INSTANCES).children[0];
    expect(ref.absolute).toEqual(abs);
    expect(ref.fallback.absolute).toBeUndefined();

    const flowing = catalogRef({ name: 'Button', stretch: true, grow: true, fallback: box({ children: [text('Los')] }) });
    const ref2 = groundPlan(box({ children: [flowing] }), CATALOG, INSTANCES).children[0];
    expect(ref2.stretch).toBe(true);
    expect(ref2.grow).toBe(true);
    expect(ref2.fallback.stretch).toBeUndefined();
    expect(ref2.fallback.grow).toBeUndefined();
  });
});

describe('groundPlan — Instanz-Modus, bewusste Ausnahmen (bleiben inline)', () => {
  it('Container (Card) bleibt eine Box mit den gemessenen Kindern — Instanzen nehmen keine Kinder an', () => {
    const node = catalogRef({
      name: 'Card', container: true,
      fallback: box({ layout: 'column', padding: [20, 20, 20, 20], gap: 8, children: [text('Orders'), text('13.465')] }),
    });
    const out = groundPlan(box({ children: [node] }), CATALOG, INSTANCES).children[0];
    expect(out.type).toBe('box');
    expect(out.radius).toBe(8);
    expect(out.padding).toEqual([20, 20, 20, 20]);
    expect(out.children).toHaveLength(2);
  });

  it('Icon-Blatt (SVG statt Text im Fallback) bleibt inline — das echte Icon würde sonst verloren gehen', () => {
    const icon = { type: 'svg', markup: '<svg width="16" height="16"><path d="M0 0h16"/></svg>' };
    const node = catalogRef({ name: 'Button', props: { size: 'icon' }, fallback: box({ children: [icon] }) });
    const out = groundPlan(box({ children: [node] }), CATALOG, INSTANCES).children[0];
    expect(out.type).toBe('box');
    expect(out.children).toEqual([icon]);
  });

  it('Eintrag mit Text-Wurzel (Label) bleibt inline — es gibt dafür keine DS-Komponente', () => {
    const node = catalogRef({ name: 'Label', fallback: box({ children: [text('E-Mail')] }) });
    const out = groundPlan(box({ children: [node] }), CATALOG, INSTANCES).children[0];
    expect(out.type).toBe('text');
    expect(out.content).toBe('E-Mail');
  });

  it('Blatt ohne sichtbaren Text bleibt inline (nichts zu überschreiben → Katalog-Default wäre irreführend)', () => {
    const node = catalogRef({ name: 'Button', fallback: box({ children: [] }) });
    const out = groundPlan(box({ children: [node] }), CATALOG, INSTANCES).children[0];
    expect(out.type).toBe('box');
  });

  it('unbekannter Katalog-Name bleibt unverändert (kein Wurf, kein DS-Ref)', () => {
    const node = catalogRef({ name: 'Karussell', fallback: box({ children: [text('x')] }) });
    const out = groundPlan(box({ children: [node] }), CATALOG, INSTANCES).children[0];
    expect(out.name).toBe('Karussell');
    expect(out.type).toBe('component-ref');
    expect(out.catalogInstance).toBeUndefined();
  });

  it('scan-interner Ref (ohne catalog-Feld) bleibt Ref, sein Fallback wird aber instanziert', () => {
    const inner = catalogRef({ name: 'Button', fallback: box({ children: [text('Los')] }) });
    const node = { type: 'component-ref', name: 'Kpi Card', variant: null, fallback: box({ children: [inner] }) };
    const out = groundPlan(box({ children: [node] }), CATALOG, INSTANCES).children[0];
    expect(out.name).toBe('Kpi Card');
    expect(out.catalogInstance).toBeUndefined();
    expect(out.fallback.children[0].name).toBe('DS/Button');
  });

  it('ohne opts (Inline-Modus, heutiges Verhalten) entsteht KEIN DS-Ref', () => {
    const node = catalogRef({ name: 'Button', fallback: box({ children: [text('Los')] }) });
    const out = groundPlan(box({ children: [node] }), CATALOG).children[0];
    expect(out.type).toBe('box');
  });
});
