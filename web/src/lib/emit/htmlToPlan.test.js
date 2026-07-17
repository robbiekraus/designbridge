import { describe, it, expect } from 'vitest';
import { htmlToPlan } from './htmlToPlan.js';

// ---------------------------------------------------------------------------
// jsdom-Testgrenze (Spec §jsdom-Testgrenze & Verifikation, verbindlich für diese Datei):
//
// vitest läuft hier unter jsdom, das KEINE Layout-Engine hat. getComputedStyle() löst in
// jsdom `%`-Werte und Flex-Verteilung (flex-basis → tatsächliche Breite, justify-content-
// Verteilung über mehrere Kinder, Prozent-Höhen relativ zum Elternelement) NICHT auf — das
// braucht einen echten Renderer. Was jsdom SEHR WOHL korrekt durchreicht: explizite Inline-
// Styles mit absoluten Einheiten (px), Farben (auch als Hex → rgb() normalisiert), einfache
// Kaskaden-Eigenschaften (padding, border, border-top-left-radius, gap/column-gap/row-gap,
// font-*, text-align, line-height mit px-Wert, justify-content/align-items als Strings).
// Empirisch geprüft (node -e mit jsdom, Stand dieser Umsetzung):
//   - `border-radius` KURZFORM wird von jsdoms CSSOM NICHT unterstützt (bleibt 0) —
//     Fixtures nutzen deshalb die Langform `border-top-left-radius`.
//   - `border: Npx solid #hex` KURZFORM funktioniert.
//   - explizite `style="width:...;height:..."` werden von getComputedStyle korrekt als px
//     zurückgegeben (kein Layout nötig für einen bereits literalen px-Wert).
//   - `flex-basis` wird zwar als gesetzter Wert erkannt, aber die daraus resultierende
//     `width`/`height` bleibt in jsdom `auto` (echte Flex-Verteilung fehlt) — dieser Zweig
//     der width/height-Heuristik ist NUR im echten Browser verifizierbar (Spec §Risiken).
//
// Diese Datei prüft deshalb die MECHANIK (liest Inline-/kaskadierte Stile, rgb→hex,
// Token-Rückbindung, Enum-Mapping, Knoten-Erzeugung, Container-Cleanup, Nie-Werfen) —
// NICHT die tatsächliche Wiedergabetreue von %/Flex-Layouts. Die wird manuell im laufenden
// Browser gegen html.to.design verifiziert (Spec §Umsetzungsschritte Punkt 4).
// ---------------------------------------------------------------------------

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

  it('unbalancierte/kaputte Tags werfen nie, egal was der Live-DOM-Parser daraus macht', () => {
    expect(() => htmlToPlan('<div style="padding:16px"><span>Unclosed')).not.toThrow();
    const { warnings } = htmlToPlan('<div style="padding:16px"><span>Unclosed');
    expect(Array.isArray(warnings)).toBe(true);
  });

  it('funktioniert ohne options-Argument (Defaults greifen)', () => {
    expect(() => htmlToPlan('<div style="padding:16px"></div>')).not.toThrow();
  });
});

describe('htmlToPlan — Root-Form', () => {
  it('einzelnes Root-Element → PlanBox direkt', () => {
    const { plan } = htmlToPlan('<div style="padding:16px"></div>');
    expect(plan.type).toBe('box');
  });

  it('mehrere Root-Geschwister → in eine Wrapper-Box gepackt, Reihenfolge erhalten', () => {
    const { plan } = htmlToPlan('<div style="padding:16px">A</div><div style="padding:32px">B</div>');
    expect(plan.type).toBe('box');
    expect(plan.children).toHaveLength(2);
    expect(plan.children[0].padding).toEqual([16, 16, 16, 16]);
    expect(plan.children[1].padding).toEqual([32, 32, 32, 32]);
  });

  it('rein-textuelles Root-Element wird in eine Box eingepackt (Vertrag: plan ist immer PlanBox)', () => {
    const { plan } = htmlToPlan('<span>Hallo</span>');
    expect(plan.type).toBe('box');
    expect(plan.children).toEqual([
      {
        type: 'text',
        content: 'Hallo',
        fontSize: 16,
        fontWeight: 400,
        color: { hex: '#000000', token: null },
        align: 'left',
        lineHeight: null,
      },
    ]);
  });
});

describe('htmlToPlan — padding (computed, direkt in px, kein Klassen-Faktor mehr)', () => {
  it('padding:16px setzt alle vier Seiten', () => {
    const { plan } = htmlToPlan('<div style="padding:16px"></div>');
    expect(plan.padding).toEqual([16, 16, 16, 16]);
  });

  it('padding:6px 0 → 6px auf top/bottom, 0 auf left/right', () => {
    const { plan } = htmlToPlan('<div style="padding:6px 0"></div>');
    expect(plan.padding).toEqual([6, 0, 6, 0]);
  });

  it('padding-left/-right → nur left/right gesetzt', () => {
    const { plan } = htmlToPlan('<div style="padding-left:8px;padding-right:8px"></div>');
    expect(plan.padding).toEqual([0, 8, 0, 8]);
  });

  it('einzelne Longhands korrekt auf das Tupel [top,right,bottom,left] gemappt', () => {
    const { plan } = htmlToPlan(
      '<div style="padding-top:8px;padding-right:16px;padding-bottom:24px;padding-left:32px"></div>'
    );
    expect(plan.padding).toEqual([8, 16, 24, 32]);
  });

  it('kein padding-Style → [0,0,0,0] (Default)', () => {
    const { plan } = htmlToPlan('<div></div>');
    expect(plan.padding).toEqual([0, 0, 0, 0]);
  });
});

