import { describe, it, expect } from 'vitest';
import { emitComponents } from './emitComponents.js';

const result = {
  raw: {
    tokens: { colors: [{ hex: '#022d2c', role: 'primary', confidence: 'high' }],
      typography: [], spacing: [], border_radius: [], shadows: [] },
    atomics: [{ name: 'Button', variants: ['primary'], confidence: 'high' }],
    components: [{ name: 'Hero section', variants: [], confidence: 'low' }],
    patterns: [],
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
    expect(button.kind).toBe('atomic');
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
      raw: { ...result.raw, atomics: [{ name: 'Icon Button', variants: ['primary'], confidence: 'high' }] },
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
    const atomics = emitComponents(result, 'atomic');
    expect(atomics).toHaveLength(1);
    expect(atomics[0].name).toBe('Button');
  });

  it('still emits components when the tokens key is absent', () => {
    const partial = { raw: { components: [{ name: 'Button', variants: [], confidence: 'high' }] } };
    const out = emitComponents(partial);
    expect(out).toHaveLength(1);
    expect(out[0].name).toBe('Button');
  });
});

describe('emitComponents + Interpretationen', () => {
  const baseRaw = {
    tokens: { colors: [{ hex: '#4263EB', role: 'brand-primary', confidence: 'high' }] },
    atomics: [{ name: 'Avatar', variants: [], confidence: 'med', notes: '' }],
    components: [],
    patterns: [],
  };

  it('Baustein ohne Template MIT Interpretation: jsx wird code, html wird interpretedHtml', () => {
    const result = {
      raw: baseRaw,
      interpretations: { Avatar: { html: '<div class="rounded-full">A</div>', jsx: 'export function Avatar() { return null; }' } },
    };
    const [item] = emitComponents(result, 'atomic');
    expect(item.interpretedHtml).toContain('rounded-full');
    expect(item.code).toContain('export function Avatar');
    expect(item.hasPreview).toBe(false); // hasPreview bleibt Template-Sache
    expect(item.interpretFailed).toBe(false);
    expect(item.interpretPending).toBe(false);
  });

  it('Interpretation mit leerem jsx: html-Vorschau ja, Code fällt auf Stub zurück', () => {
    const result = {
      raw: baseRaw,
      interpretations: { Avatar: { html: '<div>A</div>', jsx: '' } },
    };
    const [item] = emitComponents(result, 'atomic');
    expect(item.interpretedHtml).toBe('<div>A</div>');
    expect(item.code).toContain('generischer Stub');
  });

  it('pending: Baustein ohne Template ohne Interpretation bei interpretPending', () => {
    const result = { raw: baseRaw, interpretPending: true };
    const [item] = emitComponents(result, 'atomic');
    expect(item.interpretedHtml).toBeNull();
    expect(item.interpretPending).toBe(true);
  });

  it('failed: Baustein in interpretFailed wird markiert', () => {
    const result = { raw: baseRaw, interpretFailed: ['Avatar'] };
    const [item] = emitComponents(result, 'atomic');
    expect(item.interpretFailed).toBe(true);
    expect(item.interpretPending).toBe(false);
  });

  it('Template-Bausteine bleiben unberührt von Interpretationen', () => {
    const result = {
      raw: { ...baseRaw, atomics: [{ name: 'Button', variants: [], confidence: 'high' }] },
      interpretations: { Button: { html: '<div>sollte ignoriert werden</div>', jsx: 'x' } },
      interpretPending: true,
    };
    const [item] = emitComponents(result, 'atomic');
    expect(item.hasPreview).toBe(true);
    expect(item.interpretedHtml).toBeNull();
    expect(item.interpretPending).toBe(false);
  });

  it('failed hat Vorrang vor pending (failed-Liste + interpretPending gleichzeitig)', () => {
    const result = { raw: baseRaw, interpretFailed: ['Avatar'], interpretPending: true };
    const [item] = emitComponents(result, 'atomic');
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
    const [item] = emitComponents(result, 'atomic');
    expect(item.interpretedHtml).toBe('<div>A</div>');
    expect(item.interpretFailed).toBe(false);
    expect(item.interpretPending).toBe(false);
  });

  it('Interpretation mit model+demo: Item trägt interpretedModel und interpretedDemo', () => {
    const result = {
      raw: baseRaw,
      interpretations: { Avatar: { html: '<div/>', jsx: 'export function Avatar(){return null;}', model: 'gemini-3-flash-preview', demo: true } },
    };
    const [item] = emitComponents(result, 'atomic');
    expect(item.interpretedModel).toBe('gemini-3-flash-preview');
    expect(item.interpretedDemo).toBe(true);
  });

  it('Interpretation ohne model/demo (alter Cache-Eintrag): fällt auf null/false zurück', () => {
    const result = {
      raw: baseRaw,
      interpretations: { Avatar: { html: '<div/>', jsx: 'export function Avatar(){return null;}' } },
    };
    const [item] = emitComponents(result, 'atomic');
    expect(item.interpretedModel).toBeNull();
    expect(item.interpretedDemo).toBe(false);
  });

  it('kein Interpretations-Eintrag: interpretedModel null, interpretedDemo false', () => {
    const result = { raw: baseRaw };
    const [item] = emitComponents(result, 'atomic');
    expect(item.interpretedModel).toBeNull();
    expect(item.interpretedDemo).toBe(false);
  });

  it('gehobenes Repo-Item zeigt echten Code + lifted-Flag + echten Dateinamen', () => {
    const result = {
      source: 'repo',
      raw: {
        tokens: { colors: [], typography: [], spacing: [], border_radius: [], shadows: [] },
        atomics: [], patterns: [],
        components: [{ name: 'PricingCard', confidence: 'low', source: 'rules',
          path: 'src/components/PricingCard.tsx', sourceCode: 'export const PricingCard = () => <div>Pro</div>;', lang: 'tsx' }],
      },
    };
    const [item] = emitComponents(result, 'component');
    expect(item.lifted).toBe(true);
    expect(item.code).toMatch(/export const PricingCard/);
    expect(item.filename).toBe('PricingCard.tsx');
  });
});
