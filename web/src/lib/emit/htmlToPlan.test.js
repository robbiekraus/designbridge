import { describe, it, expect } from 'vitest';
import { htmlToPlan } from './htmlToPlan.js';

describe('htmlToPlan — leer/kaputt (nie werfen)', () => {
  it('leerer String → plan:null, keine Warnungen', () => {
    expect(htmlToPlan('')).toEqual({ plan: null, warnings: [] });
  });

  it('nur Whitespace → plan:null', () => {
    expect(htmlToPlan('   \n  ')).toEqual({ plan: null, warnings: [] });
  });

  it('kein string (null/undefined/Zahl) → plan:null, wirft nicht', () => {
    expect(() => htmlToPlan(null)).not.toThrow();
    expect(htmlToPlan(null)).toEqual({ plan: null, warnings: [] });
    expect(htmlToPlan(undefined)).toEqual({ plan: null, warnings: [] });
    expect(htmlToPlan(42)).toEqual({ plan: null, warnings: [] });
  });

  it('reiner Text ohne jedes Tag → plan:null (nichts Abbildbares auf Root-Ebene)', () => {
    expect(htmlToPlan('irgendein kaputter Fetzen Text')).toEqual({ plan: null, warnings: [] });
  });

  it('unbalancierte/kaputte Tags werfen nie, egal was jsdom daraus macht', () => {
    expect(() => htmlToPlan('<div class="p-4"><span>Unclosed')).not.toThrow();
    const { warnings } = htmlToPlan('<div class="p-4"><span>Unclosed');
    expect(Array.isArray(warnings)).toBe(true);
  });

  it('funktioniert ohne options-Argument (Defaults greifen)', () => {
    expect(() => htmlToPlan('<div class="p-4"></div>')).not.toThrow();
  });
});

describe('htmlToPlan — Root-Form', () => {
  it('einzelnes Root-Element → PlanBox direkt', () => {
    const { plan } = htmlToPlan('<div class="p-4"></div>');
    expect(plan.type).toBe('box');
  });

  it('mehrere Root-Geschwister → in eine Wrapper-Box gepackt, Reihenfolge erhalten', () => {
    const { plan } = htmlToPlan('<div class="p-4">A</div><div class="p-8">B</div>');
    expect(plan.type).toBe('box');
    expect(plan.children).toHaveLength(2);
    expect(plan.children[0].padding).toEqual([16, 16, 16, 16]);
    expect(plan.children[1].padding).toEqual([32, 32, 32, 32]);
  });

  it('rein-textuelles Root-Element wird in eine Box eingepackt (Vertrag: plan ist immer PlanBox)', () => {
    const { plan } = htmlToPlan('<span>Hallo</span>');
    expect(plan.type).toBe('box');
    expect(plan.children).toEqual([
      { type: 'text', content: 'Hallo', fontSize: 16, fontWeight: 400, color: { hex: '#000000', token: null } },
    ]);
  });
});

describe('htmlToPlan — padding (Tailwind-Skala ×4px, Tupel [t,r,b,l])', () => {
  it('p-4 setzt alle vier Seiten', () => {
    const { plan } = htmlToPlan('<div class="p-4"></div>');
    expect(plan.padding).toEqual([16, 16, 16, 16]);
  });

  it('py-1.5 → 6px auf top/bottom, Dezimalwerte funktionieren', () => {
    const { plan } = htmlToPlan('<div class="py-1.5"></div>');
    expect(plan.padding).toEqual([6, 0, 6, 0]);
  });

  it('px-2 → 8px auf left/right', () => {
    const { plan } = htmlToPlan('<div class="px-2"></div>');
    expect(plan.padding).toEqual([0, 8, 0, 8]);
  });

  it('einzelne Seiten pt/pr/pb/pl korrekt auf das Tupel gemappt', () => {
    const { plan } = htmlToPlan('<div class="pt-2 pr-4 pb-6 pl-8"></div>');
    expect(plan.padding).toEqual([8, 16, 24, 32]);
  });
});

describe('htmlToPlan — radius (rounded-*)', () => {
  const cases = [
    ['rounded-none', 0],
    ['rounded-sm', 2],
    ['rounded', 4],
    ['rounded-md', 6],
    ['rounded-lg', 8],
    ['rounded-xl', 12],
    ['rounded-2xl', 16],
    ['rounded-3xl', 24],
    ['rounded-full', 9999],
  ];
  for (const [cls, expected] of cases) {
    it(`${cls} → radius ${expected}`, () => {
      const { plan } = htmlToPlan(`<div class="${cls}"></div>`);
      expect(plan.radius).toBe(expected);
    });
  }

  it('kein rounded-* Klasse → radius 0 (Default)', () => {
    const { plan } = htmlToPlan('<div></div>');
    expect(plan.radius).toBe(0);
  });
});