describe('htmlToPlan — radius (border-top-left-radius, computed)', () => {
  // border-radius KURZFORM wird von jsdoms CSSOM nicht unterstützt (empirisch geprüft) —
  // Fixtures nutzen deshalb die Langform. Im echten Browser funktioniert die Kurzform genauso.
  const cases = [
    ['border-top-left-radius:0px', 0],
    ['border-top-left-radius:2px', 2],
    ['border-top-left-radius:6px', 6],
    ['border-top-left-radius:8px', 8],
    ['border-top-left-radius:12px', 12],
    ['border-top-left-radius:16px', 16],
    ['border-top-left-radius:24px', 24],
  ];
  for (const [style, expected] of cases) {
    it(`${style} → radius ${expected}`, () => {
      const { plan } = htmlToPlan(`<div style="${style}"></div>`);
      expect(plan.radius).toBe(expected);
    });
  }

  it('kein border-radius-Style → radius 0 (Default)', () => {
    const { plan } = htmlToPlan('<div></div>');
    expect(plan.radius).toBe(0);
  });

  it('border-top-left-radius:9999px → radius exakt 9999 ("full"-Fall)', () => {
    const { plan } = htmlToPlan('<div style="border-top-left-radius:9999px"></div>');
    expect(plan.radius).toBe(9999);
  });

  it('sehr große Radien werden auf 9999 gekappt', () => {
    const { plan } = htmlToPlan('<div style="border-top-left-radius:50000px"></div>');
    expect(plan.radius).toBe(9999);
  });
});

describe('htmlToPlan — Farben (background-color/color, rgb()→hex, Spec §Mapping)', () => {
  it('background-color als Hex → fill mit normalisiertem (lowercase) Hex, token:null ohne tokens-Option', () => {
    const { plan } = htmlToPlan('<div style="background-color:#4263EB"></div>');
    expect(plan.fill).toEqual({ hex: '#4263eb', token: null });
  });

  it('background-color als rgb()-Literal → identisch zu Hex-Eingabe normalisiert', () => {
    const { plan } = htmlToPlan('<div style="background-color:rgb(66, 99, 235)"></div>');
    expect(plan.fill).toEqual({ hex: '#4263eb', token: null });
  });

  it('background-color:transparent → fill:null', () => {
    const { plan } = htmlToPlan('<div style="background-color:transparent"></div>');
    expect(plan.fill).toBeNull();
  });

  it('kein background-color-Style → fill:null (Default-Hintergrund ist transparent)', () => {
    expect(htmlToPlan('<div></div>').plan.fill).toBeNull();
  });

  it('color auf einem Text-Blatt → PlanText.color', () => {
    const { plan } = htmlToPlan('<p style="color:#111827">Hi</p>');
    expect(plan.children[0].color).toEqual({ hex: '#111827', token: null });
  });

  it('kein color-Style auf Text → Default-Schwarz (#000000)', () => {
    const { plan } = htmlToPlan('<p>Hi</p>');
    expect(plan.children[0].color).toEqual({ hex: '#000000', token: null });
  });
});

describe('htmlToPlan — fontSize / fontWeight (computed)', () => {
  const sizeCases = [
    ['font-size:12px', 12],
    ['font-size:14px', 14],
    ['font-size:16px', 16],
    ['font-size:18px', 18],
    ['font-size:20px', 20],
    ['font-size:24px', 24],
    ['font-size:30px', 30],
  ];
  for (const [style, expected] of sizeCases) {
    it(`${style} → fontSize ${expected}`, () => {
      const { plan } = htmlToPlan(`<p style="${style}">Hi</p>`);
      expect(plan.children[0].fontSize).toBe(expected);
    });
  }

  it('kein font-size-Style → fontSize 16 (jsdom-Default ist das Keyword "medium", kein px-Wert)', () => {
    const { plan } = htmlToPlan('<p>Hi</p>');
    expect(plan.children[0].fontSize).toBe(16);
  });

  const weightCases = [
    ['font-weight:500', 500],
    ['font-weight:600', 600],
    ['font-weight:700', 700],
    ['font-weight:bold', 700],
  ];
  for (const [style, expected] of weightCases) {
    it(`${style} → fontWeight ${expected}`, () => {
      const { plan } = htmlToPlan(`<p style="${style}">Hi</p>`);
      expect(plan.children[0].fontWeight).toBe(expected);
    });
  }

  it('kein font-weight-Style → fontWeight 400 (Default "normal")', () => {
    const { plan } = htmlToPlan('<p>Hi</p>');
    expect(plan.children[0].fontWeight).toBe(400);
  });
});

describe('htmlToPlan — text-align → PlanText.align (Spec §Vertrags-Erweiterung)', () => {
  it('text-align:center → align "center"', () => {
    const { plan } = htmlToPlan('<p style="text-align:center">Hi</p>');
    expect(plan.children[0].align).toBe('center');
  });

  it('text-align:right → align "right"', () => {
    const { plan } = htmlToPlan('<p style="text-align:right">Hi</p>');
    expect(plan.children[0].align).toBe('right');
  });

  it('kein text-align-Style → align "left" (Default)', () => {
    const { plan } = htmlToPlan('<p>Hi</p>');
    expect(plan.children[0].align).toBe('left');
  });
});

describe('htmlToPlan — line-height → PlanText.lineHeight (Spec §Vertrags-Erweiterung)', () => {
  it('line-height:24px → lineHeight 24', () => {
    const { plan } = htmlToPlan('<p style="line-height:24px">Hi</p>');
    expect(plan.children[0].lineHeight).toBe(24);
  });

  it('kein line-height-Style → lineHeight null ("normal" → null)', () => {
    const { plan } = htmlToPlan('<p>Hi</p>');
    expect(plan.children[0].lineHeight).toBeNull();
  });
});

