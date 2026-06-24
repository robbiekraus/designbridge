import { describe, it, expect } from 'vitest';
import { emitCss } from './emitCss.js';

const tokens = [
  { group: 'color', name: 'button-primary', value: '#022d2c', confidence: 'high' },
  { group: 'color', name: 'text-secondary', value: '#706a6a', confidence: 'low' },
  { group: 'font', name: 'headline', value: { fontSize: '32px', fontWeight: '700' }, confidence: 'high' },
  { group: 'shadow', name: 'card', value: '0 1px 3px rgba(0,0,0,.1)', confidence: 'high' },
];

describe('emitCss', () => {
  it('emits grouped :root custom properties', () => {
    const css = emitCss(tokens);
    expect(css).toContain(':root {');
    expect(css).toContain('  --color-button-primary: #022d2c;');
    expect(css).toContain('  /* colors */');
    expect(css).toContain('  --font-headline-size: 32px;');
    expect(css).toContain('  --font-headline-weight: 700;');
    expect(css).toContain('  --shadow-card: 0 1px 3px rgba(0,0,0,.1);');
  });

  it('flags only low-confidence tokens with a comment', () => {
    const css = emitCss(tokens);
    expect(css).toContain('--color-text-secondary: #706a6a; /* unsicher erkannt — bitte prüfen */');
    expect(css).not.toContain('#022d2c; /*');
  });

  it('omits groups with no tokens', () => {
    const css = emitCss([{ group: 'color', name: 'x', value: '#fff', confidence: 'high' }]);
    expect(css).not.toContain('/* spacing */');
    expect(css).not.toContain('/* typography */');
  });

  it('flags BOTH font lines when font token is low-confidence', () => {
    const css = emitCss([
      { group: 'font', name: 'body', value: { fontSize: '14px', fontWeight: '400' }, confidence: 'low' },
    ]);
    expect(css).toContain('--font-body-size: 14px; /* unsicher erkannt — bitte prüfen */');
    expect(css).toContain('--font-body-weight: 400; /* unsicher erkannt — bitte prüfen */');
  });
});
