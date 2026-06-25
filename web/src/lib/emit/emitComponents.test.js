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
  });

  it('filters by kind when asked', () => {
    const atomics = emitComponents(result, 'atomic');
    expect(atomics).toHaveLength(1);
    expect(atomics[0].name).toBe('Button');
  });
});
