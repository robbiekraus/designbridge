# Figma-Emitter v2 (Components → Figma-Nodes) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Das kanonische Inventar (Atomics/Components/Patterns) wird als echte Figma-Component-Sets mit Varianten auf eine eigene „🌉 DesignBridge"-Seite geschrieben; Bausteine ohne Template werden Platzhalter-Komponenten.

**Architecture:** „Dummes Plugin" — die Web-App berechnet aus den vorhandenen Template-Rezepten einen neutralen Bauplan (nur `box`+`text`-Elemente, Farben als `{token, hex}`-Paare) und hängt ihn als `components[]` an den bestehenden Figma-Export (Payload v2). Das Plugin rendert Baupläne generisch (`renderPlan`), macht daraus Component Sets (`buildComponents`) und sortiert sie in ein Sticker-Sheet (`upsertPage`). Farben verknüpfen mit den `DesignBridge/Color/*`-Styles aus Phase 5 (Fallback Hex). Re-Import = create-or-update per Name.

**Tech Stack:** Web: Vite/React, Vitest, reine ES-Module unter `web/src/lib/`. Plugin: TypeScript, esbuild, `npm run typecheck` (tsc via node), Figma Plugin API (`combineAsVariants`, `setFillStyleIdAsync`).

**Spec:** `docs/superpowers/specs/2026-07-07-figma-emitter-v2-components-design.md`

