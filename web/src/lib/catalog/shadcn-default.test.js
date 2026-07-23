import { describe, it, expect } from 'vitest';
import {
  SHADCN_DEFAULT_CATALOG,
  getCatalogComponent,
  catalogComponentNames,
} from './shadcn-default.js';

// Rekursiv jeden Knoten eines plan-Baums besuchen.
function walkPlan(node, visit) {
  visit(node);
  if (Array.isArray(node?.children)) node.children.forEach((c) => walkPlan(c, visit));
}

const START_SET = ['Button', 'Input', 'Label', 'Badge', 'Card', 'Checkbox', 'Avatar', 'Separator'];

describe('SHADCN_DEFAULT_CATALOG — Struktur-Contract', () => {
  it('enthält den Startsatz aus der Spec', () => {
    expect(catalogComponentNames().sort()).toEqual([...START_SET].sort());
  });

  it.each(SHADCN_DEFAULT_CATALOG.map((c) => [c.name, c]))(
    '%s hat name, import, variants, props, match und plan()',
    (_name, entry) => {
      expect(typeof entry.name).toBe('string');
      expect(entry.name.length).toBeGreaterThan(0);
      expect(typeof entry.import?.name).toBe('string');
      expect(typeof entry.import?.from).toBe('string');
      expect(entry.import.from).toMatch(/^@\/components\/ui\//);
      expect(entry.variants && typeof entry.variants).toBe('object');
      expect(Array.isArray(entry.props)).toBe(true);
      expect(entry.match).toBeTruthy();
      expect(typeof entry.plan).toBe('function');
    },
  );

  it('Varianten-Achsen sind nicht-leere String-Listen (wo vorhanden)', () => {
    for (const entry of SHADCN_DEFAULT_CATALOG) {
      for (const [axis, options] of Object.entries(entry.variants)) {
        expect(Array.isArray(options), `${entry.name}.${axis}`).toBe(true);
        expect(options.length, `${entry.name}.${axis}`).toBeGreaterThan(0);
        options.forEach((o) => expect(typeof o).toBe('string'));
      }
    }
  });
});

describe('SHADCN_DEFAULT_CATALOG — plan() liefert wohlgeformte, token-referenzierte Pläne', () => {
  it.each(SHADCN_DEFAULT_CATALOG.map((c) => [c.name, c]))(
    '%s: plan() ohne Argument ist ein gültiger plan-Knoten',
    (_name, entry) => {
      const plan = entry.plan();
      expect(plan).toBeTruthy();
      expect(['box', 'text', 'svg']).toContain(plan.type);
    },
  );

  it('jeder box-Knoten hat padding[4], radius, fill/stroke-Felder', () => {
    for (const entry of SHADCN_DEFAULT_CATALOG) {
      walkPlan(entry.plan(), (n) => {
        if (n.type !== 'box') return;
        expect(Array.isArray(n.padding) && n.padding.length === 4, entry.name).toBe(true);
        expect(typeof n.radius).toBe('number');
        expect('fill' in n && 'stroke' in n, entry.name).toBe(true);
      });
    }
  });

  it('ALLE Farben im Default-Katalog tragen einen token-Namen (Grounding-Invariante)', () => {
    for (const entry of SHADCN_DEFAULT_CATALOG) {
      walkPlan(entry.plan(), (n) => {
        const colors = [n.fill, n.stroke, n.type === 'text' ? n.color : null].filter(Boolean);
        for (const c of colors) {
          expect(typeof c.token, `${entry.name}: token fehlt`).toBe('string');
          expect(c.token.length).toBeGreaterThan(0);
          expect(c.hex, `${entry.name}: hex fehlt`).toMatch(/^#[0-9a-f]{6}$/i);
        }
      });
    }
  });
});

describe('Button — Varianten & Größen', () => {
  it('default: gefüllte Box (primary) mit primary-foreground-Text', () => {
    const plan = getCatalogComponent('Button').plan({ variant: 'default', size: 'default' });
    expect(plan.fill.token).toBe('primary');
    expect(plan.children[0]).toMatchObject({ type: 'text', content: 'Button' });
    expect(plan.children[0].color.token).toBe('primary-foreground');
  });

  it('outline: Rahmen (input) statt Füllung', () => {
    const plan = getCatalogComponent('Button').plan({ variant: 'outline' });
    expect(plan.fill).toBeNull();
    expect(plan.stroke.token).toBe('input');
  });

  it('secondary: Füllung secondary', () => {
    const plan = getCatalogComponent('Button').plan({ variant: 'secondary' });
    expect(plan.fill.token).toBe('secondary');
  });

  it('icon: quadratisch, svg-Glyph statt Text', () => {
    const plan = getCatalogComponent('Button').plan({ size: 'icon' });
    expect(plan.padding).toEqual([10, 10, 10, 10]);
    expect(plan.children[0].type).toBe('svg');
  });
});

describe('Zustands-Varianten', () => {
  it('Checkbox checked: Füllung + Häkchen-svg; unchecked: nur Rahmen', () => {
    const on = getCatalogComponent('Checkbox').plan({ checked: true });
    expect(on.fill.token).toBe('primary');
    expect(on.children[0].type).toBe('svg');
    const off = getCatalogComponent('Checkbox').plan({ checked: false });
    expect(off.fill).toBeNull();
    expect(off.stroke.token).toBe('primary');
    expect(off.children).toEqual([]);
  });
});

describe('getCatalogComponent', () => {
  it('liefert Eintrag per Name, undefined bei Unbekanntem', () => {
    expect(getCatalogComponent('Button')?.name).toBe('Button');
    expect(getCatalogComponent('Nichtvorhanden')).toBeUndefined();
  });
});
