import { describe, it, expect } from 'vitest';
import { emitComponents } from './emitComponents.js';

const result = {
  raw: {
    tokens: { colors: [{ hex: '#022d2c', role: 'primary', confidence: 'high' }],
      typography: [], spacing: [], border_radius: [], shadows: [] },
    atoms: [{ name: 'Button', variants: ['primary'], confidence: 'high' }],
    molecules: [],
    organisms: [{ name: 'Hero section', variants: [], confidence: 'low' }],
    templates: [],
  },
};

describe('emitComponents', () => {
  it('returns an empty list for preview imports (raw: null)', () => {
    expect(emitComponents({ raw: null })).toEqual([]);
  });

  it('emits a template-backed atomic with preview', () => {
    const all = emitComponents(result);
    const button = all.find((c) => c.name === 'Button');
    expect(button.filename).toBe('Button.jsx');
    expect(button.kind).toBe('atom');
    expect(button.templateKey).toBe('button');
    expect(button.hasPreview).toBe(true);
    expect(button.variants).toEqual(['primary', 'secondary', 'ghost']);
    expect(button.code).toContain('bg-[#022d2c]');
  });

  it('emits a generic stub (no preview) for unknown objects', () => {
    const hero = emitComponents(result).find((c) => c.name === 'Hero section');
    expect(hero.filename).toBe('HeroSection.jsx');
    expect(hero.templateKey).toBeNull();
    expect(hero.hasPreview).toBe(false);
    expect(hero.code).toContain('export function HeroSection');
    expect(hero.code).toContain('TODO');
    expect(hero.code).toContain('unsicher erkannt');
  });

  it('emits an icon-only IconButton (svg, no text) for an Icon Button atomic', () => {
    const withIcon = {
      raw: { ...result.raw, atoms: [{ name: 'Icon Button', variants: ['primary'], confidence: 'high' }] },
    };
    const iconBtn = emitComponents(withIcon).find((c) => c.name === 'Icon Button');
    expect(iconBtn.filename).toBe('IconButton.jsx');
    expect(iconBtn.templateKey).toBe('button');
    expect(iconBtn.code).toContain('export function IconButton');
    expect(iconBtn.code).toContain('<svg');
    expect(iconBtn.code).toContain('aria-label');
  });

  it('a plain Button emits a text button (no svg, function named Button)', () => {
    const button = emitComponents(result).find((c) => c.name === 'Button');
    expect(button.code).toContain('export function Button');
    expect(button.code).not.toContain('<svg');
  });

  it('filters by kind when asked', () => {
    const atoms = emitComponents(result, 'atom');
    expect(atoms).toHaveLength(1);
    expect(atoms[0].name).toBe('Button');
  });

  it('still emits components when the tokens key is absent', () => {
    const partial = { raw: { organisms: [{ name: 'Button', variants: [], confidence: 'high' }] } };
    const out = emitComponents(partial);
    expect(out).toHaveLength(1);
    expect(out[0].name).toBe('Button');
  });

  it('reicht instanceCount und partOf pro Baustein durch', () => {
    const r = { raw: { tokens: {}, atoms: [], molecules: [{ name: 'Nav Item', instanceCount: 9, partOf: 'Sidebar' }], organisms: [], templates: [] } };
    const items = emitComponents(r, 'molecule');
    expect(items).toHaveLength(1);
    expect(items[0].instanceCount).toBe(9);
    expect(items[0].partOf).toBe('Sidebar');
  });

  it('setzt Defaults instanceCount 1 und partOf null', () => {
    const r = { raw: { tokens: {}, atoms: [{ name: 'Logo' }], molecules: [], organisms: [], templates: [] } };
    const items = emitComponents(r, 'atom');
    expect(items[0].instanceCount).toBe(1);
    expect(items[0].partOf).toBe(null);
  });
});

