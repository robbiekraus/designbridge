# Plan-to-Tailwind-Emitter (Scheibe 1) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Eine reine Funktion `planToJsx(plan, { name })` bauen, die den kanonischen `plan`-Baum in eine shadcn/Tailwind-React-Komponente (Code-String) gießt, und den Code-Export in `emitComponents.js` von Geminis separatem `interp.jsx` auf diesen Emitter umstellen — Code kommt damit aus DEMSELBEN Modell wie der Figma-Export.

**Architecture:** Rekursiver Walk über die Plan-Knoten (`box`/`text`/`svg`/`component-ref`). Jeder Knoten → JSX-Element mit deterministisch geordneten, werktreuen Tailwind-Arbitrary-Value-Klassen (`gap-[12px]`, `bg-[#022d2c]`). Token-Snapping (`p-6`, `bg-primary`) ist ausdrücklich Scheibe 2, NICHT hier. Wiring: `emitComponents` baut den plan selbst aus `interp.html` via `htmlToPlan` (wie `emitFigmaComponents`) und ruft `planToJsx`.

**Tech Stack:** JS (ESM), Vitest (jsdom-Env global), keine neuen Dependencies.

**Kontext-Dateien (vor dem Bau lesen):**
- Spec: `docs/superpowers/specs/2026-07-19-plan-to-tailwind-emitter-design.md` (Scheibe 1)
- Architektur: `docs/superpowers/specs/2026-07-19-canonical-plan-model-architecture.md`
- Plan-Knoten-Vertrag: `web/src/lib/emit/htmlToPlan.js` (Node-Shapes: box/text/svg/component-ref)
- Wiring-Ziel: `web/src/lib/emit/emitComponents.js` (Zeile 65, `interp.jsx`-Zweig)
- Vorbild-Wiring (plan aus html + namedColors): `web/src/lib/emit/emitFigmaComponents.js:22-45,154-168`

---

## Plan-Knoten-Vertrag (aus htmlToPlan.js — verbindlich für den Walk)

- **box**: `{ type:'box', layout:'row'|'column', padding:[t,r,b,l], radius:number, fill:{hex,token}|null, stroke:{hex,token}|null, strokeWeight:number, gap:number, width:number|null, height:number|null, primaryAlign:'MIN'|'CENTER'|'MAX'|'SPACE_BETWEEN', counterAlign:'MIN'|'CENTER'|'MAX'|'STRETCH', children:PlanNode[], absolute?, stretch?:true, grow?:true }`
- **text**: `{ type:'text', content:string, fontSize:number, fontWeight:number, color:{hex,token}, align:'left'|'center'|'right', lineHeight:number|null, absolute?, stretch?:true, grow?:true }`
- **svg**: `{ type:'svg', markup:string, absolute? }`
- **component-ref**: `{ type:'component-ref', name:string, variant:string|null, fallback:box, absolute?, stretch?:true, grow?:true }`

**Feste Design-Entscheidungen für diesen Emitter (dokumentierte Grenzen v1):**
- `absolute` wird IGNORIERT (Tailwind bleibt aufs Token-/Flow-Raster; absolute→Tailwind ist nicht in Scheibe 1). Kein `position:absolute` im Output.
- `component-ref` rendert seinen `fallback`-Box-Baum (defensiv, valides JSX). In der `emitComponents`-Verdrahtung entstehen ohnehin KEINE component-ref-Knoten, weil `knownComponents:[]` übergeben wird — dieser Zweig ist reine Absicherung.
- SVG-`style="…"`-Attribute werden v1 weggelassen (Icons nutzen fill/stroke-Attribute). Kein Warn-Kanal in einer reinen String-Funktion.

