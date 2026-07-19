# Figma-Emit-Skalierung 1:1 (Scheibe 3) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Der Figma-Emitter gibt Bausteine + Templates in der **Original-Screenshot-Auflösung** aus (1:1, statt auf 1024 gestaucht). Root Cause: Canvas fix 1024 + Bausteine bei ~Vollauflösungs-px → Faktor `image_width/1024` Mismatch → Stauchung/Clipping.

**Architecture:** Zwei Teile im Figma-Emit-Pfad (`web/`): (A) `canvas = raw.meta.image_width/height` statt fix 1024; (B) `scalePlan(plan, factor)` skaliert jede interpretations-abgeleitete Baustein-Variante mit bbox auf ihre wahre Bild-Pixelgröße (`factor = bbox.w·image_width / naturalWidth`, breitengetrieben, Aspekt erhalten). `htmlToPlan` gibt `naturalWidth` additiv zurück. **Tailwind-Emitter (`planToJsx`) bleibt unberührt; kein Plugin-Change.**

**Tech Stack:** JS (ESM), Vitest (jsdom global — HAT KEINE Layout-Engine: `getBoundingClientRect` → 0, daher `naturalWidth=0` → `factor=1` → `scalePlan` ist im Unit-Test No-op; die Laufzeitwirkung von Teil B beweist die **Figma-E2E**).

**Kontext-Dateien (vor dem Bau lesen):**
- Spec: `docs/superpowers/specs/2026-07-19-figma-emit-scaling-design.md`
- `web/src/lib/emit/emitFigmaComponents.js` (canvas + Zweige ai-interpreted / composed / composed-spliced)
- `web/src/lib/emit/composePlan.js` (nutzt canvas; **unverändert**)
- `web/src/lib/emit/htmlToPlan.js` (Rückgabe erweitern; `unionRect` existiert dort)
- `web/src/lib/previewWidth.js` (`PREVIEW_VIRTUAL_WIDTH = 1024`)

**Plan-Knoten-Vertrag** (box/text/svg/component-ref) siehe `htmlToPlan.js` — Felder wie in Scheibe 1/2.

---

## Task 1: `scalePlan` + `scaleFactor` (neue Datei, reine Funktionen)

**Files:**
- Create: `web/src/lib/emit/scalePlan.js`
- Test: `web/src/lib/emit/scalePlan.test.js`

- [ ] **Step 1: Failing-Test schreiben** (`web/src/lib/emit/scalePlan.test.js`)

