import { describe, it, expect, vi } from 'vitest';

// htmlToPlan mocken: liefert einen bekannten Plan + naturalWidth, damit der (in jsdom sonst 0-breite)
// Scaling-Pfad in emitFigmaComponents beobachtbar wird. tokenizeAnchorText wird von der echten
// emitFigmaComponents importiert — als No-op-Set durchreichen.
vi.mock('./htmlToPlan.js', () => ({
  htmlToPlan: () => ({
    plan: { type: 'box', layout: 'column', padding: [0, 0, 0, 0], radius: 0, fill: null, stroke: null,
      strokeWeight: 1, gap: 10, width: 250, height: 100, primaryAlign: 'MIN', counterAlign: 'MIN', children: [] },
    warnings: [], naturalWidth: 250,
  }),
  tokenizeAnchorText: () => new Set(),
}));

import { emitFigmaComponents } from './emitFigmaComponents.js';

const rawFor = (organisms, meta = { image_width: 2048, image_height: 1500 }) => ({
  raw: {
    tokens: { colors: [] }, atoms: [], molecules: [], organisms, templates: [],
    composition: { children: {}, roots: [] }, meta,
  },
  interpretations: { Card: { html: '<div>x</div>' } },
});

// Spec 2026-07-26-einheitlicher-massstab-design.md. Vorher rechnete jeder Baustein seinen Faktor
// aus slot/naturalWidth — dieselbe Schriftgröße landete dadurch je Baustein anders (am echten Scan
// gemessen: 11 bis 49 für vergleichbare Texte). Jetzt: EIN Faktor pro Scan.
describe('emitFigmaComponents — Scaling-Glue (Teil B)', () => {
  it('skaliert mit image_width/PREVIEW_VIRTUAL_WIDTH, nicht mit slot/naturalWidth', () => {
    const card = emitFigmaComponents(rawFor([{ name: 'Card', bbox: { x: 0, y: 0, w: 0.25, h: 0.1 } }]))
      .find((c) => c.name === 'Card');
    expect(card.source).toBe('ai-interpreted');
    // 2048/1024 = 2 → width 250→500, gap 10→20. Die bbox (w 0.25) geht NICHT mehr in den Faktor ein:
    // nach der alten Regel wäre slot = 0.25·2048 = 512, /250 = 2,048 → width 512.
    expect(card.variants[0].plan.width).toBe(500);
    expect(card.variants[0].plan.gap).toBe(20);
  });

  it('derselbe Faktor auch OHNE bbox — der Zoom des Scans gilt für jeden Baustein', () => {
    const card = emitFigmaComponents(rawFor([{ name: 'Card' }])).find((c) => c.name === 'Card');
    expect(card.variants[0].plan.width).toBe(500);
    expect(card.variants[0].plan.gap).toBe(20);
  });

  it('unterschiedliche bbox-Breiten ergeben denselben Maßstab (das war der eigentliche Fehler)', () => {
    const schmal = emitFigmaComponents(rawFor([{ name: 'Card', bbox: { x: 0, y: 0, w: 0.02, h: 0.9 } }]))
      .find((c) => c.name === 'Card');
    const breit = emitFigmaComponents(rawFor([{ name: 'Card', bbox: { x: 0, y: 0, w: 0.9, h: 0.1 } }]))
      .find((c) => c.name === 'Card');
    // Nach der alten Regel: schmal → factor 0,16 (Miniatur), breit → factor 7,4 (Riese).
    expect(schmal.variants[0].plan.gap).toBe(breit.variants[0].plan.gap);
    expect(schmal.variants[0].plan.width).toBe(breit.variants[0].plan.width);
  });

  it('ohne image_width (URL-/Repo-Import) bleibt der Plan unskaliert', () => {
    const card = emitFigmaComponents(rawFor([{ name: 'Card', bbox: { x: 0, y: 0, w: 0.25, h: 0.1 } }], {}))
      .find((c) => c.name === 'Card');
    expect(card.variants[0].plan.width).toBe(250);
    expect(card.variants[0].plan.gap).toBe(10);
  });
});
