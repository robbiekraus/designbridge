import { describe, it, expect } from 'vitest';
import { planToJsx, groundedComponentNames } from './planToJsx.js';

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

  it('voidElement: bleibt selbstschließend, SELBST wenn der Fallback sichtbaren Text enthält (Live-Fund 24.07.: <Input>Text</Input> crasht React zur Laufzeit — "input is a void element tag")', () => {
    const plan = box({ children: [catalogRef({
      name: 'Input', import: { name: 'Input', from: '@/components/ui/input' },
      variant: null, props: {}, voidElement: true,
      fallback: box({ children: [text('Suchen…')] }),
    }) ] });
    const code = planToJsx(plan, { name: 'X' });
    expect(code).toContain('<Input />');
    expect(code).not.toContain('<Input>');
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

  it('Katalog-Name kollidiert mit dem eigenen Komponentennamen (Live-Fund 24.07., Storybook-Harness: gescanntes Atom "Avatar" wrappt shadcns <Avatar> → Import + export function hießen identisch, Vite/Babel: "Identifier \'Avatar\' has already been declared") → Import wird aliasiert, JSX-Tag nutzt denselben Alias', () => {
    const plan = box({ children: [catalogRef({
      name: 'Avatar', import: { name: 'Avatar', from: '@/components/ui/avatar' },
      props: {}, fallback: box({}),
    }) ] });
    const code = planToJsx(plan, { name: 'Avatar' });
    expect(code).toContain('import { Avatar as AvatarPrimitive } from "@/components/ui/avatar";');
    expect(code).toContain('<AvatarPrimitive />');
    expect(code).toContain('export function Avatar(');
    expect(code).not.toMatch(/^import \{ Avatar \}/m);
  });

  it('kein Katalog-ref → gar keine Import-Zeilen (unveränderte Ausgabe)', () => {
    const code = planToJsx(box({ children: [text('nur Text')] }), { name: 'X' });
    expect(code.startsWith('export function X(')).toBe(true);
  });
});

// Task 2 (Spec 2026-07-25-komposition-gegroundeter-bausteine-design.md §Umbau → planToJsx.js):
// gegroundete Container-Bausteine (container:true) werden KOMPONIERT statt zu einer Textzeile
// eingeschmolzen. Hülle (bg/border/rounded) kommt aus dem Katalog, Layout/Kinder aus der Messung.

/** Voller Box-Knoten mit allen Vertragsfeldern, die boxClasses/layoutClasses/visualClasses lesen. */
function fullBox(o = {}) {
  return {
    type: 'box', layout: 'row', padding: [0, 0, 0, 0], radius: 0, fill: null,
    stroke: null, strokeWeight: 1, gap: 0, width: null, height: null,
    primaryAlign: 'MIN', counterAlign: 'MIN', children: [], ...o,
  };
}

/** KPI-Karte (Leitfall der Spec/Messung): Card-Container mit drei Kindern, eines davon eine
 *  verschachtelte Badge-Ref. */
function buildKpiCardPlan() {
  const badgeRef = catalogRef({
    name: 'Badge', import: { name: 'Badge', from: '@/components/ui/badge' },
    variant: 'secondary', props: { variant: 'secondary' },
    fallback: fullBox({ children: [text('3.1%')] }),
  });
  const cardFallback = fullBox({
    layout: 'column', gap: 8, padding: [20, 20, 20, 20],
    fill: { hex: '#ffffff', token: null }, stroke: { hex: '#e5e7eb', token: null }, radius: 8,
    children: [
      text('Orders'),
      fullBox({ layout: 'row', children: [text('13.465'), badgeRef] }),
      text('Last month: 11.246'),
    ],
  });
  return catalogRef({
    name: 'Card', import: { name: 'Card', from: '@/components/ui/card' },
    container: true, props: {}, fallback: cardFallback,
  });
}