```js
import { describe, it, expect } from 'vitest';
import { scalePlan, scaleFactor } from './scalePlan.js';

function box(o = {}) {
  return { type: 'box', layout: 'row', padding: [0, 0, 0, 0], radius: 0, fill: null, stroke: null,
    strokeWeight: 1, gap: 0, width: null, height: null, primaryAlign: 'MIN', counterAlign: 'MIN', children: [], ...o };
}
function text(o = {}) {
  return { type: 'text', content: 'x', fontSize: 16, fontWeight: 400, color: { hex: '#000', token: null }, align: 'left', lineHeight: null, ...o };
}

describe('scaleFactor', () => {
  it('slotWidth/naturalWidth, Guards → 1', () => {
    expect(scaleFactor({ w: 0.25 }, 2000, 250)).toBe(2); // 0.25*2000=500 /250
    expect(scaleFactor({ w: 0.25 }, 2000, 0)).toBe(1);    // naturalWidth 0
    expect(scaleFactor(null, 2000, 250)).toBe(1);
    expect(scaleFactor({ w: 0.25 }, undefined, 250)).toBe(1);
  });
});

describe('scalePlan', () => {
  it('factor 1 / ungültig → unveränderter Plan', () => {
    const p = box({ width: 100 });
    expect(scalePlan(p, 1)).toBe(p);
    expect(scalePlan(p, 0)).toBe(p);
    expect(scalePlan(p, NaN)).toBe(p);
  });

  it('box: width/height/padding/gap/radius/strokeWeight/absolute skaliert; null bleibt null', () => {
    const p = box({ width: 100, height: null, padding: [4, 8, 4, 8], gap: 10, radius: 6,
      stroke: { hex: '#000', token: null }, strokeWeight: 1, absolute: { x: -5, y: 20, width: 100, height: 50 } });
    const r = scalePlan(p, 2);
    expect(r.width).toBe(200);
    expect(r.height).toBeNull();
    expect(r.padding).toEqual([8, 16, 8, 16]);
    expect(r.gap).toBe(20);
    expect(r.radius).toBe(12);
    expect(r.strokeWeight).toBe(2);
    expect(r.absolute).toEqual({ x: -10, y: 40, width: 200, height: 100 });
    expect(p.width).toBe(100); // Original unangetastet (rein)
  });

  it('strokeWeight-Floor 1 beim Runterskalieren', () => {
    const r = scalePlan(box({ stroke: { hex: '#000', token: null }, strokeWeight: 1 }), 0.4);
    expect(r.strokeWeight).toBe(1);
  });

  it('text: fontSize/lineHeight skaliert, null lineHeight bleibt null, Rest unverändert', () => {
    const r = scalePlan(text({ fontSize: 16, lineHeight: 24, fontWeight: 700, content: 'Hi' }), 2);
    expect(r.fontSize).toBe(32);
    expect(r.lineHeight).toBe(48);
    expect(r.fontWeight).toBe(700);
    expect(r.content).toBe('Hi');
    expect(scalePlan(text({ fontSize: 10, lineHeight: null }), 2).lineHeight).toBeNull();
  });

  it('svg: nur öffnender-Tag width/height skaliert, viewBox unverändert, % übersprungen', () => {
    const r = scalePlan({ type: 'svg', markup: '<svg width="24" height="24" viewBox="0 0 24 24"><rect width="10" height="10"/></svg>' }, 2);
    expect(r.markup).toContain('width="48"');
    expect(r.markup).toContain('height="48"');
    expect(r.markup).toContain('viewBox="0 0 24 24"');
    expect(r.markup).toContain('<rect width="10" height="10"/>'); // innerer Tag unberührt
    const pct = scalePlan({ type: 'svg', markup: '<svg width="100%" height="24"></svg>' }, 2);
    expect(pct.markup).toContain('width="100%"'); // übersprungen
    expect(pct.markup).toContain('height="48"');
  });

  it('component-ref: absolute + fallback rekursiv', () => {
    const r = scalePlan({ type: 'component-ref', name: 'Btn', variant: null,
      absolute: { x: 10, y: 10, width: 40, height: 20 }, fallback: box({ width: 40, padding: [2, 2, 2, 2] }) }, 3);
    expect(r.absolute).toEqual({ x: 30, y: 30, width: 120, height: 60 });
    expect(r.fallback.width).toBe(120);
    expect(r.fallback.padding).toEqual([6, 6, 6, 6]);
    expect(r.name).toBe('Btn');
  });

  it('verschachtelt tief skaliert', () => {
    const r = scalePlan(box({ gap: 5, children: [text({ fontSize: 10 }), box({ width: 30, children: [text({ fontSize: 8 })] })] }), 2);
    expect(r.gap).toBe(10);
    expect(r.children[0].fontSize).toBe(20);
    expect(r.children[1].width).toBe(60);
    expect(r.children[1].children[0].fontSize).toBe(16);
  });
});
```

- [ ] **Step 2: Test → rot**

Run: `cd web && npx vitest run src/lib/emit/scalePlan.test.js`
Expected: FAIL — Modul/Funktionen fehlen.

- [ ] **Step 3: `scalePlan.js` implementieren**

