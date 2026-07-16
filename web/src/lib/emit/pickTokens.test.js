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

  it('resolves onPrimary and surfaceMuted from token roles when present', () => {
    const tokens = normalizeTokens({
      colors: [
        { hex: '#022d2c', role: 'primary', confidence: 'high' },
        { hex: '#e8fff9', role: 'on primary', confidence: 'high' },
        { hex: '#f0f0f0', role: 'muted background', confidence: 'med' },
      ],
      typography: [], spacing: [], border_radius: [], shadows: [],
    });
    const p = pickTokens(tokens);
    expect(p.onPrimary).toBe('#e8fff9');
    expect(p.surfaceMuted).toBe('#f0f0f0');
  });

  // Fix 13.07. — Spiegel zu pickTokenRefs.test.js (Regexe MÜSSEN identisch bleiben):
  // surfaceMuted darf keine foreground-Rolle greifen; Font-Slot nimmt Body statt erstes Token.
  it('surfaceMuted ignoriert foreground-muted (Textfarbe), fällt hell zurück', () => {
    const tokens = normalizeTokens({
      colors: [
        { hex: '#4263EB', role: 'brand-primary', confidence: 'high' },
        { hex: '#495057', role: 'foreground-muted', confidence: 'high' },
        { hex: '#F8F9FA', role: 'background-app', confidence: 'high' },
      ],
      typography: [], spacing: [], border_radius: [], shadows: [],
    });
    expect(pickTokens(tokens).surfaceMuted).toBe('#f4f4f5');
  });

  // Bug Testrunde 2: Eine einzelne Rolle traf sowohl die primary- als auch die
  // onPrimary-Regel (z. B. "accent button text") → Button bekam dieselbe Farbe
  // für Hintergrund UND Text (#79c0ff auf #79c0ff, unlesbar).
  it('onPrimary ist nie identisch mit primary, auch wenn eine Rolle beide Regexe matcht', () => {
    const tokens = normalizeTokens({
      colors: [{ hex: '#79c0ff', role: 'accent button text', confidence: 'high' }],
      typography: [], spacing: [], border_radius: [], shadows: [],
    });
    const p = pickTokens(tokens);
    expect(p.primary).toBe('#79c0ff');
    expect(p.onPrimary).not.toBe(p.primary);
  });

  it('text ist nie identisch mit surface, auch wenn eine Rolle beide Regexe matcht', () => {
    const tokens = normalizeTokens({
      colors: [{ hex: '#33aabb', role: 'background text', confidence: 'high' }],
      typography: [], spacing: [], border_radius: [], shadows: [],
    });
    const p = pickTokens(tokens);
    expect(p.surface).toBe('#33aabb');
    expect(p.text).not.toBe(p.surface);
  });

  it('wählt bei Kollision eine andere passende Token-Farbe mit ausreichend Kontrast statt Schwarz/Weiß-Fallback', () => {
    const tokens = normalizeTokens({
      colors: [
        { hex: '#79c0ff', role: 'accent button text', confidence: 'high' },
        { hex: '#0d1117', role: 'ink', confidence: 'high' },
      ],
      typography: [], spacing: [], border_radius: [], shadows: [],
    });
    const p = pickTokens(tokens);
    expect(p.onPrimary).toBe('#0d1117');
  });

  it('Font-Slot bevorzugt body-Rolle vor dem ersten (Display-)Token', () => {
    const tokens = normalizeTokens({
      colors: [],
      typography: [
        { size: 32, weight: 700, role: 'display-xl', confidence: 'high' },
        { size: 14, weight: 400, role: 'body-default', confidence: 'high' },
      ],
      spacing: [], border_radius: [], shadows: [],
    });
    const p = pickTokens(tokens);
    expect(p.fontSize).toBe('14px');
    expect(p.fontWeight).toBe('400');
  });
});
