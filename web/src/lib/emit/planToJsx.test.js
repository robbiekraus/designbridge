import { describe, it, expect } from 'vitest';
import { planToJsx } from './planToJsx.js';

/** Box-Fabrik mit allen Pflichtfeldern des Vertrags — Tests überschreiben nur Relevantes. */
function box(overrides = {}) {
  return {
    type: 'box', layout: 'row', padding: [0, 0, 0, 0], radius: 0, fill: null,
    stroke: null, strokeWeight: 1, gap: 0, width: null, height: null,
    primaryAlign: 'MIN', counterAlign: 'MIN', children: [], ...overrides,
  };
}
function text(overrides = {}) {
  return {
    type: 'text', content: '', fontSize: 16, fontWeight: 400,
    color: { hex: '#000000', token: null }, align: 'left', lineHeight: null, ...overrides,
  };
}

describe('planToJsx — box Layout/Sizing/Spacing/Visual', () => {
  it('flex row mit gap + padding (all-equal-Kollaps p-)', () => {
    const code = planToJsx(box({ layout: 'row', gap: 12, padding: [8, 8, 8, 8] }), { name: 'X' });
    expect(code).toContain('flex');
    expect(code).toContain('gap-[12px]');
    expect(code).toContain('p-[8px]');
    expect(code).not.toContain('px-');
  });

  it('column flex fügt flex-col hinzu', () => {
    const code = planToJsx(box({ layout: 'column', gap: 4 }), { name: 'X' });
    expect(code).toContain('flex flex-col');
  });

  it('padding px/py-Kollaps (t=b, l=r)', () => {
    const code = planToJsx(box({ layout: 'row', padding: [4, 16, 4, 16] }), { name: 'X' });
    expect(code).toContain('px-[16px]');
    expect(code).toContain('py-[4px]');
    expect(code).not.toMatch(/\bp-\[/);
  });

  it('padding einzeln (asymmetrisch), 0-Seiten weggelassen', () => {
    const code = planToJsx(box({ layout: 'row', padding: [4, 0, 8, 0] }), { name: 'X' });
    expect(code).toContain('pt-[4px]');
    expect(code).toContain('pb-[8px]');
    expect(code).not.toContain('pr-');
    expect(code).not.toContain('pl-');
  });

  it('fill/stroke/radius/width/height', () => {
    const code = planToJsx(box({
      fill: { hex: '#022d2c', token: 'primary' }, stroke: { hex: '#e5e7eb', token: null },
      strokeWeight: 2, radius: 8, width: 240, height: 120,
    }), { name: 'X' });
    expect(code).toContain('bg-[#022d2c]');
    expect(code).toContain('border border-[#e5e7eb]');
    expect(code).toContain('border-[2px]');
    expect(code).toContain('rounded-[8px]');
    expect(code).toContain('w-[240px]');
    expect(code).toContain('h-[120px]');
  });

  it('stroke mit Weight 1 erzeugt border ohne border-[1px]', () => {
    const code = planToJsx(box({ stroke: { hex: '#000000', token: null }, strokeWeight: 1 }), { name: 'X' });
    expect(code).toContain('border border-[#000000]');
    expect(code).not.toContain('border-[1px]');
  });

  it('Default-Werte erzeugen keine Klasse (leere Box, layout column ohne Trigger → schlichtes div)', () => {
    const code = planToJsx(box({ layout: 'column' }), { name: 'X' });
    expect(code).not.toContain('gap-');
    expect(code).not.toMatch(/\bp[trblxy]?-\[/);
    expect(code).not.toContain('rounded-');
    expect(code).not.toContain('w-[');
    expect(code).not.toContain('h-[');
    expect(code).not.toContain('bg-');
    expect(code).not.toContain('border');
    expect(code).not.toContain('flex'); // column ohne gap/align/row → kein Flex-Trigger
  });
});
