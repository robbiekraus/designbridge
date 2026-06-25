import { describe, it, expect } from 'vitest';
import { pickTokens } from './pickTokens.js';
import { normalizeTokens } from './normalizeTokens.js';

describe('pickTokens', () => {
  it('falls back to zinc defaults when there are no tokens', () => {
    const p = pickTokens([]);
    expect(p.primary).toBe('#18181b');
    expect(p.onPrimary).toBe('#ffffff');
    expect(p.border).toBe('#e4e4e7');
    expect(p.radius).toBe('6px');
    expect(p.fontSize).toBe('14px');
    expect(p.fontWeight).toBe('500');
  });

  it('pulls primary color, border, radius and font from real tokens', () => {
    const tokens = normalizeTokens({
      colors: [
        { hex: '#022d2c', role: 'primary button', confidence: 'high' },
        { hex: '#dddddd', role: 'border', confidence: 'med' },
      ],
      typography: [{ size: 16, weight: 600, role: 'body', confidence: 'high' }],
      spacing: [],
      border_radius: [{ value: 8, usage: 'cards', confidence: 'high' }],
      shadows: [],
    });
    const p = pickTokens(tokens);
    expect(p.primary).toBe('#022d2c');
    expect(p.border).toBe('#dddddd');
    expect(p.radius).toBe('8px');
    expect(p.fontSize).toBe('16px');
    expect(p.fontWeight).toBe('600');
  });
});
