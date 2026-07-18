import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { emitFigmaComponents } from './emitFigmaComponents.js';

const result = {
  raw: {
    tokens: { colors: [{ hex: '#4263EB', role: 'primary' }], typography: [], spacing: [], border_radius: [], shadows: [] },
    atoms: [
      { name: 'Primary Button', variants: ['primary', 'ghost'], confidence: 'high', source: 'rules', notes: 'CTA' },
      { name: 'Avatar', variants: ['sm', 'lg'], confidence: 'low', source: 'ai', notes: 'rund' },
    ],
    molecules: [{ name: 'Search Field', variants: ['default'], confidence: 'high', source: 'rules', notes: null }],
    organisms: [{ name: 'Card', variants: [], confidence: 'medium', source: null, notes: null }],
    templates: [{ name: 'Page Layout', variants: ['default'], confidence: 'high', source: 'rules', notes: 'Screen layout' }],
  },
};

describe('emitFigmaComponents', () => {
  it('Template-Treffer bekommen Baupläne für ALLE Template-Varianten', () => {
    const out = emitFigmaComponents(result);
    const btn = out.find((c) => c.name === 'Primary Button');
    expect(btn.placeholder).toBe(false);
    expect(btn.kind).toBe('atom');
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
    expect(out.find((c) => c.name === 'Search Field').kind).toBe('molecule');
    expect(out.find((c) => c.name === 'Card').kind).toBe('organism');
    const template = out.find((c) => c.name === 'Page Layout');
    expect(template.kind).toBe('template');
    expect(template.placeholder).toBe(true); // kein Page-Layout-Template
  });

  it('raw:null (Mock-Importe) → leere Liste', () => {
    expect(emitFigmaComponents({ raw: null })).toEqual([]);
    expect(emitFigmaComponents(undefined)).toEqual([]);
  });

  it('Platzhalter ohne Scan-Varianten bekommt default-Variante', () => {
    const out = emitFigmaComponents({ raw: { tokens: {}, atoms: [{ name: 'Avatar', variants: [] }], molecules: [], organisms: [], templates: [] } });
    expect(out[0].variants).toEqual([{ name: 'default', plan: null }]);
  });

  it('Export-Reihenfolge im Payload ist atoms → molecules → organisms → templates', () => {
    const out = emitFigmaComponents(result);
    expect(out.map((c) => c.kind)).toEqual(['atom', 'atom', 'molecule', 'organism', 'template']);
    expect(out.map((c) => c.name)).toEqual(['Primary Button', 'Avatar', 'Search Field', 'Card', 'Page Layout']);
  });
});

describe('emitFigmaComponents — KI-Interpretation (Scheibe 3, Task 4)', () => {
  it('Baustein ohne Template, aber mit result.interpretations[name] → echter plan statt placeholder', () => {
    const withInterp = {
      raw: {
        tokens: { colors: [], typography: [], spacing: [], border_radius: [], shadows: [] },
        atoms: [{ name: 'Stat Card', variants: [], confidence: 'high', source: 'ai', notes: null }],
        molecules: [],
        organisms: [],
        templates: [],
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
        atoms: [{ name: 'Primary Button', variants: ['primary'], confidence: 'high', source: 'rules', notes: null }],
        molecules: [],
        organisms: [],
        templates: [],
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
        tokens: {}, atoms: [{ name: 'Avatar', variants: ['sm'], confidence: 'low', source: 'ai', notes: null }],
        molecules: [], organisms: [], templates: [],
      },
    };
    const out = emitFigmaComponents(noInterp);
    expect(out[0].placeholder).toBe(true);
    expect(out[0].variants).toEqual([{ name: 'sm', plan: null }]);
  });

  it('leeres/kaputtes Interpretations-HTML (plan:null) → Platzhalter wie bisher, keine Exception', () => {
    const brokenInterp = {
      raw: {
        tokens: {}, atoms: [{ name: 'Weirdo', variants: [], confidence: null, source: null, notes: null }],
        molecules: [], organisms: [], templates: [],
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
        atoms: [],
        molecules: [{ name: 'Button', variants: [], confidence: 'high', source: 'ai', notes: null }],
        organisms: [{ name: 'Toolbar', variants: [], confidence: 'high', source: 'ai', notes: null }],
        templates: [],
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
        tokens: {}, atoms: [{ name: 'Weird Box', variants: [], confidence: null, source: null, notes: null }],
        molecules: [], organisms: [], templates: [], warnings: ['bestehende Scan-Warnung'],
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
        tokens: {}, atoms: [{ name: 'Clean Box', variants: [], confidence: null, source: null, notes: null }],
        molecules: [], organisms: [], templates: [],
      },
      interpretations: { 'Clean Box': { html: '<div style="padding:16px"></div>', jsx: '<div />' } },
    };
    emitFigmaComponents(clean);
    expect(clean.raw.warnings).toBeUndefined();
  });
});