```js
// Figma-Emit-Skalierung (Spec: docs/superpowers/specs/2026-07-19-figma-emit-scaling-design.md).
// Skaliert einen plan-Baum uniform auf die wahre Bild-Pixelgröße (Emit-Zeit-Transform des FIGMA-
// Emitters; der Tailwind-Emitter skaliert NICHT). Reine, rekursive Funktion — kein DOM. Skaliert
// px-Felder: box width/height/padding/gap/radius/strokeWeight/absolute · text fontSize/lineHeight/
// absolute · svg öffnender-Tag width/height (NICHT viewBox)/absolute · component-ref absolute/fallback.

const s = (v, f) => Math.round(v * f);
const sMin1 = (v, f) => Math.max(1, Math.round(v * f));

/** slot/natural, breitengetrieben. bbox.w ist auf das Gesamtbild normiert (0..1). Guards → 1. */
export function scaleFactor(bbox, imageWidth, naturalWidth) {
  if (!bbox || !Number.isFinite(imageWidth) || !Number.isFinite(naturalWidth)) return 1;
  const slotWidth = bbox.w * imageWidth;
  if (!(slotWidth > 0) || !(naturalWidth > 0)) return 1;
  return slotWidth / naturalWidth;
}

function scaleAbsolute(a, f) {
  return { x: s(a.x, f), y: s(a.y, f), width: sMin1(a.width, f), height: sMin1(a.height, f) };
}

function scaleSvgMarkup(markup, f) {
  const gt = String(markup).indexOf('>');
  if (gt === -1) return markup;
  const tag = markup.slice(0, gt).replace(
    /(\s(?:width|height)=")(\d*\.?\d+)(px)?(")/g,
    (_m, pre, num, unit, post) => `${pre}${Math.max(1, Math.round(parseFloat(num) * f))}${unit || ''}${post}`,
  );
  return tag + markup.slice(gt);
}

function scaleNode(node, f) {
  if (!node || typeof node !== 'object') return node;
  if (node.type === 'text') {
    const out = { ...node, fontSize: sMin1(node.fontSize, f) };
    if (node.lineHeight != null) out.lineHeight = sMin1(node.lineHeight, f);
    if (node.absolute) out.absolute = scaleAbsolute(node.absolute, f);
    return out;
  }
  if (node.type === 'svg') {
    const out = { ...node, markup: scaleSvgMarkup(node.markup, f) };
    if (node.absolute) out.absolute = scaleAbsolute(node.absolute, f);
    return out;
  }
  if (node.type === 'component-ref') {
    const out = { ...node };
    if (node.absolute) out.absolute = scaleAbsolute(node.absolute, f);
    if (node.fallback) out.fallback = scaleNode(node.fallback, f);
    return out;
  }
  // box
  const out = { ...node };
  if (node.width != null) out.width = sMin1(node.width, f);
  if (node.height != null) out.height = sMin1(node.height, f);
  out.padding = (node.padding || [0, 0, 0, 0]).map((p) => s(p, f));
  out.gap = s(node.gap, f);
  out.radius = s(node.radius, f);
  out.strokeWeight = sMin1(node.strokeWeight ?? 1, f);
  if (node.absolute) out.absolute = scaleAbsolute(node.absolute, f);
  out.children = (node.children || []).map((c) => scaleNode(c, f));
  return out;
}

/** Skaliert den plan-Baum um `factor`. factor===1 / ungültig (≤0, nicht endlich) → Original (Identität). */
export function scalePlan(node, factor) {
  if (!Number.isFinite(factor) || factor <= 0 || factor === 1) return node;
  return scaleNode(node, factor);
}
```

- [ ] **Step 4: Test → grün**

Run: `cd web && npx vitest run src/lib/emit/scalePlan.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add web/src/lib/emit/scalePlan.js web/src/lib/emit/scalePlan.test.js
git commit -m "feat(emit): scalePlan + scaleFactor für Figma-1:1-Skalierung (Scheibe 3, TDD)"
```

---

## Task 2: `htmlToPlan` gibt `naturalWidth` additiv zurück (nur Erfolgspfad)

**Files:**
- Modify: `web/src/lib/emit/htmlToPlan.js`
- Test: `web/src/lib/emit/htmlToPlan.test.js`

- [ ] **Step 1: Failing-Test ergänzen** (ans Ende von `htmlToPlan.test.js`)

```js
describe('htmlToPlan — naturalWidth', () => {
  it('Erfolgspfad liefert naturalWidth aus der gemessenen Wurzel', () => {
    const el = document.createElement('div');
    el.innerHTML = '<div style="padding:8px">Hallo</div>';
    // getBoundingClientRect in jsdom → 0; wir mocken die Messung der Wurzel.
    const origAppend = document.body.appendChild.bind(document.body);
    const spy = vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({ width: 320, height: 40, left: 0, top: 0, right: 320, bottom: 40 });
    const { plan, naturalWidth } = htmlToPlan('<div style="padding:8px">Hallo</div>');
    expect(plan).not.toBeNull();
    expect(naturalWidth).toBe(320);
    spy.mockRestore();
  });

  it('null-Plan-Rückgaben bleiben zweifeldrig (kein naturalWidth-Bruch)', () => {
    expect(htmlToPlan('')).toEqual({ plan: null, warnings: [] });
  });
});
```

> `vi` importieren, falls die Datei es nicht schon tut: `import { describe, it, expect, vi } from 'vitest';` (bestehenden Import erweitern).

- [ ] **Step 2: Test → rot**

Run: `cd web && npx vitest run src/lib/emit/htmlToPlan.test.js`
Expected: FAIL — `naturalWidth` ist `undefined`.

