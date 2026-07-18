import { describe, it, expect } from 'vitest';
import { adaptScanResponse, adaptImageScanResponse } from './scanResultAdapter.js';

const fixture = {
  tokens: {
    colors: [{ hex: '#fff', role: 'bg', confidence: 'high' }, { hex: '#000', role: 'text', confidence: 'high' }],
    typography: [{ size: '14px', weight: 500, role: 'body', confidence: 'med' }],
    spacing: [{ value: '8px', confidence: 'high' }],
    border_radius: [{ value: '6px', confidence: 'high' }],
    shadows: [],
  },
  atoms: [{ name: 'Button', confidence: 'high' }],
  molecules: [],
  organisms: [{ name: 'Card', confidence: 'med' }, { name: 'Modal', confidence: 'low' }],
  templates: [],
  warnings: [],
};

const raw = {
  tokens: { colors: [{ hex: '#022d2c', role: 'primary', confidence: 'high', source: '--color-primary' }] },
  atoms: [], molecules: [], organisms: [], templates: [],
};

describe('adaptImageScanResponse', () => {
  it('produces one row per category with counts and worst-case confidence', () => {
    const result = adaptImageScanResponse(fixture);
    expect(result.source).toBe('image');
    expect(result.mocked).toBe(false);
    const byKey = Object.fromEntries(result.categories.map(c => [c.key, c]));
    expect(byKey.colors).toMatchObject({ label: 'Colors', count: 2, confidence: 'high' });
    expect(byKey.typography).toMatchObject({ count: 1, confidence: 'med' });
    expect(byKey.spacing).toMatchObject({ count: 1, confidence: 'high' });
    expect(byKey.radius).toMatchObject({ count: 1, confidence: 'high' });
    expect(byKey.shadows).toMatchObject({ count: 0, confidence: null });
    expect(byKey.inventory).toMatchObject({
      count: 3,
      confidence: 'low',
      extra: { atoms: 1, molecules: 0, organisms: 2, templates: 0 },
    });
  });

  it('returns count 0 / confidence null when a category is missing', () => {
    const result = adaptImageScanResponse({ tokens: {}, atoms: [], molecules: [], organisms: [], templates: [] });
    const colors = result.categories.find(c => c.key === 'colors');
    expect(colors.count).toBe(0);
    expect(colors.confidence).toBeNull();
  });
});

describe('adaptScanResponse', () => {
  it('tags the source and is not mocked', () => {
    const out = adaptScanResponse(raw, 'url');
    expect(out.source).toBe('url');
    expect(out.mocked).toBe(false);
    expect(out.categories.find((c) => c.key === 'colors').count).toBe(1);
    expect(out.raw).toBe(raw);
  });

  it('image alias keeps source "image"', () => {
    expect(adaptImageScanResponse(raw).source).toBe('image');
  });

  it('carries server warnings through to the adapted result', () => {
    const withWarnings = { ...raw, warnings: ['1 Stylesheet war nicht lesbar und wurde übersprungen.'] };
    const out = adaptScanResponse(withWarnings, 'url');
    expect(out.warnings).toEqual(['1 Stylesheet war nicht lesbar und wurde übersprungen.']);
  });

  it('defaults warnings to an empty array when absent', () => {
    expect(adaptScanResponse(raw, 'url').warnings).toEqual([]);
  });
});
