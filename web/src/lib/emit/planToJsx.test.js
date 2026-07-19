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

describe('planToJsx — text', () => {
  it('fontSize/weight-Name/color/align/leading', () => {
    const code = planToJsx(text({
      content: 'Hallo', fontSize: 14, fontWeight: 600,
      color: { hex: '#111827', token: null }, align: 'center', lineHeight: 20,
    }), { name: 'X' });
    expect(code).toContain('text-[14px]');
    expect(code).toContain('font-semibold');
    expect(code).toContain('text-[#111827]');
    expect(code).toContain('text-center');
    expect(code).toContain('leading-[20px]');
    expect(code).toContain('>Hallo<');
  });

  it('weight 400 → font-normal, 700 → font-bold, exotisch → font-[N]', () => {
    expect(planToJsx(text({ content: 'a', fontWeight: 400 }), { name: 'X' })).toContain('font-normal');
    expect(planToJsx(text({ content: 'a', fontWeight: 700 }), { name: 'X' })).toContain('font-bold');
    expect(planToJsx(text({ content: 'a', fontWeight: 350 }), { name: 'X' })).toContain('font-[350]');
  });

  it('align left (Default) + lineHeight null erzeugen keine Klasse', () => {
    const code = planToJsx(text({ content: 'a', align: 'left', lineHeight: null }), { name: 'X' });
    expect(code).not.toContain('text-left');
    expect(code).not.toContain('leading-');
  });

  it('JSX-escaped den Textinhalt (< > { } &)', () => {
    const code = planToJsx(text({ content: 'a < b & {x}' }), { name: 'X' });
    expect(code).toContain('&lt;');
    expect(code).toContain('&amp;');
    expect(code).toContain('&#123;');
    expect(code).toContain('&#125;');
    expect(code).not.toMatch(/[^&]#\{x\}/);
  });

  it('stretch → self-stretch, grow → flex-1 (auch auf text)', () => {
    const code = planToJsx(text({ content: 'a', stretch: true, grow: true }), { name: 'X' });
    expect(code).toContain('self-stretch');
    expect(code).toContain('flex-1');
  });
});

describe('planToJsx — Wrapper + Verschachtelung', () => {
  it('voller Wrapper mit className-Passthrough und {...props}', () => {
    const code = planToJsx(box({ layout: 'row', gap: 8 }), { name: 'PremiumBadge' });
    expect(code).toContain('export function PremiumBadge({ className = "", ...props }) {');
    expect(code).toContain('return (');
    expect(code).toMatch(/className=\{`[^`]*\$\{className\}`\}/);
    expect(code).toContain('{...props}');
  });

  it('verschachtelte Kinder werden eingebettet & eingerückt', () => {
    const code = planToJsx(
      box({ layout: 'column', gap: 4, children: [
        text({ content: 'Titel', fontWeight: 700 }),
        box({ layout: 'row', gap: 8, children: [text({ content: 'A' }), text({ content: 'B' })] }),
      ] }),
      { name: 'Card' },
    );
    expect(code).toContain('Titel');
    expect(code).toContain('>A<');
    expect(code).toContain('>B<');
    // Innerer row-Container existiert
    expect(code).toMatch(/<div className="[^"]*flex[^"]*">/);
  });

  it('realistischer Mini-Baustein „Premium Badge"', () => {
    const plan = box({
      layout: 'row', gap: 6, padding: [4, 10, 4, 10], radius: 9999,
      fill: { hex: '#022d2c', token: 'primary' }, primaryAlign: 'CENTER', counterAlign: 'CENTER',
      children: [text({ content: 'Premium', fontSize: 12, fontWeight: 600, color: { hex: '#ffffff', token: null } })],
    });
    const code = planToJsx(plan, { name: 'PremiumBadge' });
    expect(code).toContain('bg-[#022d2c]');
    expect(code).toContain('rounded-[9999px]');
    expect(code).toContain('items-center');
    expect(code).toContain('justify-center');
    expect(code).toContain('gap-[6px]');
    expect(code).toContain('px-[10px]');
    expect(code).toContain('py-[4px]');
    expect(code).toContain('text-[12px]');
    expect(code).toContain('font-semibold');
    expect(code).toContain('text-[#ffffff]');
    expect(code).toContain('>Premium<');
  });
});

describe('planToJsx — svg', () => {
  const svg = (markup) => ({ type: 'svg', markup });

  it('kebab-case-Attribute → camelCase, class → className', () => {
    const code = planToJsx(svg(
      '<svg viewBox="0 0 24 24" class="icon"><path stroke-width="2" stroke-linecap="round" fill-rule="evenodd" d="M1 1"/></svg>',
    ), { name: 'X' });
    expect(code).toContain('strokeWidth="2"');
    expect(code).toContain('strokeLinecap="round"');
    expect(code).toContain('fillRule="evenodd"');
    // svg ist hier plan-ROOT: der Wrapper (Task 1/2) injiziert den className-Passthrough ins
    // Wurzel-Tag genau wie bei einer Wurzel-Box — className="icon" wird dadurch zur Template-
    // Literal-Form (className={`icon ${className}`}), nicht literal stehen gelassen.
    expect(code).toMatch(/className=\{`icon \$\{className\}`\}/);
    expect(code).toContain('viewBox="0 0 24 24"'); // bleibt unverändert
    expect(code).not.toContain('stroke-width');
    expect(code).not.toContain('class="icon"');
  });

  it('style-Attribut wird v1 weggelassen', () => {
    const code = planToJsx(svg('<svg style="color:red"><rect x="0" y="0"/></svg>'), { name: 'X' });
    expect(code).not.toContain('style=');
  });

  it('svg wird als Kind einer Box eingebettet', () => {
    const b = {
      type: 'box', layout: 'row', padding: [0, 0, 0, 0], radius: 0, fill: null, stroke: null,
      strokeWeight: 1, gap: 0, width: null, height: null, primaryAlign: 'MIN', counterAlign: 'MIN',
      children: [svg('<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="6"/></svg>')],
    };
    const code = planToJsx(b, { name: 'IconBox' });
    expect(code).toContain('<svg');
    expect(code).toContain('<circle');
  });
});
