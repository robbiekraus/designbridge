import { describe, it, expect } from 'vitest';
import { emitFigmaComponents } from './emitFigmaComponents.js';

const result = {
  raw: {
    tokens: { colors: [{ hex: '#4263EB', role: 'primary' }], typography: [], spacing: [], border_radius: [], shadows: [] },
    atomics: [
      { name: 'Primary Button', variants: ['primary', 'ghost'], confidence: 'high', source: 'rules', notes: 'CTA' },
      { name: 'Avatar', variants: ['sm', 'lg'], confidence: 'low', source: 'ai', notes: 'rund' },
    ],
    components: [{ name: 'Card', variants: [], confidence: 'medium', source: null, notes: null }],
    patterns: [{ name: 'Navbar', variants: ['default'], confidence: 'high', source: 'rules', notes: 'Logo links' }],
  },
};

describe('emitFigmaComponents', () => {
  it('Template-Treffer bekommen Baupläne für ALLE Template-Varianten', () => {
    const out = emitFigmaComponents(result);
    const btn = out.find((c) => c.name === 'Primary Button');
    expect(btn.placeholder).toBe(false);
    expect(btn.kind).toBe('atomic');
    expect(btn.variants.map((v) => v.name)).toEqual(['primary', 'secondary', 'ghost']); // Template-Varianten, nicht Scan-Varianten
    expect(btn.variants[0].plan.type).toBe('box');
    expect(btn.variants[0].plan.fill).toEqual({ token: 'primary', hex: '#4263EB' });
  });

  it('ohne Template → placeholder mit Scan-Varianten und plan:null', () => {
    const out = emitFigmaComponents(result);
    const avatar = out.find((c) => c.name === 'Avatar');
    expect(avatar.placeholder).toBe(true);
    expect(avatar.variants).toEqual([{ name: 'sm', plan: null }, { name: 'lg', plan: null }]);
    expect(avatar.notes).toBe('rund');
  });

  it('kind wird je Liste gesetzt, Metadaten durchgereicht', () => {
    const out = emitFigmaComponents(result);
    expect(out.find((c) => c.name === 'Card').kind).toBe('component');
    const nav = out.find((c) => c.name === 'Navbar');
    expect(nav.kind).toBe('pattern');
    expect(nav.placeholder).toBe(true); // kein Navbar-Template
  });

  it('raw:null (Mock-Importe) → leere Liste', () => {
    expect(emitFigmaComponents({ raw: null })).toEqual([]);
    expect(emitFigmaComponents(undefined)).toEqual([]);
  });

  it('Platzhalter ohne Scan-Varianten bekommt default-Variante', () => {
    const out = emitFigmaComponents({ raw: { tokens: {}, atomics: [{ name: 'Avatar', variants: [] }], components: [], patterns: [] } });
    expect(out[0].variants).toEqual([{ name: 'default', plan: null }]);
  });

  it('Export-Reihenfolge im Payload ist atomics → components → patterns', () => {
    const out = emitFigmaComponents(result);
    expect(out.map((c) => c.kind)).toEqual(['atomic', 'atomic', 'component', 'pattern']);
    expect(out.map((c) => c.name)).toEqual(['Primary Button', 'Avatar', 'Card', 'Navbar']);
  });
});