describe('emitFigmaComponents — Card-Template retired (Karten werden interpretiert, nicht gestubbt)', () => {
  it('ein "…Card"-Organismus mit echter Interpretation und ohne Kinder wird ai-interpreted, NICHT der generische Card-Stub', () => {
    const withCardInterp = {
      raw: {
        tokens: { colors: [], typography: [], spacing: [], border_radius: [], shadows: [] },
        atoms: [],
        molecules: [],
        organisms: [{ name: 'Category of Emissions Card', variants: [], confidence: 'high', source: 'ai', notes: null }],
        templates: [],
      },
      interpretations: {
        'Category of Emissions Card': { html: '<div>real</div>', jsx: '<div>real</div>', model: 'gemini-3.5-flash' },
      },
    };
    const out = emitFigmaComponents(withCardInterp);
    const card = out.find((c) => c.name === 'Category of Emissions Card');
    expect(card.source).toBe('ai-interpreted');
    expect(card.placeholder).toBe(false);
    // Kein Card-Template-Treffer mehr — es gibt keinen templateKey-Begriff hier, aber der Plan
    // darf nicht der generische Card-Stub (Titel/Beschreibungstext-Box) sein.
    expect(JSON.stringify(card.variants[0].plan)).not.toContain('Card-Titel');
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
        atoms: [{ name: 'Stat Card', variants: [], confidence: 'high', source: 'ai', notes: null }],
        molecules: [],
        organisms: [],
        templates: [],
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

const baseCompositionResult = () => ({
  raw: {
    tokens: { colors: [], typography: [], spacing: [], border_radius: [], shadows: [] },
    atoms: [{ name: 'Logo', bbox: { x: 0.02, y: 0.02, w: 0.05, h: 0.05 } }],
    molecules: [],
    organisms: [{ name: 'Sidebar', bbox: { x: 0, y: 0, w: 0.25, h: 1 } }],
    templates: [{ name: 'Dashboard', bbox: { x: 0, y: 0, w: 1, h: 1 } }],
    warnings: [],
    meta: { image_width: 1024, image_height: 768 },
    composition: {
      children: { Dashboard: ['Sidebar'], Sidebar: ['Logo'] },
      roots: ['Dashboard'],
    },
  },
  interpretations: {},
});

describe('emitFigmaComponents — composition', () => {
  it('parents with children are composed of component-refs, not htmlToPlan', () => {
    const out = emitFigmaComponents(baseCompositionResult());
    const dashboard = out.find((c) => c.name === 'Dashboard');
    expect(dashboard.source).toBe('composed');
    expect(dashboard.placeholder).toBe(false);
    const plan = dashboard.variants[0].plan;
    expect(plan.children.map((c) => c.type)).toEqual(['component-ref']);
    expect(plan.children[0].name).toBe('Sidebar');
    const sidebar = out.find((c) => c.name === 'Sidebar');
    expect(sidebar.source).toBe('composed');
    expect(sidebar.variants[0].plan.children[0].name).toBe('Logo');
  });
  it('leaf baustein without children keeps existing placeholder path', () => {
    const out = emitFigmaComponents(baseCompositionResult());
    const logo = out.find((c) => c.name === 'Logo');
    expect(logo.source).not.toBe('composed');
    expect(logo.placeholder).toBe(true); // no interpretation, no template
  });

  it('repo composition (no bbox) → composed parent in flow mode', () => {
    const result = { raw: {
      tokens: { colors: [], typography: [], spacing: [], border_radius: [], shadows: [] },
      atoms: [{ name: 'Button', path: 'ui/Button.tsx' }],
      molecules: [],
      organisms: [{ name: 'SidebarNav', path: 'SidebarNav.tsx' }],
      templates: [{ name: 'Layout', path: 'Layout.tsx' }],
      warnings: [], meta: {},
      composition: { children: { Layout: ['SidebarNav'], SidebarNav: ['Button'] }, roots: ['Layout'] },
    }, interpretations: {} };
    const out = emitFigmaComponents(result);
    const layout = out.find((c) => c.name === 'Layout');
    expect(layout.source).toBe('composed');
    expect(layout.variants[0].plan.layout).toBe('column');
    expect(layout.variants[0].plan.children[0]).toMatchObject({ type: 'component-ref', name: 'SidebarNav' });
    expect(layout.variants[0].plan.children[0].absolute).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// Composition-Splice (Scheibe 1b, Spec: docs/superpowers/specs/2026-07-18-composition-splice-
// parent-fidelity-design.md, Plan: docs/superpowers/plans/2026-07-18-composition-splice.md, Task 2).
//
// Eltern MIT eigener Interpretation + Kind-bbox splicen jetzt in ihre EIGENE Interpretation statt
// (wie bisher) rein aus component-ref-Instanzen komponiert zu werden. htmlToPlan braucht dafür echte
// Rects — jsdom liefert nur Nullen (s. htmlToPlan.test.js Kopf-Kommentar) — deshalb wird
// Element.prototype.getBoundingClientRect für diese Suite gemockt (identischer Ansatz wie dort:
// `data-mock-rect` JSON-Attribut je Element).
// ---------------------------------------------------------------------------
describe('emitFigmaComponents — composed-spliced (Composition-Splice, Task 2)', () => {
  let restoreGetBoundingClientRect;

  beforeEach(() => {
    const original = Element.prototype.getBoundingClientRect;
    restoreGetBoundingClientRect = () => {
      Element.prototype.getBoundingClientRect = original;
    };
    Element.prototype.getBoundingClientRect = function mockedGetBoundingClientRect() {
      const raw = this.getAttribute?.('data-mock-rect');
      const r = raw ? JSON.parse(raw) : { x: 0, y: 0, width: 0, height: 0 };
      return {
        x: r.x,
        y: r.y,
        left: r.x,
        top: r.y,
        width: r.width,
        height: r.height,
        right: r.x + r.width,
        bottom: r.y + r.height,
        toJSON() {
          return this;
        },
      };
    };
  });

  afterEach(() => {
    restoreGetBoundingClientRect();
  });

  // Gepinnte Beispielrechnung (Spec §2, Organism-Parent NICHT bei 0,0):
  //   parent.bbox = {x:0.1, y:0.2, w:0.6, h:0.4}
  //   child.bbox  = {x:0.3, y:0.3, w:0.2, h:0.1}   (absolute Bild-Koordinaten)
  //   childRel = { x:(0.3-0.1)/0.6, y:(0.3-0.2)/0.4, w:0.2/0.6, h:0.1/0.4 }
  //            = { x: 1/3, y: 0.25, w: 1/3, h: 0.25 }
  // Das gemockte Kind-Rect innerhalb der Eltern-Interpretation (Wurzel 900x400) wird EXAKT auf
  // diese childRel-Fraktion gelegt — matcht die Zielposition nur, wenn die Normierungsformel
  // korrekt implementiert ist (sonst IoU < SPLICE_MIN_IOU, kein component-ref).
  const parentBbox = { x: 0.1, y: 0.2, w: 0.6, h: 0.4 };
  const childBbox = { x: 0.3, y: 0.3, w: 0.2, h: 0.1 };

  function baseResult(interpHtml) {
    return {
      raw: {
        tokens: { colors: [], typography: [], spacing: [], border_radius: [], shadows: [] },
        atoms: [],
        molecules: [],
        organisms: [
          { name: 'KPI Chart', bbox: childBbox, confidence: 'high', source: 'ai', notes: null },
        ],
        templates: [
          { name: 'Dashboard', bbox: parentBbox, confidence: 'high', source: 'ai', notes: null },
        ],
        warnings: [],
        meta: { image_width: 1024, image_height: 768 },
        composition: { children: { Dashboard: ['KPI Chart'] }, roots: ['Dashboard'] },
      },
      interpretations: interpHtml ? { Dashboard: { html: interpHtml, jsx: '<div />' } } : {},
    };
  }

  it('Eltern MIT Interpretation + Kind-bbox → source composed-spliced, component-ref an Kind-Position, Rest = Eltern-Interpretation', () => {
    const html =
      '<div data-mock-rect=\'{"x":0,"y":0,"width":900,"height":400}\' style="border-top-left-radius:8px">' +
      '<h2 style="font-size:20px">Dashboard-Titel</h2>' +
      '<div data-mock-rect=\'{"x":300,"y":100,"width":300,"height":100}\'>Chart-Platzhalter</div>' +
      '</div>';
    const out = emitFigmaComponents(baseResult(html));
    const dashboard = out.find((c) => c.name === 'Dashboard');
    expect(dashboard.source).toBe('composed-spliced');
    expect(dashboard.placeholder).toBe(false);
    const plan = dashboard.variants[0].plan;
    // Eltern-Struktur bleibt erhalten: Titel-Text als eigenes Kind vorhanden.
    expect(JSON.stringify(plan)).toContain('Dashboard-Titel');
    // Kind-Region ist ein FLOW-Element (kein CSS position:absolute) → Composition-Fidelity-v3-
    // Wrapper (Spec 2026-07-19-composition-fidelity-v3-flow-box-wrap-design.md): die echte
    // component-ref-Instanz steckt jetzt im einzigen Kind einer Flow-Box in Slot-Größe, statt
    // direkt als Eltern-Kind zu erscheinen (Overlap-Fix — die Box behält den Flow-Platz).
    const wrapperNode = plan.children.find((c) => c.type === 'box' && c.children?.[0]?.type === 'component-ref');
    expect(wrapperNode).toBeDefined();
    const refNode = wrapperNode.children[0];
    expect(refNode.name).toBe('KPI Chart');
    expect(refNode.fallback.children[0]).toMatchObject({ type: 'text', content: 'Chart-Platzhalter' });
  });

  it('Eltern MIT Kindern, OHNE eigene Interpretation → Fallback composePlan (source composed), wie Scheibe 1', () => {
    const out = emitFigmaComponents(baseResult(null));
    const dashboard = out.find((c) => c.name === 'Dashboard');
    expect(dashboard.source).toBe('composed');
    expect(dashboard.placeholder).toBe(false);
    expect(dashboard.variants[0].plan.children[0]).toMatchObject({ type: 'component-ref', name: 'KPI Chart' });
  });

  it('Eltern-Interpretation vorhanden, aber Kind OHNE bbox → Fallback composePlan (source composed)', () => {
    const result = baseResult('<div data-mock-rect=\'{"x":0,"y":0,"width":900,"height":400}\'>x</div>');
    result.raw.organisms[0] = { name: 'KPI Chart', confidence: 'high', source: 'ai', notes: null }; // kein bbox
    const out = emitFigmaComponents(result);
    const dashboard = out.find((c) => c.name === 'Dashboard');
    expect(dashboard.source).toBe('composed');
  });

  it('Eltern-Interpretation vorhanden, aber leer/kaputt (plan:null) → Fallback composePlan (source composed)', () => {
    const out = emitFigmaComponents(baseResult('   '));
    const dashboard = out.find((c) => c.name === 'Dashboard');
    expect(dashboard.source).toBe('composed');
  });

  it('Leaf-Baustein (keine Kinder) bleibt unverändert (kein composed-spliced)', () => {
    const out = emitFigmaComponents(baseResult(null));
    const kpi = out.find((c) => c.name === 'KPI Chart');
    expect(kpi.source).not.toBe('composed-spliced');
    expect(kpi.source).not.toBe('composed');
  });
});
