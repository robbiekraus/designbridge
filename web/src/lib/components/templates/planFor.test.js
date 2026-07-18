import { describe, it, expect } from 'vitest';
import { buttonTemplate } from './button.js';
import { badgeTemplate } from './badge.js';
import { inputTemplate } from './input.js';

const refs = {
  primary: { value: '#4263EB', token: 'brand-primary' },
  onPrimary: { value: '#FFFFFF', token: null },
  text: { value: '#212529', token: 'text-body' },
  surface: { value: '#FFFFFF', token: 'surface-card' },
  surfaceMuted: { value: '#F1F3F5', token: null },
  border: { value: '#DEE2E6', token: 'border-default' },
  radius: '8px', fontSize: '15px', fontWeight: '500',
};

const toRef = (r) => ({ token: r.token, hex: r.value });

describe('buttonTemplate.planFor', () => {
  it('primary: gefüllte Box mit onPrimary-Text', () => {
    const plan = buttonTemplate.planFor('primary', refs);
    expect(plan).toEqual({
      type: 'box', layout: 'row', padding: [8, 16, 8, 16], radius: 8,
      fill: toRef(refs.primary), stroke: null,
      children: [{ type: 'text', content: 'Button', fontSize: 15, fontWeight: 500, color: toRef(refs.onPrimary) }],
    });
  });

  it('secondary: Rahmen statt Füllung, Textfarbe text', () => {
    const plan = buttonTemplate.planFor('secondary', refs);
    expect(plan.fill).toBeNull();
    expect(plan.stroke).toEqual(toRef(refs.border));
    expect(plan.children[0].color).toEqual(toRef(refs.text));
  });

  it('ghost: weder Füllung noch Rahmen', () => {
    const plan = buttonTemplate.planFor('ghost', refs);
    expect(plan.fill).toBeNull();
    expect(plan.stroke).toBeNull();
  });

  // Fix 14.07.: emit() kannte den Icon-Fall längst (JSX mit Plus-Icon-SVG),
  // planFor ignorierte ihn — Icon Button kam in Figma als Text-Button an.
  it('Icon-Button (Name enthält "icon"): SVG-Icon statt Text, quadratisches Padding', () => {
    const plan = buttonTemplate.planFor('primary', refs, { name: 'Icon Button' });
    expect(plan.fill).toEqual(toRef(refs.primary));
    expect(plan.padding[0]).toBe(plan.padding[1]); // quadratisch, kein Text-Button-Padding
    expect(plan.children).toHaveLength(1);
    expect(plan.children[0].type).toBe('svg');
    expect(plan.children[0].markup).toContain('<svg');
    expect(plan.children[0].markup).toContain(refs.onPrimary.value); // Icon in onPrimary
  });

  it('Icon-Button ghost: Icon in Primärfarbe', () => {
    const plan = buttonTemplate.planFor('ghost', refs, { name: 'Icon Button' });
    expect(plan.children[0].type).toBe('svg');
    expect(plan.children[0].markup).toContain(refs.primary.value);
  });

  it('normaler Button bleibt Text — auch wenn item übergeben wird', () => {
    const plan = buttonTemplate.planFor('primary', refs, { name: 'Button' });
    expect(plan.children[0].type).toBe('text');
    expect(plan.children[0].content).toBe('Button');
  });

  it('kaputte Zahlwerte fallen auf Defaults zurück', () => {
    const plan = buttonTemplate.planFor('primary', { ...refs, radius: 'auto', fontSize: '', fontWeight: 'bold' });
    expect(plan.radius).toBe(6);
    expect(plan.children[0].fontSize).toBe(14);
    expect(plan.children[0].fontWeight).toBe(500);
  });

  it('unbekannte Variante fällt auf primary zurück', () => {
    const plan = buttonTemplate.planFor('weird', refs);
    expect(plan.fill).toEqual(toRef(refs.primary));
  });
});

describe('badgeTemplate.planFor', () => {
  it('default: Pille mit primary-Füllung, 12px Text', () => {
    const plan = badgeTemplate.planFor('default', refs);
    expect(plan.radius).toBe(9999);
    expect(plan.padding).toEqual([2, 8, 2, 8]);
    expect(plan.fill).toEqual(toRef(refs.primary));
    expect(plan.children[0].fontSize).toBe(12);
  });
  it('secondary: surfaceMuted-Füllung, text-Farbe', () => {
    const plan = badgeTemplate.planFor('secondary', refs);
    expect(plan.fill).toEqual(toRef(refs.surfaceMuted));
    expect(plan.children[0].color).toEqual(toRef(refs.text));
  });
});

describe('inputTemplate.planFor', () => {
  it('default: surface-Füllung, border-Rahmen, Platzhaltertext', () => {
    const plan = inputTemplate.planFor('default', refs);
    expect(plan.fill).toEqual(toRef(refs.surface));
    expect(plan.stroke).toEqual(toRef(refs.border));
    expect(plan.children[0].content).toBe('Wert eingeben…');
  });
  it('disabled: surfaceMuted-Füllung', () => {
    const plan = inputTemplate.planFor('disabled', refs);
    expect(plan.fill).toEqual(toRef(refs.surfaceMuted));
  });
});