describe('planToJsx — Komposition gegroundeter Container-Bausteine (container:true)', () => {
  it('Card mit Kindern → komponiert (nicht eingeschmolzen): eigene Knoten für Titel, Wert, Badge, Fußzeile', () => {
    const plan = fullBox({ layout: 'column', children: [buildKpiCardPlan()] });
    const code = planToJsx(plan, { name: 'KpiCard' });
    // `items-start` spiegelt Figmas counterAlign MIN (Kinder huggen) — CSS-Flex würde sie sonst per
    // Default dehnen, s. planToJsx.layoutClasses.
    expect(code).toContain('<Card className="flex flex-col items-start gap-[8px] p-[20px]">');
    expect(code).toMatch(/<span[^>]*>Orders<\/span>/);
    expect(code).toContain('<Badge variant="secondary">3.1%</Badge>');
    expect(code).toMatch(/<span[^>]*>Last month: 11\.246<\/span>/);
    // Nicht als eine flache Textzeile eingeschmolzen: die drei Textstücke stehen NICHT gemeinsam
    // in einem einzigen Textknoten.
    expect(code).not.toMatch(/>Orders 13\.465 3\.1% Last month: 11\.246</);
  });

  it('am <Card>-Tag stehen KEINE Hüllen-Klassen (bg-/border/rounded) — die kommen aus dem Katalog', () => {
    const plan = fullBox({ layout: 'column', children: [buildKpiCardPlan()] });
    const code = planToJsx(plan, { name: 'KpiCard' });
    const cardOpenTag = code.match(/<Card className="[^"]*">/)[0];
    expect(cardOpenTag).not.toContain('bg-');
    expect(cardOpenTag).not.toContain('border');
    expect(cardOpenTag).not.toContain('rounded');
  });

  it('beide Imports werden gesammelt (Card + Badge)', () => {
    const plan = fullBox({ layout: 'column', children: [buildKpiCardPlan()] });
    const code = planToJsx(plan, { name: 'KpiCard' });
    expect(code).toContain('import { Badge } from "@/components/ui/badge";');
    expect(code).toContain('import { Card } from "@/components/ui/card";');
  });

  it('groundedComponentNames liefert Badge + Card (sortiert)', () => {
    const plan = fullBox({ layout: 'column', children: [buildKpiCardPlan()] });
    expect(groundedComponentNames(plan)).toEqual(['Badge', 'Card']);
  });

  it('Regression Blatt: Button-Ref mit Fallback-Text bleibt <Button>Speichern</Button> (kein Container)', () => {
    const plan = fullBox({ children: [catalogRef({
      name: 'Button', import: { name: 'Button', from: '@/components/ui/button' },
      props: {}, fallback: fullBox({ children: [text('Speichern')] }),
    })] });
    const code = planToJsx(plan, { name: 'X' });
    expect(code).toContain('<Button>Speichern</Button>');
  });

  it('Regression voidElement: Input-Ref (voidElement, container:true UND Fallback-Kinder) rendert selbstschließend, ohne Kinder', () => {
    const plan = fullBox({ children: [catalogRef({
      name: 'Input', import: { name: 'Input', from: '@/components/ui/input' },
      voidElement: true, container: true, props: {},
      fallback: fullBox({ children: [text('Suchen…')] }),
    })] });
    const code = planToJsx(plan, { name: 'X' });
    expect(code).toContain('<Input />');
    expect(code).not.toContain('<Input>');
    expect(code).not.toContain('Suchen');
  });

  it('Regression catalogLocalName: eigene Komponente heißt "Card" und wrappt einen Card-Container → Tag/Import nutzen CardPrimitive', () => {
    const plan = fullBox({ children: [catalogRef({
      name: 'Card', import: { name: 'Card', from: '@/components/ui/card' },
      container: true, props: {}, fallback: fullBox({ layout: 'column', children: [text('Inner')] }),
    })] });
    const code = planToJsx(plan, { name: 'Card' });
    expect(code).toContain('import { Card as CardPrimitive } from "@/components/ui/card";');
    expect(code).toMatch(/<CardPrimitive[^>]*>/);
    expect(code).toContain('</CardPrimitive>');
    expect(code).not.toMatch(/^import \{ Card \}/m);
  });

  it('Container ohne Fallback-Kinder → <Card /> (kein className, kein Aufklappen)', () => {
    const plan = fullBox({ children: [catalogRef({
      name: 'Card', import: { name: 'Card', from: '@/components/ui/card' },
      container: true, props: {}, fallback: fullBox({ children: [] }),
    })] });
    const code = planToJsx(plan, { name: 'X' });
    expect(code).toContain('<Card />');
  });

  it('extractText-Fix: Blatt-Ref (Button), dessen Fallback einen verschachtelten Badge-Ref enthält → dessen Text steht im Label', () => {
    const plan = fullBox({ children: [catalogRef({
      name: 'Button', import: { name: 'Button', from: '@/components/ui/button' }, props: {},
      fallback: fullBox({ children: [catalogRef({
        name: 'Badge', import: { name: 'Badge', from: '@/components/ui/badge' },
        variant: 'secondary', props: { variant: 'secondary' },
        fallback: fullBox({ children: [text('3.1%')] }),
      })] }),
    })] });
    const code = planToJsx(plan, { name: 'X' });
    expect(code).toContain('<Button>3.1%</Button>');
  });

  it('Container-Ref als Plan-Wurzel: className-Passthrough + {...props} bleiben erhalten, Ausgabe syntaktisch plausibel', () => {
    const plan = buildKpiCardPlan();
    const code = planToJsx(plan, { name: 'KpiCard' });
    expect(code).toMatch(/className=\{`[^`]*\$\{className\}`\}/);
    expect(code).toContain('{...props}');
    const opens = (code.match(/<Card\b/g) || []).length;
    const closes = (code.match(/<\/Card>/g) || []).length;
    expect(opens).toBe(1);
    expect(closes).toBe(1);
    expect(code).toContain('<Badge variant="secondary">3.1%</Badge>');
  });
});

// Task 3 (Live-Fund 25.07., Prod-Scan): ein Blatt-Katalog-Ref (z. B. Icon-Button), dessen Fallback
// NUR ein SVG und keinen sichtbaren Text trägt, verlor sein Icon komplett — `walkCatalogRef`
// übernahm bislang nur den TEXT des Fallbacks, ein reiner Icon-Fallback lieferte leeren String →
// selbstschließendes, leeres Tag (`<Button variant="ghost" size="icon" />`). Real gesehen an einem
// gescannten Dashboard: die komplette Sidebar-Navigation kam im Storybook als Reihe leerer Kästchen
// an. Spec 2026-07-25 §Blatt-Zweig: SVGs aus dem Fallback werden jetzt als Kinder gerendert.
const svgNode = (markup) => ({ type: 'svg', markup });

describe('planToJsx — Blatt-Ref Icon-Fallback: SVG als Kind statt leerem Tag (Live-Fund 25.07.)', () => {
  it('Icon-Button (Fallback = Box mit einem SVG, kein Text) → SVG wird als Kind gerendert, Tag schließt regulär', () => {
    const plan = fullBox({ children: [catalogRef({
      name: 'Button', import: { name: 'Button', from: '@/components/ui/button' },
      props: { variant: 'ghost', size: 'icon' },
      fallback: fullBox({ children: [svgNode('<svg width="16" height="16"><path d="M5 12h14"/></svg>')] }),
    })] });
    const code = planToJsx(plan, { name: 'X' });
    expect(code).toContain('<Button variant="ghost" size="icon">');
    expect(code).toContain('<path d="M5 12h14"/>');
    expect(code).toContain('</Button>');
    expect(code).not.toContain('<Button variant="ghost" size="icon" />');
  });

  it('Label-Button mit Text bleibt <Button>Speichern</Button> (Regression: kein Icon-Verhalten, wenn Text vorhanden ist)', () => {
    const plan = fullBox({ children: [catalogRef({
      name: 'Button', import: { name: 'Button', from: '@/components/ui/button' }, props: {},
      fallback: fullBox({ children: [text('Speichern')] }),
    })] });
    const code = planToJsx(plan, { name: 'X' });
    expect(code).toContain('<Button>Speichern</Button>');
  });

  it('voidElement (Input) mit SVG im Fallback bleibt selbstschließend (Regression: voidElement gewinnt IMMER)', () => {
    const plan = fullBox({ children: [catalogRef({
      name: 'Input', import: { name: 'Input', from: '@/components/ui/input' },
      voidElement: true, props: {},
      fallback: fullBox({ children: [svgNode('<svg><path d="M0 0"/></svg>')] }),
    })] });
    const code = planToJsx(plan, { name: 'X' });
    expect(code).toContain('<Input />');
    expect(code).not.toContain('<Input>');
    expect(code).not.toContain('<svg');
  });

  it('Blatt ohne Text und ohne SVG bleibt selbstschließend (Regression)', () => {
    const plan = fullBox({ children: [catalogRef({
      name: 'Input', import: { name: 'Input', from: '@/components/ui/input' }, props: {},
      fallback: fullBox({}),
    })] });
    const code = planToJsx(plan, { name: 'X' });
    expect(code).toContain('<Input />');
  });

  it('mehrere SVGs im Fallback → alle als Kinder, in Dokumentreihenfolge', () => {
    const plan = fullBox({ children: [catalogRef({
      name: 'Button', import: { name: 'Button', from: '@/components/ui/button' },
      props: { size: 'icon' },
      fallback: fullBox({ children: [
        svgNode('<svg><path d="M1 1"/></svg>'),
        svgNode('<svg><path d="M2 2"/></svg>'),
      ] }),
    })] });
    const code = planToJsx(plan, { name: 'X' });
    const i1 = code.indexOf('M1 1');
    const i2 = code.indexOf('M2 2');
    expect(i1).toBeGreaterThan(-1);
    expect(i2).toBeGreaterThan(i1);
  });

  it('SVG in verschachteltem Katalog-Ref im Fallback wird ebenfalls gefunden (steigt wie extractText in Sub-Fallbacks ab)', () => {
    const plan = fullBox({ children: [catalogRef({
      name: 'Button', import: { name: 'Button', from: '@/components/ui/button' }, props: { size: 'icon' },
      fallback: fullBox({ children: [catalogRef({
        name: 'Badge', import: { name: 'Badge', from: '@/components/ui/badge' }, props: {},
        fallback: fullBox({ children: [svgNode('<svg><path d="M9 9"/></svg>')] }),
      })] }),
    })] });
    const code = planToJsx(plan, { name: 'X' });
    expect(code).toContain('M9 9');
  });
});

// Sub-Komponenten-Slots (Spec 2026-07-25-sub-komponenten-slots-design.md, Scheibe A): ein
// Katalog-Container-Ref mit `slots` verteilt seinen gemessenen Unterbaum auf <CardHeader>
// (erstes Kind) und <CardContent> (Rest) statt sie flach unter <Card> zu hängen. Nur wenn der
// Katalog-Eintrag `slots` trägt — bestehende Grounding-Tests (oben) bauen ihre Refs ohne `slots`
// und laufen deshalb unverändert durch den alten flachen Pfad.
const CARD_SLOTS = {
  header: { name: 'CardHeader', import: { name: 'CardHeader', from: '@/components/ui/card' } },
  content: { name: 'CardContent', import: { name: 'CardContent', from: '@/components/ui/card' } },
};

function buildSlottedCardPlan(children) {
  return catalogRef({
    name: 'Card', import: { name: 'Card', from: '@/components/ui/card' },
    container: true, slots: CARD_SLOTS, props: {},
    fallback: fullBox({
      layout: 'column', gap: 8, padding: [20, 20, 20, 20],
      fill: { hex: '#ffffff', token: null }, stroke: { hex: '#e5e7eb', token: null }, radius: 8,
      children,
    }),
  });
}

describe('planToJsx — Sub-Komponenten-Slots: Card > CardHeader/CardContent (slots-Feld)', () => {
  it('≥2 Kinder + slots → erstes Kind in CardHeader, Rest in CardContent', () => {
    const plan = fullBox({ children: [buildSlottedCardPlan([text('Orders'), text('13.465'), text('Last month: 11.246')])] });
    const code = planToJsx(plan, { name: 'KpiCard' });
    expect(code).toMatch(/<Card className="[^"]*">\s*<CardHeader className="!p-0">\s*<span[^>]*>Orders<\/span>\s*<\/CardHeader>/);
    expect(code).toMatch(/<CardContent className="[^"]*!p-0[^"]*">\s*<span[^>]*>13\.465<\/span>\s*<span[^>]*>Last month: 11\.246<\/span>\s*<\/CardContent>/);
    // weiterhin genau EIN Card-Open/Close (kein doppeltes Aufklappen der Hülle)
    expect((code.match(/<Card\b/g) || []).length).toBe(1);
    expect((code.match(/<\/Card>/g) || []).length).toBe(1);
  });

  it('genau 1 Kind + slots → kein Split, unveränderter flacher Fall (ein Slot für ein einzelnes Kind bringt nichts)', () => {
    const plan = fullBox({ children: [buildSlottedCardPlan([text('Nur ein Kind')])] });
    const code = planToJsx(plan, { name: 'X' });
    expect(code).not.toContain('CardHeader');
    expect(code).not.toContain('CardContent');
    expect(code).toMatch(/<Card className="[^"]*">\s*<span[^>]*>Nur ein Kind<\/span>\s*<\/Card>/);
  });

  it('kein slots-Feld → unveränderter flacher Fall (Rückwärtskompatibilität, z. B. Repo-Kataloge ohne Slots)', () => {
    const plan = fullBox({ children: [catalogRef({
      name: 'Card', import: { name: 'Card', from: '@/components/ui/card' },
      container: true, props: {},
      fallback: fullBox({ layout: 'column', children: [text('A'), text('B')] }),
    })] });
    const code = planToJsx(plan, { name: 'X' });
    expect(code).not.toContain('CardHeader');
    expect(code).not.toContain('CardContent');
  });

  it('CardContent bekommt denselben Gap wie vorher zwischen den flachen Geschwistern (hier gap-[8px])', () => {
    const plan = fullBox({ children: [buildSlottedCardPlan([text('Titel'), text('Zeile 2'), text('Zeile 3')])] });
    const code = planToJsx(plan, { name: 'X' });
    const contentTag = code.match(/<CardContent className="([^"]*)">/)[1];
    expect(contentTag).toContain('gap-[8px]');
    expect(contentTag).toContain('flex-col');
    expect(contentTag).not.toContain('p-[20px]'); // Padding bleibt am äußeren Card, nicht am Content
  });

  it('Card selbst behält seine volle gemessene Klasse (Gap+Padding) unverändert, auch mit Slots', () => {
    const plan = fullBox({ children: [buildSlottedCardPlan([text('Titel'), text('Inhalt')])] });
    const code = planToJsx(plan, { name: 'X' });
    expect(code).toContain('<Card className="flex flex-col items-start gap-[8px] p-[20px]">');
  });

  it('beide Slot-Imports werden gesammelt (gleiches Modul wie Card selbst, zusammengefasst)', () => {
    const plan = fullBox({ children: [buildSlottedCardPlan([text('A'), text('B')])] });
    const code = planToJsx(plan, { name: 'X' });
    expect(code).toContain('import { Card, CardContent, CardHeader } from "@/components/ui/card";');
  });

  it('Kollisions-Aliasing gilt auch für Slot-Tags, wenn die eigene Komponente "Card" heißt', () => {
    const plan = buildSlottedCardPlan([text('A'), text('B')]);
    const code = planToJsx(plan, { name: 'Card' });
    expect(code).toContain('import { Card as CardPrimitive, CardContent, CardHeader } from "@/components/ui/card";');
    expect(code).toMatch(/<CardPrimitive[^>]*>\s*<CardHeader/);
  });

  it('groundedComponentNames bleibt unverändert (Slot-Tags sind kein eigener gegroundeter Baustein)', () => {
    const plan = fullBox({ children: [buildSlottedCardPlan([text('A'), text('B')])] });
    expect(groundedComponentNames(plan)).toEqual(['Card']);
  });

  it('verschachtelter Katalog-Ref (Badge) im CardContent-Teil wird weiterhin komponiert', () => {
    const badgeRef = catalogRef({
      name: 'Badge', import: { name: 'Badge', from: '@/components/ui/badge' },
      props: { variant: 'secondary' }, fallback: fullBox({ children: [text('3.1%')] }),
    });
    const plan = fullBox({ children: [buildSlottedCardPlan([text('Orders'), badgeRef])] });
    const code = planToJsx(plan, { name: 'X' });
    expect(code).toMatch(/<CardContent[^>]*>\s*<Badge variant="secondary">3\.1%<\/Badge>\s*<\/CardContent>/);
  });
});