describe('htmlToPlan — Layout (display:flex + flex-direction, computed)', () => {
  it('display:flex;flex-direction:column → layout column', () => {
    const { plan } = htmlToPlan('<div style="display:flex;flex-direction:column"><span>A</span><span>B</span></div>');
    expect(plan.layout).toBe('column');
  });

  it('display:flex ohne flex-direction → layout row (echtes Flex-row bleibt row, Spec Fix 6)', () => {
    const { plan } = htmlToPlan('<div style="display:flex"><span>A</span><span>B</span></div>');
    expect(plan.layout).toBe('row');
  });

  // Fix 6 (Testrunde 6, docs/superpowers/specs/2026-07-17-testrunde6-fixes-design.md):
  // ein normaler Block-Container (display:block, der Default) stapelt seine Kind-ELEMENTE im
  // Browser vertikal — der Plan muss das als 'column' abbilden, nicht als 'row'. Vor diesem Fix
  // stand hier `expect(plan.layout).toBe('row')` und schrieb genau den Bug fest (Figma-Plugin baut
  // daraus HORIZONTAL-Auto-Layout → Clipping, siehe Fix 6 „Befund"). Test umgezogen auf 'column'.
  it('Block-Container (kein flex/grid) MIT Element-Kindern → layout column (Block-Flow stapelt vertikal)', () => {
    const { plan } = htmlToPlan('<div><span>A</span></div>');
    expect(plan.layout).toBe('column');
  });

  // Echtes Regressionsmuster aus dem Befund: Wrapper-div (block) mit Header-div + Body-div,
  // wie es die KI-Interpretation eines Charts erzeugt (Titelzeile über Chart-Body).
  it('Wrapper-div (block) mit Header-div + Body-div → layout column (echtes Bug-Muster aus Fix 6)', () => {
    const { plan } = htmlToPlan('<div><div style="padding:4px">A</div><div>B</div></div>');
    expect(plan.layout).toBe('column');
  });

  it('Block-Container OHNE Element-Kinder (nur Text) → layout bleibt row (Blatt, unkritisch laut Spec)', () => {
    const { plan } = htmlToPlan('<div style="padding:8px">Hallo</div>');
    expect(plan.layout).toBe('row');
  });

  it('gar kein display-Style, keine Kind-Elemente (leere Box) → layout row (Default, unveraendert)', () => {
    const { plan } = htmlToPlan('<div></div>');
    expect(plan.layout).toBe('row');
  });
});

describe('htmlToPlan — Tabellen (CSS-Table-Displays, Fix E, Testrunde 7)', () => {
  // Befund (Figma-Datei `test1707 -3`, Reports Table H=2199px): Fix 6 macht JEDEN Nicht-Flex-
  // Container mit Element-Kindern zur Spalte — auch <tr>. Echte Tabellen kamen dadurch als ein
  // vertikaler Turm aus Zellen an. jsdom liefert die CSS-table-*-Displays nativ als UA-Default
  // über getComputedStyle (empirisch geprüft, kein Raten): table→"table", thead→
  // "table-header-group", tbody→"table-row-group", tr→"table-row", th/td→"table-cell".
  const tableHtml =
    '<table><thead><tr><th>Plant</th><th>Process</th></tr></thead>' +
    '<tbody><tr><td>Bangalore</td><td>Printing</td></tr></tbody></table>';

  it('<table> (display:table) → layout column (Zeilen stapeln vertikal)', () => {
    const { plan } = htmlToPlan(tableHtml);
    expect(plan.layout).toBe('column');
  });

  it('<thead> (table-header-group) → layout column', () => {
    const { plan } = htmlToPlan(tableHtml);
    const thead = plan.children[0];
    expect(thead.layout).toBe('column');
  });

  it('<tbody> (table-row-group) → layout column', () => {
    const { plan } = htmlToPlan(tableHtml);
    const tbody = plan.children[1];
    expect(tbody.layout).toBe('column');
  });

  it('<tr> (table-row) → layout row mit th/td-Kindern (nicht mehr fälschlich column)', () => {
    const { plan } = htmlToPlan(tableHtml);
    const headerRow = plan.children[0].children[0];
    expect(headerRow.layout).toBe('row');
    expect(headerRow.children).toHaveLength(2);

    // th/td (table-cell, kein eigenes Element-Kind) fallen auf den Block-Default durch:
    // hasElementChildren ist false → die Zelle selbst bekommt layout 'row'. jsdoms UA-Stylesheet
    // gibt th/td zusätzlich 1px Padding (td auch fontWeight normal, th zusätzlich bold), wodurch
    // die Zelle über hasBoxTrigger zur Box statt zu reinem Text wird — der Zelltext lebt dann als
    // Text-Kind darin. Kern der Aussage: die ZEILE ist 'row', nicht mehr fälschlich 'column' wie
    // vor Fix E (dort hätte der Block-Default die ganze Zeile wegen ihrer Element-Kinder in
    // 'column' geplant).
    expect(headerRow.children[0].layout).toBe('row');
    expect(headerRow.children[0].children[0]).toMatchObject({ type: 'text', content: 'Plant' });
    expect(headerRow.children[1].children[0]).toMatchObject({ type: 'text', content: 'Process' });

    const bodyRow = plan.children[1].children[0];
    expect(bodyRow.layout).toBe('row');
    expect(bodyRow.children).toHaveLength(2);
    expect(bodyRow.children[0].layout).toBe('row');
    expect(bodyRow.children[0].children[0]).toMatchObject({ type: 'text', content: 'Bangalore' });
    expect(bodyRow.children[1].children[0]).toMatchObject({ type: 'text', content: 'Printing' });
  });

  it('table-cell OHNE jeden Box-Trigger-Stil (Padding explizit auf 0 zurückgesetzt) bleibt reines Text-Blatt', () => {
    // Isoliert den table-cell-Zweig von jsdoms UA-Default-Padding (s. Test oben): mit
    // padding:0 verschwindet der einzige Box-Trigger, und die Zelle fällt bis zum Text-Blatt durch —
    // belegt, dass table-cell tatsächlich dem BESTEHENDEN Block-Default folgt (kein Sonderfall
    // durch Fix E), nicht dass es grundsätzlich immer zur Box wird.
    const html = '<table><tbody><tr><td style="padding:0">Bangalore</td></tr></tbody></table>';
    const { plan } = htmlToPlan(html);
    const cell = plan.children[0].children[0].children[0]; // table(column) -> tbody(column) -> tr(row) -> td
    expect(cell.type).toBe('text');
    expect(cell.content).toBe('Bangalore');
  });

  it('table-cell MIT Element-Kindern folgt weiterhin dem Block-Default (column), unverändert durch Fix E', () => {
    const html = '<table><tbody><tr><td><span>A</span><span>B</span></td></tr></tbody></table>';
    const { plan } = htmlToPlan(html);
    const cellBox = plan.children[0].children[0].children[0]; // tbody(column) -> tr(row) -> td-Box
    expect(cellBox.type).toBe('box');
    expect(cellBox.layout).toBe('column');
  });
});

