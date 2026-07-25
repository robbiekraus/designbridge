import { describe, it, expect } from 'vitest';
import { storybookFiles } from './buildStorybookZip.js';

const result = {
  raw: {
    tokens: { colors: [{ hex: '#022d2c', role: 'primary', confidence: 'high' }],
      typography: [],
      spacing: [{ value: 24, usage: 'card layout padding and grid gaps', confidence: 'high' }],
      border_radius: [], shadows: [] },
    atoms: [{ name: 'Button', variants: ['primary'], confidence: 'high' }],
    molecules: [],
    organisms: [{ name: 'Hero section', variants: [], confidence: 'low' }],
    templates: [],
  },
};

describe('storybookFiles', () => {
  it('leere Map für Preview-Importe (raw: null)', () => {
    const files = storybookFiles({ raw: null });
    // Nur Config + README, keine Komponenten/Stories.
    expect(Object.keys(files)).toEqual(['.storybook/main.js', 'README-storybook.md']);
  });

  it('erzeugt je Baustein Komponente + Story', () => {
    const files = storybookFiles(result);
    expect(files['components/Button.jsx']).toBeDefined();
    expect(files['stories/Button.stories.jsx']).toContain("title: 'Atoms/Button'");
    expect(files['components/HeroSection.jsx']).toBeDefined();
    expect(files['stories/HeroSection.stories.jsx']).toContain("title: 'Organisms/Hero section'");
  });

  it('legt .storybook/main.js an, das auf stories zeigt', () => {
    const files = storybookFiles(result);
    expect(files['.storybook/main.js']).toContain("'../stories/**/*.stories.jsx'");
  });

  it('README listet die Stories', () => {
    const readme = storybookFiles(result)['README-storybook.md'];
    expect(readme).toContain('stories/Button.stories.jsx');
    expect(readme).toContain('# DesignBridge — Storybook-Paket');
  });

  it('bringt tailwind.tokens.js und tokens.css mit den Scan-Tokens mit', () => {
    const files = storybookFiles(result);
    expect(files['tailwind.tokens.js']).toContain('export default {');
    expect(files['tailwind.tokens.js']).toContain("'primary': 'var(--color-primary)',");
    expect(files['tailwind.tokens.js']).toContain(
      "'card-layout-padding-and-grid-gaps': 'var(--spacing-card-layout-padding-and-grid-gaps)',",
    );
    expect(files['tokens.css']).toContain('--color-primary: #022d2c;');
    expect(files['tokens.css']).toContain('--spacing-card-layout-padding-and-grid-gaps: 24px;');
  });

  it('README erklärt das Einbinden von tailwind.tokens.js und tokens.css', () => {
    const readme = storybookFiles(result)['README-storybook.md'];
    expect(readme).toContain('tailwind.tokens.js');
    expect(readme).toContain('tokens.css');
    expect(readme).toMatch(/theme\.extend/);
  });

  it('keine Token-Dateien für Preview-Importe ohne Rohdaten', () => {
    const files = storybookFiles({ raw: null });
    expect(files['tailwind.tokens.js']).toBeUndefined();
    expect(files['tokens.css']).toBeUndefined();
  });
});
