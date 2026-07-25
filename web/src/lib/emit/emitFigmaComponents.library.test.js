// Verdrahtungs-Tests für die DS-Library im Figma-Payload (Spec: docs/superpowers/specs/
// 2026-07-25-katalog-als-figma-library-design.md). Prüft die NAHT, nicht die Einzelteile:
// `emitFigmaLibrary` liefert die Bibliothek, `emitFigmaComponents` liefert Bausteine, deren
// Katalog-Blätter als `DS/…`-Refs auf genau diese Bibliothek zeigen — inkl. Skalierung.

import { describe, it, expect } from 'vitest';
import { emitFigmaComponents, emitFigmaLibrary } from './emitFigmaComponents.js';
import { buildExports } from './index.js';

function collectAllNodes(node, out = []) {
  if (!node || typeof node !== 'object') return out;
  out.push(node);
  if (node.type === 'component-ref') return collectAllNodes(node.fallback, out);
  for (const c of node.children || []) collectAllNodes(c, out);
  return out;
}

const TOKENS = {
  colors: [{ hex: '#18181b', role: 'primary', confidence: 'high' }],
  typography: [{ size: 14, weight: 400, role: 'body', confidence: 'high' }],
  spacing: [], border_radius: [], shadows: [],
};

/** Ein Baustein mit einem Badge-Blatt (Katalog-Ref) in seiner Interpretation. */
function resultWithBadge({ bbox, imageWidth } = {}) {
  return {
    raw: {
      tokens: TOKENS,
      atoms: [{ name: 'KPI Card', variants: [], confidence: 'high', source: 'ai', notes: null, ...(bbox ? { bbox } : {}) }],
      molecules: [], organisms: [], templates: [],
      composition: { children: {}, roots: [] },
      warnings: [],
      ...(imageWidth ? { meta: { image_width: imageWidth, image_height: 800 } } : {}),
    },
    interpretations: {
      'KPI Card': {
        html:
          '<div style="padding:20px;display:flex;flex-direction:column;gap:8px">' +
          '<span style="font-size:14px">Orders</span>' +
          '<span data-ds-component="Badge" data-ds-variant="secondary" style="font-size:12px">3.1%</span>' +
          '</div>',
      },
    },
  };
}

describe('emitFigmaLibrary', () => {
  it('liefert die Default-Library mit DS/Button (Kreuzprodukt) und DS/Card', () => {
    const library = emitFigmaLibrary(resultWithBadge());
    const names = library.map((e) => e.name);
    expect(names).toContain('DS/Button');
    expect(names).toContain('DS/Card');
    expect(library.find((e) => e.name === 'DS/Button').variants).toHaveLength(24);
  });

  it('ohne raw → leere Library statt Wurf', () => {
    expect(emitFigmaLibrary({})).toBeInstanceOf(Array);
    expect(emitFigmaLibrary(null)).toBeInstanceOf(Array);
  });
});

describe('emitFigmaComponents → DS-Refs', () => {
  it('Badge-Blatt wird ein component-ref auf DS/Badge mit Text-Override und Inline-Fallback', () => {
    const plan = emitFigmaComponents(resultWithBadge()).find((c) => c.name === 'KPI Card').variants[0].plan;
    const refs = collectAllNodes(plan).filter((n) => n.type === 'component-ref');
    expect(refs).toHaveLength(1);
    const [ref] = refs;
    expect(ref.name).toBe('DS/Badge');
    expect(ref.variant).toBe('variant=secondary');
    expect(ref.overrideText).toBe('3.1%');
    expect(ref.fallback.type).toBe('box'); // parsePayload-Vertrag: Fallback ist eine Box
    expect(ref.scale).toBeUndefined();     // unskalierter Fall
  });

  it('jeder DS-Ref im Payload hat einen Fallback (altes Plugin rendert damit das heutige Bild)', () => {
    const plan = emitFigmaComponents(resultWithBadge()).find((c) => c.name === 'KPI Card').variants[0].plan;
    for (const ref of collectAllNodes(plan).filter((n) => n.type === 'component-ref')) {
      expect(ref.fallback).toBeTruthy();
      expect(ref.fallback.type).toBe('box');
    }
  });

  it('jeder DS-Ref zeigt auf eine Komponente, die die Library wirklich enthält', () => {
    const result = resultWithBadge();
    const components = emitFigmaComponents(result);
    const library = emitFigmaLibrary(result);
    const byName = new Map(library.map((e) => [e.name, e]));
    const refs = components.flatMap((c) => c.variants.flatMap((v) => collectAllNodes(v.plan)))
      .filter((n) => n.type === 'component-ref' && n.name.startsWith('DS/'));
    expect(refs.length).toBeGreaterThan(0);
    for (const ref of refs) {
      const entry = byName.get(ref.name);
      expect(entry, `Library kennt ${ref.name} nicht`).toBeTruthy();
      if (ref.variant !== null) {
        expect(entry.variants.map((v) => v.name)).toContain(ref.variant);
      }
    }
  });
});