**Verifikations-Kommandos (aus dem Repo-Root):**
- Web-Tests: `cd web && npx vitest run` (Baseline: 106/106)
- Server-Tests: `npm run test:server` (Baseline: 77/77, wird hier nicht angefasst)
- Plugin: `cd designbridge-plugin && npm run typecheck` (0 Fehler) und `npm run build` („Build complete.")

**⚠️ Volume-Regel (CLAUDE.md #7):** nach Datei-Writes `find . -name '._*' -not -path '*/node_modules/*' -delete` im Projektroot.

---

### Task 0: Branch + Baseline

**Files:** keine (nur git)

- [ ] **Step 1: Branch anlegen** (Arbeit direkt im Haupt-Checkout; kein Worktree nötig, keine parallele Arbeit)

```bash
cd "/Volumes/4TB Shield/Vibe Coding Bootcamp/Projekte/Designbridge"
git checkout -b feat/figma-emitter-v2
```

- [ ] **Step 2: Baseline verifizieren**

Run: `cd web && npx vitest run` → Expected: 106 passed.
Run: `cd designbridge-plugin && npm run typecheck` → Expected: exit 0.
Run: `cd designbridge-plugin && npm run build` → Expected: „Build complete."

---

### Task 1: `pickTokenRefs` — Token-Slots mit Namen UND Wert

**Files:**
- Create: `web/src/lib/emit/pickTokenRefs.js`
- Test: `web/src/lib/emit/pickTokenRefs.test.js`

Gegenstück zu `pickTokens.js` (gleiche Slot-Logik/Regexe!), liefert aber je Farb-Slot `{ value, token }` — `token` = normalisierter Token-Name für die Style-Verknüpfung, `null` wenn der Slot auf einen Fallback-Wert zurückfällt.

- [ ] **Step 1: Failing Test schreiben**

```js
// web/src/lib/emit/pickTokenRefs.test.js
import { describe, it, expect } from 'vitest';
import { pickTokenRefs } from './pickTokenRefs.js';

const tokens = [
  { group: 'color', name: 'brand-primary', value: '#4263EB', source: { role: 'primary brand' } },
  { group: 'color', name: 'text-body', value: '#212529', source: { role: 'body text' } },
  { group: 'radius', name: 'radius-card', value: '8px', source: {} },
  { group: 'font', name: 'font-body', value: { fontSize: '15px', fontWeight: '400' }, source: {} },
];

describe('pickTokenRefs', () => {
  it('liefert Wert + Token-Name für gefundene Slots', () => {
    const r = pickTokenRefs(tokens);
    expect(r.primary).toEqual({ value: '#4263EB', token: 'brand-primary' });
    expect(r.text).toEqual({ value: '#212529', token: 'text-body' });
  });

  it('Fallback-Slots haben token: null', () => {
    const r = pickTokenRefs(tokens);
    expect(r.onPrimary).toEqual({ value: '#ffffff', token: null });
    expect(r.border.token).toBeNull();
  });

  it('nicht-Farb-Slots wie pickTokens (nackte Werte)', () => {
    const r = pickTokenRefs(tokens);
    expect(r.radius).toBe('8px');
    expect(r.fontSize).toBe('15px');
    expect(r.fontWeight).toBe('400');
  });

  it('leere Liste → komplette Fallbacks', () => {
    const r = pickTokenRefs([]);
    expect(r.primary).toEqual({ value: '#18181b', token: null });
    expect(r.radius).toBe('6px');
  });
});
```

- [ ] **Step 2: Test läuft rot**

Run: `cd web && npx vitest run src/lib/emit/pickTokenRefs.test.js`
Expected: FAIL („Cannot find module './pickTokenRefs.js'")

- [ ] **Step 3: Implementieren**

```js
// web/src/lib/emit/pickTokenRefs.js
// Wie pickTokens, aber Farb-Slots als { value, token } für die Figma-Style-Verknüpfung.
// Die Slot-Regexe MÜSSEN mit pickTokens.js identisch bleiben.
export function pickTokenRefs(tokens = []) {
  const colors = tokens.filter((t) => t.group === 'color');
  const byRole = (re) => colors.find((c) => re.test(String(c.source?.role ?? '')));
  const ref = (tk, fallback) => (tk ? { value: tk.value, token: tk.name } : { value: fallback, token: null });
  const radius = tokens.find((t) => t.group === 'radius')?.value;
  const font = tokens.find((t) => t.group === 'font')?.value;
  return {
    primary: ref(byRole(/primary|brand|accent/i) ?? colors[0], '#18181b'),
    onPrimary: ref(byRole(/on.?primary|on.?brand|button text/i), '#ffffff'),
    text: ref(byRole(/text|foreground|body/i), '#18181b'),
    surface: ref(byRole(/background|surface|card/i), '#ffffff'),
    surfaceMuted: ref(byRole(/muted|subtle|secondary background|secondary-bg/i), '#f4f4f5'),
    border: ref(byRole(/border|outline|divider/i), '#e4e4e7'),
    radius: radius ?? '6px',
    fontSize: font?.fontSize ?? '14px',
    fontWeight: font?.fontWeight ?? '500',
  };
}
```

- [ ] **Step 4: Test läuft grün**

Run: `cd web && npx vitest run src/lib/emit/pickTokenRefs.test.js` → Expected: 4 passed

- [ ] **Step 5: Commit**

```bash
git add web/src/lib/emit/pickTokenRefs.js web/src/lib/emit/pickTokenRefs.test.js
git commit -m "feat(emit): pickTokenRefs — Token-Slots mit Namen für Figma-Style-Verknüpfung"
```

---

### Task 2: `planFor` im Button-Template

**Files:**
- Modify: `web/src/lib/components/templates/button.js` (Objekt `buttonTemplate` um `planFor` erweitern)
- Test: `web/src/lib/components/templates/planFor.test.js` (neu; nimmt in Task 3 die anderen Templates mit auf)

Bauplan-Format (Spec): `box` = `{type:'box', layout:'row'|'column', padding:[t,r,b,l], radius:number, fill:ColorRef|null, stroke:ColorRef|null, children:[]}` · `text` = `{type:'text', content, fontSize:number, fontWeight:number, color:ColorRef}` · `ColorRef` = `{token:string|null, hex:string}`.

- [ ] **Step 1: Failing Test schreiben**

```js
// web/src/lib/components/templates/planFor.test.js
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
```

- [ ] **Step 2: Test läuft rot**

Run: `cd web && npx vitest run src/lib/components/templates/planFor.test.js`
Expected: FAIL („planFor is not a function")

- [ ] **Step 3: Implementieren** — in `button.js` ein gemeinsamer Helfer-Import + Methode. Helfer zuerst:

```js
// web/src/lib/components/templates/planHelpers.js  (NEU, wird von allen 4 Templates genutzt)
export const colorRef = (slot) => ({ token: slot.token, hex: slot.value });
export const px = (v, fallback) => {
  const n = parseFloat(v);
  return Number.isFinite(n) ? n : fallback;
};
export const weight = (v, fallback = 500) => {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : fallback;
};
export const textEl = (content, refs, colorSlot, overrides = {}) => ({
  type: 'text',
  content,
  fontSize: px(refs.fontSize, 14),
  fontWeight: weight(refs.fontWeight),
  color: colorRef(colorSlot),
  ...overrides,
});
export const box = (overrides = {}) => ({
  type: 'box', layout: 'row', padding: [0, 0, 0, 0], radius: 0,
  fill: null, stroke: null, children: [], ...overrides,
});
```

Dann in `button.js` (Import oben ergänzen, Methode ins `buttonTemplate`-Objekt neben `styleFor`):

```js
import { colorRef, px, textEl, box } from './planHelpers.js';

// … im buttonTemplate-Objekt:
  planFor(variant, r) {
    const base = box({ padding: [8, 16, 8, 16], radius: px(r.radius, 6) });
    if (variant === 'secondary')
      return { ...base, stroke: colorRef(r.border), children: [textEl('Button', r, r.text)] };
    if (variant === 'ghost')
      return { ...base, children: [textEl('Button', r, r.text)] };
    return { ...base, fill: colorRef(r.primary), children: [textEl('Button', r, r.onPrimary)] };
  },
```

- [ ] **Step 4: Tests grün + keine Regression**

Run: `cd web && npx vitest run` → Expected: alle grün (106 + 8 neue)

- [ ] **Step 5: Commit**

```bash
git add web/src/lib/components/templates/planHelpers.js web/src/lib/components/templates/button.js web/src/lib/components/templates/planFor.test.js
git commit -m "feat(templates): planFor für Button — Figma-Bauplan aus Token-Refs"
```

---

### Task 3: `planFor` für Card, Badge, Input

**Files:**
- Modify: `web/src/lib/components/templates/card.js`, `badge.js`, `input.js`
- Test: `web/src/lib/components/templates/planFor.test.js` (erweitern)

- [ ] **Step 1: Failing Tests ergänzen** (an bestehende Datei anhängen, Imports erweitern)

```js
import { cardTemplate } from './card.js';
import { badgeTemplate } from './badge.js';
import { inputTemplate } from './input.js';

describe('cardTemplate.planFor', () => {
  it('default: Spalten-Box, surface-Füllung, border-Rahmen, Titel+Text', () => {
    const plan = cardTemplate.planFor('default', refs);
    expect(plan.layout).toBe('column');
    expect(plan.padding).toEqual([16, 16, 16, 16]);
    expect(plan.fill).toEqual(toRef(refs.surface));
    expect(plan.stroke).toEqual(toRef(refs.border));
    expect(plan.children).toHaveLength(2);
    expect(plan.children[0].fontWeight).toBe(600); // Titel
    expect(plan.children[1].color).toEqual(toRef(refs.text));
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
```

- [ ] **Step 2: rot laufen lassen** — Run: `cd web && npx vitest run src/lib/components/templates/planFor.test.js` → FAIL

- [ ] **Step 3: Implementieren** (je Datei Import + Methode neben `styleFor`)

```js
// card.js
import { colorRef, px, textEl, box } from './planHelpers.js';
  planFor(_variant, r) {
    return box({
      layout: 'column', padding: [16, 16, 16, 16], radius: px(r.radius, 6),
      fill: colorRef(r.surface), stroke: colorRef(r.border),
      children: [
        textEl('Card-Titel', r, r.text, { fontWeight: 600 }),
        textEl('Beschreibender Text der Karte.', r, r.text),
      ],
    });
  },
```

```js
// badge.js
import { colorRef, textEl, box } from './planHelpers.js';
  planFor(variant, r) {
    const fill = variant === 'secondary' ? r.surfaceMuted : r.primary;
    const color = variant === 'secondary' ? r.text : r.onPrimary;
    return box({
      padding: [2, 8, 2, 8], radius: 9999, fill: colorRef(fill),
      children: [textEl('Badge', r, color, { fontSize: 12, fontWeight: 500 })],
    });
  },
```

```js
// input.js
import { colorRef, px, textEl, box } from './planHelpers.js';
  planFor(variant, r) {
    const fill = variant === 'disabled' ? r.surfaceMuted : r.surface;
    return box({
      padding: [8, 12, 8, 12], radius: px(r.radius, 6),
      fill: colorRef(fill), stroke: colorRef(r.border),
      children: [textEl('Wert eingeben…', r, r.text)],
    });
  },
```

- [ ] **Step 4: Alle Tests grün** — Run: `cd web && npx vitest run` → Expected: alle grün

- [ ] **Step 5: Commit**

```bash
git add web/src/lib/components/templates/{card,badge,input}.js web/src/lib/components/templates/planFor.test.js
git commit -m "feat(templates): planFor für Card, Badge, Input"
```

---

### Task 4: `emitFigmaComponents` — Inventar → `components[]`

**Files:**
- Create: `web/src/lib/emit/emitFigmaComponents.js`
- Test: `web/src/lib/emit/emitFigmaComponents.test.js`

- [ ] **Step 1: Failing Test schreiben**

```js
// web/src/lib/emit/emitFigmaComponents.test.js
import { describe, it, expect } from 'vitest';
import { emitFigmaComponents } from './emitFigmaComponents.js';

const result = {
  raw: {
    tokens: { colors: [{ hex: '#4263EB', role: 'primary' }], typography: [], spacing: [], border_radius: [], shadows: [] },
    atomics: [
      { name: 'Primary Button', variants: ['primary', 'ghost'], confidence: 'high', source: 'rules', notes: 'CTA' },
      { name: 'Avatar', variants: ['sm', 'lg'], confidence: 'low', source: 'ai', notes: 'rund' },
    ],
    components: [{ name: 'Card', variants: [], confidence: 'medium', source: null, notes: null }],
    patterns: [{ name: 'Navbar', variants: ['default'], confidence: 'high', source: 'rules', notes: 'Logo links' }],
  },
};

describe('emitFigmaComponents', () => {
  it('Template-Treffer bekommen Baupläne für ALLE Template-Varianten', () => {
    const out = emitFigmaComponents(result);
    const btn = out.find((c) => c.name === 'Primary Button');
    expect(btn.placeholder).toBe(false);
    expect(btn.kind).toBe('atomic');
    expect(btn.variants.map((v) => v.name)).toEqual(['primary', 'secondary', 'ghost']); // Template-Varianten, nicht Scan-Varianten
    expect(btn.variants[0].plan.type).toBe('box');
    expect(btn.variants[0].plan.fill).toEqual({ token: 'primary', hex: '#4263EB' });
  });

  it('ohne Template → placeholder mit Scan-Varianten und plan:null', () => {
    const out = emitFigmaComponents(result);
    const avatar = out.find((c) => c.name === 'Avatar');
    expect(avatar.placeholder).toBe(true);
    expect(avatar.variants).toEqual([{ name: 'sm', plan: null }, { name: 'lg', plan: null }]);
    expect(avatar.notes).toBe('rund');
  });

  it('kind wird je Liste gesetzt, Metadaten durchgereicht', () => {
    const out = emitFigmaComponents(result);
    expect(out.find((c) => c.name === 'Card').kind).toBe('component');
    const nav = out.find((c) => c.name === 'Navbar');
    expect(nav.kind).toBe('pattern');
    expect(nav.placeholder).toBe(true); // kein Navbar-Template
  });

  it('raw:null (Mock-Importe) → leere Liste', () => {
    expect(emitFigmaComponents({ raw: null })).toEqual([]);
    expect(emitFigmaComponents(undefined)).toEqual([]);
  });
});
```

- [ ] **Step 2: rot** — Run: `cd web && npx vitest run src/lib/emit/emitFigmaComponents.test.js` → FAIL

- [ ] **Step 3: Implementieren**

```js
// web/src/lib/emit/emitFigmaComponents.js
// Kanonisches Inventar + Tokens → components[] des Figma-Payloads v2.
// Template-Wissen bleibt in den Templates (planFor); hier nur Orchestrierung.
import { matchTemplate } from '../components/templates/registry.js';
import { normalizeTokens } from './normalizeTokens.js';
import { pickTokenRefs } from './pickTokenRefs.js';

const KINDS = [
  ['atomics', 'atomic'],
  ['components', 'component'],
  ['patterns', 'pattern'],
];

export function emitFigmaComponents(result) {
  const raw = result?.raw;
  if (!raw) return [];
  const refs = pickTokenRefs(normalizeTokens(raw.tokens));
  const out = [];
  for (const [rawKey, kind] of KINDS) {
    const items = Array.isArray(raw[rawKey]) ? raw[rawKey] : [];
    for (const item of items) {
      const tpl = matchTemplate(item.name);
      const meta = {
        name: item.name,
        kind,
        confidence: item.confidence ?? null,
        source: item.source ?? null,
        notes: item.notes ?? null,
      };
      if (tpl?.planFor) {
        out.push({
          ...meta,
          placeholder: false,
          variants: tpl.variants.map((v) => ({ name: v, plan: tpl.planFor(v, refs) })),
        });
      } else {
        const names = Array.isArray(item.variants) && item.variants.length ? item.variants : ['default'];
        out.push({
          ...meta,
          placeholder: true,
          variants: names.map((v) => ({ name: String(v), plan: null })),
        });
      }
    }
  }
  return out;
}
```

- [ ] **Step 4: grün** — Run: `cd web && npx vitest run` → Expected: alle grün

- [ ] **Step 5: Commit**

```bash
git add web/src/lib/emit/emitFigmaComponents.js web/src/lib/emit/emitFigmaComponents.test.js
git commit -m "feat(emit): emitFigmaComponents — Inventar zu Bauplaenen (Payload v2)"
```

---

### Task 5: `emitFigma` v2 + `buildExports` verdrahten

**Files:**
- Modify: `web/src/lib/emit/emitFigma.js`
- Modify: `web/src/lib/emit/index.js` (nur die `figma:`-Zeile in `buildExports`)
- Test: `web/src/lib/emit/emitFigma.test.js` (bestehende Tests anpassen + neue)

- [ ] **Step 1: Bestehende emitFigma-Tests lesen und anpassen + neue Fälle**

Bestehende Assertions auf `version: 1` auf `version: 2` heben. Neue Tests:

```js
// in web/src/lib/emit/emitFigma.test.js ergänzen
it('hängt components an und setzt version 2', () => {
  const comps = [{ name: 'Button', kind: 'atomic', confidence: null, source: null, notes: null, placeholder: false, variants: [] }];
  const parsed = JSON.parse(emitFigma([], comps));
  expect(parsed.version).toBe(2);
  expect(parsed.components).toHaveLength(1);
});

it('ohne components-Argument → leeres Array (abwärtskompatibel)', () => {
  const parsed = JSON.parse(emitFigma([]));
  expect(parsed.components).toEqual([]);
});
```

- [ ] **Step 2: rot** — Run: `cd web && npx vitest run src/lib/emit/emitFigma.test.js` → FAIL

- [ ] **Step 3: Implementieren**

```js
// emitFigma.js — Signatur & Umschlag ändern:
export function emitFigma(tokens, components = []) {
  // … colors/text-Schleife unverändert …
  return JSON.stringify(
    { designbridge: 'figma-import', version: 2, colors, text, components },
    null, 2
  ) + '\n';
}
```

```js
// index.js — in buildExports:
import { emitFigmaComponents } from './emitFigmaComponents.js';
// …
    figma: emitFigma(tokens, emitFigmaComponents(result)),
```

- [ ] **Step 4: ALLE Web-Tests grün** (auch Export.jsx-Tests, die das figma-Format rendern)

Run: `cd web && npx vitest run` → Expected: alle grün. Falls Snapshot-/Text-Assertions auf `"version": 1` existieren: auf 2 anpassen (bewusste Formatänderung).

- [ ] **Step 5: Commit**

```bash
git add web/src/lib/emit/emitFigma.js web/src/lib/emit/emitFigma.test.js web/src/lib/emit/index.js
git commit -m "feat(emit): Figma-Payload v2 — components[] im Umschlag"
```

---

### Task 6: Export-UI Hinweistext

**Files:**
- Modify: `web/src/pages/Export.jsx` (Zeile ~131, der „Schnellster Weg"-Absatz)

- [ ] **Step 1: Satz ergänzen** — im bestehenden Anleitungs-`<p>` hinter „Legt Paint- und Text-Styles an (Gruppe „DesignBridge/…")." erweitern zu:

```jsx
Legt Paint- und Text-Styles an (Gruppe „DesignBridge/…") und baut jetzt auch die
erkannten Komponenten als Figma-Komponenten auf einer eigenen Seite „🌉 DesignBridge".
v2: Farben + Typografie + Komponenten.
```

(Den alten Schluss-Satz „v1: Farben + Typografie." ersetzen.)

- [ ] **Step 2: Tests + Sichtprüfung** — Run: `cd web && npx vitest run` → grün. 

- [ ] **Step 3: Commit**

```bash
git add web/src/pages/Export.jsx
git commit -m "feat(export-ui): Hinweistext für Payload v2 (Komponenten)"
```

---

### Task 7: Plugin — Typen + `parsePayload` v2

**Files:**
- Modify: `designbridge-plugin/src/writer/parsePayload.ts`
- Modify: `designbridge-plugin/src/types/manifest.ts` (`ImportSummary` erweitern)

Kein Testrunner im Plugin (bewusst, wie Phase 5): Verifikation = `npm run typecheck` + `npm run build`. Funktionen bleiben `figma`-frei.

- [ ] **Step 1: Plan-Typen + Parsing in `parsePayload.ts` ergänzen**

```ts
// Neue Typen (unter ImportText einfügen):
export interface ColorRef { token: string | null; hex: string; }
export interface PlanText {
  type: 'text'; content: string; fontSize: number; fontWeight: number; color: ColorRef;
}
export interface PlanBox {
  type: 'box'; layout: 'row' | 'column';
  padding: [number, number, number, number]; radius: number;
  fill: ColorRef | null; stroke: ColorRef | null;
  children: PlanNode[];
}
export type PlanNode = PlanBox | PlanText;
export interface ImportVariant { name: string; plan: PlanBox | null; }
export interface ImportComponent {
  name: string; kind: 'atomic' | 'component' | 'pattern';
  confidence: string | null; source: string | null; notes: string | null;
  placeholder: boolean; variants: ImportVariant[];
}
// ImportPayload erweitern:
export interface ImportPayload {
  colors: ImportColor[];
  text: ImportText[];
  components: ImportComponent[];
}
```

```ts
// Validierungs-Helfer (rein, wirft nicht — ungültig ⇒ null):
function parseColorRef(v: unknown): ColorRef | null {
  if (!v || typeof v !== 'object') return null;
  const r = v as Record<string, unknown>;
  if (typeof r.hex !== 'string' || !r.hex) return null;
  return { token: typeof r.token === 'string' ? r.token : null, hex: r.hex };
}

function parsePlan(v: unknown): PlanBox | null {
  if (!v || typeof v !== 'object') return null;
  const r = v as Record<string, unknown>;
  if (r.type !== 'box') return null;
  const pad = Array.isArray(r.padding) && r.padding.length === 4 && r.padding.every((n) => typeof n === 'number')
    ? (r.padding as [number, number, number, number]) : [0, 0, 0, 0] as [number, number, number, number];
  const children: PlanNode[] = [];
  for (const c of Array.isArray(r.children) ? r.children : []) {
    if (c && typeof c === 'object' && (c as Record<string, unknown>).type === 'text') {
      const t = c as Record<string, unknown>;
      const color = parseColorRef(t.color);
      if (typeof t.content === 'string' && color) {
        children.push({
          type: 'text', content: t.content,
          fontSize: typeof t.fontSize === 'number' ? t.fontSize : 14,
          fontWeight: typeof t.fontWeight === 'number' ? t.fontWeight : 400,
          color,
        });
      }
    } else {
      const nested = parsePlan(c);
      if (nested) children.push(nested);
    }
  }
  return {
    type: 'box',
    layout: r.layout === 'column' ? 'column' : 'row',
    padding: pad,
    radius: typeof r.radius === 'number' ? r.radius : 0,
    fill: parseColorRef(r.fill),
    stroke: parseColorRef(r.stroke),
    children,
  };
}

const KINDS = ['atomic', 'component', 'pattern'] as const;

function parseComponents(raw: unknown): ImportComponent[] {
  const out: ImportComponent[] = [];
  for (const c of Array.isArray(raw) ? raw : []) {
    if (!c || typeof c !== 'object') continue;
    const r = c as Record<string, unknown>;
    if (typeof r.name !== 'string' || !r.name) continue;
    const kind = KINDS.includes(r.kind as (typeof KINDS)[number]) ? (r.kind as ImportComponent['kind']) : 'component';
    const variants: ImportVariant[] = [];
    for (const v of Array.isArray(r.variants) ? r.variants : []) {
      if (!v || typeof v !== 'object') continue;
      const vr = v as Record<string, unknown>;
      if (typeof vr.name !== 'string' || !vr.name) continue;
      variants.push({ name: vr.name, plan: parsePlan(vr.plan) });
    }
    out.push({
      name: r.name, kind,
      confidence: typeof r.confidence === 'string' ? r.confidence : null,
      source: typeof r.source === 'string' ? r.source : null,
      notes: typeof r.notes === 'string' ? r.notes : null,
      placeholder: r.placeholder === true,
      variants,
    });
  }
  return out;
}
```

In `parseImportPayload`: `const components = parseComponents(obj.components);` — Rückgabe `{ colors, text, components }`. Die Leer-Prüfung erweitern:

```ts
if (colors.length === 0 && text.length === 0 && components.length === 0) {
  throw new Error('Keine Farben, Textstile oder Komponenten im Export gefunden.');
}
```

- [ ] **Step 2: `ImportSummary` in `types/manifest.ts` erweitern**

```ts
export interface ImportSummary {
  colorsCreated: number;
  colorsUpdated: number;
  textCreated: number;
  textUpdated: number;
  componentsCreated: number;
  componentsUpdated: number;
  placeholders: number;
  skipped: string[];
}
```

**Folgeänderung:** `applyImport.ts` initialisiert `summary` — dort die drei neuen Felder mit `0` ergänzen, sonst Typfehler.

- [ ] **Step 3: Verifizieren** — Run: `cd designbridge-plugin && npm run typecheck` → 0 Fehler; `npm run build` → „Build complete."

- [ ] **Step 4: Commit**

```bash
git add designbridge-plugin/src/writer/parsePayload.ts designbridge-plugin/src/types/manifest.ts designbridge-plugin/src/writer/applyImport.ts
git commit -m "feat(plugin): Payload v2 parsen — Bauplan-Typen + erweiterte ImportSummary"
```

---

### Task 8: Plugin — `renderPlan.ts` (der Zeichner)

**Files:**
- Create: `designbridge-plugin/src/writer/renderPlan.ts`

- [ ] **Step 1: Implementieren**

```ts
// designbridge-plugin/src/writer/renderPlan.ts
// Generischer Bauplan-Renderer: PlanBox → FrameNode. Kennt keine Komponenten-Namen.
// VORBEREITUNG: in applyImport.ts `export` vor `nearestWeightStyle` setzen (existiert dort seit Phase 5).
import { hexToRgb, PlanBox, PlanNode, ColorRef } from './parsePayload';
import { nearestWeightStyle } from './applyImport';

const STYLE_PREFIX = 'DesignBridge/Color/';

function solidPaint(ref: ColorRef): SolidPaint {
  return { type: 'SOLID', color: hexToRgb(ref.hex) };
}

/** Fill/Stroke setzen: verknüpfter Style wenn Token bekannt, sonst Hex. */
async function applyFill(
  node: FrameNode | TextNode,
  ref: ColorRef,
  paintByName: Map<string, PaintStyle>
): Promise<void> {
  const style = ref.token ? paintByName.get(STYLE_PREFIX + ref.token) : undefined;
  if (style) {
    await node.setFillStyleIdAsync(style.id);
    return;
  }
  node.fills = [solidPaint(ref)];
}

async function renderText(
  el: Extract<PlanNode, { type: 'text' }>,
  paintByName: Map<string, PaintStyle>,
  warnings: string[]
): Promise<TextNode> {
  const t = figma.createText();
  const styleName = nearestWeightStyle(el.fontWeight);
  try {
    await figma.loadFontAsync({ family: 'Inter', style: styleName });
    t.fontName = { family: 'Inter', style: styleName };
  } catch {
    await figma.loadFontAsync({ family: 'Inter', style: 'Regular' });
    t.fontName = { family: 'Inter', style: 'Regular' };
    warnings.push(`Schrift Inter ${styleName} nicht ladbar — Regular verwendet.`);
  }
  t.characters = el.content;
  t.fontSize = el.fontSize;
  await applyFill(t, el.color, paintByName);
  return t;
}

export async function renderPlan(
  plan: PlanBox,
  paintByName: Map<string, PaintStyle>,
  warnings: string[]
): Promise<FrameNode> {
  const frame = figma.createFrame();
  frame.layoutMode = plan.layout === 'column' ? 'VERTICAL' : 'HORIZONTAL';
  frame.primaryAxisSizingMode = 'AUTO';
  frame.counterAxisSizingMode = 'AUTO';
  frame.counterAxisAlignItems = 'CENTER';
  frame.itemSpacing = 8;
  const [pt, pr, pb, pl] = plan.padding;
  frame.paddingTop = pt; frame.paddingRight = pr; frame.paddingBottom = pb; frame.paddingLeft = pl;
  frame.cornerRadius = plan.radius;
  frame.fills = [];
  if (plan.fill) await applyFill(frame, plan.fill, paintByName);
  if (plan.stroke) {
    frame.strokes = [solidPaint(plan.stroke)];
    frame.strokeWeight = 1;
  }
  for (const child of plan.children) {
    const node = child.type === 'text'
      ? await renderText(child, paintByName, warnings)
      : await renderPlan(child, paintByName, warnings);
    frame.appendChild(node);
  }
  return frame;
}
```

**Hinweis:** In `renderPlan.ts` das Font-Fallback (`renderText`) nutzt `nearestWeightStyle(el.fontWeight)`, das aus `applyImport.ts` importiert wird — in `applyImport.ts` nur das Schlüsselwort `export` vor die bestehende Funktion setzen, sonst nichts ändern.

- [ ] **Step 2: Verifizieren** — Run: `cd designbridge-plugin && npm run typecheck` → 0 Fehler; `npm run build` → „Build complete."

- [ ] **Step 3: Commit**

```bash
git add designbridge-plugin/src/writer/renderPlan.ts designbridge-plugin/src/writer/applyImport.ts
git commit -m "feat(plugin): renderPlan — generischer Bauplan-Renderer mit Style-Verknüpfung"
```

---

### Task 9: Plugin — `buildComponents.ts` (Sets, Platzhalter, Upsert)

**Files:**
- Create: `designbridge-plugin/src/writer/buildComponents.ts`

- [ ] **Step 1: Implementieren**

```ts
// designbridge-plugin/src/writer/buildComponents.ts
// Baut aus ImportComponent[] echte Figma-Komponenten in die Sektions-Frames.
// Create-or-update per Name: bestehende Sets behalten ihre Identität.
import { ImportComponent } from './parsePayload';
import { renderPlan } from './renderPlan';

export interface BuildResult {
  created: number;
  updated: number;
  placeholders: number;
  skipped: string[];
}

export interface SectionFrames {
  atomic: FrameNode;
  component: FrameNode;
  pattern: FrameNode;
}

const BADGE_YELLOW: SolidPaint = { type: 'SOLID', color: { r: 1, g: 0.95, b: 0.75 } };
const BADGE_TEXT: SolidPaint = { type: 'SOLID', color: { r: 0.6, g: 0.45, b: 0.02 } };
const MUTED_TEXT: SolidPaint = { type: 'SOLID', color: { r: 0.4, g: 0.42, b: 0.45 } };

async function loadInter(style: string): Promise<FontName> {
  try {
    await figma.loadFontAsync({ family: 'Inter', style });
    return { family: 'Inter', style };
  } catch {
    await figma.loadFontAsync({ family: 'Inter', style: 'Regular' });
    return { family: 'Inter', style: 'Regular' };
  }
}

async function makeText(content: string, size: number, style: string, fill?: SolidPaint): Promise<TextNode> {
  const t = figma.createText();
  t.fontName = await loadInter(style);
  t.characters = content;
  t.fontSize = size;
  if (fill) t.fills = [fill];
  return t;
}

/** Platzhalter-Karte: Name, Varianten, Notizen, gelbes Badge. */
async function buildPlaceholderFrame(comp: ImportComponent): Promise<FrameNode> {
  const frame = figma.createFrame();
  frame.layoutMode = 'VERTICAL';
  frame.primaryAxisSizingMode = 'AUTO';
  frame.counterAxisSizingMode = 'AUTO';
  frame.itemSpacing = 6;
  frame.paddingTop = 12; frame.paddingRight = 12; frame.paddingBottom = 12; frame.paddingLeft = 12;
  frame.cornerRadius = 6;
  frame.fills = [{ type: 'SOLID', color: { r: 0.97, g: 0.98, b: 0.98 } }];
  frame.strokes = [{ type: 'SOLID', color: { r: 0.8, g: 0.83, b: 0.85 } }];
  frame.strokeWeight = 1;
  frame.dashPattern = [4, 4];

  frame.appendChild(await makeText(comp.name, 13, 'Semi Bold'));
  const variantNames = comp.variants.map((v) => v.name).join(', ') || 'default';
  frame.appendChild(await makeText(`Varianten: ${variantNames}`, 10, 'Regular', MUTED_TEXT));
  if (comp.notes) frame.appendChild(await makeText(`„${comp.notes}"`, 10, 'Regular', MUTED_TEXT));

  const badge = figma.createFrame();
  badge.layoutMode = 'HORIZONTAL';
  badge.primaryAxisSizingMode = 'AUTO';
  badge.counterAxisSizingMode = 'AUTO';
  badge.paddingTop = 2; badge.paddingRight = 6; badge.paddingBottom = 2; badge.paddingLeft = 6;
  badge.cornerRadius = 3;
  badge.fills = [BADGE_YELLOW];
  badge.appendChild(await makeText('Vorlage fehlt — Platzhalter', 9, 'Medium', BADGE_TEXT));
  frame.appendChild(badge);
  return frame;
}

function findByName(section: FrameNode, name: string): SceneNode | undefined {
  return section.children.find((c) => c.name === name);
}

export async function buildComponents(
  components: ImportComponent[],
  sections: SectionFrames,
  paintByName: Map<string, PaintStyle>
): Promise<BuildResult> {
  const result: BuildResult = { created: 0, updated: 0, placeholders: 0, skipped: [] };

  for (const comp of components) {
    const section = sections[comp.kind];
    try {
      if (comp.placeholder) {
        // ── Platzhalter: einzelne Komponente ──
        const frame = await buildPlaceholderFrame(comp);
        const fresh = figma.createComponentFromNode(frame);
        fresh.name = comp.name;
        const existing = findByName(section, comp.name);
        if (existing) {
          section.insertChild(section.children.indexOf(existing), fresh);
          existing.remove();
          result.updated += 1;
        } else {
          section.appendChild(fresh);
          result.created += 1;
        }
        result.placeholders += 1;
        continue;
      }

      // ── Template-Komponente: Component Set mit Varianten ──
      const variantComponents: ComponentNode[] = [];
      for (const v of comp.variants) {
        if (!v.plan) {
          result.skipped.push(`${comp.name}/${v.name}: ungültiger Bauplan`);
          continue;
        }
        const frame = await renderPlan(v.plan, paintByName, result.skipped);
        const c = figma.createComponentFromNode(frame);
        c.name = `Variant=${v.name}`;
        variantComponents.push(c);
      }
      if (variantComponents.length === 0) {
        result.skipped.push(`${comp.name}: keine gültigen Varianten`);
        continue;
      }

      const existing = findByName(section, comp.name);
      if (existing && existing.type === 'COMPONENT_SET') {
        // Update: neue Varianten in bestehendes Set, alte entfernen (Set-Identität bleibt)
        const old = [...existing.children];
        for (const c of variantComponents) existing.appendChild(c);
        for (const o of old) o.remove();
        result.updated += 1;
      } else {
        if (existing) existing.remove(); // Strukturwechsel (z. B. war Platzhalter)
        const set = figma.combineAsVariants(variantComponents, section);
        set.name = comp.name;
        result.created += 1;
      }
    } catch (err) {
      result.skipped.push(`${comp.name}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  return result;
}
```

- [ ] **Step 2: Verifizieren** — Run: `cd designbridge-plugin && npm run typecheck` → 0 Fehler; `npm run build` → „Build complete."

- [ ] **Step 3: Commit**

```bash
git add designbridge-plugin/src/writer/buildComponents.ts
git commit -m "feat(plugin): buildComponents — Component Sets, Platzhalter, Upsert per Name"
```

**NACHTRAG (Task-9-Quality-Review, per Fix-Commit umgesetzt — bei Wiederverwendung dieses Code-Blocks beachten):** Der Block oben hat zwei Lücken: (1) **Waisen-Cleanup** — bereits erzeugte Variant-ComponentNodes bzw. der halbe Platzhalter-Frame der aktuellen Komponente müssen im `catch` per `.remove()` entfernt werden (`variantComponents` vors try ziehen), sonst bleiben publishable Waisen im Assets-Panel; (2) **Positions-Erhalt beim Strukturwechsel** Platzhalter→Set: Index vor `existing.remove()` merken und das neue Set per `insertChild(idx, set)` an die alte Position setzen.

---

### Task 10: Plugin — `upsertPage.ts` (Sticker-Sheet-Seite)

**Files:**
- Create: `designbridge-plugin/src/writer/upsertPage.ts`

- [ ] **Step 1: Implementieren**

```ts
// designbridge-plugin/src/writer/upsertPage.ts
// Findet/erzeugt die Seite „🌉 DesignBridge" mit drei Auto-Layout-Sektionen.
import type { SectionFrames } from './buildComponents';

export const PAGE_NAME = '🌉 DesignBridge';

const SECTIONS: Array<{ key: keyof SectionFrames; title: string }> = [
  { key: 'atomic', title: 'Atomics' },
  { key: 'component', title: 'Components' },
  { key: 'pattern', title: 'Patterns' },
];

async function sectionHeading(title: string): Promise<TextNode> {
  await figma.loadFontAsync({ family: 'Inter', style: 'Bold' });
  const t = figma.createText();
  t.fontName = { family: 'Inter', style: 'Bold' };
  t.characters = title;
  t.fontSize = 20;
  return t;
}

function findSection(page: PageNode, title: string): FrameNode | undefined {
  const node = page.children.find((c) => c.type === 'FRAME' && c.name === `DB/${title}`);
  return node as FrameNode | undefined;
}

async function createSection(page: PageNode, title: string): Promise<FrameNode> {
  const frame = figma.createFrame();
  frame.name = `DB/${title}`;
  frame.layoutMode = 'VERTICAL';
  frame.primaryAxisSizingMode = 'AUTO';
  frame.counterAxisSizingMode = 'AUTO';
  frame.itemSpacing = 24;
  frame.paddingTop = 24; frame.paddingRight = 24; frame.paddingBottom = 24; frame.paddingLeft = 24;
  frame.fills = [];
  frame.appendChild(await sectionHeading(title));
  page.appendChild(frame);
  return frame;
}

export async function upsertPage(): Promise<{ page: PageNode; sections: SectionFrames }> {
  let page = figma.root.children.find((p) => p.name === PAGE_NAME);
  if (!page) {
    page = figma.createPage();
    page.name = PAGE_NAME;
  }
  await page.loadAsync();

  const sections = {} as SectionFrames;
  for (const s of SECTIONS) {
    sections[s.key] = findSection(page, s.title) ?? (await createSection(page, s.title));
  }
  return { page, sections };
}

/** Sektionen untereinander stapeln (nach dem Bauen, wenn Auto-Layout Größen kennt). */
export function layoutSections(sections: SectionFrames): void {
  let y = 0;
  for (const s of SECTIONS) {
    const frame = sections[s.key];
    // Sektion ausblenden, wenn außer der Überschrift nichts drin ist
    frame.visible = frame.children.length > 1;
    if (!frame.visible) continue;
    frame.x = 0;
    frame.y = y;
    y += frame.height + 64;
  }
}
```

**Achtung `figma.createComponentFromNode` in Task 9 hängt Komponenten zunächst dort an, wo der Quell-Frame liegt** — `createFrame()` erzeugt auf der aktuellen Seite. In Task 11 wird deshalb VOR dem Bauen `figma.currentPage = page` gesetzt (bzw. `figma.setCurrentPageAsync(page)`), damit alles direkt auf der DesignBridge-Seite entsteht.

- [ ] **Step 2: Verifizieren** — Run: `cd designbridge-plugin && npm run typecheck` → 0 Fehler; `npm run build` → „Build complete."

- [ ] **Step 3: Commit**

```bash
git add designbridge-plugin/src/writer/upsertPage.ts
git commit -m "feat(plugin): upsertPage — Sticker-Sheet-Seite mit Sektionen"
```

---

### Task 11: Plugin — `main.ts` + `ui.ts` verdrahten

**Files:**
- Modify: `designbridge-plugin/src/main.ts` (IMPORT-Zweig)
- Modify: `designbridge-plugin/src/ui.ts` (IMPORT_DONE-Statuszeile, ~Zeile 175)

- [ ] **Step 1: `main.ts` — IMPORT-Zweig erweitern**

```ts
// Imports oben ergänzen:
import { buildComponents } from './writer/buildComponents';
import { upsertPage, layoutSections } from './writer/upsertPage';

// Der IMPORT-Zweig wird zu:
  if (msg.type === 'IMPORT') {
    try {
      const payload = parseImportPayload(msg.json);
      postStatus('Schreibe Styles nach Figma…');
      const summary = await applyImport(payload);

      if (payload.components.length > 0) {
        postStatus('Baue Komponenten…');
        const { page, sections } = await upsertPage();
        await figma.setCurrentPageAsync(page);
        const paintStyles = await figma.getLocalPaintStylesAsync();
        const paintByName = new Map(paintStyles.map((s) => [s.name, s]));
        const res = await buildComponents(payload.components, sections, paintByName);
        layoutSections(sections);
        summary.componentsCreated = res.created;
        summary.componentsUpdated = res.updated;
        summary.placeholders = res.placeholders;
        summary.skipped.push(...res.skipped);
      }

      const done: SandboxMessage = { type: 'IMPORT_DONE', summary };
      figma.ui.postMessage(done);
    } catch (err) {
      // … unverändert …
    }
    return;
  }
```

- [ ] **Step 2: `ui.ts` — Statuszeile erweitern** (im `IMPORT_DONE`-Handler, `parts`-Array ergänzen)

```ts
    const parts = [
      `${s.colorsCreated} Farben neu`,
      s.colorsUpdated ? `${s.colorsUpdated} Farben aktualisiert` : '',
      `${s.textCreated} Textstile neu`,
      s.textUpdated ? `${s.textUpdated} Textstile aktualisiert` : '',
      s.componentsCreated ? `${s.componentsCreated} Komponenten neu` : '',
      s.componentsUpdated ? `${s.componentsUpdated} Komponenten aktualisiert` : '',
      s.placeholders ? `${s.placeholders} Platzhalter` : '',
    ].filter(Boolean);
```

- [ ] **Step 3: Verifizieren** — Run: `cd designbridge-plugin && npm run typecheck` → 0 Fehler; `npm run build` → „Build complete."

- [ ] **Step 4: Commit**

```bash
git add designbridge-plugin/src/main.ts designbridge-plugin/src/ui.ts
git commit -m "feat(plugin): Komponenten-Bau im IMPORT-Flow + Statuszeile"
```

---

### Task 12: Full-Verify + Browser-Smoke + Robs Figma-Test

**Files:** keine (Verifikation)

- [ ] **Step 1: Komplette Suite**

```bash
cd "/Volumes/4TB Shield/Vibe Coding Bootcamp/Projekte/Designbridge"
npm run test:server          # Expected: 77/77
cd web && npx vitest run     # Expected: alle grün (>106)
cd ../designbridge-plugin && npm run typecheck && npm run build
find .. -name '._*' -not -path '*/node_modules/*' -not -path '*/.git/*' -delete
```

- [ ] **Step 2: Browser-Smoke (Payload-Prüfung)** — Backend `PORT=3047 node server/index.js` (bei leeren API-Credits `DEMO_FALLBACK=1` davor) + `cd web && npm run dev`. Bild importieren → Export → Format „Nach Figma (Plugin)" → Payload-Vorschau prüfen: `"version": 2`, `components`-Array mit `plan`-Objekten (Button) und `placeholder: true`-Einträgen (z. B. Navbar). Keine Konsolenfehler.

- [ ] **Step 3: Figma-Laufzeit-Test (NUR ROB — Session pausiert hier und übergibt an Rob)** — „An Figma senden" → Figma-Plugin → „Aus DesignBridge übernehmen". Erwartung: Seite „🌉 DesignBridge" mit Sektionen; Button als Component Set (3 Varianten im Dropdown umschaltbar), Card/Badge/Input ebenso; Platzhalter-Karten mit gelbem Badge; Farb-Test: Paint-Style `DesignBridge/Color/<primary-token>` ändern ⇒ Button-Füllung folgt. Zweiter Klick (Re-Import) ⇒ „aktualisiert" statt Duplikate.

- [ ] **Step 4: Merge + Push (mit Robs OK)**

```bash
git checkout main && git merge --ff-only feat/figma-emitter-v2
git push   # NUR mit Robs explizitem OK
```
