// Tests für emitFigmaCatalog (Spec: docs/superpowers/specs/2026-07-25-katalog-als-figma-library-
// design.md §Verträge/Payload). Reine Funktion, kein DOM. Katalog ist der ECHTE Default-Katalog,
// damit die Tests gegen die reale Library prüfen (Button-Kreuzprodukt, Card ohne Achsen, Label als
// Text-Wurzel → übersprungen).

import { describe, it, expect } from 'vitest';
import {
  CATALOG_NAMESPACE,
  catalogFigmaName,
  variantSelectionKey,
  selectionFromVariantKey,
  emitFigmaCatalog,
} from './emitFigmaCatalog.js';
import { SHADCN_DEFAULT_CATALOG_OPTION } from '../catalog/shadcn-default.js';

const CATALOG = SHADCN_DEFAULT_CATALOG_OPTION;

describe('Namensvertrag', () => {
  it('namespaced den Figma-Namen mit DS/', () => {
    expect(CATALOG_NAMESPACE).toBe('DS/');
    expect(catalogFigmaName('Button')).toBe('DS/Button');
  });

  it('baut Varianten-Schlüssel in Figma-Konvention (Achsen in Katalog-Reihenfolge)', () => {
    const button = CATALOG.components.find((c) => c.name === 'Button');
    expect(variantSelectionKey(button, { variant: 'secondary', size: 'lg' })).toBe('variant=secondary, size=lg');
  });

  it('Eintrag ohne Varianten-Achsen bekommt den Schlüssel „default"', () => {
    const card = CATALOG.components.find((c) => c.name === 'Card');
    expect(variantSelectionKey(card, {})).toBe('default');
  });

  it('Schlüssel ist auch bei Teil-Auswahl vollständig (fehlende Achse → erster Wert = Default)', () => {
    const button = CATALOG.components.find((c) => c.name === 'Button');
    expect(variantSelectionKey(button, { variant: 'ghost' })).toBe('variant=ghost, size=default');
    expect(variantSelectionKey(button, {})).toBe('variant=default, size=default');
  });

  it('selectionFromVariantKey ist die Umkehrung (Rundlauf)', () => {
    const button = CATALOG.components.find((c) => c.name === 'Button');
    const key = variantSelectionKey(button, { variant: 'outline', size: 'icon' });
    expect(selectionFromVariantKey(key)).toEqual({ variant: 'outline', size: 'icon' });
    expect(selectionFromVariantKey('default')).toEqual({});
  });
});

describe('emitFigmaCatalog', () => {
  it('kein/leerer Katalog → leere Liste (kein Wurf)', () => {
    expect(emitFigmaCatalog(null)).toEqual([]);
    expect(emitFigmaCatalog({ source: 'x', components: [] })).toEqual([]);
    expect(emitFigmaCatalog({ source: 'x' })).toEqual([]);
  });

  it('Button wird ein Set mit dem vollen Kreuzprodukt (6 Varianten × 4 Größen)', () => {
    const entries = emitFigmaCatalog(CATALOG);
    const button = entries.find((e) => e.catalogName === 'Button');
    expect(button.name).toBe('DS/Button');
    expect(button.source).toBe('shadcn-default');
    expect(button.variants).toHaveLength(24);
    expect(button.variants[0].name).toBe('variant=default, size=default');
    expect(button.variants.map((v) => v.name)).toContain('variant=secondary, size=lg');
    // Jede Variante trägt einen echten, rendernbaren Plan (Box-Wurzel).
    for (const v of button.variants) expect(v.plan.type).toBe('box');
  });

  it('die Varianten-Pläne sind ECHT verschieden (secondary trägt die secondary-Füllung)', () => {
    const entries = emitFigmaCatalog(CATALOG);
    const button = entries.find((e) => e.catalogName === 'Button');
    const secondary = button.variants.find((v) => v.name === 'variant=secondary, size=default');
    expect(secondary.plan.fill).toEqual({ token: 'secondary', hex: '#f4f4f5' });
    const outline = button.variants.find((v) => v.name === 'variant=outline, size=default');
    expect(outline.plan.fill).toBe(null);
    expect(outline.plan.stroke).toEqual({ token: 'input', hex: '#e4e4e7' });
  });

  it('Eintrag ohne Achsen (Card) bekommt genau eine Variante „default" mit der echten Hülle', () => {
    const entries = emitFigmaCatalog(CATALOG);
    const card = entries.find((e) => e.catalogName === 'Card');
    expect(card.name).toBe('DS/Card');
    expect(card.variants).toHaveLength(1);
    expect(card.variants[0].name).toBe('default');
    expect(card.variants[0].plan.radius).toBe(8);
    expect(card.variants[0].plan.fill).toEqual({ token: 'card', hex: '#ffffff' });
  });

  it('Pläne sind 1× (KEINE Skalierung) — die Library ist die Wahrheit des Systems', () => {
    const entries = emitFigmaCatalog(CATALOG);
    const badge = entries.find((e) => e.catalogName === 'Badge');
    const def = badge.variants.find((v) => v.name === 'variant=default');
    expect(def.plan.padding).toEqual([2, 10, 2, 10]);
    expect(def.plan.children[0].fontSize).toBe(12);
  });

  it('Einträge mit Text-Wurzel (Label) werden übersprungen — kein Frame, keine Komponente', () => {
    const entries = emitFigmaCatalog(CATALOG);
    expect(entries.some((e) => e.catalogName === 'Label')).toBe(false);
  });

  it('Pläne sind normalisierte Plan-Boxen (alle Pflichtfelder für parsePayload da)', () => {
    const entries = emitFigmaCatalog(CATALOG);
    const plan = entries.find((e) => e.catalogName === 'Card').variants[0].plan;
    for (const key of ['layout', 'padding', 'radius', 'gap', 'strokeWeight', 'primaryAlign', 'counterAlign', 'children']) {
      expect(plan[key]).toBeDefined();
    }
    expect(plan.width).toBe(null);
    expect(plan.height).toBe(null);
  });

  it('kaputter Eintrag (plan wirft / fehlt) wird übersprungen statt den Emit zu sprengen', () => {
    const broken = {
      source: 'test',
      components: [
        { name: 'Boom', variants: {}, plan: () => { throw new Error('kaputt'); } },
        { name: 'Ohne', variants: {} },
        { name: 'Gut', variants: {}, plan: () => ({ type: 'box', children: [] }) },
      ],
    };
    const entries = emitFigmaCatalog(broken);
    expect(entries.map((e) => e.catalogName)).toEqual(['Gut']);
  });

  it('deckelt das Kreuzprodukt bei 32 Varianten und meldet das als Warnung', () => {
    const many = {
      source: 'test',
      components: [{
        name: 'Wide',
        variants: { a: ['1', '2', '3', '4', '5', '6'], b: ['1', '2', '3', '4', '5', '6'] },
        plan: () => ({ type: 'box', children: [] }),
      }],
    };
    const warnings = [];
    const entries = emitFigmaCatalog(many, { warnings });
    expect(entries[0].variants).toHaveLength(32);
    expect(warnings.join(' ')).toMatch(/Wide/);
    expect(warnings.join(' ')).toMatch(/32/);
  });
});