- [ ] **Step 3: Implementieren** — in `web/src/lib/emit/htmlToPlan.js`, im **Erfolgs-Rückgabepfad** (nach dem `plan.type !== 'box'`-Wrap, direkt vor `return { plan, warnings: Array.from(warnings) };`):

```js
    const naturalWidth = roots.length === 1
      ? Math.round(roots[0].getBoundingClientRect().width)
      : Math.round(unionRect(roots.map((r) => r.getBoundingClientRect()))?.width || 0);

    return { plan, warnings: Array.from(warnings), naturalWidth };
```

> Die frühen `return { plan: null, warnings: [] }` / `{ plan: null, warnings: Array.from(warnings) }` (leeres/kaputtes HTML, roots.length===0, catch) bleiben UNVERÄNDERT — additiv nur im Erfolgspfad, damit die `.toEqual({ plan: null, warnings: [] })`-Bestandstests (htmlToPlan.test.js) grün bleiben. Nutzer, die `naturalWidth` bei null-Plan lesen, bekommen `undefined` — der Aufrufer skaliert null-Pläne ohnehin nicht.

- [ ] **Step 4: Test → grün**

Run: `cd web && npx vitest run src/lib/emit/htmlToPlan.test.js`
Expected: PASS (inkl. der 6 bestehenden `.toEqual({plan:null,warnings:[]})`-Tests — unberührt).

- [ ] **Step 5: Commit**

```bash
git add web/src/lib/emit/htmlToPlan.js web/src/lib/emit/htmlToPlan.test.js
git commit -m "feat(emit): htmlToPlan gibt naturalWidth additiv zurück (Scheibe 3)"
```

---

## Task 3: `emitFigmaComponents` verdrahten (canvas=Bildmaße + scalePlan)

**Files:**
- Modify: `web/src/lib/emit/emitFigmaComponents.js`
- Test: `web/src/lib/emit/emitFigmaComponents.test.js` (Teil A + Fallback) + neue Datei `web/src/lib/emit/emitFigmaComponents.scaling.test.js` (Teil-B-Glue via Mock)

- [ ] **Step 1: Tests schreiben**

**(a)** In `emitFigmaComponents.test.js` (Teil A: canvas nutzt image_width). Ergänze im bestehenden `describe`-Block einen Test — nutze das vorhandene composed-Fixture-Muster (Parent + Kinder mit bbox), aber `meta.image_width` ≠ 1024:

```js
  it('canvas nutzt echte Bildmaße: composed-Parent-Größe = bbox·image_width (nicht ·1024)', () => {
    const result = {
      raw: {
        tokens: { colors: [] },
        atoms: [], molecules: [],
        organisms: [{ name: 'Card A', bbox: { x: 0.1, y: 0.1, w: 0.4, h: 0.2 } }],
        templates: [{ name: 'Dash', bbox: { x: 0, y: 0, w: 1, h: 1 } }],
        composition: { children: { Dash: ['Card A'] }, roots: ['Dash'] },
        meta: { image_width: 2000, image_height: 1500 },
      },
    };
    const out = emitFigmaComponents(result);
    const dash = out.find((c) => c.name === 'Dash');
    expect(dash.source).toBe('composed');
    expect(dash.variants[0].plan.width).toBe(2000);   // 1.0 · 2000, nicht 1024
    expect(dash.variants[0].plan.height).toBe(1500);
    const childRef = dash.variants[0].plan.children[0];
    expect(childRef.absolute.width).toBe(800);         // 0.4 · 2000
  });

  it('fehlendes meta.image_width → Fallback canvas 1024 (altes Verhalten)', () => {
    const result = {
      raw: {
        tokens: { colors: [] }, atoms: [], molecules: [],
        organisms: [{ name: 'Card A', bbox: { x: 0.1, y: 0.1, w: 0.4, h: 0.2 } }],
        templates: [{ name: 'Dash', bbox: { x: 0, y: 0, w: 1, h: 1 } }],
        composition: { children: { Dash: ['Card A'] }, roots: ['Dash'] },
        meta: {},
      },
    };
    const dash = emitFigmaComponents(result).find((c) => c.name === 'Dash');
    expect(dash.variants[0].plan.width).toBe(1024); // 1.0 · 1024 (Fallback)
  });
```

