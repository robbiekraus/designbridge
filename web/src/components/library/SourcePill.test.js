import { describe, it, expect } from 'vitest';
import { sourceLabel } from './SourcePill.jsx';

describe('sourceLabel', () => {
  it('maps known sources to a label', () => {
    expect(sourceLabel('rules+ai').label).toBe('Regeln + KI');
    expect(sourceLabel('ai').label).toBe('von KI');
    expect(sourceLabel('rules').label).toBe('nur Regeln');
  });
  it('returns null for missing/unknown source', () => {
    expect(sourceLabel(null)).toBeNull();
    expect(sourceLabel('xxx')).toBeNull();
  });
  it('kennt die lifted-Variante', () => {
    expect(sourceLabel('lifted').label).toBe('aus Repo gehoben');
  });
  it('bleibt für unbekannte Werte null', () => {
    expect(sourceLabel('nope')).toBe(null);
  });
  it('kennt die demo-Variante', () => {
    expect(sourceLabel('demo').label).toBe('Demo-Daten');
  });
});
