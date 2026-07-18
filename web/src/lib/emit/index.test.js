import { describe, it, expect } from 'vitest';
import { buildExports, EXPORT_FORMATS } from './index.js';

const imageResult = {
  source: 'image', mocked: false, raw: {
    tokens: {
      colors: [{ hex: '#022d2c', role: 'primary button', confidence: 'high' }],
      typography: [{ size: 32, weight: 700, role: 'headline', confidence: 'high' }],
      spacing: [], border_radius: [], shadows: [],
    },
    atoms: [{ name: 'Button', variants: [] }],
  },
};
const mockResult = { source: 'url', mocked: true, raw: null };

describe('buildExports', () => {
  it('returns the three format strings for a real image import', () => {
    const out = buildExports(imageResult);
    expect(Object.keys(out)).toEqual(['css', 'tailwind', 'json', 'figma']);
    expect(out.css).toContain('--color-primary-button: #022d2c;');
    expect(out.tailwind).toContain("'primary-button': 'var(--color-primary-button)'");
    expect(JSON.parse(out.json).color['primary-button'].$value).toBe('#022d2c');
    const figma = JSON.parse(out.figma);
    expect(figma.designbridge).toBe('figma-import');
    expect(figma.colors).toContainEqual({ name: 'primary-button', hex: '#022d2c' });
    expect(figma.text).toContainEqual({ name: 'headline', fontSize: 32, fontWeight: 700 });
    expect(figma.version).toBe(2);
    expect(figma.components.length).toBeGreaterThan(0);
    expect(figma.components[0].name).toBe('Button');
  });

  it('returns null for a mock import with no token detail', () => {
    expect(buildExports(mockResult)).toBeNull();
  });

  it('returns null when there are no tokens at all', () => {
    expect(buildExports({ raw: { tokens: {} } })).toBeNull();
    expect(buildExports(null)).toBeNull();
  });

  it('exposes a stable format registry', () => {
    expect(EXPORT_FORMATS.map(f => f.id)).toEqual(['css', 'tailwind', 'json', 'figma']);
    expect(EXPORT_FORMATS.find(f => f.id === 'json').filename).toBe('tokens.json');
    expect(EXPORT_FORMATS.find(f => f.id === 'figma').filename).toBe('designbridge-figma.json');
  });
});
