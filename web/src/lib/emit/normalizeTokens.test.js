import { describe, it, expect } from 'vitest';
import { normalizeTokens } from './normalizeTokens.js';

const raw = {
  colors: [
    { hex: '#022d2c', role: 'primary button background', confidence: 'high' },
    { hex: '#706a6a', role: 'secondary text', confidence: 'low' },
    { hex: '#ffffff', role: 'secondary text', confidence: 'med' }, // collision with previous role
    { hex: '#000000', role: '', confidence: 'high' },              // empty label → fallback
  ],
  typography: [
    { size: 32, weight: 700, role: 'headline', sample: 'Ag', confidence: 'high' },
    { size: '14px', weight: '500', role: 'body', confidence: 'medium' },
  ],
  spacing: [
    { value: 16, usage: 'gutter', confidence: 'high' },
    { value: '8px', usage: 'inline gap', confidence: 'low' },
  ],
  border_radius: [
    { value: 8, usage: 'card', confidence: 'high' },
    { value: '50%', usage: 'avatar', confidence: 'med' },
  ],
  shadows: [
    { css: '0 1px 3px rgba(0,0,0,.1)', description: 'card shadow', confidence: 'high' },
  ],
};

describe('normalizeTokens', () => {
  it('names colors, handles collisions and empty labels', () => {
    const out = normalizeTokens(raw).filter(t => t.group === 'color');
    expect(out.map(t => t.name)).toEqual([
      'primary-button-background',
      'secondary-text',
      'secondary-text-2',
      'color-4',
    ]);
    expect(out[0]).toMatchObject({ group: 'color', value: '#022d2c', confidence: 'high' });
    expect(out[1].confidence).toBe('low');
  });

  it('builds typography as a compound value with px font size', () => {
    const out = normalizeTokens(raw).filter(t => t.group === 'font');
    expect(out[0]).toMatchObject({ name: 'headline', value: { fontSize: '32px', fontWeight: '700' } });
    expect(out[1].value).toEqual({ fontSize: '14px', fontWeight: '500' });
  });

  it('appends px to unitless spacing and radius, passes units through', () => {
    const all = normalizeTokens(raw);
    const spacing = all.filter(t => t.group === 'spacing');
    const radius = all.filter(t => t.group === 'radius');
    expect(spacing.map(t => t.value)).toEqual(['16px', '8px']);
    expect(radius.map(t => t.value)).toEqual(['8px', '50%']);
  });

  it('passes shadow css through unchanged', () => {
    const shadow = normalizeTokens(raw).find(t => t.group === 'shadow');
    expect(shadow).toMatchObject({ name: 'card-shadow', value: '0 1px 3px rgba(0,0,0,.1)' });
  });

  it('returns an empty array for missing or empty token sets', () => {
    expect(normalizeTokens(undefined)).toEqual([]);
    expect(normalizeTokens({})).toEqual([]);
    expect(normalizeTokens({ colors: [] })).toEqual([]);
  });
});
