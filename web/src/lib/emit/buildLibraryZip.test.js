import { describe, it, expect } from 'vitest';
import JSZip from 'jszip';
import { buildLibraryZip } from './buildLibraryZip.js';

const result = {
  raw: {
    tokens: { colors: [{ hex: '#022d2c', role: 'primary', confidence: 'high' }],
      typography: [], spacing: [], border_radius: [], shadows: [] },
    atoms: [{ name: 'Button', variants: ['primary'], confidence: 'high' }],
    molecules: [], organisms: [], templates: [],
  },
};

describe('buildLibraryZip', () => {
  it('packs tokens and components into the zip', async () => {
    const blob = await buildLibraryZip(result);
    const zip = await JSZip.loadAsync(blob);
    const names = Object.keys(zip.files);
    expect(names).toContain('tokens/tokens.css');
    expect(names).toContain('tokens/tokens.json');
    expect(names).toContain('tokens/tailwind.config.tokens.js');
    expect(names).toContain('components/Button.jsx');
    expect(names).toContain('README.md');
  });
});