describe('htmlToPlan — Farben (arbitrary Hex immer, benannt nur white/black)', () => {
  it('bg-[#4263EB] → fill mit rohem Hex, token:null (Token-Bindung folgt in Task 3)', () => {
    const { plan } = htmlToPlan('<div class="bg-[#4263EB]"></div>');
    expect(plan.fill).toEqual({ hex: '#4263EB', token: null });
  });

  it('bg-white / bg-black werden als benannte Farben erkannt', () => {
    expect(htmlToPlan('<div class="bg-white"></div>').plan.fill).toEqual({ hex: '#ffffff', token: null });
    expect(htmlToPlan('<div class="bg-black"></div>').plan.fill).toEqual({ hex: '#000000', token: null });
  });

  it('kein bg-* Klasse → fill:null', () => {
    expect(htmlToPlan('<div></div>').plan.fill).toBeNull();
  });

  it('text-[#111827] → Textfarbe des Text-Kinds', () => {
    const { plan } = htmlToPlan('<p class="text-[#111827]">Hi</p>');
    expect(plan.children[0].color).toEqual({ hex: '#111827', token: null });
  });

  it('andere benannte Tailwind-Farben (nicht white/black) → ignoriert + Warnung, kein fill', () => {
    const { plan, warnings } = htmlToPlan('<div class="bg-gray-100"></div>');
    expect(plan.fill).toBeNull();
    expect(warnings).toContain('Klasse ignoriert: bg-gray-100');
  });
});

describe('htmlToPlan — fontSize / fontWeight', () => {
  const sizeCases = [
    ['text-xs', 12],
    ['text-sm', 14],
    ['text-base', 16],
    ['text-lg', 18],
    ['text-xl', 20],
    ['text-2xl', 24],
    ['text-3xl', 30],
  ];
  for (const [cls, expected] of sizeCases) {
    it(`${cls} → fontSize ${expected}`, () => {
      const { plan } = htmlToPlan(`<p class="${cls}">Hi</p>`);
      expect(plan.children[0].fontSize).toBe(expected);
    });
  }

  const weightCases = [
    ['font-medium', 500],
    ['font-semibold', 600],
    ['font-bold', 700],
  ];
  for (const [cls, expected] of weightCases) {
    it(`${cls} → fontWeight ${expected}`, () => {
      const { plan } = htmlToPlan(`<p class="${cls}">Hi</p>`);
      expect(plan.children[0].fontWeight).toBe(expected);
    });
  }

  it('kein font-* Klasse → fontWeight 400 (Default "sonst")', () => {
    const { plan } = htmlToPlan('<p>Hi</p>');
    expect(plan.children[0].fontWeight).toBe(400);
  });
});

describe('htmlToPlan — Layout (flex/flex-col)', () => {
  it('flex-col → layout column', () => {
    const { plan } = htmlToPlan('<div class="flex flex-col"><span>A</span><span>B</span></div>');
    expect(plan.layout).toBe('column');
  });

  it('flex ohne flex-col → layout row (Default)', () => {
    const { plan } = htmlToPlan('<div class="flex"><span>A</span><span>B</span></div>');
    expect(plan.layout).toBe('row');
  });

  it('gar keine Layout-Klasse → layout row (Default)', () => {
    const { plan } = htmlToPlan('<div><span>A</span></div>');
    expect(plan.layout).toBe('row');
  });
});

describe('htmlToPlan — gap-* (kein itemSpacing-Feld im Plan → weglassen + Warnung)', () => {
  it('gap-4 erzeugt eine eigene Warnung statt eines itemSpacing-Felds', () => {
    const { plan, warnings } = htmlToPlan('<div class="flex gap-4"><span>A</span></div>');
    expect(plan.itemSpacing).toBeUndefined();
    expect(warnings.some((w) => w.includes('gap-*') && w.includes('gap-4'))).toBe(true);
  });
});

describe('htmlToPlan — unbekannte Klassen: gesammelt + dedupliziert, nie fatal', () => {
  it('dieselbe unbekannte Klasse auf mehreren Elementen erscheint nur einmal in warnings', () => {
    const { warnings } = htmlToPlan(
      '<div class="items-center"><span class="items-center">A</span><span class="items-center">B</span></div>'
    );
    const occurrences = warnings.filter((w) => w === 'Klasse ignoriert: items-center');
    expect(occurrences).toHaveLength(1);
  });

  it('mehrere verschiedene unbekannte Klassen landen alle in warnings', () => {
    const { warnings } = htmlToPlan('<div class="w-9 h-9 justify-center"></div>');
    expect(warnings).toContain('Klasse ignoriert: w-9');
    expect(warnings).toContain('Klasse ignoriert: h-9');
    expect(warnings).toContain('Klasse ignoriert: justify-center');
  });
});

