import { describe, it, expect } from 'vitest';
import {
  SHADCN_DEFAULT_CATALOG,
  getCatalogComponent,
  catalogComponentNames,
} from './shadcn-default.js';

// Rekursiv jeden Knoten eines plan-Baums besuchen.
function walkPlan(node, visit) {
  visit(node);
  if (Array.isArray(node?.children)) node.children.forEach((c) => walkPlan(c, visit));
}

// Startsatz aus Spec 2026-07-23-slice1-ds-grounding-default-catalog-design.md.
const START_SET = ['Button', 'Input', 'Label', 'Badge', 'Card', 'Checkbox', 'Avatar', 'Separator'];
// Aufstockung 26.07.2026 — nur Komponenten, deren Wurzel als EIN Element sichtbar rendert.
// Select/Table/DropdownMenu/Tooltip fehlen bewusst (Begründung im Block-Kommentar der Quelldatei).
const ERWEITERUNG = ['Tabs', 'ToggleGroup', 'Progress', 'Switch', 'Skeleton', 'Textarea', 'Alert', 'Breadcrumb', 'Pagination'];

describe('SHADCN_DEFAULT_CATALOG — Struktur-Contract', () => {
  it('enthält weiterhin den vollständigen Startsatz aus der Spec', () => {
    for (const name of START_SET) expect(catalogComponentNames()).toContain(name);
  });

  it('enthält genau Startsatz + Aufstockung (keine stillen Zu-/Abgänge)', () => {
    expect(catalogComponentNames().sort()).toEqual([...START_SET, ...ERWEITERUNG].sort());
  });

  it('die vier strukturbedürftigen Komponenten sind bewusst NICHT drin', () => {
    // Ihre Radix-Wurzel rendert ohne Pflicht-Unterkomponenten nichts; gegroundet würde der
    // gemessene Inhalt im Code-Emit unsichtbar. Erst mit Sub-Komponenten-Slots aufnehmen.
    for (const name of ['Select', 'Table', 'DropdownMenu', 'Tooltip']) {
      expect(catalogComponentNames()).not.toContain(name);
    }
  });

  it.each(SHADCN_DEFAULT_CATALOG.map((c) => [c.name, c]))(
    '%s hat name, import, variants, props, match und plan()',
    (_name, entry) => {
      expect(typeof entry.name).toBe('string');
      expect(entry.name.length).toBeGreaterThan(0);
      expect(typeof entry.import?.name).toBe('string');
      expect(typeof entry.import?.from).toBe('string');
      expect(entry.import.from).toMatch(/^@\/components\/ui\//);
      expect(entry.variants && typeof entry.variants).toBe('object');
      expect(Array.isArray(entry.props)).toBe(true);
      expect(entry.match).toBeTruthy();
      expect(typeof entry.plan).toBe('function');
    },
  );

  it('Varianten-Achsen sind nicht-leere String-Listen (wo vorhanden)', () => {
    for (const entry of SHADCN_DEFAULT_CATALOG) {
      for (const [axis, options] of Object.entries(entry.variants)) {
        expect(Array.isArray(options), `${entry.name}.${axis}`).toBe(true);
        expect(options.length, `${entry.name}.${axis}`).toBeGreaterThan(0);
        options.forEach((o) => expect(typeof o).toBe('string'));
      }
    }
  });
});

describe('SHADCN_DEFAULT_CATALOG — plan() liefert wohlgeformte, token-referenzierte Pläne', () => {
  it.each(SHADCN_DEFAULT_CATALOG.map((c) => [c.name, c]))(
    '%s: plan() ohne Argument ist ein gültiger plan-Knoten',
    (_name, entry) => {
      const plan = entry.plan();
      expect(plan).toBeTruthy();
      expect(['box', 'text', 'svg']).toContain(plan.type);
    },
  );

  it('jeder box-Knoten hat padding[4], radius, fill/stroke-Felder', () => {
    for (const entry of SHADCN_DEFAULT_CATALOG) {
      walkPlan(entry.plan(), (n) => {
        if (n.type !== 'box') return;
        expect(Array.isArray(n.padding) && n.padding.length === 4, entry.name).toBe(true);
        expect(typeof n.radius).toBe('number');
        expect('fill' in n && 'stroke' in n, entry.name).toBe(true);
      });
    }
  });

  it('ALLE Farben im Default-Katalog tragen einen token-Namen (Grounding-Invariante)', () => {
    for (const entry of SHADCN_DEFAULT_CATALOG) {
      walkPlan(entry.plan(), (n) => {
        const colors = [n.fill, n.stroke, n.type === 'text' ? n.color : null].filter(Boolean);
        for (const c of colors) {
          expect(typeof c.token, `${entry.name}: token fehlt`).toBe('string');
          expect(c.token.length).toBeGreaterThan(0);
          expect(c.hex, `${entry.name}: hex fehlt`).toMatch(/^#[0-9a-f]{6}$/i);
        }
      });
    }
  });
});

describe('Button — Varianten & Größen', () => {
  it('default: gefüllte Box (primary) mit primary-foreground-Text', () => {
    const plan = getCatalogComponent('Button').plan({ variant: 'default', size: 'default' });
    expect(plan.fill.token).toBe('primary');
    expect(plan.children[0]).toMatchObject({ type: 'text', content: 'Button' });
    expect(plan.children[0].color.token).toBe('primary-foreground');
  });

  it('outline: Rahmen (input) statt Füllung', () => {
    const plan = getCatalogComponent('Button').plan({ variant: 'outline' });
    expect(plan.fill).toBeNull();
    expect(plan.stroke.token).toBe('input');
  });

  it('secondary: Füllung secondary', () => {
    const plan = getCatalogComponent('Button').plan({ variant: 'secondary' });
    expect(plan.fill.token).toBe('secondary');
  });

  it('icon: quadratisch, svg-Glyph statt Text', () => {
    const plan = getCatalogComponent('Button').plan({ size: 'icon' });
    expect(plan.padding).toEqual([10, 10, 10, 10]);
    expect(plan.children[0].type).toBe('svg');
  });
});

describe('Zustands-Varianten', () => {
  it('Checkbox checked: Füllung + Häkchen-svg; unchecked: nur Rahmen', () => {
    const on = getCatalogComponent('Checkbox').plan({ checked: true });
    expect(on.fill.token).toBe('primary');
    expect(on.children[0].type).toBe('svg');
    const off = getCatalogComponent('Checkbox').plan({ checked: false });
    expect(off.fill).toBeNull();
    expect(off.stroke.token).toBe('primary');
    expect(off.children).toEqual([]);
  });
});

describe('getCatalogComponent', () => {
  it('liefert Eintrag per Name, undefined bei Unbekanntem', () => {
    expect(getCatalogComponent('Button')?.name).toBe('Button');
    expect(getCatalogComponent('Nichtvorhanden')).toBeUndefined();
  });
});

// Fund in Robs Figma-Datei 26.07. (`qRz1I3zX1WDkQ0459X3Kxc`, Sektion DB/Design System):
// DS/Checkbox und DS/Separator lagen als 100×100-Kästen in der Bibliothek, DS/Avatar als 19×17.
// 100×100 ist Figmas Default-Größe für einen Frame, der weder Maße noch huggbare Kinder hat —
// die Pläne setzten trotz passender Code-Kommentare (`h-4 w-4`, `h-px`, `h-10 w-10`) keine Größe.
// Betrifft nur die Bibliotheks-Exemplare: gegroundete Bausteine bekommen ihre Maße aus der Messung
// (groundContainer liest width/height vom fallback), deshalb fiel es im Scan nie auf.
// Beim Aufstocken am 26.07. war das der gefährlichste Punkt: das Empfangs-Storybook (und der
// Verifikations-Target) hatten nur die 8 Stubs des Startsatzes. Erkennt ein Scan eine neue
// Komponente, emittiert planToJsx `import { Tabs } from '@/components/ui/tabs'` — fehlt die Datei,
// bricht der komplette Storybook-Build, und zwar erst beim User. Deshalb hier als Vertrag.
describe('Jeder Katalog-Import löst in den Emit-Zielen auf', () => {
  const ZIELE = [
    'verification/shadcn-target/components/ui',
    '../storybook-harness/components/ui',
  ];

  it.each(SHADCN_DEFAULT_CATALOG.map((c) => [c.name, c]))('%s: Stub-Datei + benannter Export vorhanden', async (name, entry) => {
    const fs = await import('node:fs');
    const path = await import('node:path');
    const file = `${entry.import.from.replace('@/components/ui/', '')}.jsx`;
    for (const ziel of ZIELE) {
      const p = path.resolve(process.cwd(), ziel, file);
      expect(fs.existsSync(p), `${name}: ${ziel}/${file} fehlt — Storybook-Export würde brechen`).toBe(true);
      const src = fs.readFileSync(p, 'utf8');
      expect(src, `${name}: ${ziel}/${file} exportiert kein ${entry.import.name}`)
        .toMatch(new RegExp(`export function ${entry.import.name}\\b`));
    }
  });

  // AppleDouble (`._tabs.jsx`) wird hier BEWUSST nicht geprüft: macOS erzeugt die Dateien auf
  // diesem exFAT-Volume bei jedem Dateizugriff neu, ein Test darauf wäre dauerhaft rot ohne etwas
  // über den Code zu sagen. Die Absicherung sitzt an der Quelle — `storybook-harness/sync-shadcn.mjs`
  // filtert `._*` beim Kopieren heraus (sonst landen sie in components/ui und Storybook lädt sie als
  // Module; am 26.07. real passiert: 26 statt 17 „Stubs"). Aufräumen per
  // `find . -name '._*' -delete`, s. CLAUDE.md Regel 7.
});

describe('Größen mit fester shadcn-Vorgabe stehen am Plan (kein 100×100-Default in Figma)', () => {
  it('Checkbox ist 16×16 (h-4 w-4), in beiden Zuständen', () => {
    for (const checked of [false, true]) {
      const p = getCatalogComponent('Checkbox').plan({ checked });
      expect([p.width, p.height]).toEqual([16, 16]);
    }
  });

  it('Avatar ist 40×40 (h-10 w-10) und zentriert seine Initialen', () => {
    const p = getCatalogComponent('Avatar').plan();
    expect([p.width, p.height]).toEqual([40, 40]);
    expect(p.primaryAlign).toBe('CENTER');
    expect(p.counterAlign).toBe('CENTER');
  });

  it('Separator ist 1px dünn — horizontal in der Höhe, vertikal in der Breite', () => {
    const h = getCatalogComponent('Separator').plan();
    expect(h.height).toBe(1);
    expect(h.width).toBeGreaterThan(1);
    const v = getCatalogComponent('Separator').plan({ orientation: 'vertical' });
    expect(v.width).toBe(1);
    expect(v.height).toBeGreaterThan(1);
  });

  it('kein Katalog-Eintrag liefert eine Wurzel ohne Maße UND ohne Kinder (= 100×100 in Figma)', () => {
    for (const entry of SHADCN_DEFAULT_CATALOG) {
      const p = entry.plan();
      if (p.type !== 'box') continue;
      const hatMasse = p.width != null || p.height != null;
      const hatKinder = Array.isArray(p.children) && p.children.length > 0;
      expect(hatMasse || hatKinder, `${entry.name} würde in Figma auf 100×100 fallen`).toBe(true);
    }
  });
});
