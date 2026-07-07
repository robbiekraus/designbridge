import { describe, it, expect } from 'vitest';
import { pickTokenRefs } from './pickTokenRefs.js';

const tokens = [
  { group: 'color', name: 'brand-primary', value: '#4263EB', source: { role: 'primary brand' } },
  { group: 'color', name: 'text-body', value: '#212529', source: { role: 'body text' } },
  { group: 'radius', name: 'radius-card', value: '8px', source: {} },
  { group: 'font', name: 'font-body', value: { fontSize: '15px', fontWeight: '400' }, source: {} },
];

describe('pickTokenRefs', () => {
  it('liefert Wert + Token-Name für gefundene Slots', () => {
    const r = pickTokenRefs(tokens);
    expect(r.primary).toEqual({ value: '#4263EB', token: 'brand-primary' });
    expect(r.text).toEqual({ value: '#212529', token: 'text-body' });
  });

  it('Fallback-Slots haben token: null', () => {
    const r = pickTokenRefs(tokens);
    expect(r.onPrimary).toEqual({ value: '#ffffff', token: null });
    expect(r.border.token).toBeNull();
  });

  it('nicht-Farb-Slots wie pickTokens (nackte Werte)', () => {
    const r = pickTokenRefs(tokens);
    expect(r.radius).toBe('8px');
    expect(r.fontSize).toBe('15px');
    expect(r.fontWeight).toBe('400');
  });

  it('leere Liste → komplette Fallbacks', () => {
    const r = pickTokenRefs([]);
    expect(r.primary).toEqual({ value: '#18181b', token: null });
    expect(r.radius).toBe('6px');
  });
});
