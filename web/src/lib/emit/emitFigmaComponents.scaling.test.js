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

describe('emitFigmaComponents — Scaling-Glue (Teil B)', () => {
  it('ai-interpreted mit bbox → Plan auf bbox.w·image_width skaliert (factor = slot/naturalWidth)', () => {
    const result = {
      raw: {
        tokens: { colors: [] }, atoms: [], molecules: [],
        organisms: [{ name: 'Card', bbox: { x: 0, y: 0, w: 0.25, h: 0.1 } }], templates: [],
        composition: { children: {}, roots: [] },
        meta: { image_width: 2000, image_height: 1500 },
      },
      interpretations: { Card: { html: '<div>x</div>' } },
    };
    const card = emitFigmaComponents(result).find((c) => c.name === 'Card');
    expect(card.source).toBe('ai-interpreted');
    // slot = 0.25·2000 = 500; naturalWidth 250 → factor 2 → width 250→500, gap 10→20
    expect(card.variants[0].plan.width).toBe(500);
    expect(card.variants[0].plan.gap).toBe(20);
  });

  it('ai-interpreted OHNE bbox → factor 1, Plan unskaliert', () => {
    const result = {
      raw: {
        tokens: { colors: [] }, atoms: [], molecules: [],
        organisms: [{ name: 'Card' }], templates: [], composition: { children: {}, roots: [] },
        meta: { image_width: 2000, image_height: 1500 },
      },
      interpretations: { Card: { html: '<div>x</div>' } },
    };
    const card = emitFigmaComponents(result).find((c) => c.name === 'Card');
    expect(card.variants[0].plan.width).toBe(250); // unskaliert
  });
});