describe('htmlToPlan — primaryAlign / counterAlign (justify-content/align-items, Spec §Vertrags-Erweiterung)', () => {
  it('justify-content:center → primaryAlign CENTER', () => {
    const { plan } = htmlToPlan('<div style="display:flex;justify-content:center"></div>');
    expect(plan.primaryAlign).toBe('CENTER');
  });

  it('justify-content:flex-end → primaryAlign MAX', () => {
    const { plan } = htmlToPlan('<div style="display:flex;justify-content:flex-end"></div>');
    expect(plan.primaryAlign).toBe('MAX');
  });

  it('justify-content:space-between → primaryAlign SPACE_BETWEEN', () => {
    const { plan } = htmlToPlan('<div style="display:flex;justify-content:space-between"></div>');
    expect(plan.primaryAlign).toBe('SPACE_BETWEEN');
  });

  it('align-items:flex-end → counterAlign MAX', () => {
    const { plan } = htmlToPlan('<div style="display:flex;align-items:flex-end"></div>');
    expect(plan.counterAlign).toBe('MAX');
  });

  it('align-items:center → counterAlign CENTER', () => {
    const { plan } = htmlToPlan('<div style="display:flex;align-items:center"></div>');
    expect(plan.counterAlign).toBe('CENTER');
  });

  it('display:flex ohne justify-content/align-items → primaryAlign MIN, counterAlign CENTER (Defaults)', () => {
    const { plan } = htmlToPlan('<div style="display:flex"></div>');
    expect(plan.primaryAlign).toBe('MIN');
    expect(plan.counterAlign).toBe('CENTER');
  });

  it('kein flex/grid-Display → primaryAlign MIN, counterAlign CENTER (Defaults, unabhängig vom Rest)', () => {
    const { plan } = htmlToPlan('<div style="padding:8px"></div>');
    expect(plan.primaryAlign).toBe('MIN');
    expect(plan.counterAlign).toBe('CENTER');
  });
});

describe('htmlToPlan — gap (jetzt abgebildet statt nur gewarnt, Spec §Vertrags-Erweiterung)', () => {
  it('column-gap:16px auf einer row-Box → gap 16', () => {
    const { plan } = htmlToPlan('<div style="display:flex;column-gap:16px"><span>A</span></div>');
    expect(plan.gap).toBe(16);
  });

  it('row-gap:24px auf einer column-Box → gap 24 (Primärachse bestimmt, welcher Shorthand-Teil zählt)', () => {
    const { plan } = htmlToPlan(
      '<div style="display:flex;flex-direction:column;row-gap:24px;column-gap:4px"><span>A</span></div>'
    );
    expect(plan.gap).toBe(24);
  });

  it('kein gap-Style → gap 0 (Default)', () => {
    const { plan } = htmlToPlan('<div style="display:flex"></div>');
    expect(plan.gap).toBe(0);
  });

  // Fix 6, Punkt 2: seit Block-Container jetzt layout:'column' bekommen (statt 'row'), muss
  // readGap() für den row-gap-Zweig (layout==='column') robust bleiben, obwohl ein normaler
  // Block-Fluss (kein flex/grid) gar kein "gap" im CSS-Sinn kennt — computed.rowGap ist dort
  // das Keyword "normal", NICHT parsbar. pxOr0 faengt das ab (Number.isFinite-Check), landet
  // also bei 0, niemals NaN.
  it('Block-Container (layout column, kein flex) ohne echtes CSS-gap → gap 0, niemals NaN', () => {
    const { plan } = htmlToPlan('<div><div>A</div><div>B</div></div>');
    expect(plan.layout).toBe('column');
    expect(plan.gap).toBe(0);
    expect(Number.isNaN(plan.gap)).toBe(false);
  });
});