describe('emitComponents + Interpretationen', () => {
  const baseRaw = {
    tokens: { colors: [{ hex: '#4263EB', role: 'brand-primary', confidence: 'high' }] },
    atoms: [{ name: 'Avatar', variants: [], confidence: 'med', notes: '' }],
    molecules: [],
    organisms: [],
    templates: [],
  };

  it('Baustein ohne Template MIT Interpretation: jsx wird code, html wird interpretedHtml', () => {
    const result = {
      raw: baseRaw,
      interpretations: { Avatar: { html: '<div class="rounded-full">A</div>', jsx: 'export function Avatar() { return null; }' } },
    };
    const [item] = emitComponents(result, 'atom');
    expect(item.interpretedHtml).toContain('rounded-full');
    expect(item.code).toContain('export function Avatar');
    expect(item.hasPreview).toBe(false); // hasPreview bleibt Template-Sache
    expect(item.interpretFailed).toBe(false);
    expect(item.interpretPending).toBe(false);
  });

  it('Interpretation mit html (jsx leer): Code kommt aus planToJsx (nicht mehr aus jsx/Stub)', () => {
    const result = {
      raw: baseRaw,
      interpretations: { Avatar: { html: '<div style="background:#4263eb;padding:8px">A</div>', jsx: '' } },
    };
    const [item] = emitComponents(result, 'atom');
    expect(item.interpretedHtml).toContain('background:#4263eb');
    expect(item.code).toContain('export function Avatar');
    expect(item.code).toContain('bg-brand-primary'); // plan-abgeleiteter Tailwind
    expect(item.code).not.toContain('generischer Stub');
  });

  it('ohne Interpretation (kein html) + kein Template → weiter genericStub', () => {
    const [item] = emitComponents({ raw: baseRaw }, 'atom');
    expect(item.code).toContain('generischer Stub');
  });

  it('pending: Baustein ohne Template ohne Interpretation bei interpretPending', () => {
    const result = { raw: baseRaw, interpretPending: true };
    const [item] = emitComponents(result, 'atom');
    expect(item.interpretedHtml).toBeNull();
    expect(item.interpretPending).toBe(true);
  });

  it('failed: Baustein in interpretFailed wird markiert', () => {
    const result = { raw: baseRaw, interpretFailed: ['Avatar'] };
    const [item] = emitComponents(result, 'atom');
    expect(item.interpretFailed).toBe(true);
    expect(item.interpretPending).toBe(false);
  });

  it('Template-Bausteine bleiben unberührt von Interpretationen', () => {
    const result = {
      raw: { ...baseRaw, atoms: [{ name: 'Button', variants: [], confidence: 'high' }] },
      interpretations: { Button: { html: '<div>sollte ignoriert werden</div>', jsx: 'x' } },
      interpretPending: true,
    };
    const [item] = emitComponents(result, 'atom');
    expect(item.hasPreview).toBe(true);
    expect(item.interpretedHtml).toBeNull();
    expect(item.interpretPending).toBe(false);
  });

  it('failed hat Vorrang vor pending (failed-Liste + interpretPending gleichzeitig)', () => {
    const result = { raw: baseRaw, interpretFailed: ['Avatar'], interpretPending: true };
    const [item] = emitComponents(result, 'atom');
    expect(item.interpretFailed).toBe(true);
    expect(item.interpretPending).toBe(false);
  });

  it('vorhandene Interpretation schlägt stale failed/pending (kein failed/pending trotz Listeneintrag)', () => {
    const result = {
      raw: baseRaw,
      interpretations: { Avatar: { html: '<div>A</div>', jsx: 'export function Avatar(){return null;}' } },
      interpretFailed: ['Avatar'],
      interpretPending: true,
    };
    const [item] = emitComponents(result, 'atom');
    expect(item.interpretedHtml).toBe('<div>A</div>');
    expect(item.interpretFailed).toBe(false);
    expect(item.interpretPending).toBe(false);
  });

  it('Interpretation mit model+demo: Item trägt interpretedModel und interpretedDemo', () => {
    const result = {
      raw: baseRaw,
      interpretations: { Avatar: { html: '<div/>', jsx: 'export function Avatar(){return null;}', model: 'gemini-3-flash-preview', demo: true } },
    };
    const [item] = emitComponents(result, 'atom');
    expect(item.interpretedModel).toBe('gemini-3-flash-preview');
    expect(item.interpretedDemo).toBe(true);
  });

  it('Interpretation ohne model/demo (alter Cache-Eintrag): fällt auf null/false zurück', () => {
    const result = {
      raw: baseRaw,
      interpretations: { Avatar: { html: '<div/>', jsx: 'export function Avatar(){return null;}' } },
    };
    const [item] = emitComponents(result, 'atom');
    expect(item.interpretedModel).toBeNull();
    expect(item.interpretedDemo).toBe(false);
  });

  it('kein Interpretations-Eintrag: interpretedModel null, interpretedDemo false', () => {
    const result = { raw: baseRaw };
    const [item] = emitComponents(result, 'atom');
    expect(item.interpretedModel).toBeNull();
    expect(item.interpretedDemo).toBe(false);
  });

  it('gehobenes Repo-Item zeigt echten Code + lifted-Flag + echten Dateinamen', () => {
    const result = {
      source: 'repo',
      raw: {
        tokens: { colors: [], typography: [], spacing: [], border_radius: [], shadows: [] },
        atoms: [], templates: [],
        organisms: [{ name: 'PricingCard', confidence: 'low', source: 'rules',
          path: 'src/components/PricingCard.tsx', sourceCode: 'export const PricingCard = () => <div>Pro</div>;', lang: 'tsx' }],
      },
    };
    const [item] = emitComponents(result, 'organism');
    expect(item.lifted).toBe(true);
    expect(item.code).toMatch(/export const PricingCard/);
    expect(item.filename).toBe('PricingCard.tsx');
  });

  it('Card-Template retired: „…Card"-Organismus mit Interpretation → Code aus planToJsx (nicht interp.jsx)', () => {
    const result = {
      raw: {
        tokens: { colors: [], typography: [], spacing: [], border_radius: [], shadows: [] },
        atoms: [], templates: [],
        organisms: [{ name: 'Category of Emissions Card', confidence: 'high', variants: [] }],
      },
      interpretations: {
        'Category of Emissions Card': { html: '<div style="padding:16px">real</div>', jsx: '<div>real jsx</div>', model: 'gemini-3.5-flash' },
      },
    };
    const [item] = emitComponents(result, 'organism');
    expect(item.templateKey).toBeNull();
    expect(item.hasPreview).toBe(false);
    expect(item.code).toContain('export function CategoryOfEmissionsCard');
    expect(item.code).toContain('p-[16px]');
    expect(item.code).toContain('real');
    expect(item.code).not.toContain('<div>real jsx</div>'); // interp.jsx wird NICHT mehr genutzt
  });

  it('Snapping end-to-end: Spacing-Token + Farb-Token durch emitComponents', () => {
    const result = {
      raw: {
        tokens: {
          colors: [{ hex: '#4263EB', role: 'brand-primary', confidence: 'high' }],
          spacing: [{ value: 8, usage: 'inline gap', confidence: 'high' }],
          typography: [], border_radius: [], shadows: [],
        },
        atoms: [{ name: 'Avatar', variants: [], confidence: 'high' }], molecules: [], organisms: [], templates: [],
      },
      interpretations: { Avatar: { html: '<div style="background:#4263eb;padding:8px">A</div>' } },
    };
    const [item] = emitComponents(result, 'atom');
    expect(item.code).toContain('p-inline-gap');   // 8px → Spacing-Token
    expect(item.code).toContain('bg-brand-primary'); // Farbe → Token
    expect(item.code).not.toContain('p-[8px]');
  });
});
