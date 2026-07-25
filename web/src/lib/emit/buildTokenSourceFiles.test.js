import { describe, it, expect } from 'vitest';
import { buildTokenSourceFiles } from './buildTokenSourceFiles.js';

// Reale Spacing-/Farb-Fixture (angelehnt an den Prod-Scan aus
// storybook-harness/fixtures/prod-scan-raw.json), damit sich die entstehenden Klassennamen
// (`bg-background-card`, `p-card-layout-padding-and-grid-gaps`) direkt nachvollziehen lassen.
const result = {
  raw: {
    tokens: {
      colors: [
        { hex: '#FFFFFF', role: 'background-card', confidence: 'high' },
        { hex: '#1A1D1F', role: 'foreground-primary', confidence: 'high' },
      ],
      typography: [],
      spacing: [{ value: 24, usage: 'card layout padding and grid gaps', confidence: 'high' }],
      border_radius: [],
      shadows: [],
    },
  },
};

describe('buildTokenSourceFiles', () => {
  it('liefert null ohne Rohdaten (Preview-Importe)', () => {
    expect(buildTokenSourceFiles({ raw: null })).toBeNull();
    expect(buildTokenSourceFiles({})).toBeNull();
  });

  it('erzeugt tokens.css mit den CSS-Variablen des Scans', () => {
    const { tokensCss } = buildTokenSourceFiles(result);
    expect(tokensCss).toContain('--color-background-card: #FFFFFF;');
    expect(tokensCss).toContain('--color-foreground-primary: #1A1D1F;');
    expect(tokensCss).toContain('--spacing-card-layout-padding-and-grid-gaps: 24px;');
  });

  it('erzeugt tailwind.tokens.js als ES-Modul mit Default-Export derselben Tokens', () => {
    const { tailwindTokensJs } = buildTokenSourceFiles(result);
    expect(tailwindTokensJs).toContain('export default {');
    expect(tailwindTokensJs).not.toContain('module.exports');
    expect(tailwindTokensJs).toContain("'background-card': 'var(--color-background-card)',");
    expect(tailwindTokensJs).toContain(
      "'card-layout-padding-and-grid-gaps': 'var(--spacing-card-layout-padding-and-grid-gaps)',",
    );
  });
});
