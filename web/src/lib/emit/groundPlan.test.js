// Tests für groundPlan (Spec: docs/superpowers/specs/2026-07-25-komposition-gegroundeter-bausteine-
// design.md §Entscheidung 4 + §Umbau im Detail). Reine Plan→Plan-Transform, kein DOM — Fixtures sind
// Plan-Knoten als Objektliterale, Katalog ist der ECHTE Default-Katalog (shadcn-default.js), damit die
// Tests gegen die reale Hülle (Card-radius 8, card-/border-Farben, Badge-/Button-Optik) prüfen.

import { describe, it, expect } from 'vitest';
import { groundPlan } from './groundPlan.js';
import { scalePlan } from './scalePlan.js';
import { SHADCN_DEFAULT_CATALOG_OPTION } from '../catalog/shadcn-default.js';

const CATALOG = SHADCN_DEFAULT_CATALOG_OPTION;

// --- Fixture-Helfer -------------------------------------------------------

function text(content) {
  return { type: 'text', content, fontSize: 14, fontWeight: 400, color: { token: 'foreground', hex: '#09090b' } };
}

function box(o = {}) {
  return {
    type: 'box', layout: 'row', padding: [0, 0, 0, 0], radius: 0, fill: null, stroke: null,
    strokeWeight: 1, gap: 0, width: null, height: null, primaryAlign: 'MIN', counterAlign: 'MIN',
    children: [], ...o,
  };
}

function catalogRef(o = {}) {
  return {
    type: 'component-ref', name: o.name, catalog: 'shadcn-default',
    import: o.import ?? { name: o.name, from: `@/components/ui/${(o.name || '').toLowerCase()}` },
    variant: o.props?.variant ?? null, props: o.props ?? {},
    voidElement: Boolean(o.voidElement), container: Boolean(o.container),
    fallback: o.fallback,
    ...(o.absolute ? { absolute: o.absolute } : {}),
    ...(o.stretch ? { stretch: true } : {}),
    ...(o.grow ? { grow: true } : {}),
  };
}

describe('groundPlan — Container-Eintrag (Card)', () => {
  it('KPI-Karten-Fall: Card-Ref → Box mit Katalog-Hülle, gemessenem Layout und gegroundeten Kindern (Badge inkl. echtem Text)', () => {
    const badgeRef = catalogRef({
      name: 'Badge',
      props: { variant: 'secondary' },
      fallback: box({ children: [text('3.1%')] }),
    });
    const cardRef = catalogRef({
      name: 'Card',
      container: true,
      fallback: box({
        layout: 'column', gap: 8, padding: [20, 20, 20, 20],
        // Fallback-Wurzel trägt (absichtlich abweichende) eigene fill/stroke/radius — die MÜSSEN
        // von der Katalog-Hülle überschrieben werden (Katalog gewinnt für die Hülle).
        fill: { token: 'destructive', hex: '#ef4444' }, stroke: { token: 'ring', hex: '#18181b' }, radius: 2,
        children: [
          text('Orders'),
          box({ layout: 'row', gap: 6, children: [text('13.465'), badgeRef] }),
        ],
      }),
    });

    const result = groundPlan(cardRef, CATALOG);

    expect(result.type).toBe('box');
    // Hülle kommt aus dem Katalog (Card: radius 8, fill=card, stroke=border) — NICHT aus dem Fallback.
    expect(result.radius).toBe(8);
    expect(result.fill).toEqual({ token: 'card', hex: '#ffffff' });
    expect(result.stroke).toEqual({ token: 'border', hex: '#e4e4e7' });
    // Layout/Maße kommen aus dem Fallback (gemessen).
    expect(result.layout).toBe('column');
    expect(result.gap).toBe(8);
    expect(result.padding).toEqual([20, 20, 20, 20]);
    // Kinder: Text "Orders" + Box(row) mit Text "13.465" und aufgelöstem Badge.
    expect(result.children).toHaveLength(2);
    expect(result.children[0]).toMatchObject({ type: 'text', content: 'Orders' });
    const row = result.children[1];
    expect(row.type).toBe('box');
    expect(row.children).toHaveLength(2);
    expect(row.children[0]).toMatchObject({ type: 'text', content: '13.465' });
    // Badge ist ein aufgelöster Katalog-Badge-Knoten (keine component-ref mehr), trägt den ECHTEN Text.
    const groundedBadge = row.children[1];
    expect(groundedBadge.type).not.toBe('component-ref');
    expect(groundedBadge.radius).toBe(9999); // Badge: rounded-full
    const badgeText = JSON.stringify(groundedBadge);
    expect(badgeText).toContain('3.1%');
    expect(badgeText).not.toContain('"Badge"');
  });

  it('absolute/stretch/grow des Container-Ref-Knotens überleben die Auflösung', () => {
    const cardRef = catalogRef({
      name: 'Card', container: true,
      absolute: { x: 1, y: 2, width: 100, height: 50 },
      fallback: box({ layout: 'column', children: [text('x'), text('y')] }),
    });
    const result = groundPlan(cardRef, CATALOG);
    expect(result.absolute).toEqual({ x: 1, y: 2, width: 100, height: 50 });
  });

  it('Container ohne absolute/stretch/grow am Ref fällt auf die Fallback-Wurzel zurück', () => {
    const cardRef = catalogRef({
      name: 'Card', container: true,
      fallback: { ...box({ layout: 'column', children: [text('x'), text('y')] }), stretch: true, grow: true },
    });
    const result = groundPlan(cardRef, CATALOG);
    expect(result.stretch).toBe(true);
    expect(result.grow).toBe(true);
  });
});