describe('emitFigmaComponents — KI-Interpretation (Scheibe 3, Task 4)', () => {
  it('Baustein ohne Template, aber mit result.interpretations[name] → echter plan statt placeholder', () => {
    const withInterp = {
      raw: {
        tokens: { colors: [], typography: [], spacing: [], border_radius: [], shadows: [] },
        atomics: [{ name: 'Stat Card', variants: [], confidence: 'high', source: 'ai', notes: null }],
        components: [],
        patterns: [],
      },
      interpretations: {
        // Langform border-top-left-radius statt Shorthand border-radius: jsdom expandiert den
        // Shorthand nicht in getComputedStyle (echter Browser schon) — Spec §jsdom-Testgrenze.
        'Stat Card': { html: '<div style="border-top-left-radius:12px;background:#ffffff;padding:16px"><p style="font-size:12px">Total Sales</p></div>', jsx: '<div />' },
      },
    };
    const out = emitFigmaComponents(withInterp);
    const card = out.find((c) => c.name === 'Stat Card');
    expect(card.placeholder).toBe(false);
    expect(card.source).toBe('ai-interpreted');
    expect(card.variants).toHaveLength(1);
    expect(card.variants[0].name).toBe('default');
    expect(card.variants[0].plan.type).toBe('box');
    expect(card.variants[0].plan.radius).toBe(12);
  });

  it('Template-Baustein bleibt unverändert, auch wenn zusätzlich eine Interpretation vorliegt', () => {
    const withBoth = {
      raw: {
        tokens: { colors: [{ hex: '#4263EB', role: 'primary' }], typography: [], spacing: [], border_radius: [], shadows: [] },
        atomics: [{ name: 'Primary Button', variants: ['primary'], confidence: 'high', source: 'rules', notes: null }],
        components: [],
        patterns: [],
      },
      interpretations: {
        'Primary Button': { html: '<button>Sollte ignoriert werden</button>', jsx: '<button />' },
      },
    };
    const out = emitFigmaComponents(withBoth);
    const btn = out.find((c) => c.name === 'Primary Button');
    expect(btn.placeholder).toBe(false);
    expect(btn.source).toBe('rules'); // Template-Pfad — Scan-source bleibt, KEIN 'ai-interpreted'
    expect(btn.variants.map((v) => v.name)).toEqual(['primary', 'secondary', 'ghost']);
  });

  it('Baustein ohne Template UND ohne Interpretation bleibt Platzhalter (unverändert)', () => {
    const noInterp = {
      raw: {
        tokens: {}, atomics: [{ name: 'Avatar', variants: ['sm'], confidence: 'low', source: 'ai', notes: null }],
        components: [], patterns: [],
      },
    };
    const out = emitFigmaComponents(noInterp);
    expect(out[0].placeholder).toBe(true);
    expect(out[0].variants).toEqual([{ name: 'sm', plan: null }]);
  });

  it('leeres/kaputtes Interpretations-HTML (plan:null) → Platzhalter wie bisher, keine Exception', () => {
    const brokenInterp = {
      raw: {
        tokens: {}, atomics: [{ name: 'Weirdo', variants: [], confidence: null, source: null, notes: null }],
        components: [], patterns: [],
      },
      interpretations: { Weirdo: { html: '   ', jsx: '' } },
    };
    expect(() => emitFigmaComponents(brokenInterp)).not.toThrow();
    const out = emitFigmaComponents(brokenInterp);
    expect(out[0].placeholder).toBe(true);
    expect(out[0].variants).toEqual([{ name: 'default', plan: null }]);
  });

  it('knownComponents wird über alle Ebenen gebaut → Organismus referenziert Molekül als component-ref', () => {
    const hierarchy = {
      raw: {
        tokens: { colors: [], typography: [], spacing: [], border_radius: [], shadows: [] },
        atomics: [],
        components: [{ name: 'Button', variants: [], confidence: 'high', source: 'ai', notes: null }],
        patterns: [{ name: 'Toolbar', variants: [], confidence: 'high', source: 'ai', notes: null }],
      },
      interpretations: {
        Button: { html: '<button class="btn">Save</button>', jsx: '<button />' },
        Toolbar: { html: '<div class="flex p-2"><button class="btn">Save</button></div>', jsx: '<div />' },
      },
    };
    const out = emitFigmaComponents(hierarchy);
    const toolbar = out.find((c) => c.name === 'Toolbar');
    expect(toolbar.placeholder).toBe(false);
    const plan = toolbar.variants[0].plan;
    expect(plan.children[0].type).toBe('component-ref');
    expect(plan.children[0].name).toBe('Button');
  });

  it('Konverter-Warnungen werden in raw.warnings durchgereicht (bestehender Warnungs-Kanal)', () => {
    // v2 kennt keine „Klasse ignoriert"-Warnung mehr (kein Klassen-Raten). Ein echter, parser-
    // unabhängiger v2-Warnfall ist die SVG-Längenkappung (>20000 Zeichen).
    const bigSvg = '<svg viewBox="0 0 100 100">' + '<rect x="0" y="0" width="1" height="1"/>'.repeat(700) + '</svg>';
    const withWarning = {
      raw: {
        tokens: {}, atomics: [{ name: 'Weird Box', variants: [], confidence: null, source: null, notes: null }],
        components: [], patterns: [], warnings: ['bestehende Scan-Warnung'],
      },
      interpretations: {
        'Weird Box': { html: bigSvg, jsx: '<div />' },
      },
    };
    emitFigmaComponents(withWarning);
    expect(withWarning.raw.warnings).toContain('bestehende Scan-Warnung');
    expect(withWarning.raw.warnings.some((w) => /gekappt/i.test(w))).toBe(true);
  });

  it('keine Konverter-Warnungen → raw.warnings bleibt unverändert (kein leeres Feld angehängt)', () => {
    const clean = {
      raw: {
        tokens: {}, atomics: [{ name: 'Clean Box', variants: [], confidence: null, source: null, notes: null }],
        components: [], patterns: [],
      },
      interpretations: { 'Clean Box': { html: '<div style="padding:16px"></div>', jsx: '<div />' } },
    };
    emitFigmaComponents(clean);
    expect(clean.raw.warnings).toBeUndefined();
  });
});

describe('emitFigmaComponents — Token-Bindung gegen disambiguierte Namen (Review-Fix)', () => {
  it('bei kollidierenden Rollen bindet der Konverter an den disambiguierten Namen (primary-2), nicht an den rohen Slug', () => {
    // normalizeTokens.assignNames vergibt bei Kollision "primary" + "primary-2" (siehe normalizeTokens.js).
    // htmlToPlan.matchColorToken darf NICHT bare slugify(role) zurückgeben, sonst bindet applyFill
    // an den FALSCHEN (ersten) Figma-Style — hier müsste der Treffer auf das zweite Token (#222222) zeigen.
    const withCollision = {
      raw: {
        tokens: {
          colors: [
            { hex: '#111111', role: 'Primary' },
            { hex: '#222222', role: 'primary' },
          ],
          typography: [], spacing: [], border_radius: [], shadows: [],
        },
        atomics: [{ name: 'Stat Card', variants: [], confidence: 'high', source: 'ai', notes: null }],
        components: [],
        patterns: [],
      },
      interpretations: {
        'Stat Card': { html: '<div style="background:#222222"></div>', jsx: '<div />' },
      },
    };
    const out = emitFigmaComponents(withCollision);
    const card = out.find((c) => c.name === 'Stat Card');
    expect(card.variants[0].plan.fill).toEqual({ hex: '#222222', token: 'primary-2' });
  });
});
