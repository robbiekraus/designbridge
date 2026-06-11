import { describe, it, expect } from 'vitest';
import { adaptImageScanResponse } from './scanResultAdapter.js';

const fixture = {
  tokens: {
    colors: [{ hex: '#fff', role: 'bg', confidence: 'high' }, { hex: '#000', role: 'text', confidence: 'high' }],
    typography: [{ size: '14px', weight: 500, role: 'body', confidence: 'med' }],
    spacing: [{ value: '8px', confidence: 'high' }],
    border_radius: [{ value: '6px', confidence: 'high' }],
    shadows: [],
  },
  atomics: [{ name: 'Button', confidence: 'high' }],
  components: [{ name: 'Card', confidence: 'med' }, { name: 'Modal', confidence: 'low' }],
  patterns: [],
  warnings: [],
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
      extra: { atomics: 1, components: 2, patterns: 0 },
    });
  });

  it('returns count 0 / confidence null when a category is missing', () => {
    const result = adaptImageScanResponse({ tokens: {}, atomics: [], components: [], patterns: [] });
    const colors = result.categories.find(c => c.key === 'colors');
    expect(colors.count).toBe(0);
    expect(colors.confidence).toBeNull();
  });
});
