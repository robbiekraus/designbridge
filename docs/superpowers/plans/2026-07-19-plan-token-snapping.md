# Plan-Token-Snapping (Scheibe 2) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `planToJsx` gibt design-system-treue Tailwind-Klassen aus, die auf die Design-Tokens zeigen (`bg-primary`, `p-card-padding`, `rounded-card`, `text-heading-md`) statt roher arbitrary values — konsistent mit dem exportierten Tailwind-Config.

**Architecture:** Token-Snapping ist eine Emit-Zeit-Transformation von `planToJsx`. Der `plan` bleibt px (kein Shape-/Plugin-Change). Farben nutzen die bereits im plan gebundene `token`-Referenz; Spacing/Radius/Font snappen zur Emit-Zeit gegen die aus `normalizeTokens` abgeleiteten Skalen (±2px, Weight exakt bei Fonts). `emitComponents` baut die Skalen und reicht sie durch.

**Tech Stack:** JS (ESM), Vitest (jsdom global), keine neuen Dependencies.

**Kontext-Dateien (vor dem Bau lesen):**
- Spec: `docs/superpowers/specs/2026-07-19-plan-token-snapping-design.md`
- Vorgänger: `web/src/lib/emit/planToJsx.js` + `planToJsx.test.js` (Scheibe 1)
- Token-Namen/Shapes: `web/src/lib/emit/normalizeTokens.js`, `web/src/lib/emit/emitTailwind.js`
- Wiring: `web/src/lib/emit/emitComponents.js` (`codeFromInterp`)

**Snapping-Skalen-Shape (aus normalizeTokens, `parsePx('24px')=24`, `parsePx('50%')=null`):**
```
tokens = {
  spacing: [{ px, name }],          // group 'spacing'
  radius:  [{ px, name }],          // group 'radius' (nur px)
  fonts:   [{ px, weight, name }],  // group 'font'
}
```

---

## Task 1: `snapToken` + Spacing/Radius-Snapping in `boxClasses`

**Files:**
- Modify: `web/src/lib/emit/planToJsx.js`
- Test: `web/src/lib/emit/planToJsx.test.js`

- [ ] **Step 1: Failing-Tests ergänzen** (ans Ende von `planToJsx.test.js`)

```js
import { snapToken } from './planToJsx.js';

const SCALE = { spacing: [{ px: 8, name: 'inline-gap' }, { px: 16, name: 'stack-gap' }, { px: 24, name: 'card-padding' }],
                radius: [{ px: 8, name: 'button-control' }, { px: 16, name: 'card' }], fonts: [] };

describe('planToJsx — snapToken (reine Funktion)', () => {
  it('exakt/innerhalb Toleranz → Name, Gleichstand → erstes, außerhalb → null', () => {
    expect(snapToken(16, SCALE.spacing)).toBe('stack-gap');
    expect(snapToken(17, SCALE.spacing)).toBe('stack-gap'); // ±2
    expect(snapToken(20, SCALE.spacing)).toBeNull();        // 4 weg von 16/24
    expect(snapToken(12, [{ px: 10, name: 'a' }, { px: 14, name: 'b' }])).toBe('a'); // Gleichstand → erstes
    expect(snapToken(16, [])).toBeNull();
    expect(snapToken(16, undefined)).toBeNull();
  });
});

describe('planToJsx — Spacing/Radius Snapping', () => {
  it('gap + padding snappen auf Token, sonst arbitrary', () => {
    const code = planToJsx(box({ layout: 'row', gap: 16, padding: [24, 24, 24, 24] }), { name: 'X', tokens: SCALE });
    expect(code).toContain('gap-stack-gap');
    expect(code).toContain('p-card-padding');
    expect(code).not.toContain('gap-[16px]');
  });

  it('padding px/py-Kollaps mit Token-Symbol', () => {
    const code = planToJsx(box({ layout: 'row', padding: [8, 24, 8, 24] }), { name: 'X', tokens: SCALE });
    expect(code).toContain('px-card-padding');
    expect(code).toContain('py-inline-gap');
  });

  it('kein passendes Token → arbitrary px (Fallback)', () => {
    const code = planToJsx(box({ layout: 'row', gap: 40, padding: [40, 0, 0, 0] }), { name: 'X', tokens: SCALE });
    expect(code).toContain('gap-[40px]');
    expect(code).toContain('pt-[40px]');
  });

  it('radius snappt; 9999 → rounded-full; kein Token → arbitrary', () => {
    expect(planToJsx(box({ radius: 16 }), { name: 'X', tokens: SCALE })).toContain('rounded-card');
    expect(planToJsx(box({ radius: 9999 }), { name: 'X', tokens: SCALE })).toContain('rounded-full');
    expect(planToJsx(box({ radius: 40 }), { name: 'X', tokens: SCALE })).toContain('rounded-[40px]');
  });

  it('ohne tokens-Argument bleibt Spacing/Radius arbitrary (Scheibe-1-Verhalten)', () => {
    const code = planToJsx(box({ layout: 'row', gap: 16, radius: 16 }), { name: 'X' });
    expect(code).toContain('gap-[16px]');
    expect(code).toContain('rounded-[16px]');
  });
});
```

