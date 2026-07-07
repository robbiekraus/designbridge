import { describe, it, expect } from 'vitest';
import { emitFigmaComponents } from './emitFigmaComponents.js';

const result = {
  raw: {
    tokens: { colors: [{ hex: '#4263EB', role: 'primary' }], typography: [], spacing: [], border_radius: [], shadows: [] },
    atomics: [
      { name: 'Primary Button', variants: ['primary', 'ghost'], confidence: 'high', source: 'rules', notes: 'CTA' },
      { name: 'Avatar', variants: ['sm', 'lg'], confidence: 'low', source: 'ai', notes: 'rund' },
    ],
    components: [{ name: 'Card', variants: [], confidence: 'medium', source: null, notes: null }],
    patterns: [{ name: 'Navbar', variants: ['default'], confidence: 'high', source: 'rules', notes: 'Logo links' }],
  },
};

describe('emitFigmaComponents', () => {
  it('Template-Treffer bekommen Baupläne für ALLE Template-Varianten', () => {
    const out = emitFigmaComponents(result);
    const btn = out.find((c) => c.name === 'Primary Button');
    expect(btn.placeholder).toBe(false);
    expect(btn.kind).toBe('atomic');
    expect(btn.variants.map((v) => v.name)).toEqual(['primary', 'secondary', 'ghost']); // Template-Varianten, nicht Scan-Varianten
    expect(btn.variants[0].plan.type).toBe('box');
    expect(btn.variants[0].plan.fill).toEqual({ token: 'primary', hex: '#4263EB' });
  });

  it('ohne Template → placeholder mit Scan-Varianten und plan:null', () => {
    const out = emitFigmaComponents(result);
    const avatar = out.find((c) => c.name === 'Avatar');
    expect(avatar.placeholder).toBe(true);
    expect(avatar.variants).toEqual([{ name: 'sm', plan: null }, { name: 'lg', plan: null }]);
    expect(avatar.notes).toBe('rund');
  });

  it('kind wird je Liste gesetzt, Metadaten durchgereicht', () => {
    const out = emitFigmaComponents(result);
    expect(out.find((c) => c.name === 'Card').kind).toBe('component');
    const nav = out.find((c) => c.name === 'Navbar');
    expect(nav.kind).toBe('pattern');
    expect(nav.placeholder).toBe(true); // kein Navbar-Template
  });

  it('raw:null (Mock-Importe) → leere Liste', () => {
    expect(emitFigmaComponents({ raw: null })).toEqual([]);
    expect(emitFigmaComponents(undefined)).toEqual([]);
  });

  it('Platzhalter ohne Scan-Varianten bekommt default-Variante', () => {
    const out = emitFigmaComponents({ raw: { tokens: {}, atomics: [{ name: 'Avatar', variants: [] }], components: [], patterns: [] } });
    expect(out[0].variants).toEqual([{ name: 'default', plan: null }]);
  });
});
