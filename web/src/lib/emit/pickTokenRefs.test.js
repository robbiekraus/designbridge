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

// Fix 13.07.: Slot-Auflösung nahm den erstbesten Namens-Treffer statt der semantisch richtigen
// Rolle — surfaceMuted band an foreground-muted (#495057, eine TEXTfarbe → dunkler „disabled"-Input
// in Figma), fontSize/fontWeight nahmen das ERSTE Font-Token (display-xl 32/700 → Riesen-Labels).
describe('pickTokenRefs — semantische Slot-Wahl (Fix 13.07.)', () => {
  const demoLike = [
    { group: 'color', name: 'brand-primary', value: '#4263EB', source: { role: 'brand-primary' } },
    { group: 'color', name: 'foreground-strong', value: '#1A1B1E', source: { role: 'foreground-strong' } },
    { group: 'color', name: 'foreground-muted', value: '#495057', source: { role: 'foreground-muted' } },
    { group: 'color', name: 'background-app', value: '#F8F9FA', source: { role: 'background-app' } },
    { group: 'color', name: 'border-subtle', value: '#F1F3F5', source: { role: 'border-subtle' } },
    { group: 'font', name: 'font-display-xl', value: { fontSize: '32px', fontWeight: '700' }, source: { role: 'display-xl' } },
    { group: 'font', name: 'font-body-default', value: { fontSize: '14px', fontWeight: '400' }, source: { role: 'body-default' } },
  ];

  it('surfaceMuted greift NIE eine foreground-Rolle (Textfarbe als Fläche)', () => {
    const r = pickTokenRefs(demoLike);
    expect(r.surfaceMuted.value).not.toBe('#495057');
    // kein echtes Flächen-muted vorhanden → heller Fallback
    expect(r.surfaceMuted).toEqual({ value: '#f4f4f5', token: null });
  });

  it('surfaceMuted findet echte muted-FLÄCHEN-Rollen', () => {
    const withSurface = [
      ...demoLike,
      { group: 'color', name: 'surface-muted', value: '#F1F3F5', source: { role: 'surface-muted' } },
    ];
    expect(pickTokenRefs(withSurface).surfaceMuted).toEqual({ value: '#F1F3F5', token: 'surface-muted' });
  });

  it('fontSize/fontWeight nehmen das Body-Font-Token, nicht das erste (Display)', () => {
    const r = pickTokenRefs(demoLike);
    expect(r.fontSize).toBe('14px');
    expect(r.fontWeight).toBe('400');
  });

  it('ohne Body-Rolle: kleinstes Font-Token statt erstes', () => {
    const noBody = demoLike
      .filter((t) => t.group !== 'font')
      .concat([
        { group: 'font', name: 'font-display', value: { fontSize: '32px', fontWeight: '700' }, source: { role: 'display' } },
        { group: 'font', name: 'font-caption', value: { fontSize: '12px', fontWeight: '500' }, source: { role: 'caption' } },
      ]);
    expect(pickTokenRefs(noBody).fontSize).toBe('12px');
  });
});
