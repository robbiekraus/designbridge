import { describe, it, expect } from 'vitest';
import { planToJsx } from './planToJsx.js';

// DS-Grounding, Scheibe 1 Schritt 3 (Spec 2026-07-23 §Q3): Katalog-component-refs rendern als echte
// shadcn-Komponenten inkl. am Dateikopf gesammelter Imports.

const box = (o = {}) => ({ type: 'box', layout: 'row', padding: [0, 0, 0, 0], radius: 0, fill: null, stroke: null, children: [], ...o });
const text = (content) => ({ type: 'text', content, fontSize: 14, fontWeight: 400, color: { hex: '#000000', token: null } });
const catalogRef = (o) => ({ type: 'component-ref', catalog: 'shadcn-default', ...o });

describe('planToJsx — DS-Grounding: Katalog-refs als echte Komponenten', () => {
  it('Katalog-Button → echter Import am Kopf + <Button variant size>Text</Button>', () => {
    const plan = box({ children: [catalogRef({
      name: 'Button', import: { name: 'Button', from: '@/components/ui/button' },
      variant: 'secondary', props: { variant: 'secondary', size: 'sm' },
      fallback: box({ children: [text('Speichern')] }),
    }) ] });
    const code = planToJsx(plan, { name: 'X' });
    expect(code.startsWith('import { Button } from "@/components/ui/button";')).toBe(true);
    expect(code).toContain('<Button variant="secondary" size="sm">Speichern</Button>');
  });

  it('shadcn-Default-Werte werden weggelassen → schlichtes <Button>', () => {
    const plan = box({ children: [catalogRef({
      name: 'Button', import: { name: 'Button', from: '@/components/ui/button' },
      variant: 'default', props: { variant: 'default', size: 'default' },
      fallback: box({ children: [text('OK')] }),
    }) ] });
    const code = planToJsx(plan, { name: 'X' });
    expect(code).toContain('<Button>OK</Button>');
    expect(code).not.toContain('variant="default"');
  });

  it('ohne Text → selbstschließende Komponente', () => {
    const plan = box({ children: [catalogRef({
      name: 'Input', import: { name: 'Input', from: '@/components/ui/input' },
      variant: null, props: {}, fallback: box({}),
    }) ] });
    const code = planToJsx(plan, { name: 'X' });
    expect(code).toContain('<Input />');
    expect(code).toContain('import { Input } from "@/components/ui/input";');
  });

  it('scan-interner Ref (ohne catalog) rendert weiterhin seinen fallback, KEIN Import', () => {
    const plan = box({ children: [{
      type: 'component-ref', name: 'Suche', variant: null,
      fallback: box({ children: [text('scan-fallback')] }),
    }] });
    const code = planToJsx(plan, { name: 'X' });
    expect(code).toContain('scan-fallback');
    expect(code).not.toContain('import {');
  });

  it('mehrere Katalog-Komponenten → sortierte Import-Zeilen', () => {
    const plan = box({ children: [
      catalogRef({ name: 'Button', import: { name: 'Button', from: '@/components/ui/button' }, props: {}, fallback: box({ children: [text('A')] }) }),
      catalogRef({ name: 'Badge', import: { name: 'Badge', from: '@/components/ui/badge' }, props: {}, fallback: box({ children: [text('B')] }) }),
    ] });
    const code = planToJsx(plan, { name: 'X' });
    const lines = code.split('\n');
    expect(lines[0]).toBe('import { Badge } from "@/components/ui/badge";');
    expect(lines[1]).toBe('import { Button } from "@/components/ui/button";');
    expect(lines[2]).toBe('');
  });

  it('gleiches Modul → zusammengefasster Import mit sortierten Namen', () => {
    const plan = box({ layout: 'column', children: [
      catalogRef({ name: 'CardHeader', import: { name: 'CardHeader', from: '@/components/ui/card' }, props: {}, fallback: box({ children: [text('H')] }) }),
      catalogRef({ name: 'Card', import: { name: 'Card', from: '@/components/ui/card' }, props: {}, fallback: box({ children: [text('C')] }) }),
    ] });
    const code = planToJsx(plan, { name: 'X' });
    expect(code.startsWith('import { Card, CardHeader } from "@/components/ui/card";')).toBe(true);
  });

  it('kein Katalog-ref → gar keine Import-Zeilen (unveränderte Ausgabe)', () => {
    const code = planToJsx(box({ children: [text('nur Text')] }), { name: 'X' });
    expect(code.startsWith('export function X(')).toBe(true);
  });
});
