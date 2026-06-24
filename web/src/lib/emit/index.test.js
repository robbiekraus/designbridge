import { describe, it, expect } from 'vitest';
import { buildExports, EXPORT_FORMATS } from './index.js';

const imageResult = {
  source: 'image', mocked: false, raw: {
    tokens: {
      colors: [{ hex: '#022d2c', role: 'primary button', confidence: 'high' }],
      typography: [{ size: 32, weight: 700, role: 'headline', confidence: 'high' }],
      spacing: [], border_radius: [], shadows: [],
    },
  },
};
const mockResult = { source: 'url', mocked: true, raw: null };

describe('buildExports', () => {
  it('returns the three format strings for a real image import', () => {
    const out = buildExports(imageResult);
    expect(Object.keys(out)).toEqual(['css', 'tailwind', 'json']);
    expect(out.css).toContain('--color-primary-button: #022d2c;');
    expect(out.tailwind).toContain("'primary-button': 'var(--color-primary-button)'");
    expect(JSON.parse(out.json).color['primary-button'].$value).toBe('#022d2c');
  });

  it('returns null for a mock import with no token detail', () => {
    expect(buildExports(mockResult)).toBeNull();
  });

  it('returns null when there are no tokens at all', () => {
    expect(buildExports({ raw: { tokens: {} } })).toBeNull();
    expect(buildExports(null)).toBeNull();
  });

  it('exposes a stable format registry', () => {
    expect(EXPORT_FORMATS.map(f => f.id)).toEqual(['css', 'tailwind', 'json']);
    expect(EXPORT_FORMATS.find(f => f.id === 'json').filename).toBe('tokens.json');
  });
});
