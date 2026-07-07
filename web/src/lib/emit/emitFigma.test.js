import { describe, it, expect } from 'vitest';
import { normalizeTokens } from './normalizeTokens.js';
import { emitFigma } from './emitFigma.js';

const rawTokens = {
  colors: [
    { hex: '#022d2c', role: 'primary button', confidence: 'high' },
    { hex: '#ffffff', role: 'surface', confidence: 'high' },
  ],
  typography: [
    { size: 32, weight: 700, role: 'headline', confidence: 'high' },
    { size: '16px', weight: '400', role: 'body', confidence: 'high' },
  ],
  spacing: [{ value: 8, usage: 'gap', confidence: 'low' }],
  border_radius: [{ value: 8, usage: 'card', confidence: 'low' }],
  shadows: [{ description: 'card', css: '0 1px 2px rgba(0,0,0,.1)', confidence: 'high' }],
};

describe('emitFigma', () => {
  it('emits a designbridge figma-import envelope', () => {
    const payload = JSON.parse(emitFigma(normalizeTokens(rawTokens)));
    expect(payload.designbridge).toBe('figma-import');
    expect(payload.version).toBe(2);
    expect(Array.isArray(payload.colors)).toBe(true);
    expect(Array.isArray(payload.text)).toBe(true);
  });

  it('maps colors to {name, hex}', () => {
    const payload = JSON.parse(emitFigma(normalizeTokens(rawTokens)));
    expect(payload.colors).toEqual([
      { name: 'primary-button', hex: '#022d2c' },
      { name: 'surface', hex: '#ffffff' },
    ]);
  });

  it('maps typography to numeric fontSize/fontWeight', () => {
    const payload = JSON.parse(emitFigma(normalizeTokens(rawTokens)));
    expect(payload.text).toEqual([
      { name: 'headline', fontSize: 32, fontWeight: 700 },
      { name: 'body', fontSize: 16, fontWeight: 400 },
    ]);
  });

  it('only includes colors and typography (no spacing/radius/shadow)', () => {
    const payload = JSON.parse(emitFigma(normalizeTokens(rawTokens)));
    expect(Object.keys(payload).sort()).toEqual(['colors', 'components', 'designbridge', 'text', 'version']);
  });

  it('returns empty arrays when there are no tokens', () => {
    const payload = JSON.parse(emitFigma(normalizeTokens({})));
    expect(payload.colors).toEqual([]);
    expect(payload.text).toEqual([]);
  });

  it('ends with a trailing newline', () => {
    expect(emitFigma(normalizeTokens(rawTokens)).endsWith('\n')).toBe(true);
  });

  it('hängt components an und setzt version 2', () => {
    const comps = [{ name: 'Button', kind: 'atomic', confidence: null, source: null, notes: null, placeholder: false, variants: [] }];
    const parsed = JSON.parse(emitFigma([], comps));
    expect(parsed.version).toBe(2);
    expect(parsed.components).toHaveLength(1);
  });

  it('ohne components-Argument → leeres Array (abwärtskompatibel)', () => {
    const parsed = JSON.parse(emitFigma([]));
    expect(parsed.components).toEqual([]);
  });
});