describe('htmlToPlan — border-* → stroke + strokeWeight (Spec §Mapping)', () => {
  it('sichtbarer Rahmen (Breite>0, Farbe nicht transparent) → stroke gesetzt, strokeWeight aus Breite', () => {
    const { plan } = htmlToPlan('<div style="border:2px solid #e5e7eb"></div>');
    expect(plan.stroke).toEqual({ hex: '#e5e7eb', token: null });
    expect(plan.strokeWeight).toBe(2);
  });

  it('kein border-Style → stroke:null, strokeWeight bleibt Default 1 (unwirksam ohne stroke)', () => {
    const { plan } = htmlToPlan('<div></div>');
    expect(plan.stroke).toBeNull();
    expect(plan.strokeWeight).toBe(1);
  });

  it('border-width:0 → stroke:null (kein sichtbarer Rahmen)', () => {
    const { plan } = htmlToPlan('<div style="border:0px solid #000000"></div>');
    expect(plan.stroke).toBeNull();
  });

  it('border mit transparenter Farbe → stroke:null, obwohl width>0', () => {
    const { plan } = htmlToPlan('<div style="border:2px solid transparent"></div>');
    expect(plan.stroke).toBeNull();
  });
});

describe('htmlToPlan — width/height (Spec §Mapping: NUR explizit gesetzte Größe, sonst null=HUG)', () => {
  it('explizites style="width:...;height:..." → width/height in px', () => {
    const { plan } = htmlToPlan('<div style="width:120px;height:40px"></div>');
    expect(plan.width).toBe(120);
    expect(plan.height).toBe(40);
  });

  it('kein width/height-Style → beide null (HUG, Default)', () => {
    const { plan } = htmlToPlan('<div style="padding:8px"></div>');
    expect(plan.width).toBeNull();
    expect(plan.height).toBeNull();
  });

  it('nur width gesetzt → height bleibt null', () => {
    const { plan } = htmlToPlan('<div style="width:200px"></div>');
    expect(plan.width).toBe(200);
    expect(plan.height).toBeNull();
  });

  // Der flex-basis-Zweig der Heuristik (Spec §Mapping: "…oder Flex-Basis") lässt sich in jsdom
  // NICHT sinnvoll testen: flex-basis wird als gesetzter Wert erkannt, aber die daraus
  // resultierende width/height bleibt in jsdom "auto" (keine echte Flex-Verteilung, s. Kopf-
  // kommentar dieser Datei) — der Code degradiert dort bewusst zu null statt zu raten. Wird
  // im echten Browser verifiziert (Spec §Umsetzungsschritte Punkt 4), nicht hier.
});

describe('htmlToPlan — box/text-Entscheidung (realistische Fixtures, jetzt aus computed style statt Klassen)', () => {
  it('Container mit Kind-Elementen wird immer zur Box, auch ohne eigene Box-Stile', () => {
    const { plan } = htmlToPlan('<div><span>A</span></div>');
    expect(plan.type).toBe('box');
    expect(plan.children).toHaveLength(1);
    expect(plan.children[0]).toEqual({
      type: 'text',
      content: 'A',
      fontSize: 16,
      fontWeight: 400,
      color: { hex: '#000000', token: null },
      align: 'left',
      lineHeight: null,
    });
  });

  it('reiner Textknoten ohne Box-Trigger-Stile wird direkt zu PlanText (kein Box-Wrapper als Kind)', () => {
    const { plan } = htmlToPlan('<div><p style="font-size:12px;color:#6b7280">Total Sales</p></div>');
    expect(plan.children[0]).toEqual({
      type: 'text',
      content: 'Total Sales',
      fontSize: 12,
      fontWeight: 400,
      color: { hex: '#6b7280', token: null },
      align: 'left',
      lineHeight: null,
    });
  });

  it('Blatt-Element MIT Box-Trigger-Stilen (bg/radius) UND eigenem Text wird zur Box mit Text-Kind (Avatar-Fall)', () => {
    const html =
      '<div style="height:36px;width:36px;border-top-left-radius:9999px;background-color:#4263eb;' +
      'color:#ffffff;display:flex;align-items:center;justify-content:center;font-size:14px;font-weight:500">RK</div>';
    const { plan } = htmlToPlan(html);
    expect(plan.type).toBe('box');
    expect(plan.radius).toBe(9999);
    expect(plan.fill).toEqual({ hex: '#4263eb', token: null });
    expect(plan.width).toBe(36);
    expect(plan.height).toBe(36);
    expect(plan.children).toEqual([
      {
        type: 'text',
        content: 'RK',
        fontSize: 14,
        fontWeight: 500,
        color: { hex: '#ffffff', token: null },
        align: 'left',
        lineHeight: null,
      },
    ]);
  });

  it('leeres Blatt-Element mit Box-Trigger-Stilen (Status-Dot) → Box ohne Kinder', () => {
    const { plan } = htmlToPlan(
      '<span style="height:8px;width:8px;border-top-left-radius:9999px;background-color:#51cf66"></span>'
    );
    expect(plan.type).toBe('box');
    expect(plan.radius).toBe(9999);
    expect(plan.fill).toEqual({ hex: '#51cf66', token: null });
    expect(plan.children).toEqual([]);
  });

  it('vollständig leeres Blatt ohne jeden Stil/Text → leere Box mit alle-Defaults (harmlos)', () => {
    const { plan } = htmlToPlan('<div></div>');
    expect(plan).toEqual({
      type: 'box',
      layout: 'row',
      padding: [0, 0, 0, 0],
      radius: 0,
      fill: null,
      stroke: null,
      strokeWeight: 1,
      gap: 0,
      width: null,
      height: null,
      primaryAlign: 'MIN',
      counterAlign: 'CENTER',
      children: [],
    });
  });

  it('gemischter Inhalt (Element-Kind + direkter Text daneben) verliert den Text nicht', () => {
    const { plan } = htmlToPlan(
      '<span style="display:flex;align-items:center;column-gap:6px">' +
        '<span style="height:8px;width:8px;border-top-left-radius:9999px;background-color:#51cf66"></span>Aktiv</span>'
    );
    expect(plan.type).toBe('box');
    expect(plan.children).toHaveLength(2);
    expect(plan.children[0].type).toBe('box'); // der Dot
    expect(plan.children[1]).toEqual({
      type: 'text',
      content: 'Aktiv',
      fontSize: 16,
      fontWeight: 400,
      color: { hex: '#000000', token: null },
      align: 'left',
      lineHeight: null,
    });
  });
});