describe('htmlToPlan — box/text-Entscheidung (realistische Fixtures)', () => {
  it('Container mit Kind-Elementen wird immer zur Box, auch ohne eigene Box-Klassen', () => {
    const { plan } = htmlToPlan('<div><span>A</span></div>');
    expect(plan.type).toBe('box');
    expect(plan.children).toHaveLength(1);
    expect(plan.children[0]).toEqual({
      type: 'text', content: 'A', fontSize: 16, fontWeight: 400, color: { hex: '#000000', token: null },
    });
  });

  it('reiner Textknoten ohne Box-Trigger-Klassen wird direkt zu PlanText (kein Box-Wrapper als Kind)', () => {
    const { plan } = htmlToPlan('<div><p class="text-xs text-[#6b7280]">Total Sales</p></div>');
    expect(plan.children[0]).toEqual({
      type: 'text', content: 'Total Sales', fontSize: 12, fontWeight: 400, color: { hex: '#6b7280', token: null },
    });
  });

  it('Blatt-Element MIT Box-Trigger-Klassen (bg/rounded) UND eigenem Text wird zur Box mit Text-Kind (Avatar-Fall)', () => {
    // Fixture-nah: server/fixtures/demo-interpretations.json → "Avatar"
    const { plan } = htmlToPlan(
      '<div class="h-9 w-9 rounded-full bg-[#4263EB] text-white flex items-center justify-center text-sm font-medium">RK</div>'
    );
    expect(plan.type).toBe('box');
    expect(plan.radius).toBe(9999);
    expect(plan.fill).toEqual({ hex: '#4263EB', token: null });
    expect(plan.children).toEqual([
      { type: 'text', content: 'RK', fontSize: 14, fontWeight: 500, color: { hex: '#ffffff', token: null } },
    ]);
  });

  it('leeres Blatt-Element mit Box-Trigger-Klassen (Status-Dot) → Box ohne Kinder', () => {
    const { plan } = htmlToPlan('<span class="h-2 w-2 rounded-full bg-[#51CF66]"></span>');
    expect(plan.type).toBe('box');
    expect(plan.radius).toBe(9999);
    expect(plan.fill).toEqual({ hex: '#51CF66', token: null });
    expect(plan.children).toEqual([]);
  });

  it('vollständig leeres Blatt ohne jede Klasse/Text → leere Box (harmlos)', () => {
    const { plan } = htmlToPlan('<div></div>');
    expect(plan).toEqual({
      type: 'box', layout: 'row', padding: [0, 0, 0, 0], radius: 0, fill: null, stroke: null, children: [],
    });
  });

  it('gemischter Inhalt (Element-Kind + direkter Text daneben) verliert den Text nicht', () => {
    const { plan } = htmlToPlan(
      '<span class="flex items-center gap-1.5"><span class="h-2 w-2 rounded-full bg-[#51CF66]"></span>Aktiv</span>'
    );
    expect(plan.type).toBe('box');
    expect(plan.children).toHaveLength(2);
    expect(plan.children[0].type).toBe('box'); // der Dot
    expect(plan.children[1]).toEqual({
      type: 'text', content: 'Aktiv', fontSize: 16, fontWeight: 400, color: { hex: '#000000', token: null },
    });
  });
});

describe('htmlToPlan — Stat-Card-Integration (realistische Fixture, mehrere Regeln gemeinsam)', () => {
  it('verschachtelte Card mit mehreren Text-Kindern', () => {
    const html =
      '<div class="rounded-xl border border-[#e5e7eb] bg-white p-4 w-56">' +
      '<p class="text-xs text-[#6b7280]">Total Sales</p>' +
      '<p class="mt-1 text-2xl font-semibold text-[#111827]">$12,480</p>' +
      '</div>';
    const { plan } = htmlToPlan(html);
    expect(plan.type).toBe('box');
    expect(plan.radius).toBe(12);
    expect(plan.fill).toEqual({ hex: '#ffffff', token: null });
    expect(plan.padding).toEqual([16, 16, 16, 16]);
    expect(plan.children).toHaveLength(2);
    expect(plan.children[0]).toEqual({
      type: 'text', content: 'Total Sales', fontSize: 12, fontWeight: 400, color: { hex: '#6b7280', token: null },
    });
    expect(plan.children[1]).toEqual({
      type: 'text', content: '$12,480', fontSize: 24, fontWeight: 600, color: { hex: '#111827', token: null },
    });
  });
});
