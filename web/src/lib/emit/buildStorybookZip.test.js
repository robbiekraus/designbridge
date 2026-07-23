import { describe, it, expect } from 'vitest';
import { storybookFiles } from './buildStorybookZip.js';

const result = {
  raw: {
    tokens: { colors: [{ hex: '#022d2c', role: 'primary', confidence: 'high' }],
      typography: [], spacing: [], border_radius: [], shadows: [] },
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
});