describe('emitFigmaComponents → DS-Refs, Skalierung', () => {
  // Die Library liegt bei 1× in Figma; ein Bild-Scan wird auf echte Bildpixel skaliert. Die Instanz
  // kann das nicht selbst → sie trägt den Faktor als `scale` (Plugin: instance.rescale). Ohne diesen
  // Wert wäre der Baustein 2× und der Button darin 1× — genau die Regression, die Entscheidung 1
  // verhindert. jsdom hat keine Layout-Engine, daher gemockte Rects (Muster aus
  // emitFigmaComponents.test.js).
  it('Bild-Scan mit Faktor 2 → DS-Ref trägt scale 2, sein Fallback ist mitskaliert', () => {
    const result = {
      raw: {
        tokens: TOKENS,
        atoms: [{ name: 'KPI Row', bbox: { x: 0, y: 0, w: 1, h: 0.1 }, confidence: 'high', source: 'ai', notes: null }],
        molecules: [], organisms: [], templates: [],
        composition: { children: {}, roots: [] },
        warnings: [],
        meta: { image_width: 2048, image_height: 800 },
      },
      interpretations: {
        'KPI Row': {
          html:
            '<div data-mock-rect=\'{"x":0,"y":0,"width":1024,"height":80}\' style="display:flex">' +
            '<span data-ds-component="Badge" data-ds-variant="secondary" data-mock-rect=\'{"x":0,"y":0,"width":60,"height":24}\' style="font-size:12px">3.1%</span>' +
            '</div>',
        },
      },
    };

    const original = Element.prototype.getBoundingClientRect;
    Element.prototype.getBoundingClientRect = function mockedGetBoundingClientRect() {
      const raw = this.getAttribute?.('data-mock-rect');
      const r = raw ? JSON.parse(raw) : { x: 0, y: 0, width: 0, height: 0 };
      return {
        x: r.x, y: r.y, left: r.x, top: r.y, width: r.width, height: r.height,
        right: r.x + r.width, bottom: r.y + r.height, toJSON() { return this; },
      };
    };
    try {
      const plan = emitFigmaComponents(result).find((c) => c.name === 'KPI Row').variants[0].plan;
      const ref = collectAllNodes(plan).find((n) => n.type === 'component-ref');
      expect(ref.name).toBe('DS/Badge');
      expect(ref.scale).toBe(2);                       // slot 2048 / naturalWidth 1024
      expect(ref.fallback.padding).toEqual([4, 20, 4, 20]); // Badge-Padding [2,10,2,10] × 2
    } finally {
      Element.prototype.getBoundingClientRect = original;
    }
  });
});

describe('buildExports — Payload-Naht', () => {
  it('das figma-Envelope trägt catalog UND Bausteine mit DS-Refs', () => {
    const exports = buildExports(resultWithBadge());
    const payload = JSON.parse(exports.figma);
    expect(payload.catalog.map((e) => e.name)).toContain('DS/Badge');
    expect(JSON.stringify(payload.components)).toContain('"DS/Badge"');
  });
});
