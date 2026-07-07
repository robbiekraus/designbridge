import { describe, it, expect } from 'vitest';
import { buttonTemplate } from './button.js';

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

  it('kaputte Zahlwerte fallen auf Defaults zurück', () => {
    const plan = buttonTemplate.planFor('primary', { ...refs, radius: 'auto', fontSize: '', fontWeight: 'bold' });
    expect(plan.radius).toBe(6);
    expect(plan.children[0].fontSize).toBe(14);
    expect(plan.children[0].fontWeight).toBe(500);
  });
});