**Flex-Trigger (deterministisch aus Plan-Feldern):** Ein Box-Knoten wird zum Flex-Container (`flex`, bei `column` zusätzlich `flex-col`) genau dann, wenn `layout === 'row' || gap > 0 || primaryAlign !== 'MIN' || counterAlign !== 'MIN'`. Sonst schlichtes `<div>` (Block-Flow, „kein Flex-Trigger" der Spec). `justify-*`/`items-*`/`self-stretch`/`flex-1` werden nur ausgegeben, wenn der Container Flex ist bzw. das Feld gesetzt ist.

**Klassen-Reihenfolge (stabil, Spec §Klassen-Zusammenbau: Layout → Sizing → Spacing → Visual → Text):**
- box: `[flex] [flex-col] [justify-*] [items-*] [self-stretch] [flex-1]` → `[w-[…]] [h-[…]]` → `[gap-[…]] [padding…]` → `[bg-…] [border border-… (border-[Npx])] [rounded-[…]]`
- text: `text-[…px]` → `font-…` → `text-[#…]` → `[text-center|text-right]` → `[leading-[…px]]`

**„Default erzeugt keine Klasse"** (Spec §Klassen-Zusammenbau, letzter Punkt): kein `gap-[0px]`, kein `p-[0px]`, kein `rounded-[0px]`, kein `w-`/`h-` bei `null`, kein `border` ohne sichtbaren stroke, `justify-*`/`items-*` nur für Nicht-MIN, `text-left` (Default) weglassen. `fontSize`/`fontWeight`/`color` sind bei text-Knoten immer konkrete Messwerte → immer ausgeben.

---

## Task 1: `planToJsx` — Grundgerüst, box-Layout/Sizing/Spacing/Visual

**Files:**
- Create: `web/src/lib/emit/planToJsx.js`
- Test: `web/src/lib/emit/planToJsx.test.js`

- [ ] **Step 1: Failing-Test schreiben** (`web/src/lib/emit/planToJsx.test.js`)

```js
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
```

- [ ] **Step 2: Test laufen lassen → rot**

Run: `cd web && npx vitest run src/lib/emit/planToJsx.test.js`
Expected: FAIL — „Failed to resolve import './planToJsx.js'" / `planToJsx is not a function`.

- [ ] **Step 3: `planToJsx.js` implementieren (box-Teil + Wrapper + Rekursions-Hülle)**

```js
// Deterministischer plan→Tailwind/JSX-Emitter (Spec: docs/superpowers/specs/2026-07-19-plan-to-
// tailwind-emitter-design.md). Reine Funktion: kanonischer plan-Baum (box/text/svg/component-ref,
// Vertrag s. htmlToPlan.js) → shadcn/Tailwind-React-Komponente als Code-String. Werktreu mit
// arbitrary values (gap-[12px], bg-[#022d2c]) — Token-Snapping ist Scheibe 2. Kein DOM nötig.
//
// Bewusste Grenzen v1 (Spec §Bewusst NICHT in Scheibe 1): `absolute` wird ignoriert (Tailwind
// bleibt aufs Flow-Raster), component-ref rendert seinen fallback-Box-Baum (entsteht in der
// emitComponents-Verdrahtung ohnehin nicht — knownComponents:[]), SVG-`style`-Attribute entfallen.

const INDENT = '  ';

/** px-Zahl → arbitrary-Klasse `<prefix>-[Npx]`, nur für > 0. */
function pxClass(prefix, n) {
  return Number.isFinite(n) && n > 0 ? `${prefix}-[${Math.round(n)}px]` : null;
}

/** padding [t,r,b,l] → minimale Tailwind-Klassenliste (all-equal → p-, t=b&l=r → px-/py-, sonst einzeln). */
function paddingClasses([t, r, b, l]) {
  if (!t && !r && !b && !l) return [];
  if (t === r && r === b && b === l) return [`p-[${t}px]`];
  const out = [];
  if (t === b && l === r) {
    if (l > 0) out.push(`px-[${l}px]`);
    if (t > 0) out.push(`py-[${t}px]`);
    return out;
  }
  if (t > 0) out.push(`pt-[${t}px]`);
  if (r > 0) out.push(`pr-[${r}px]`);
  if (b > 0) out.push(`pb-[${b}px]`);
  if (l > 0) out.push(`pl-[${l}px]`);
  return out;
}

const JUSTIFY_CLASS = { CENTER: 'justify-center', MAX: 'justify-end', SPACE_BETWEEN: 'justify-between' };
const ITEMS_CLASS = { CENTER: 'items-center', MAX: 'items-end', STRETCH: 'items-stretch' };

function boxClasses(node) {
  const out = [];
  const isFlex = node.layout === 'row' || node.gap > 0 || node.primaryAlign !== 'MIN' || node.counterAlign !== 'MIN';
  // Layout
  if (isFlex) {
    out.push('flex');
    if (node.layout === 'column') out.push('flex-col');
    if (JUSTIFY_CLASS[node.primaryAlign]) out.push(JUSTIFY_CLASS[node.primaryAlign]);
    if (ITEMS_CLASS[node.counterAlign]) out.push(ITEMS_CLASS[node.counterAlign]);
  }
  if (node.stretch) out.push('self-stretch');
  if (node.grow) out.push('flex-1');
  // Sizing
  const w = pxClass('w', node.width);
  const h = pxClass('h', node.height);
  if (w) out.push(w);
  if (h) out.push(h);
  // Spacing
  const gap = pxClass('gap', node.gap);
  if (gap) out.push(gap);
  out.push(...paddingClasses(node.padding));
  // Visual
  if (node.fill?.hex) out.push(`bg-[${node.fill.hex}]`);
  if (node.stroke?.hex) {
    out.push('border', `border-[${node.stroke.hex}]`);
    if (Number.isFinite(node.strokeWeight) && node.strokeWeight !== 1) out.push(`border-[${node.strokeWeight}px]`);
  }
  const radius = pxClass('rounded', node.radius);
  if (radius) out.push(radius);
  return out;
}

/** Ein Plan-Knoten → JSX-String (mehrzeilig, mit `depth` eingerückt). */
function walk(node, depth) {
  const pad = INDENT.repeat(depth);
  if (!node || typeof node !== 'object') return '';
  if (node.type === 'text') return walkText(node, depth); // Task 2
  if (node.type === 'svg') return walkSvg(node, depth);   // Task 3
  if (node.type === 'component-ref') return walk(node.fallback, depth); // fallback-Box, defensiv

  // box
  const cls = boxClasses(node).join(' ');
  const classAttr = cls ? ` className="${cls}"` : '';
  const kids = (node.children || []).map((c) => walk(c, depth + 1)).filter(Boolean);
  if (!kids.length) return `${pad}<div${classAttr} />`;
  return `${pad}<div${classAttr}>\n${kids.join('\n')}\n${pad}</div>`;
}

// Platzhalter — in Task 2/3 ersetzt.
function walkText() { return ''; }
function walkSvg() { return ''; }

export function planToJsx(plan, { name } = {}) {
  const componentName = name || 'Component';
  const body = walk(plan, 3); // 3 Ebenen Einrückung: export→return→( → Wurzel-Element
  // Wurzelklassen an den className-Passthrough hängen (Spec §Wrapper): das Wurzel-<div> trägt
  // seine eigenen Klassen + ${className}. Wir hängen den Passthrough in das gerenderte Wurzel-Tag.
  const rooted = injectClassNamePassthrough(body);
  return [
    `export function ${componentName}({ className = "", ...props }) {`,
    `  return (`,
    rooted,
    `  );`,
    `}`,
    ``,
  ].join('\n');
}

/** Hängt ` ${className}` + {...props} an das äußerste Wurzel-Tag (Spec §Wrapper: className-Passthrough).
 *  Robust für beide Formen (`<div className="…">` und `<div />`/`<div>`). */
function injectClassNamePassthrough(body) {
  // Wurzelzeile ist die erste nicht-leere Zeile; ihr öffnendes Tag bekommt den Passthrough.
  const nl = body.indexOf('\n');
  const firstLine = nl === -1 ? body : body.slice(0, nl);
  const rest = nl === -1 ? '' : body.slice(nl);
  let injected;
  if (/className="/.test(firstLine)) {
    injected = firstLine.replace(/className="([^"]*)"/, 'className={`$1 ${className}`}');
  } else {
    // Kein className → nach dem Tag-Namen einfügen (funktioniert für `<div />` und `<div>`).
    injected = firstLine.replace(/^(\s*)<(\w+)/, '$1<$2 className={className}');
  }
  // {...props} zusätzlich ans Wurzel-Tag hängen (vor `/>` bzw. vor `>`).
  injected = injected.replace(/\s*(\/?)>/, ' {...props}$1>');
  return injected + rest;
}
```

- [ ] **Step 4: Test laufen lassen → grün**

Run: `cd web && npx vitest run src/lib/emit/planToJsx.test.js`
Expected: PASS (6 Tests).

- [ ] **Step 5: Commit**

```bash
git add web/src/lib/emit/planToJsx.js web/src/lib/emit/planToJsx.test.js
git commit -m "feat(emit): planToJsx box layout/sizing/spacing/visual (Scheibe 1, TDD)"
```

---

## Task 2: text-Knoten + Align/Grow/Stretch + JSX-Escaping + Wrapper

**Files:**
- Modify: `web/src/lib/emit/planToJsx.js` (walkText implementieren, `escapeJsxText` ergänzen)
- Test: `web/src/lib/emit/planToJsx.test.js` (Tests ergänzen)

- [ ] **Step 1: Failing-Tests ergänzen**

```js
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
```

- [ ] **Step 2: Test laufen lassen → rot**

Run: `cd web && npx vitest run src/lib/emit/planToJsx.test.js`
Expected: FAIL — walkText liefert `''`, text-/Wrapper-Tests scheitern.

- [ ] **Step 3: walkText + escapeJsxText implementieren** (`web/src/lib/emit/planToJsx.js`)

Ersetze die Platzhalter-Funktion `walkText` und ergänze Helfer:

```js
const FONT_WEIGHT_NAME = { 400: 'font-normal', 500: 'font-medium', 600: 'font-semibold', 700: 'font-bold' };

/** Textinhalt JSX-sicher machen: & zuerst, dann < > { }. In JSX-Text dekodieren HTML-Entities;
 *  { und } müssen escaped werden, da sie sonst einen JS-Ausdruck öffnen. */
function escapeJsxText(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/\{/g, '&#123;')
    .replace(/\}/g, '&#125;');
}

function textClasses(node) {
  const out = [`text-[${Math.round(node.fontSize)}px]`];
  out.push(FONT_WEIGHT_NAME[node.fontWeight] || `font-[${node.fontWeight}]`);
  if (node.color?.hex) out.push(`text-[${node.color.hex}]`);
  if (node.align === 'center') out.push('text-center');
  else if (node.align === 'right') out.push('text-right');
  if (node.lineHeight != null) out.push(`leading-[${Math.round(node.lineHeight)}px]`);
  if (node.stretch) out.push('self-stretch');
  if (node.grow) out.push('flex-1');
  return out;
}
```

und die echte `walkText`:

```js
function walkText(node, depth) {
  const pad = INDENT.repeat(depth);
  const cls = textClasses(node).join(' ');
  return `${pad}<span className="${cls}">${escapeJsxText(node.content)}</span>`;
}
```

- [ ] **Step 4: Test laufen lassen → grün**

Run: `cd web && npx vitest run src/lib/emit/planToJsx.test.js`
Expected: PASS (alle Tests aus Task 1 + Task 2).

- [ ] **Step 5: Commit**

```bash
git add web/src/lib/emit/planToJsx.js web/src/lib/emit/planToJsx.test.js
git commit -m "feat(emit): planToJsx text nodes, align/stretch/grow, JSX-escaping, wrapper (Scheibe 1)"
```

---

## Task 3: svg-Knoten (kebab→camelCase, class→className, style/externe Refs entfernen)

**Files:**
- Modify: `web/src/lib/emit/planToJsx.js` (walkSvg implementieren, Attribut-Transform)
- Test: `web/src/lib/emit/planToJsx.test.js` (Tests ergänzen)

- [ ] **Step 1: Failing-Tests ergänzen**

```js
describe('planToJsx — svg', () => {
  const svg = (markup) => ({ type: 'svg', markup });

  it('kebab-case-Attribute → camelCase, class → className', () => {
    const code = planToJsx(svg(
      '<svg viewBox="0 0 24 24" class="icon"><path stroke-width="2" stroke-linecap="round" fill-rule="evenodd" d="M1 1"/></svg>',
    ), { name: 'X' });
    expect(code).toContain('strokeWidth="2"');
    expect(code).toContain('strokeLinecap="round"');
    expect(code).toContain('fillRule="evenodd"');
    expect(code).toContain('className="icon"');
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
```

- [ ] **Step 2: Test laufen lassen → rot**

Run: `cd web && npx vitest run src/lib/emit/planToJsx.test.js`
Expected: FAIL — walkSvg liefert `''`.

- [ ] **Step 3: walkSvg + Attribut-Transform implementieren** (`web/src/lib/emit/planToJsx.js`)

Ersetze die Platzhalter-Funktion `walkSvg` und ergänze die Attribut-Map (reine String-Transformation, Spec §svg):

```js
// Endliche kebab→camelCase-Map (Spec §svg). class→className separat behandelt; style entfällt v1.
const SVG_ATTR_RENAME = {
  'stroke-width': 'strokeWidth', 'stroke-linecap': 'strokeLinecap', 'stroke-linejoin': 'strokeLinejoin',
  'fill-rule': 'fillRule', 'clip-rule': 'clipRule', 'stop-color': 'stopColor', 'stop-opacity': 'stopOpacity',
  'fill-opacity': 'fillOpacity', 'stroke-opacity': 'strokeOpacity', 'stroke-dasharray': 'strokeDasharray',
  'stroke-dashoffset': 'strokeDashoffset', 'text-anchor': 'textAnchor', 'stroke-miterlimit': 'strokeMiterlimit',
  'clip-path': 'clipPath',
};

/** SVG-Markup-String JSX-sicher machen (Spec §svg): endliche Attribut-Umbenennung, class→className,
 *  style- und xlink:href-Attribute entfernen. Reine String-Transformation, kein DOM. */
function svgMarkupToJsx(markup) {
  let out = String(markup);
  for (const [kebab, camel] of Object.entries(SVG_ATTR_RENAME)) {
    out = out.replace(new RegExp(`(\\s)${kebab}=`, 'g'), `$1${camel}=`);
  }
  out = out.replace(/(\s)class=/g, '$1className=');
  // style="…" und xlink:href="…" (inkl. einfacher Anführungszeichen) entfernen.
  out = out.replace(/\s(?:style|xlink:href)=("[^"]*"|'[^']*')/g, '');
  return out;
}

function walkSvg(node, depth) {
  const pad = INDENT.repeat(depth);
  return pad + svgMarkupToJsx(node.markup);
}
```

- [ ] **Step 4: Test laufen lassen → grün**

Run: `cd web && npx vitest run src/lib/emit/planToJsx.test.js`
Expected: PASS (alle planToJsx-Tests).

- [ ] **Step 5: Commit**

```bash
git add web/src/lib/emit/planToJsx.js web/src/lib/emit/planToJsx.test.js
git commit -m "feat(emit): planToJsx svg markup JSX-safe (kebab→camelCase, class→className) (Scheibe 1)"
```

---

## Task 4: Verdrahtung in `emitComponents.js` (interp.jsx → planToJsx via htmlToPlan)

**Files:**
- Modify: `web/src/lib/emit/emitComponents.js`
- Test: `web/src/lib/emit/emitComponents.test.js` (2 Bestandstests anpassen + 1 neuer)

- [ ] **Step 1: Bestehende Tests anpassen + neuen Test schreiben** (`web/src/lib/emit/emitComponents.test.js`)

**(a)** Test „Interpretation mit leerem jsx: html-Vorschau ja, Code fällt auf Stub zurück" (Zeile ~95) — html liegt vor, also kommt Code jetzt aus `planToJsx`, NICHT aus dem Stub. Ersetze den Testkörper:

```js
  it('Interpretation mit html (jsx leer): Code kommt aus planToJsx (nicht mehr aus jsx/Stub)', () => {
    const result = {
      raw: baseRaw,
      interpretations: { Avatar: { html: '<div style="background:#4263eb;padding:8px">A</div>', jsx: '' } },
    };
    const [item] = emitComponents(result, 'atom');
    expect(item.interpretedHtml).toContain('background:#4263eb');
    expect(item.code).toContain('export function Avatar');
    expect(item.code).toContain('bg-[#4263eb]'); // plan-abgeleiteter Tailwind
    expect(item.code).not.toContain('generischer Stub');
  });
```

**(b)** Test „Card-Template retired … nutzt interp.jsx" (Zeile ~194) — Code kommt jetzt aus `planToJsx`, nicht aus `interp.jsx`. Ersetze:

```js
  it('Card-Template retired: „…Card"-Organismus mit Interpretation → Code aus planToJsx (nicht interp.jsx)', () => {
    const result = {
      raw: {
        tokens: { colors: [], typography: [], spacing: [], border_radius: [], shadows: [] },
        atoms: [], templates: [],
        organisms: [{ name: 'Category of Emissions Card', confidence: 'high', variants: [] }],
      },
      interpretations: {
        'Category of Emissions Card': { html: '<div style="padding:16px">real</div>', jsx: '<div>real jsx</div>', model: 'gemini-3.5-flash' },
      },
    };
    const [item] = emitComponents(result, 'organism');
    expect(item.templateKey).toBeNull();
    expect(item.hasPreview).toBe(false);
    expect(item.code).toContain('export function CategoryOfEmissionsCard');
    expect(item.code).toContain('p-[16px]');
    expect(item.code).toContain('real');
    expect(item.code).not.toContain('<div>real jsx</div>'); // interp.jsx wird NICHT mehr genutzt
  });
```

**(c)** Neuer Test — ohne html fällt es weiter auf den Stub zurück (Präzedenz-Absicherung). Direkt nach (a) einfügen:

```js
  it('ohne Interpretation (kein html) + kein Template → weiter genericStub', () => {
    const [item] = emitComponents({ raw: baseRaw }, 'atom');
    expect(item.code).toContain('generischer Stub');
  });
```

- [ ] **Step 2: Test laufen lassen → rot**

Run: `cd web && npx vitest run src/lib/emit/emitComponents.test.js`
Expected: FAIL — (a)/(b) erwarten planToJsx-Output, `emitComponents` liefert aber noch `interp.jsx`/Stub.

- [ ] **Step 3: `emitComponents.js` verdrahten**

Imports oben ergänzen (nach den bestehenden imports):

```js
import { htmlToPlan } from './htmlToPlan.js';
import { planToJsx } from './planToJsx.js';
```

In `emitComponents` nach `const picks = pickTokens(normalizeTokens(raw.tokens));` die disambiguierte Farbliste bauen (wie `emitFigmaComponents`):

```js
  // Dieselbe disambiguierte Farbliste wie emitFigmaComponents — htmlToPlan.matchColorToken bindet
  // per Hex und reicht .name durch (Token-Referenz im plan). Für Scheibe 1 (arbitrary values)
  // reicht der Hex, die Namen sind fürs spätere Token-Snapping (Scheibe 2) schon korrekt gesetzt.
  const normalized = normalizeTokens(raw.tokens);
  const namedColors = normalized.filter((t) => t.group === 'color').map((t) => ({ hex: t.value, name: t.name }));
```

> Hinweis: `picks` bleibt für die Template-`emit(picks, item)`-Aufrufe unverändert. `normalizeTokens` wird bereits importiert.

Den `code`-Ausdruck (Zeile ~63-65) von

```js
        code: lifted
          ? item.sourceCode
          : (tpl ? tpl.emit(picks, item) : (interp?.jsx?.trim() ? interp.jsx : genericStub(pascal, item))),
```

ersetzen durch

```js
        code: lifted
          ? item.sourceCode
          : (tpl ? tpl.emit(picks, item) : codeFromInterp(interp, pascal, item, namedColors)),
```

und die Helferfunktion oben im Modul (neben `genericStub`) ergänzen:

```js
/** Code aus der KI-Interpretation ableiten (Scheibe 1, kanonischer plan → Tailwind): hat der
 *  Baustein interp.html, wird der plan deterministisch daraus gebaut (htmlToPlan, wie im Figma-
 *  Pfad) und via planToJsx zu Tailwind/JSX gegossen — DERSELBE plan wie der Figma-Export, statt
 *  Geminis separatem interp.jsx. Leeres/kaputtes html (plan === null) oder gar keine Interpretation
 *  → generischer Stub. knownComponents bewusst leer: der Code-Export braucht keine component-ref-
 *  Instanzen (die Datei ist eigenständig), planToJsx würde sie ohnehin nur als fallback rendern. */
function codeFromInterp(interp, pascal, item, namedColors) {
  const html = interp?.html;
  if (html && html.trim()) {
    const { plan } = htmlToPlan(html, { tokens: { colors: namedColors }, knownComponents: [] });
    if (plan) return planToJsx(plan, { name: pascal });
  }
  return genericStub(pascal, item);
}
```

- [ ] **Step 4: Test laufen lassen → grün**

Run: `cd web && npx vitest run src/lib/emit/emitComponents.test.js`
Expected: PASS (inkl. der beiden angepassten + neuen Tests).

- [ ] **Step 5: Commit**

```bash
git add web/src/lib/emit/emitComponents.js web/src/lib/emit/emitComponents.test.js
git commit -m "feat(emit): Code-Export aus kanonischem plan statt interp.jsx (Scheibe 1 verdrahtet)"
```

---

## Task 5: Volle Web-Suite + Browser-Smoke + Doku

**Files:**
- Verify: gesamte Web-Suite
- Modify: `RESUME.md`, Memory (Orchestrator zieht nach)

- [ ] **Step 1: Volle Web-Suite grün (Baseline 521 + neue Tests)**

Run: `cd web && npx vitest run`
Expected: PASS — 39+ Files, 521 + neue planToJsx-Tests + angepasste emitComponents-Tests, KEINE Regression. Falls andere Tests unerwartet brechen: prüfen, ob sie sich (spec-konform) auf den alten `interp.jsx`→code-Pfad verließen; nur dann anpassen, sonst ist es eine echte Regression → Root-Cause.

- [ ] **Step 2: Build sauber**

Run: `cd web && npm run build`
Expected: Build ohne Fehler.

- [ ] **Step 3: Browser-Smoke (Orchestrator, nach dem Bau)**

Dev-Server per launch.json starten (⚠️ RESUME/Memory: Express/Vite-Port-Falle — Start mit `PORT=3047 npm run dev:demo` bzw. dem etablierten Startbefehl), einen interpretierten Baustein in der Library öffnen → **Code-Ansicht** zeigt plan-abgeleiteten Tailwind (arbitrary values wie `gap-[…px]`, `bg-[#…]`), NICHT mehr Geminis rohes jsx. Figma-Export-Knopf weiter funktionsfähig (unverändert — `emitFigmaComponents` nutzt denselben plan).

- [ ] **Step 4: Commit + Push (Robs Regel: KEIN PR, direkt main)**

```bash
git add -A && git commit -m "docs: Scheibe 1 (plan→Tailwind) fertig — RESUME/Plan nachgezogen"
git push origin main
```

> ⚠️ Push auf main = Auto-Re-Deploy auf Railway (RESUME). Scheibe 1 ist web-only und ändert Prod-Verhalten nur in der Code-Ansicht — unkritisch, aber bewusst.

---

## Self-Review (vom Autor durchgeführt)

**Spec-Abdeckung:**
- planToJsx reine Funktion, Signatur `(plan, { name })` → Task 1 (Wrapper) ✓
- box Layout/gap/padding-Kollaps/radius/fill/stroke/width-height/align/stretch-grow → Task 1 ✓
- text fontSize/weight-Name/color/align/leading/JSX-Escaping → Task 2 ✓
- svg kebab→camelCase/class→className/style-Weglassung → Task 3 ✓
- Verschachtelung + voller Wrapper + Mini-Baustein → Task 2 ✓
- Default erzeugt keine Klasse → Task 1 + Task 2 ✓
- Verdrahtung emitComponents (interp.html → planToJsx, sonst Stub; Präzedenz lifted>Template>plan>Stub unverändert) → Task 4 ✓
- emitComponents.test.js-Ergänzung (html→planToJsx, kein html→Stub, Template unangetastet) → Task 4 ✓
- Verifikation Web-Suite grün + Browser-Smoke → Task 5 ✓

**Dokumentierte Grenzen (Spec §Bewusst NICHT in Scheibe 1):** Token-Snapping = Scheibe 2; `absolute` ignoriert; component-ref → fallback; SVG-style weggelassen; Vorschau-Rendering unverändert; Geminis jsx-Erzeugung serverseitig bleibt (nur web-seitig nicht mehr genutzt).

**Typ-Konsistenz:** `planToJsx(plan, { name })`, `walk/walkText/walkSvg(node, depth)`, `boxClasses/textClasses(node)`, `codeFromInterp(interp, pascal, item, namedColors)` — Namen über alle Tasks konsistent.
