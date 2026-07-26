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

  // Fund in Robs Figma-Datei 26.07. (`UuoCS1lCmtRPfAE10Mjter`): der Template-Zweig war der einzige,
  // der scanScale nie sah. Template-Pläne sind in 1×-Design-Pixeln geschrieben — bei k ≈ 2,41 standen
  // dadurch genau die per NAME gematchten Bausteine mitten im 2466px-Dashboard auf 1×: Atom „Button"
  // 73×32 mit Schrift 13 neben Organismen mit Schrift 45–49. matchTemplate greift per Namensteil
  // (/butt|btn|cta/, /badge|tag|chip|pill/, /input|field|…/) — erwischt also auch „Search Field".
  it('Template-Bausteine (Button/Badge/Input) tragen denselben Scan-Maßstab wie interpretierte', () => {
    const comps = emitFigmaComponents(rawFor([
      { name: 'Card', bbox: { x: 0, y: 0, w: 0.25, h: 0.1 } },
      { name: 'Primary Button', bbox: { x: 0, y: 0, w: 0.05, h: 0.02 } },
      { name: 'Status Badge', bbox: { x: 0, y: 0, w: 0.03, h: 0.01 } },
      { name: 'Search Field', bbox: { x: 0, y: 0, w: 0.1, h: 0.02 } },
    ]));

    const groesste = (plan) => {
      let max = 0;
      const walk = (n) => {
        if (!n || typeof n !== 'object') return;
        if (n.type === 'text' && n.fontSize) max = Math.max(max, n.fontSize);
        if (n.type === 'component-ref') return walk(n.fallback);
        (n.children || []).forEach(walk);
      };
      walk(plan);
      return max;
    };

    for (const name of ['Primary Button', 'Status Badge', 'Search Field']) {
      const c = comps.find((x) => x.name === name);
      expect(c, `${name} fehlt im Emit`).toBeTruthy();
      // Der Beweis unabhängig von den konkreten Template-Maßen: die Schrift ist bei Faktor 2
      // GERADE und mindestens 20 — ein 1×-Template-Plan liegt bei shadcn-Größen 12–14.
      const font = groesste(c.variants[0].plan);
      expect(font, `${name} scheint unskaliert (Schrift ${font})`).toBeGreaterThanOrEqual(20);
    }
  });

  it('ohne image_width bleiben auch Template-Bausteine unskaliert (URL-/Repo-Import)', () => {
    const btn = emitFigmaComponents(rawFor([{ name: 'Primary Button', bbox: { x: 0, y: 0, w: 0.05, h: 0.02 } }], {}))
      .find((c) => c.name === 'Primary Button');
    const font = (() => {
      let max = 0;
      const walk = (n) => {
        if (!n || typeof n !== 'object') return;
        if (n.type === 'text' && n.fontSize) max = Math.max(max, n.fontSize);
        (n.children || []).forEach(walk);
      };
      walk(btn.variants[0].plan);
      return max;
    })();
    expect(font).toBeLessThan(20);
  });

  it('ohne image_width (URL-/Repo-Import) bleibt der Plan unskaliert', () => {
    const card = emitFigmaComponents(rawFor([{ name: 'Card', bbox: { x: 0, y: 0, w: 0.25, h: 0.1 } }], {}))
      .find((c) => c.name === 'Card');
    expect(card.variants[0].plan.width).toBe(250);
    expect(card.variants[0].plan.gap).toBe(10);
  });
});