- [ ] **Step 2: Test → rot**

Run: `cd web && npx vitest run src/lib/emit/planToJsx.test.js`
Expected: FAIL — `snapToken` nicht exportiert, Token-Klassen fehlen.

- [ ] **Step 3: Implementieren** — in `web/src/lib/emit/planToJsx.js`:

Oben (nach `const INDENT`) ergänzen:

```js
const SNAP_TOLERANCE_PX = 2;

/** Nächstes Token in `scale` (Array {px,name}) zu `px`, nur wenn |diff| ≤ tol. Gleichstand → erstes
 *  (Listen-Reihenfolge). Fehlende/leere Skala oder kein Treffer → null. Reine Funktion. */
export function snapToken(px, scale, tol = SNAP_TOLERANCE_PX) {
  if (!Array.isArray(scale) || !Number.isFinite(px)) return null;
  let best = null;
  let bestDiff = Infinity;
  for (const t of scale) {
    if (!t || !Number.isFinite(t.px)) continue;
    const diff = Math.abs(t.px - px);
    if (diff < bestDiff) { bestDiff = diff; best = t; }
  }
  return best && bestDiff <= tol ? best.name : null;
}

/** Spacing-Wert → `<prefix>-<token>` (gesnappt) oder `<prefix>-[Npx]`. px<=0 → null. */
function spacingClass(prefix, px, scale) {
  if (!(Number.isFinite(px) && px > 0)) return null;
  const name = snapToken(px, scale);
  return name ? `${prefix}-${name}` : `${prefix}-[${Math.round(px)}px]`;
}

/** radius → `rounded-full` (≥9999) / `rounded-<token>` (gesnappt) / `rounded-[Npx]`; ≤0 → null. */
function radiusClass(radius, scale) {
  if (!(Number.isFinite(radius) && radius > 0)) return null;
  if (radius >= 9999) return 'rounded-full';
  const name = snapToken(radius, scale);
  return name ? `rounded-${name}` : `rounded-[${Math.round(radius)}px]`;
}
```

`paddingClasses` ersetzen (nimmt jetzt `scale`, nutzt `spacingClass`):

```js
/** padding [t,r,b,l] → minimale Tailwind-Klassenliste (all-equal → p-, t=b&l=r → px-/py-, sonst
 *  einzeln); jedes ausgegebene Symbol gesnappt oder arbitrary. Kollaps rein über px-Gleichheit. */
function paddingClasses([t, r, b, l], scale) {
  if (!t && !r && !b && !l) return [];
  if (t === r && r === b && b === l) return [spacingClass('p', t, scale)].filter(Boolean);
  const out = [];
  if (t === b && l === r) {
    const px = spacingClass('px', l, scale);
    const py = spacingClass('py', t, scale);
    if (px) out.push(px);
    if (py) out.push(py);
    return out;
  }
  for (const [prefix, v] of [['pt', t], ['pr', r], ['pb', b], ['pl', l]]) {
    const c = spacingClass(prefix, v, scale);
    if (c) out.push(c);
  }
  return out;
}
```

`boxClasses` — Signatur `(node, tokens)`, Spacing/Radius über die Helfer (`pxClass` für gap entfällt zugunsten `spacingClass`):