describe('htmlToPlan — Stat-Card-Integration (realistische Fixture, mehrere Regeln gemeinsam)', () => {
  it('verschachtelte Card mit mehreren Text-Kindern', () => {
    const html =
      '<div style="border-top-left-radius:12px;border:1px solid #e5e7eb;background-color:#ffffff;padding:16px;width:224px">' +
      '<p style="font-size:12px;color:#6b7280">Total Sales</p>' +
      '<p style="margin-top:4px;font-size:24px;font-weight:600;color:#111827">$12,480</p>' +
      '</div>';
    const { plan } = htmlToPlan(html);
    expect(plan.type).toBe('box');
    expect(plan.radius).toBe(12);
    expect(plan.fill).toEqual({ hex: '#ffffff', token: null });
    expect(plan.stroke).toEqual({ hex: '#e5e7eb', token: null });
    expect(plan.padding).toEqual([16, 16, 16, 16]);
    expect(plan.width).toBe(224);
    expect(plan.children).toHaveLength(2);
    expect(plan.children[0]).toEqual({
      type: 'text',
      content: 'Total Sales',
      fontSize: 12,
      fontWeight: 400,
      color: { hex: '#6b7280', token: null },
      align: 'left',
      lineHeight: null,
    });
    expect(plan.children[1]).toEqual({
      type: 'text',
      content: '$12,480',
      fontSize: 24,
      fontWeight: 600,
      color: { hex: '#111827', token: null },
      align: 'left',
      lineHeight: null,
    });
  });
});

describe('htmlToPlan — SVG-Extraktion (unverändert: Vektor-Passthrough, kein Stil-Lesen im SVG-Subtree)', () => {
  it('svg als Root-Element → PlanSvg-Node (in Wrapper-Box, wie jedes nicht-box Root)', () => {
    const { plan } = htmlToPlan('<svg viewBox="0 0 10 10"><circle cx="5" cy="5" r="4"></circle></svg>');
    expect(plan.type).toBe('box');
    expect(plan.children).toHaveLength(1);
    const svgNode = plan.children[0];
    expect(svgNode.type).toBe('svg');
    expect(svgNode.markup.startsWith('<svg')).toBe(true);
    expect(svgNode.markup).toContain('<circle');
  });

  it('svg verschachtelt in einer Box → svg-Kind, kein box/text-Abstieg in den svg-Inhalt', () => {
    const { plan } = htmlToPlan(
      '<div style="border-top-left-radius:8px;background-color:#ffffff;padding:16px"><svg viewBox="0 0 42 42"><circle cx="21" cy="21" r="15.9" stroke="#4263EB"></circle></svg></div>'
    );
    expect(plan.type).toBe('box');
    expect(plan.children).toHaveLength(1);
    expect(plan.children[0].type).toBe('svg');
    expect(plan.children[0].markup).toContain('stroke="#4263EB"');
  });

  it('<foreignObject> wird vor dem Senden entfernt (kann beliebiges HTML/CSS enthalten)', () => {
    const html =
      '<svg viewBox="0 0 100 100">' +
      '<foreignObject width="100" height="100"><div>Hallo Fremdkoerper</div></foreignObject>' +
      '<rect width="10" height="10"></rect>' +
      '</svg>';
    const { plan } = htmlToPlan(html);
    const svgNode = plan.children[0];
    expect(svgNode.markup).not.toContain('foreignObject');
    expect(svgNode.markup).not.toContain('Hallo Fremdkoerper');
    expect(svgNode.markup).toContain('<rect');
  });

  it('Markup > 20000 Zeichen wird gekappt + Warnung, wirft nicht', () => {
    const bigPath = 'M0 0 '.repeat(5000); // 25000 Zeichen, garantiert > 20000 im finalen Markup
    const html = `<svg viewBox="0 0 10 10"><path d="${bigPath}"></path></svg>`;
    const { plan, warnings } = htmlToPlan(html);
    const svgNode = plan.children[0];
    expect(svgNode.type).toBe('svg');
    expect(svgNode.markup.length).toBe(20000);
    expect(warnings.some((w) => w.includes('gekappt'))).toBe(true);
  });
});