> Prüfe die exakte Feld-/Fixture-Form an den bestehenden composed-Tests (ab `describe('emitFigmaComponents — composed…`, ~Zeile 240–305) und pass die Konstruktion daran an, falls nötig (z. B. `variants: []` auf Items). Ziel-Assertions (2000/1500/800 bzw. 1024) bleiben.

**(b)** Neue Datei `web/src/lib/emit/emitFigmaComponents.scaling.test.js` (Teil-B-Glue — isoliert, weil `vi.mock` das ganze File betrifft):

```js
import { describe, it, expect, vi } from 'vitest';

// htmlToPlan mocken: liefert einen bekannten Plan + naturalWidth, damit der (in jsdom sonst 0-breite)
// Scaling-Pfad in emitFigmaComponents beobachtbar wird. tokenizeAnchorText wird von der echten
// emitFigmaComponents importiert — als No-op-Set durchreichen.
vi.mock('./htmlToPlan.js', () => ({
  htmlToPlan: () => ({
    plan: { type: 'box', layout: 'column', padding: [0, 0, 0, 0], radius: 0, fill: null, stroke: null,
      strokeWeight: 1, gap: 10, width: 250, height: 100, primaryAlign: 'MIN', counterAlign: 'MIN', children: [] },
    warnings: [], naturalWidth: 250,
  }),
  tokenizeAnchorText: () => new Set(),
}));

import { emitFigmaComponents } from './emitFigmaComponents.js';

describe('emitFigmaComponents — Scaling-Glue (Teil B)', () => {
  it('ai-interpreted mit bbox → Plan auf bbox.w·image_width skaliert (factor = slot/naturalWidth)', () => {
    const result = {
      raw: {
        tokens: { colors: [] }, atoms: [], molecules: [],
        organisms: [{ name: 'Card', bbox: { x: 0, y: 0, w: 0.25, h: 0.1 } }], templates: [],
        composition: { children: {}, roots: [] },
        meta: { image_width: 2000, image_height: 1500 },
      },
      interpretations: { Card: { html: '<div>x</div>' } },
    };
    const card = emitFigmaComponents(result).find((c) => c.name === 'Card');
    expect(card.source).toBe('ai-interpreted');
    // slot = 0.25·2000 = 500; naturalWidth 250 → factor 2 → width 250→500, gap 10→20
    expect(card.variants[0].plan.width).toBe(500);
    expect(card.variants[0].plan.gap).toBe(20);
  });

  it('ai-interpreted OHNE bbox → factor 1, Plan unskaliert', () => {
    const result = {
      raw: {
        tokens: { colors: [] }, atoms: [], molecules: [],
        organisms: [{ name: 'Card' }], templates: [], composition: { children: {}, roots: [] },
        meta: { image_width: 2000, image_height: 1500 },
      },
      interpretations: { Card: { html: '<div>x</div>' } },
    };
    const card = emitFigmaComponents(result).find((c) => c.name === 'Card');
    expect(card.variants[0].plan.width).toBe(250); // unskaliert
  });
});
```

- [ ] **Step 2: Test → rot**

Run: `cd web && npx vitest run src/lib/emit/emitFigmaComponents.test.js src/lib/emit/emitFigmaComponents.scaling.test.js`
Expected: FAIL — canvas noch 1024-basiert, scalePlan noch nicht verdrahtet.

- [ ] **Step 3: `emitFigmaComponents.js` verdrahten**

Import ergänzen:
```js
import { scalePlan, scaleFactor } from './scalePlan.js';
```

`canvas`-Block ersetzen (Teil A, Fallback erhalten):
```js
  const iw = raw.meta?.image_width;
  const ih = raw.meta?.image_height;
  const canvas = (iw && ih)
    ? { w: iw, h: ih }
    : { w: PREVIEW_VIRTUAL_WIDTH, h: PREVIEW_VIRTUAL_WIDTH };
```

`composed-spliced`-Zweig — `naturalWidth` lesen + skalieren (der `htmlToPlan`-Aufruf mit `spliceTargets`):
```js
          const { plan, warnings, naturalWidth } = htmlToPlan(parentInterp.html, { tokens: { colors: namedColors }, knownComponents, spliceTargets });
          if (warnings.length) converterWarnings.push(...warnings);
          if (plan) {
            const scaled = scalePlan(plan, scaleFactor(item.bbox, iw, naturalWidth));
            out.push({
              ...meta,
              placeholder: false,
              source: 'composed-spliced',
              variants: [{ name: 'default', plan: scaled }],
            });
            continue;
          }
```