```js
function boxClasses(node, tokens) {
  const out = [];
  const isFlex = node.layout === 'row' || node.gap > 0 || node.primaryAlign !== 'MIN' || node.counterAlign !== 'MIN';
  if (isFlex) {
    out.push('flex');
    if (node.layout === 'column') out.push('flex-col');
    if (JUSTIFY_CLASS[node.primaryAlign]) out.push(JUSTIFY_CLASS[node.primaryAlign]);
    if (ITEMS_CLASS[node.counterAlign]) out.push(ITEMS_CLASS[node.counterAlign]);
  }
  if (node.stretch) out.push('self-stretch');
  if (node.grow) out.push('flex-1');
  // Sizing (Element-Größen, keine Spacing-Tokens → bleibt arbitrary)
  const w = pxClass('w', node.width);
  const h = pxClass('h', node.height);
  if (w) out.push(w);
  if (h) out.push(h);
  // Spacing (gesnappt)
  const gap = spacingClass('gap', node.gap, tokens?.spacing);
  if (gap) out.push(gap);
  out.push(...paddingClasses(node.padding, tokens?.spacing));
  // Visual
  if (node.fill?.hex) out.push(`bg-[${node.fill.hex}]`);
  if (node.stroke?.hex) {
    out.push('border', `border-[${node.stroke.hex}]`);
    if (Number.isFinite(node.strokeWeight) && node.strokeWeight !== 1) out.push(`border-[${node.strokeWeight}px]`);
  }
  const radius = radiusClass(node.radius, tokens?.radius);
  if (radius) out.push(radius);
  return out;
}
```

> `pxClass` bleibt bestehen (für w/h). Farben bleiben in Task 1 noch Hex — Task 2 stellt sie auf Token um.

`walk` — `tokens` durchreichen (auch an walkText, das es erst in Task 2 nutzt):

```js
function walk(node, depth, tokens) {
  const pad = INDENT.repeat(depth);
  if (!node || typeof node !== 'object') return '';
  if (node.type === 'text') return walkText(node, depth, tokens);
  if (node.type === 'svg') return walkSvg(node, depth);
  if (node.type === 'component-ref') return walk(node.fallback, depth, tokens);
  const cls = boxClasses(node, tokens).join(' ');
  const classAttr = cls ? ` className="${cls}"` : '';
  const kids = (node.children || []).map((c) => walk(c, depth + 1, tokens)).filter(Boolean);
  if (!kids.length) return `${pad}<div${classAttr} />`;
  return `${pad}<div${classAttr}>\n${kids.join('\n')}\n${pad}</div>`;
}
```

`walkText`-Signatur auf `(node, depth, tokens)` erweitern (Body unverändert in Task 1 — `textClasses(node)` bleibt vorerst ohne tokens):

```js
function walkText(node, depth) { // tokens-Param folgt in Task 2
```
> Praktisch: lasse `walkText(node, depth)` unverändert; `walk` ruft `walkText(node, depth, tokens)` — der überzählige Parameter wird ignoriert, bis Task 2 ihn nutzt. Kein Fehler.

`planToJsx` — `tokens` aus Options ziehen und an `walk` geben:

```js
export function planToJsx(plan, { name, tokens } = {}) {
  const componentName = name || 'Component';
  const body = walk(plan, 3, tokens);
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
```

- [ ] **Step 4: Test → grün**

Run: `cd web && npx vitest run src/lib/emit/planToJsx.test.js`
Expected: PASS (Scheibe-1-Tests + neue Snapping-Tests). Die Scheibe-1-Farb-Tests (`bg-[#022d2c]`) sind noch grün (Farben erst Task 2).

- [ ] **Step 5: Commit**

```bash
git add web/src/lib/emit/planToJsx.js web/src/lib/emit/planToJsx.test.js
git commit -m "feat(emit): planToJsx Spacing/Radius Token-Snapping (Scheibe 2, TDD)"
```

---

## Task 2: Farb-Token + Font-Snapping in `planToJsx`

**Files:**
- Modify: `web/src/lib/emit/planToJsx.js`
- Test: `web/src/lib/emit/planToJsx.test.js` (2 Scheibe-1-Assertions anpassen + neue Tests)

- [ ] **Step 1: Scheibe-1-Farb-Assertions anpassen + neue Tests**

**(a)** Im Scheibe-1-Test „fill/stroke/radius/width/height": `expect(code).toContain('bg-[#022d2c]');` → `expect(code).toContain('bg-primary');` (fill hat `token:'primary'`).

**(b)** Im Scheibe-1-Test „realistischer Mini-Baustein „Premium Badge"": `expect(code).toContain('bg-[#022d2c]');` → `expect(code).toContain('bg-primary');`.

**(c)** Neue Tests ans Ende ergänzen:

```js
describe('planToJsx — Farb-Token + Font-Snapping', () => {
  const FONTS = { fonts: [{ px: 32, weight: 700, name: 'display-xl' }, { px: 14, weight: 400, name: 'body-default' }, { px: 14, weight: 600, name: 'label-strong' }] };

  it('fill/stroke/color mit token → Token-Klasse, ohne token → Hex', () => {
    const code = planToJsx(box({
      fill: { hex: '#022d2c', token: 'primary' },
      stroke: { hex: '#e5e7eb', token: 'border' }, strokeWeight: 1,
      children: [text({ content: 'x', color: { hex: '#111827', token: 'foreground' } })],
    }), { name: 'X' });
    expect(code).toContain('bg-primary');
    expect(code).toContain('border border-border');
    expect(code).toContain('text-foreground');
  });

  it('token:null → Hex-Fallback', () => {
    const code = planToJsx(box({ fill: { hex: '#abcdef', token: null } }), { name: 'X' });
    expect(code).toContain('bg-[#abcdef]');
  });

  it('font snappt nur bei Size+Weight-Match → text-{name} font-{name}', () => {
    const code = planToJsx(text({ content: 'Hi', fontSize: 32, fontWeight: 700 }), { name: 'X', tokens: FONTS });
    expect(code).toContain('text-display-xl');
    expect(code).toContain('font-display-xl');
    expect(code).not.toContain('text-[32px]');
  });

  it('Size-Match aber Weight-Mismatch → arbitrary + Weight-Name (kein falsches Token)', () => {
    const code = planToJsx(text({ content: 'Hi', fontSize: 14, fontWeight: 500 }), { name: 'X', tokens: FONTS });
    expect(code).toContain('text-[14px]');
    expect(code).toContain('font-medium');
    expect(code).not.toContain('label-strong');
    expect(code).not.toContain('body-default');
  });

  it('ohne fonts-Skala → arbitrary Size + Weight-Name (Scheibe-1-Verhalten)', () => {
    const code = planToJsx(text({ content: 'Hi', fontSize: 32, fontWeight: 700 }), { name: 'X' });
    expect(code).toContain('text-[32px]');
    expect(code).toContain('font-bold');
  });
});
```

- [ ] **Step 2: Test → rot**

Run: `cd web && npx vitest run src/lib/emit/planToJsx.test.js`
Expected: FAIL — Farben noch Hex, Font-Snapping fehlt.

- [ ] **Step 3: Implementieren** — in `web/src/lib/emit/planToJsx.js`:

Helfer ergänzen (nach `radiusClass`):