// Live-Fund 27.07. nachmittags (Robs EcoMetrics-Scan, „Table Card: Reports"): Pagination war der
// einzige Katalog-Eintrag mit mehreren strukturell eigenständigen Fallback-Kindern (Label + Pager-
// Zeile mit Chevrons/Seitenzahlen), aber OHNE `container:true` — lief also über groundLeaf (s.
// „Blatt-Eintrag"-Tests unten) und bekam den GESAMTEN sichtbaren Fallback-Text als EIN String in
// die erste Katalog-Pille gestopft, bei deren fontSize/weight (14/500) statt der echten Werte.
// `container:true` (Fix, s. shadcn-default.js) muss denselben Card-Pfad nehmen: Hülle aus dem
// Katalog (hier: kein fill/stroke — Pagination setzt keine), Layout/Maße/ALLE echten Kinder aus
// der Messung.
describe('groundPlan — Container-Eintrag (Pagination, Fix 27.07.)', () => {
  it('Pagination-Ref → Box mit gemessenem Layout und BEIDEN echten Kindern (Label + Pager-Zeile), keine Text-Verschmelzung', () => {
    const pagerRow = box({
      layout: 'row', gap: 12,
      children: [text('1'), text('2'), text('...'), text('16')],
    });
    const paginationRef = catalogRef({
      name: 'Pagination',
      fallback: box({
        layout: 'row', gap: 20, padding: [8, 16, 8, 16],
        // Fallback trägt eigene fill/stroke (echte Scan-Farben) — Katalog-Pagination setzt keine
        // eigene Hülle, das Ergebnis muss trotzdem den Katalog-Wert (null/null/0) übernehmen, NIE
        // stillschweigend beim Fallback-Wert bleiben (sonst wäre das kein Container-Grounding).
        fill: { token: 'destructive', hex: '#ef4444' }, stroke: { token: 'ring', hex: '#18181b' }, radius: 2,
        children: [text('15 to 29 out of 96'), pagerRow],
      }),
    });

    const result = groundPlan(paginationRef, CATALOG);

    expect(result.type).toBe('box');
    // Hülle aus dem Katalog: paginationPlan() setzt kein eigenes fill/stroke/radius → null/null/0.
    expect(result.fill).toBeNull();
    expect(result.stroke).toBeNull();
    expect(result.radius).toBe(0);
    // Layout/Maße/Kinder kommen unverändert aus der Messung — BEIDE echten Kinder bleiben erhalten.
    expect(result.layout).toBe('row');
    expect(result.gap).toBe(20);
    expect(result.padding).toEqual([8, 16, 8, 16]);
    expect(result.children).toHaveLength(2);
    expect(result.children[0]).toMatchObject({ type: 'text', content: '15 to 29 out of 96', fontSize: 14 });
    const row = result.children[1];
    expect(row.type).toBe('box');
    expect(row.children.map((c) => c.content)).toEqual(['1', '2', '...', '16']);
    // Keine Text-Verschmelzung: der gesamte Fallback-Text landet NICHT als ein String irgendwo.
    const serialized = JSON.stringify(result);
    expect(serialized).not.toContain('15 to 29 out of 96 1 2 ... 16');
  });
});