describe('htmlToPlan — SVG externe Ressourcen-Härtung (Review-Fix v1 + v2: kein SSRF/Remote-Leak, jetzt auch beim Offscreen-Mount)', () => {
  it('<image> mit externer http(s)-Quelle wird komplett entfernt + Warnung', () => {
    const html =
      '<svg viewBox="0 0 10 10">' +
      '<image href="https://evil.example/x.png" width="10" height="10"></image>' +
      '<rect width="5" height="5"></rect>' +
      '</svg>';
    const { plan, warnings } = htmlToPlan(html);
    const markup = plan.children[0].markup;
    expect(markup).not.toContain('evil.example');
    expect(markup).not.toContain('<image');
    expect(markup).toContain('<rect');
    expect(warnings.some((w) => w.toLowerCase().includes('extern'))).toBe(true);
  });

  it('<image> mit protokoll-relativer (//) Quelle wird entfernt + Warnung', () => {
    const html = '<svg viewBox="0 0 10 10"><image href="//evil.example/x.png"></image></svg>';
    const { plan, warnings } = htmlToPlan(html);
    expect(plan.children[0].markup).not.toContain('evil.example');
    expect(warnings.some((w) => w.toLowerCase().includes('extern'))).toBe(true);
  });

  it('<image> mit data:-URI bleibt vollständig erhalten', () => {
    const dataUri = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAAB';
    const html = `<svg viewBox="0 0 10 10"><image href="${dataUri}" width="10" height="10"></image></svg>`;
    const { plan, warnings } = htmlToPlan(html);
    const markup = plan.children[0].markup;
    expect(markup).toContain('<image');
    expect(markup).toContain(dataUri);
    expect(warnings.some((w) => w.toLowerCase().includes('extern'))).toBe(false);
  });

  it('externes xlink:href auf <use> wird als Attribut entfernt, Element bleibt (kein <image>)', () => {
    const html = '<svg viewBox="0 0 10 10"><use xlink:href="https://evil.example/sprite.svg#icon"></use></svg>';
    const { plan, warnings } = htmlToPlan(html);
    const markup = plan.children[0].markup;
    expect(markup).not.toContain('evil.example');
    expect(markup).toContain('<use');
    expect(warnings.some((w) => w.toLowerCase().includes('extern'))).toBe(true);
  });

  it('inline path/polyline ohne href/src bleiben unangetastet', () => {
    const html =
      '<svg viewBox="0 0 10 10"><path d="M0 0 L10 10"></path><polyline points="0,0 10,10"></polyline></svg>';
    const { plan, warnings } = htmlToPlan(html);
    const markup = plan.children[0].markup;
    expect(markup).toContain('M0 0 L10 10');
    expect(markup).toContain('0,0 10,10');
    expect(warnings.some((w) => w.toLowerCase().includes('extern'))).toBe(false);
  });

  it('interne Fragment-Refs (<use href="#grad1"> + <linearGradient id="grad1">) bleiben erhalten, kein Strip/keine Warnung', () => {
    // Chart-SVGs referenzieren Gradienten/clipPaths intern über #-Fragmente — das ist KEINE
    // externe Ressource und darf nicht entfernt werden (sonst brechen genau die SVGs, die wir erhalten wollen).
    const html =
      '<svg viewBox="0 0 10 10">' +
      '<defs><linearGradient id="grad1"><stop offset="0%"></stop></linearGradient></defs>' +
      '<use href="#grad1"></use>' +
      '<rect fill="url(#grad1)" width="10" height="10"></rect>' +
      '</svg>';
    const { plan, warnings } = htmlToPlan(html);
    const markup = plan.children[0].markup;
    expect(markup).toContain('href="#grad1"');
    expect(markup).toContain('id="grad1"');
    expect(markup).toContain('<use');
    expect(warnings.some((w) => w.toLowerCase().includes('extern'))).toBe(false);
  });

  it('interner xlink:href auf <use> (#icon) bleibt erhalten', () => {
    const html = '<svg viewBox="0 0 10 10"><use xlink:href="#icon"></use></svg>';
    const { plan, warnings } = htmlToPlan(html);
    expect(plan.children[0].markup).toContain('#icon');
    expect(warnings.some((w) => w.toLowerCase().includes('extern'))).toBe(false);
  });
});

