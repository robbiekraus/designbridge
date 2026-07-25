// Tests für groundPlan (Spec: docs/superpowers/specs/2026-07-25-komposition-gegroundeter-bausteine-
// design.md §Entscheidung 4 + §Umbau im Detail). Reine Plan→Plan-Transform, kein DOM — Fixtures sind
// Plan-Knoten als Objektliterale, Katalog ist der ECHTE Default-Katalog (shadcn-default.js), damit die
// Tests gegen die reale Hülle (Card-radius 8, card-/border-Farben, Badge-/Button-Optik) prüfen.

import { describe, it, expect } from 'vitest';
import { groundPlan } from './groundPlan.js';
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