describe('groundPlan — Blatt-Eintrag (Button/Badge)', () => {
  it('Button-Ref variant:secondary mit Fallback-Text "Speichern" → Secondary-Optik, echter Text', () => {
    const buttonRef = catalogRef({
      name: 'Button',
      props: { variant: 'secondary' },
      fallback: box({ children: [text('Speichern')] }),
    });
    const result = groundPlan(buttonRef, CATALOG);
    expect(result.type).toBe('box');
    expect(result.fill).toEqual({ token: 'secondary', hex: '#f4f4f5' });
    const label = result.children.find((c) => c.type === 'text');
    expect(label.content).toBe('Speichern');
    expect(label.color).toEqual({ token: 'secondary-foreground', hex: '#18181b' });
  });

  it('absolute/stretch/grow des Blatt-Ref-Knotens überleben die Auflösung', () => {
    const buttonRef = catalogRef({
      name: 'Button', props: { variant: 'default' }, stretch: true, grow: true,
      absolute: { x: 5, y: 5, width: 40, height: 20 },
      fallback: box({ children: [text('OK')] }),
    });
    const result = groundPlan(buttonRef, CATALOG);
    expect(result.absolute).toEqual({ x: 5, y: 5, width: 40, height: 20 });
    expect(result.stretch).toBe(true);
    expect(result.grow).toBe(true);
  });

  it('Icon-Button (size:icon, Fallback ohne Text, aber mit SVG) → Katalog-Hülle bleibt, aber das ECHTE Fallback-SVG gewinnt gegen den Katalog-Plus-Glyph (Live-Fund 25.07., Prod-Scan)', () => {
    const iconButtonRef = catalogRef({
      name: 'Button',
      props: { size: 'icon' },
      fallback: box({ children: [{ type: 'svg', markup: '<svg><path d="M0 0"/></svg>' }] }),
    });
    const result = groundPlan(iconButtonRef, CATALOG);
    expect(result.type).toBe('box');
    // Katalog-Hülle (radius/Sizing) bleibt (Button-Icon-Padding [10,10,10,10] aus dem Katalog).
    expect(result.padding).toEqual([10, 10, 10, 10]);
    // Genau ein Kind: das ECHTE SVG aus dem Fallback, NICHT der Katalog-Plus-Glyph.
    expect(result.children).toHaveLength(1);
    expect(result.children[0].type).toBe('svg');
    expect(result.children[0].markup).toBe('<svg><path d="M0 0"/></svg>');
    expect(result.children[0].markup).not.toContain('M12 5v14M5 12h14'); // Katalog-Plus-Glyph
    expect(result.children.some((c) => c.type === 'text')).toBe(false);
  });

  it('Blatt mit Text bleibt unverändert (Regression: Text-Ersetzung hat weiterhin Vorrang vor SVG-Ersetzung)', () => {
    const buttonRef = catalogRef({
      name: 'Button',
      props: { variant: 'secondary' },
      fallback: box({ children: [text('Speichern')] }),
    });
    const result = groundPlan(buttonRef, CATALOG);
    const label = result.children.find((c) => c.type === 'text');
    expect(label.content).toBe('Speichern');
    expect(result.children.some((c) => c.type === 'svg')).toBe(false);
  });
});

describe('groundPlan — unbekannter Katalog-Name / kein Katalog', () => {
  it('Unbekannter Katalog-Name → Knoten unverändert', () => {
    const ref = catalogRef({ name: 'Sparkline', fallback: box({ children: [text('42')] }) });
    const result = groundPlan(ref, CATALOG);
    expect(result).toEqual(ref);
  });

  it('Ohne Katalog-Argument → Plan unverändert (tief gleich)', () => {
    const ref = catalogRef({ name: 'Button', props: { variant: 'default' }, fallback: box({ children: [text('OK')] }) });
    const plan = box({ children: [text('Titel'), ref] });
    expect(groundPlan(plan, null)).toEqual(plan);
    expect(groundPlan(plan, undefined)).toEqual(plan);
  });
});

