import { describe, it, expect } from 'vitest';
import { emitTailwind } from './emitTailwind.js';

const tokens = [
  { group: 'color', name: 'button-primary', value: '#022d2c', confidence: 'high' },
  { group: 'color', name: 'text-secondary', value: '#706a6a', confidence: 'low' },
  { group: 'font', name: 'headline', value: { fontSize: '32px', fontWeight: '700' }, confidence: 'high' },
  { group: 'spacing', name: 'gutter', value: '16px', confidence: 'high' },
  { group: 'radius', name: 'card', value: '8px', confidence: 'high' },
  { group: 'shadow', name: 'card', value: '0 1px 3px rgba(0,0,0,.1)', confidence: 'high' },
];

describe('emitTailwind', () => {
  it('maps token names to var() references under the right theme keys', () => {
    const out = emitTailwind(tokens);
    expect(out).toContain('module.exports = {');
    expect(out).toContain("    'button-primary': 'var(--color-button-primary)',");
    expect(out).toContain("  fontSize: {");
    expect(out).toContain("    'headline': 'var(--font-headline-size)',");
    expect(out).toContain("  fontWeight: {");
    expect(out).toContain("    'headline': 'var(--font-headline-weight)',");
    expect(out).toContain("  spacing: {");
    expect(out).toContain("    'gutter': 'var(--spacing-gutter)',");
    expect(out).toContain("  borderRadius: {");
    expect(out).toContain("    'card': 'var(--radius-card)',");
    expect(out).toContain("  boxShadow: {");
    expect(out).toContain("    'card': 'var(--shadow-card)',");
  });

  it('flags only low-confidence tokens with a line comment', () => {
    const out = emitTailwind(tokens);
    expect(out).toContain("    'text-secondary': 'var(--color-text-secondary)', // unsicher erkannt — bitte prüfen");
  });

  it('omits theme keys whose group has no tokens', () => {
    const out = emitTailwind([{ group: 'color', name: 'x', value: '#fff', confidence: 'high' }]);
    expect(out).not.toContain('spacing:');
    expect(out).not.toContain('boxShadow:');
  });
});