`ai-interpreted`-Zweig — analog:
```js
      const interp = result?.interpretations?.[item.name];
      if (interp?.html) {
        const { plan, warnings, naturalWidth } = htmlToPlan(interp.html, { tokens: { colors: namedColors }, knownComponents });
        if (warnings.length) converterWarnings.push(...warnings);
        if (plan) {
          const scaled = scalePlan(plan, item.bbox ? scaleFactor(item.bbox, iw, naturalWidth) : 1);
          out.push({
            ...meta,
            placeholder: false,
            source: 'ai-interpreted',
            variants: [{ name: 'default', plan: scaled }],
          });
          continue;
        }
      }
```

> `composed`-Zweig (composePlan) UNVERÄNDERT — canvas trägt schon die wahre Größe (Faktor 1). `composePlan.js` selbst nicht anfassen.

- [ ] **Step 4: Test → grün**

Run: `cd web && npx vitest run src/lib/emit/emitFigmaComponents.test.js src/lib/emit/emitFigmaComponents.scaling.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add web/src/lib/emit/emitFigmaComponents.js web/src/lib/emit/emitFigmaComponents.test.js web/src/lib/emit/emitFigmaComponents.scaling.test.js
git commit -m "feat(emit): Figma-canvas=Bildmaße + scalePlan pro Baustein (Scheibe 3 verdrahtet)"
```

---

## Task 4: Volle Suite + Build + Figma-E2E-Verifikation + Push (Orchestrator)

- [ ] **Step 1: Volle Web-Suite grün**

Run: `cd web && npx vitest run`
Expected: PASS — Baseline 552 + neue Tests, KEINE Regression. (Bestehende Figma-Tests nutzen `image_width:1024` → canvas identisch; jsdom naturalWidth 0 → scalePlan No-op → ai-interpreted/spliced-Assertions unverändert.)

- [ ] **Step 2: Build sauber** — `cd web && npm run build`

- [ ] **Step 3: Figma-E2E-Verifikation** (Orchestrator, Rob hat Figma-Lauf authorisiert):
  - `/figma-e2e-test`-Skill nutzen. Token-schonend: aus einem **gecachten** Result re-emittieren (kein frischer Gemini-Scan) — Payload auf Prod legen ODER lokal, in leere Figma-Datei importieren.
  - Per Figma-MCP verifizieren: **Template ~image_width breit** (nicht 1024), Bausteine in Original-Proportion, KEINE Stauchung/Clipping, Instanzen füllen Slots, Sidebar/KPI-Karten nicht gequetscht (Regressions-Vergleich zum letzten Stand). Sidebar-#4 (Profil-Shrink-Overlap) mit-prüfen.
  - Screenshot unter `Testdaten/` ablegen.
  - **Bei Befund:** systematic-debugging (Doppel-Scaling? Slot/natural-Ratio? svg-Skalierung?), fixen, TDD nachziehen, erneut verifizieren. NICHT blind pushen.

- [ ] **Step 4: Erst nach grünem Figma-Beweis — Commit Doku + Push (kein PR, direkt main)**

```bash
git add -A && git commit -m "docs: Scheibe 3 (Figma-1:1-Skalierung) fertig + Figma-E2E-bewiesen"
git push origin main
```

> ⚠️ Push auf main = Auto-Re-Deploy Railway.

---

## Self-Review (vom Autor durchgeführt)

**Spec-Abdeckung:** scaleFactor (Task 1) · scalePlan alle Knotentypen + Felder (Task 1) · naturalWidth additiv nur Erfolgspfad (Task 2) · canvas=Bildmaße + Fallback (Task 3 Teil A) · scalePlan-Verdrahtung ai-interpreted + composed-spliced, composed unverändert (Task 3 Teil B) · Figma-E2E (Task 4). ✓

**Typ-Konsistenz:** `scaleFactor(bbox, imageWidth, naturalWidth)`, `scalePlan(node, factor)`, `htmlToPlan → { plan, warnings, naturalWidth }`, `iw`/`ih` als image_width/height — konsistent.

**Grenzen dokumentiert:** Tailwind-Emitter unberührt; kein Plugin-Change; jsdom hat keine Layout-Engine → Teil-B-Laufzeit via Figma-E2E bewiesen (Unit-Glue via Mock); Nicht-Bild-Importe → Faktor 1; viewBox nie skaliert; breitengetrieben.
