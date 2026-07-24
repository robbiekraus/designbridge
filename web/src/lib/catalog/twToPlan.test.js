import { describe, it, expect } from 'vitest';
import { twToPlan } from './twToPlan.js';

// Theme wie aus themeReader(server/fixtures/shadcn-repo/app/globals.css).
const theme = {
  colors: {
    primary: '#18181b', 'primary-foreground': '#fafafa',
    background: '#ffffff', input: '#e4e4e7',
    secondary: '#f4f4f5', 'secondary-foreground': '#18181b',
    destructive: '#ef4444', 'destructive-foreground': '#fafafa',
  },
  vars: { radius: '0.5rem' },
};

// Klassen exakt aus dem shadcn-cva-Button-Fixture (base + variant + size).
const BASE = 'inline-flex items-center justify-center whitespace-nowrap rounded-md text-sm font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 disabled:pointer-events-none disabled:opacity-50';

describe('twToPlan', () => {
  it('default-Variante: bg-primary + rounded-md + px-4 py-2 → korrekter plan', () => {
    const cls = `${BASE} bg-primary text-primary-foreground hover:bg-primary/90 h-10 px-4 py-2`;
    const plan = twToPlan(cls, { theme, label: 'Button' });

    expect(plan.type).toBe('box');
    expect(plan.layout).toBe('row');
    expect(plan.padding).toEqual([8, 16, 8, 16]); // py-2 / px-4
    expect(plan.radius).toBe(6); // rounded-md = --radius(8) - 2
    expect(plan.fill).toEqual({ token: 'primary', hex: '#18181b' });
    expect(plan.stroke).toBeNull();

    expect(plan.children).toHaveLength(1);
    expect(plan.children[0]).toEqual({
      type: 'text', content: 'Button',
      fontSize: 14, fontWeight: 500, // text-sm / font-medium
      color: { token: 'primary-foreground', hex: '#fafafa' },
    });
  });

  it('outline-Variante: border border-input bg-background → Stroke + Fill, hover verworfen', () => {
    const cls = `${BASE} border border-input bg-background hover:bg-accent hover:text-accent-foreground h-10 px-4 py-2`;
    const plan = twToPlan(cls, { theme, label: 'Button' });

    expect(plan.stroke).toEqual({ token: 'input', hex: '#e4e4e7' });
    expect(plan.fill).toEqual({ token: 'background', hex: '#ffffff' });
    // kein text-<slot> im Grundzustand → Default foreground (nicht im Theme → hex null, token bleibt)
    expect(plan.children[0].color).toEqual({ token: 'foreground', hex: null });
  });

  it('secondary-Variante: Fill secondary', () => {
    const cls = `${BASE} bg-secondary text-secondary-foreground hover:bg-secondary/80 h-10 px-4 py-2`;
    const plan = twToPlan(cls, { theme, label: 'Button' });
    expect(plan.fill).toEqual({ token: 'secondary', hex: '#f4f4f5' });
    expect(plan.children[0].color).toEqual({ token: 'secondary-foreground', hex: '#18181b' });
  });

  it('ohne label → nur die box, keine Kinder', () => {
    const plan = twToPlan('bg-primary rounded-lg p-6', { theme });
    expect(plan.children).toEqual([]);
    expect(plan.radius).toBe(8); // rounded-lg = --radius
    expect(plan.padding).toEqual([24, 24, 24, 24]);
  });

  it('bekannte Grenze: size sm nutzt Höhe statt py → vertikales Padding 0', () => {
    // shadcn sm = "h-9 rounded-md px-3" (kein py). h-* wird ignoriert → [0,12,0,12].
    const plan = twToPlan('rounded-md px-3 h-9', { theme });
    expect(plan.padding).toEqual([0, 12, 0, 12]);
  });

  it('unbekannte Klassen werden ignoriert, kein Absturz', () => {
    const plan = twToPlan('some-unknown-class grid gap-2 shadow-lg animate-spin', { theme, label: 'X' });
    expect(plan.type).toBe('box');
    expect(plan.fill).toBeNull();
  });

  it('degradiert ohne Theme (hex null, token bleibt fürs Token-Snapping)', () => {
    const plan = twToPlan('bg-primary', { label: null });
    expect(plan.fill).toEqual({ token: 'primary', hex: null });
  });
});