describe('groundPlan — scan-interne Refs (Atomic-Nesting) bleiben unangetastet', () => {
  it('Scan-interner Ref (ohne catalog) bleibt ein component-ref — sein Fallback wird aber gegroundet', () => {
    const nestedCatalogRef = catalogRef({
      name: 'Button', props: { variant: 'secondary' }, fallback: box({ children: [text('Speichern')] }),
    });
    const scanInternalRef = {
      type: 'component-ref', name: 'Toolbar', variant: null,
      fallback: box({ children: [text('Titel'), nestedCatalogRef] }),
    };
    const result = groundPlan(scanInternalRef, CATALOG);
    expect(result.type).toBe('component-ref');
    expect(result.name).toBe('Toolbar');
    expect(result.catalog).toBeUndefined();
    // Fallback-Struktur bleibt eine Box, aber der verschachtelte Katalog-Ref ist aufgelöst.
    expect(result.fallback.type).toBe('box');
    const groundedButton = result.fallback.children[1];
    expect(groundedButton.type).not.toBe('component-ref');
    expect(groundedButton.fill).toEqual({ token: 'secondary', hex: '#f4f4f5' });
  });
});

// Live-Fund 27.07.2026 (Rob's Sunstone-Scan, Testdaten/sunstone-scan-27-07.json): im Figma-Import
// lag über den Metrik-Zeilen der „Shopping Cart Performance Card" ein durchgehender schwarzer Balken.
// Phase-1-Recherche (real-browser-Nachbau der KOMPONENTE selbst) zeigte: die Karte ist strukturell
// sauber (7px Abstand Label→Balken, korrekte Proportionen, kein Overlap). Der reproduzierbare Fehler
// steckt im daneben erzeugten Katalog-Baustein „Metric Funnel Progress Bar" — dessen Progress-Balken
// tragen `data-ds-component="Progress"` und werden dadurch über `groundLeaf` (Blatt-Zweig, kein
// Container, kein Text/SVG zum Ersetzen) 1:1 aus dem Katalog übernommen. shadcn-default.js' Blatt-
// Pläne (progressPlan & Co.) setzen `gap`/`primaryAlign`/`counterAlign` nie explizit — anders als
// htmlToPlan.js's readGap/readAlignment, die diese Felder IMMER auf eine Zahl/ein gültiges Enum
// setzen, blieben sie hier `undefined`. scalePlan.js skalierte `gap` bis 27.07. ungeschützt
// (`Math.round(node.gap * factor)`), also wurde daraus bei jedem realistischen Scan (scanScale ≠ 1)
// `NaN` — und `primaryAlign`/`counterAlign` blieben `undefined`, was die Figma-Plugin-Seite
// (designbridge-plugin/src/writer/renderPlan.ts: `frame.primaryAxisAlignItems = plan.primaryAlign`)
// ungeprüft an die Figma-API durchreicht, die dort ein gültiges Enum erwartet.
describe('groundPlan + scalePlan — Katalog-Blatt ohne eigenes gap/primaryAlign/counterAlign bleibt sauber (Live-Fund 27.07., Sunstone-Scan)', () => {
  it('Progress-Blatt (wie in „Metric Funnel Progress Bar") hat nach Grounding+Skalierung eine Zahl in gap und ein gültiges Alignment, nie NaN/undefined', () => {
    const progressRef = catalogRef({
      name: 'Progress',
      // Blatt ohne Text/SVG im Fallback (reine Deko-Leiste) — genau der Fall, der in groundLeaf auf
      // mode:'plain' bleibt und daher NICHT als Figma-Instanz, sondern inline aus dem Katalog-Plan
      // übernommen wird (s. instanceRefFor: canInstance nur bei mode 'text' oder 'plain'+skipText).
      fallback: box({ width: 359, height: 3 }),
    });

    const grounded = groundPlan(progressRef, CATALOG);
    expect(grounded.type).toBe('box');
    // VORHER (Bug): grounded.gap war hier bereits `undefined` (Katalog-Plan reicht es nie durch).
    expect(Number.isFinite(grounded.gap)).toBe(true);
    expect(['MIN', 'CENTER', 'MAX', 'SPACE_BETWEEN']).toContain(grounded.primaryAlign);
    expect(['MIN', 'CENTER', 'MAX', 'STRETCH']).toContain(grounded.counterAlign);
    // Das innere Fill-Kind kommt ebenfalls direkt aus dem Katalog (progressPlan) — derselbe Fehler
    // wäre dort genauso reproduzierbar.
    const [fill] = grounded.children;
    expect(Number.isFinite(fill.gap)).toBe(true);

    // Realer Scan-Maßstab (Sunstone: scanScale ≈ 2,4) — VORHER wurde grounded.gap hier zu NaN.
    const scaled = scalePlan(grounded, 2.4);
    expect(scaled.gap).not.toBeNaN();
    expect(Number.isFinite(scaled.gap)).toBe(true);
    expect(scaled.children[0].gap).not.toBeNaN();
  });
});