```js
/** {hex, token}|null → Klassensymbol: `token` (gebunden) oder `[#hex]`; null wenn beides fehlt. */
function colorSymbol(ref) {
  if (!ref || (!ref.hex && !ref.token)) return null;
  return ref.token ? ref.token : `[${ref.hex}]`;
}

/** Typografie-Token, dessen px (±tol) UND weight (exakt) passen; sonst null. Verhindert Bindung
 *  eines 14/400-Fließtexts an ein 14/600-Token. */
function snapFont(fontSize, fontWeight, scale, tol = SNAP_TOLERANCE_PX) {
  if (!Array.isArray(scale) || !Number.isFinite(fontSize)) return null;
  let best = null;
  let bestDiff = Infinity;
  for (const t of scale) {
    if (!t || !Number.isFinite(t.px) || t.weight !== fontWeight) continue;
    const diff = Math.abs(t.px - fontSize);
    if (diff <= tol && diff < bestDiff) { bestDiff = diff; best = t; }
  }
  return best ? best.name : null;
}
```

In `boxClasses` den Visual-Block auf `colorSymbol` umstellen:

```js
  // Visual
  const fillSym = colorSymbol(node.fill);
  if (fillSym) out.push(`bg-${fillSym}`);
  const strokeSym = colorSymbol(node.stroke);
  if (strokeSym) {
    out.push('border', `border-${strokeSym}`);
    if (Number.isFinite(node.strokeWeight) && node.strokeWeight !== 1) out.push(`border-[${node.strokeWeight}px]`);
  }
  const radius = radiusClass(node.radius, tokens?.radius);
  if (radius) out.push(radius);
```

`textClasses` — Signatur `(node, tokens)`, Font-Snapping + Farb-Token:

```js
function textClasses(node, tokens) {
  const out = [];
  const fontName = snapFont(node.fontSize, node.fontWeight, tokens?.fonts);
  if (fontName) {
    out.push(`text-${fontName}`, `font-${fontName}`);
  } else {
    out.push(`text-[${Math.round(node.fontSize)}px]`);
    out.push(FONT_WEIGHT_NAME[node.fontWeight] || `font-[${node.fontWeight}]`);
  }
  const colorSym = colorSymbol(node.color);
  if (colorSym) out.push(`text-${colorSym}`);
  if (node.align === 'center') out.push('text-center');
  else if (node.align === 'right') out.push('text-right');
  if (node.lineHeight != null) out.push(`leading-[${Math.round(node.lineHeight)}px]`);
  if (node.stretch) out.push('self-stretch');
  if (node.grow) out.push('flex-1');
  return out;
}
```

`walkText` — `tokens` an `textClasses` geben:

```js
function walkText(node, depth, tokens) {
  const pad = INDENT.repeat(depth);
  const cls = textClasses(node, tokens).join(' ');
  return `${pad}<span className="${cls}">${escapeJsxText(node.content)}</span>`;
}
```

- [ ] **Step 4: Test → grün**

Run: `cd web && npx vitest run src/lib/emit/planToJsx.test.js`
Expected: PASS (inkl. angepasster Farb-Assertions + neue Farb/Font-Tests).

- [ ] **Step 5: Commit**

```bash
git add web/src/lib/emit/planToJsx.js web/src/lib/emit/planToJsx.test.js
git commit -m "feat(emit): planToJsx Farb-Token-Klassen + Font-Snapping (Scheibe 2)"
```

---

## Task 3: `emitComponents`-Wiring (Snapping-Skalen aus normalizeTokens)

**Files:**
- Modify: `web/src/lib/emit/emitComponents.js`
- Test: `web/src/lib/emit/emitComponents.test.js` (1 Assertion anpassen + 1 neuer Test)

- [ ] **Step 1: Bestehenden Test anpassen + neuen Test schreiben**

**(a)** Im Scheibe-1-Test „Interpretation mit html (jsx leer): Code kommt aus planToJsx": Farbe bindet jetzt ans Token (`baseRaw` hat Color-Rolle `brand-primary` = `#4263EB`, html-bg `#4263eb`). Ändere:
`expect(item.code).toContain('bg-[#4263eb]');` → `expect(item.code).toContain('bg-brand-primary');`

**(b)** Neuer Test (End-to-End-Snapping durch `emitComponents`), ans Ende des `describe('emitComponents + Interpretationen', …)`-Blocks:

```js
  it('Snapping end-to-end: Spacing-Token + Farb-Token durch emitComponents', () => {
    const result = {
      raw: {
        tokens: {
          colors: [{ hex: '#4263EB', role: 'brand-primary', confidence: 'high' }],
          spacing: [{ value: 8, usage: 'inline gap', confidence: 'high' }],
          typography: [], border_radius: [], shadows: [],
        },
        atoms: [{ name: 'Avatar', variants: [], confidence: 'high' }], molecules: [], organisms: [], templates: [],
      },
      interpretations: { Avatar: { html: '<div style="background:#4263eb;padding:8px">A</div>' } },
    };
    const [item] = emitComponents(result, 'atom');
    expect(item.code).toContain('p-inline-gap');   // 8px → Spacing-Token
    expect(item.code).toContain('bg-brand-primary'); // Farbe → Token
    expect(item.code).not.toContain('p-[8px]');
  });
```

- [ ] **Step 2: Test → rot**

Run: `cd web && npx vitest run src/lib/emit/emitComponents.test.js`
Expected: FAIL — Skalen werden noch nicht durchgereicht (`p-[8px]`/`bg-[#4263eb]` statt Token).

- [ ] **Step 3: `emitComponents.js` verdrahten**

`parsePx`-Helfer oben im Modul ergänzen (neben `genericStub`):

```js
/** Token-Wert → px-Zahl: number direkt, 'NNpx'/'NN' → NN, '50%'/nicht-parsbar → null. */
function parsePx(v) {
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  if (typeof v !== 'string') return null;
  const s = v.trim();
  if (s.endsWith('%')) return null;
  const n = parseFloat(s);
  return Number.isFinite(n) ? n : null;
}
```

`codeFromInterp` um `tokenScales`-Parameter erweitern:

```js
function codeFromInterp(interp, pascal, item, namedColors, tokenScales) {
  const html = interp?.html;
  if (html && html.trim()) {
    const { plan } = htmlToPlan(html, { tokens: { colors: namedColors }, knownComponents: [] });
    if (plan) return planToJsx(plan, { name: pascal, tokens: tokenScales });
  }
  return genericStub(pascal, item);
}
```

In `emitComponents` nach `namedColors` die Skalen bauen:

```js
  const tokenScales = {
    spacing: normalized.filter((t) => t.group === 'spacing').map((t) => ({ px: parsePx(t.value), name: t.name })).filter((t) => t.px != null),
    radius: normalized.filter((t) => t.group === 'radius').map((t) => ({ px: parsePx(t.value), name: t.name })).filter((t) => t.px != null),
    fonts: normalized.filter((t) => t.group === 'font').map((t) => ({ px: parsePx(t.value?.fontSize), weight: parseInt(t.value?.fontWeight, 10), name: t.name })).filter((t) => t.px != null),
  };
```

Den `code`-Ausdruck-Aufruf anpassen:
`: (tpl ? tpl.emit(picks, item) : codeFromInterp(interp, pascal, item, namedColors))` →
`: (tpl ? tpl.emit(picks, item) : codeFromInterp(interp, pascal, item, namedColors, tokenScales))`

- [ ] **Step 4: Test → grün**

Run: `cd web && npx vitest run src/lib/emit/emitComponents.test.js`
Expected: PASS (angepasste + neue Tests).

- [ ] **Step 5: Commit**

```bash
git add web/src/lib/emit/emitComponents.js web/src/lib/emit/emitComponents.test.js
git commit -m "feat(emit): Snapping-Skalen aus normalizeTokens an planToJsx durchreichen (Scheibe 2 verdrahtet)"
```

---

## Task 4: Volle Web-Suite + Browser-Smoke + Doku (Orchestrator)

- [ ] **Step 1: Volle Web-Suite grün**

Run: `cd web && npx vitest run`
Expected: PASS — Baseline 540 + neue Snapping-Tests + angepasste Assertions, KEINE unerwartete Regression. Falls ein anderer Test bricht: prüfen, ob er sich auf arbitrary/Hex verließ, wo jetzt ein Token bindet (spec-konform anpassen); sonst echte Regression → Root-Cause.

- [ ] **Step 2: Build sauber**

Run: `cd web && npm run build`

- [ ] **Step 3: Browser-Smoke** (Orchestrator): Dev-Server (`designbridge`-launch-Config, Port-Fix), Library → interpretierter Baustein → Code-Ansicht zeigt Token-Klassen (`bg-…`, `p-…`, `rounded-…`, `text-…`) statt arbitrary/Hex. Figma-Export unverändert (nutzt denselben px-plan).

- [ ] **Step 4: Commit + Push (kein PR, direkt main)**

```bash
git add -A && git commit -m "docs: Scheibe 2 (Token-Snapping) fertig — Spec/Plan/RESUME nachgezogen"
git push origin main
```

---

## Self-Review (vom Autor durchgeführt)

**Spec-Abdeckung:** snapToken (Task 1) · Spacing gap/padding-Kollaps-Snapping (Task 1) · Radius inkl. rounded-full (Task 1) · tokens-Threading + Rückwärtskompat (Task 1) · Farb-Token fill/stroke/color (Task 2) · Font-Snapping Size+Weight (Task 2) · emitComponents-Skalen + parsePx (Task 3) · angepasste Scheibe-1-Farb-Assertions (Task 2) + emitComponents-Assertion (Task 3) · e2e-Snapping-Test (Task 3) · Verifikation (Task 4). ✓

**Typ-Konsistenz:** `snapToken(px, scale, tol)`, `spacingClass(prefix, px, scale)`, `radiusClass(radius, scale)`, `colorSymbol(ref)`, `snapFont(fontSize, fontWeight, scale, tol)`, `boxClasses(node, tokens)`, `textClasses(node, tokens)`, `walk(node, depth, tokens)`, `codeFromInterp(interp, pascal, item, namedColors, tokenScales)` — konsistent über alle Tasks.

**Grenzen dokumentiert:** Plan-Shape bleibt px; w/h bleiben arbitrary; Shadows nicht gesnappt; keine Tailwind-Default-Skala; Font-`font-{name}`-Ambiguität akzeptiert.