describe('htmlToPlan — component-ref-Erkennung (Struktur-Heuristik, unverändert klassenbasiert)', () => {
  it('Button in einer Card → component-ref MIT Variante und Fallback, Card steigt NICHT weiter in den Button ab', () => {
    // text-align:left explizit gesetzt, um den Test unabhängig von jsdoms UA-Default für
    // <button> zu machen (jsdom zentriert Button-Text standardmäßig, echte Browser nicht
    // unbedingt identisch — hier geht es um die component-ref-Hierarchie, nicht um Text-Defaults).
    const html =
      '<div style="border-top-left-radius:8px;background-color:#ffffff;padding:16px">' +
      '<button class="btn btn-primary" style="text-align:left">Save</button></div>';
    const { plan } = htmlToPlan(html, { knownComponents: [{ name: 'Button', kind: 'atomic' }] });
    expect(plan.type).toBe('box');
    expect(plan.children).toHaveLength(1);
    const ref = plan.children[0];
    expect(ref).toEqual({
      type: 'component-ref',
      name: 'Button',
      variant: 'primary',
      fallback: {
        type: 'box',
        layout: 'row',
        padding: [0, 0, 0, 0],
        radius: 0,
        fill: null,
        stroke: null,
        strokeWeight: 1,
        gap: 0,
        width: null,
        height: null,
        primaryAlign: 'MIN',
        counterAlign: 'CENTER',
        children: [
          {
            type: 'text',
            content: 'Save',
            fontSize: 16,
            fontWeight: 400,
            color: { hex: '#000000', token: null },
            align: 'left',
            lineHeight: null,
          },
        ],
      },
    });
  });

  it('<input type="search"> → component-ref "Suche" wenn bekannt', () => {
    const { plan } = htmlToPlan('<input type="search">', {
      knownComponents: [{ name: 'Suche', kind: 'atomic' }],
    });
    expect(plan.children[0].type).toBe('component-ref');
    expect(plan.children[0].name).toBe('Suche');
  });

  it('<input> (nicht search) / <select> → component-ref "Input" wenn bekannt', () => {
    const { plan } = htmlToPlan('<div><input><select></select></div>', {
      knownComponents: [{ name: 'Input', kind: 'atomic' }],
    });
    expect(plan.children).toHaveLength(2);
    expect(plan.children[0].type).toBe('component-ref');
    expect(plan.children[0].name).toBe('Input');
    expect(plan.children[1].type).toBe('component-ref');
    expect(plan.children[1].name).toBe('Input');
  });

  it('Klasse "badge"/"chip"/"tag" → component-ref "Badge" wenn bekannt', () => {
    const { plan } = htmlToPlan('<span class="badge">Neu</span>', {
      knownComponents: [{ name: 'Badge', kind: 'atomic' }],
    });
    expect(plan.children[0].type).toBe('component-ref');
    expect(plan.children[0].name).toBe('Badge');
  });

  it('unbekannter Baustein (Name nicht in knownComponents) → normaler box/text-Nachbau, KEIN component-ref', () => {
    const html = '<div style="border-top-left-radius:8px;background-color:#ffffff;padding:16px"><button class="btn btn-primary">Save</button></div>';
    const { plan } = htmlToPlan(html, { knownComponents: [] });
    expect(plan.children[0].type).toBe('text');
    expect(plan.children[0].content).toBe('Save');
  });

  it('Button ohne Variant-Wort-Klasse → variant:null', () => {
    const { plan } = htmlToPlan('<button>Save</button>', { knownComponents: [{ name: 'Button', kind: 'atomic' }] });
    expect(plan.children[0]).toMatchObject({ type: 'component-ref', name: 'Button', variant: null });
  });

  it('Hierarchie: Organismus referenziert Molekül, das selbst wieder ein Atom referenziert', () => {
    const html =
      '<div style="border-top-left-radius:8px;background-color:#ffffff;padding:16px">' + // Organismus (unbekannt)
      '<div style="border-top-left-radius:6px;background-color:#ffffff;padding:8px"><button class="btn">Save</button></div>' + // Molekül "Card" wäre bekannt, hier einfach unbekannte Box
      '</div>';
    const { plan } = htmlToPlan(html, { knownComponents: [{ name: 'Button', kind: 'atomic' }] });
    // Organismus bleibt Box (kein Match), steigt normal ab, sein Kind (Box) enthält den erkannten Button als component-ref.
    expect(plan.type).toBe('box');
    const inner = plan.children[0];
    expect(inner.type).toBe('box');
    expect(inner.children[0].type).toBe('component-ref');
    expect(inner.children[0].name).toBe('Button');
  });
});

describe('htmlToPlan — Token-Bindung (unverändert, Eingabe jetzt rgb→hex statt Tailwind-Arbitrary-Hex)', () => {
  it('Hex-Treffer gegen tokens.colors (case-insensitiv) → ColorRef.token gesetzt', () => {
    const { plan } = htmlToPlan('<div style="background-color:#4263EB"></div>', {
      tokens: { colors: [{ hex: '#4263eb', role: 'Primary' }] },
    });
    expect(plan.fill).toEqual({ hex: '#4263eb', token: 'primary' });
  });

  it('kein Treffer → token:null, roher (normalisierter) Hex bleibt erhalten', () => {
    const { plan } = htmlToPlan('<div style="background-color:#123456"></div>', {
      tokens: { colors: [{ hex: '#4263EB', role: 'primary' }] },
    });
    expect(plan.fill).toEqual({ hex: '#123456', token: null });
  });

  it('Token-Bindung gilt auch für PlanText.color', () => {
    const { plan } = htmlToPlan('<p style="color:#111827">Hi</p>', {
      tokens: { colors: [{ hex: '#111827', role: 'text-default' }] },
    });
    expect(plan.children[0].color).toEqual({ hex: '#111827', token: 'text-default' });
  });

  it('ohne tokens-Option (Default {}) → token bleibt null wie bisher', () => {
    const { plan } = htmlToPlan('<div style="background-color:#4263EB"></div>');
    expect(plan.fill).toEqual({ hex: '#4263eb', token: null });
  });

  it('vorab vergebener .name gewinnt gegenüber slugify(role) (Bindung an disambiguierte Figma-Style-Namen)', () => {
    // emitFigmaComponents reicht die bereits von normalizeTokens.assignNames disambiguierten
    // Namen durch (z. B. "primary-2" bei Kollision) — matchColorToken darf role nicht erneut
    // slugifien und muss stattdessen den mitgelieferten Namen 1:1 durchreichen.
    const { plan } = htmlToPlan('<div style="background-color:#222222"></div>', {
      tokens: { colors: [{ hex: '#222222', role: 'primary', name: 'primary-2' }] },
    });
    expect(plan.fill).toEqual({ hex: '#222222', token: 'primary-2' });
  });
});

describe('htmlToPlan — Offscreen-Container-Cleanup (Spec §Kernidee Schritt 4: immer entfernen, try/finally)', () => {
  it('Container wird nach einem erfolgreichen Aufruf wieder aus dem Live-DOM entfernt', () => {
    const before = document.body.children.length;
    htmlToPlan('<div style="padding:16px"><p>Hi</p></div>');
    expect(document.body.children.length).toBe(before);
  });

  it('Container wird auch bei plan:null (leeres HTML) entfernt', () => {
    const before = document.body.children.length;
    htmlToPlan('   ');
    expect(document.body.children.length).toBe(before);
  });

  it('Container akkumuliert nicht über mehrere aufeinanderfolgende Aufrufe', () => {
    const before = document.body.children.length;
    for (let i = 0; i < 5; i += 1) {
      htmlToPlan(`<div style="padding:${i}px"><span>${i}</span></div>`);
    }
    expect(document.body.children.length).toBe(before);
  });
});
