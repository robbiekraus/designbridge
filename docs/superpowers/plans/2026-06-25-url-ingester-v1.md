# URL-Ingester v1 — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the URL import mock with a real ingester that fetches a website, parses its CSS deterministically, and returns the same result shape as the image scan — so the whole existing pipeline (Dashboard, Tokens, Emitter, Export) works on real data.

**Architecture:** A pure CSS parser (`cssIngest.js`, postcss, fully unit-testable, no I/O) is fed by an isolated network layer (`fetchSite.js`). A new endpoint `POST /api/scan/url` wires them together and emits the canonical server shape. A controlled static demo page (`/demo`) guarantees a clean, repeatable result. The client swaps one line in `useImportSession` and renders a new per-token "Herkunft" (provenance) line.

**Tech Stack:** Node 24 (global `fetch`, built-in `node --test`), Express (ESM), postcss; React + Vite + Vitest on the web side.

**Spec:** `docs/superpowers/specs/2026-06-25-url-ingester-v1-design.md`

---

## File Structure

**Server (new/modified):**
- Create `server/lib/cssIngest.js` — pure: CSS text → `{summary, tokens, atomics, components, patterns, warnings, meta}`.
- Create `server/lib/cssIngest.test.js` — `node:test` unit tests.
- Create `server/lib/fetchSite.js` — network: URL → `{css, baseUrl}` (injectable `fetchImpl` for tests).
- Create `server/lib/fetchSite.test.js` — `node:test`, mocked fetch.
- Modify `server/routes/scan.js` — add `POST /api/scan/url`.
- Modify `server/index.js` — serve `demo-site/` at `GET /demo`.
- Create `demo-site/index.html`, `demo-site/styles.css` — controlled demo page.
- Modify root `package.json` — add `postcss` dep + `test:server` script.

**Web (modified):**
- Modify `web/src/lib/scanResultAdapter.js` — generalize to `adaptScanResponse(raw, source)`, keep `adaptImageScanResponse` alias.
- Modify `web/src/lib/useImportSession.js` — real `submitUrl`.
- Modify `web/src/components/ImportModal/tabs/UrlTab.jsx` — drop "mocked" copy, add "Demo-Seite verwenden".
- Modify `web/src/components/library/tokenViews.jsx` — render `↳ <source>` provenance line.
- Create `web/src/lib/scanResultAdapter.test.js` (if absent) and `web/src/components/library/tokenViews.test.jsx`.

**Token shape (canonical, with provenance `source`):**
- color: `{ hex, role, confidence, source }`
- typography: `{ size, weight, role, sample, confidence, source }`
- spacing: `{ value, usage, confidence, source }`
- border_radius: `{ value, usage, confidence, source }`
- shadow: `{ description, css, confidence, source }`

---

## Task 0: Add postcss dependency + server test script

**Files:**
- Modify: `package.json` (root)

- [ ] **Step 1: Add postcss and a server test script**

Edit root `package.json` — add `"postcss": "^8.4.38"` to `dependencies` and `"test:server": "node --test server/"` to `scripts`.

- [ ] **Step 2: Install**

Run: `npm install`
Expected: postcss added to root `node_modules`, no errors.

- [ ] **Step 3: Sanity-check postcss import**

Run: `node -e "import('postcss').then(p=>console.log(typeof p.default.parse))"`
Expected: prints `function`.

- [ ] **Step 4: Commit**

```bash
git add package.json package-lock.json
git commit -m "chore: add postcss dep + node --test server script"
```

---

## Task 1: cssIngest — colors from CSS variables

**Files:**
- Create: `server/lib/cssIngest.js`
- Test: `server/lib/cssIngest.test.js`

- [ ] **Step 1: Write the failing test**

```js
// server/lib/cssIngest.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ingestCss } from './cssIngest.js';

test('extracts colors from :root custom properties with role + source', () => {
  const css = ':root { --color-primary: #022d2c; --color-surface: #ffffff; }';
  const { tokens } = ingestCss(css, { sourceUrl: 'http://x/demo' });
  assert.deepEqual(tokens.colors, [
    { hex: '#022d2c', role: 'primary', confidence: 'high', source: '--color-primary' },
    { hex: '#ffffff', role: 'surface', confidence: 'high', source: '--color-surface' },
  ]);
});

test('normalizes #rgb shorthand and rgb() to #rrggbb', () => {
  const css = ':root { --color-a: #fff; --color-b: rgb(2, 45, 44); }';
  const { tokens } = ingestCss(css);
  assert.equal(tokens.colors[0].hex, '#ffffff');
  assert.equal(tokens.colors[1].hex, '#022d2c');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test server/lib/cssIngest.test.js`
Expected: FAIL — `Cannot find module './cssIngest.js'` / `ingestCss is not a function`.

- [ ] **Step 3: Write minimal implementation**

```js
// server/lib/cssIngest.js
import postcss from 'postcss';

const VAR_RULES = [
  { cat: 'colors', re: /^--(?:color|colour|c|brand|clr)-(.+)$/ },
];

function classifyVar(name) {
  for (const rule of VAR_RULES) {
    const m = rule.re.exec(name);
    if (m) return { cat: rule.cat, role: m[1] };
  }
  return null;
}

function rgbToHex(value) {
  const m = /^rgba?\(\s*([\d.]+)[ ,]+([\d.]+)[ ,]+([\d.]+)/i.exec(value.trim());
  if (!m) return null;
  const hex = [m[1], m[2], m[3]]
    .map((n) => Math.max(0, Math.min(255, Math.round(parseFloat(n)))).toString(16).padStart(2, '0'))
    .join('');
  return `#${hex}`;
}

function normalizeColor(value) {
  const v = value.trim();
  if (/^#[0-9a-f]{3,8}$/i.test(v)) {
    if (v.length === 4) return ('#' + v.slice(1).split('').map((c) => c + c).join('')).toLowerCase();
    return v.toLowerCase();
  }
  return rgbToHex(v);
}

function collectVariables(root) {
  const acc = { colors: [] };
  root.walkDecls((decl) => {
    if (!decl.prop.startsWith('--')) return;
    const hit = classifyVar(decl.prop);
    if (!hit) return;
    if (hit.cat === 'colors') {
      const hex = normalizeColor(decl.value);
      if (hex) acc.colors.push({ hex, role: hit.role, confidence: 'high', source: decl.prop });
    }
  });
  return acc;
}

export function ingestCss(cssText, { sourceUrl = null } = {}) {
  const root = postcss.parse(cssText || '');
  const vars = collectVariables(root);
  return {
    summary: {
      source_description: 'Tokens aus CSS extrahiert',
      app_type: 'Website',
      color_mode: 'unknown',
      design_style: 'aus Stylesheet abgeleitet',
    },
    tokens: { colors: vars.colors, typography: [], spacing: [], border_radius: [], shadows: [] },
    atomics: [],
    components: [],
    patterns: [],
    warnings: ['Nur Tokens — Komponenten werden aus CSS nicht erkannt.'],
    meta: { model: 'css-ingest', source_url: sourceUrl, elapsed_ms: 0 },
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test server/lib/cssIngest.test.js`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add server/lib/cssIngest.js server/lib/cssIngest.test.js
git commit -m "feat(server): cssIngest — colors from CSS variables"
```

---

## Task 2: cssIngest — typography, spacing, radius, shadows from variables

**Files:**
- Modify: `server/lib/cssIngest.js`
- Test: `server/lib/cssIngest.test.js`

- [ ] **Step 1: Add failing tests**

Append to `server/lib/cssIngest.test.js`:

```js
test('extracts typography, pairing font-size with matching font-weight by role', () => {
  const css = ':root { --font-size-base: 1rem; --font-weight-base: 600; --font-size-lg: 24px; }';
  const { tokens } = ingestCss(css);
  assert.deepEqual(tokens.typography, [
    { size: 16, weight: '600', role: 'base', sample: 'Aa', confidence: 'high', source: '--font-size-base' },
    { size: 24, weight: '400', role: 'lg',   sample: 'Aa', confidence: 'high', source: '--font-size-lg' },
  ]);
});

test('extracts spacing (rem→px, sorted) and radius (% kept, px normalized)', () => {
  const css = ':root { --space-4: 1rem; --space-2: 8px; --radius-md: 0.5rem; --radius-full: 50%; }';
  const { tokens } = ingestCss(css);
  assert.deepEqual(tokens.spacing, [
    { value: 8,  usage: '2', confidence: 'high', source: '--space-2' },
    { value: 16, usage: '4', confidence: 'high', source: '--space-4' },
  ]);
  assert.deepEqual(tokens.border_radius, [
    { value: '8px', usage: 'md',   confidence: 'high', source: '--radius-md' },
    { value: '50%', usage: 'full', confidence: 'high', source: '--radius-full' },
  ]);
});

test('extracts shadows verbatim with role + source', () => {
  const css = ':root { --shadow-card: 0 1px 3px rgba(0,0,0,.1); }';
  const { tokens } = ingestCss(css);
  assert.deepEqual(tokens.shadows, [
    { description: 'card', css: '0 1px 3px rgba(0,0,0,.1)', confidence: 'high', source: '--shadow-card' },
  ]);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test server/lib/cssIngest.test.js`
Expected: FAIL — new categories empty.

- [ ] **Step 3: Expand implementation**

Replace `server/lib/cssIngest.js` with:

```js
// server/lib/cssIngest.js
import postcss from 'postcss';

const VAR_RULES = [
  { cat: 'colors',     re: /^--(?:color|colour|c|brand|clr)-(.+)$/ },
  { cat: 'fontSize',   re: /^--(?:font-size|text|fs)-(.+)$/ },
  { cat: 'fontWeight', re: /^--(?:font-weight|fw)-(.+)$/ },
  { cat: 'spacing',    re: /^--(?:space|spacing|gap|sp)-(.+)$/ },
  { cat: 'radius',     re: /^--(?:radius|rounded|br|rad)-(.+)$/ },
  { cat: 'shadows',    re: /^--(?:shadow|elevation|shd)-(.+)$/ },
];

function classifyVar(name) {
  for (const rule of VAR_RULES) {
    const m = rule.re.exec(name);
    if (m) return { cat: rule.cat, role: m[1] };
  }
  return null;
}

function remToPx(value) {
  const m = /^(-?[\d.]+)rem$/.exec(value.trim());
  if (m) return `${Math.round(parseFloat(m[1]) * 16)}px`;
  return value.trim();
}

function pxNumber(value) {
  const m = /^(-?[\d.]+)px$/.exec(remToPx(value));
  return m ? parseFloat(m[1]) : null;
}

function rgbToHex(value) {
  const m = /^rgba?\(\s*([\d.]+)[ ,]+([\d.]+)[ ,]+([\d.]+)/i.exec(value.trim());
  if (!m) return null;
  const hex = [m[1], m[2], m[3]]
    .map((n) => Math.max(0, Math.min(255, Math.round(parseFloat(n)))).toString(16).padStart(2, '0'))
    .join('');
  return `#${hex}`;
}

function normalizeColor(value) {
  const v = value.trim();
  if (/^#[0-9a-f]{3,8}$/i.test(v)) {
    if (v.length === 4) return ('#' + v.slice(1).split('').map((c) => c + c).join('')).toLowerCase();
    return v.toLowerCase();
  }
  return rgbToHex(v);
}

function collectVariables(root) {
  const acc = { colors: [], fontSize: [], fontWeight: [], spacing: [], radius: [], shadows: [] };
  root.walkDecls((decl) => {
    if (!decl.prop.startsWith('--')) return;
    const hit = classifyVar(decl.prop);
    if (!hit) return;
    const raw = decl.value.trim();
    const source = decl.prop;
    if (hit.cat === 'colors') {
      const hex = normalizeColor(raw);
      if (hex) acc.colors.push({ hex, role: hit.role, confidence: 'high', source });
    } else if (hit.cat === 'fontSize') {
      const px = pxNumber(raw);
      if (px != null) acc.fontSize.push({ role: hit.role, size: px, source });
    } else if (hit.cat === 'fontWeight') {
      acc.fontWeight.push({ role: hit.role, weight: raw });
    } else if (hit.cat === 'spacing') {
      const px = pxNumber(raw);
      if (px != null) acc.spacing.push({ value: px, usage: hit.role, confidence: 'high', source });
    } else if (hit.cat === 'radius') {
      const val = raw.endsWith('%') ? raw : remToPx(raw);
      acc.radius.push({ value: val, usage: hit.role, confidence: 'high', source });
    } else if (hit.cat === 'shadows') {
      acc.shadows.push({ description: hit.role, css: raw, confidence: 'high', source });
    }
  });
  return acc;
}

function buildTypography(vars) {
  const weightByRole = new Map(vars.fontWeight.map((w) => [w.role, w.weight]));
  return vars.fontSize.map((f) => ({
    size: f.size,
    weight: weightByRole.get(f.role) ?? '400',
    role: f.role,
    sample: 'Aa',
    confidence: 'high',
    source: f.source,
  }));
}

export function ingestCss(cssText, { sourceUrl = null } = {}) {
  const root = postcss.parse(cssText || '');
  const vars = collectVariables(root);
  return {
    summary: {
      source_description: 'Tokens aus CSS extrahiert',
      app_type: 'Website',
      color_mode: 'unknown',
      design_style: 'aus Stylesheet abgeleitet',
    },
    tokens: {
      colors: vars.colors,
      typography: buildTypography(vars),
      spacing: [...vars.spacing].sort((a, b) => a.value - b.value),
      border_radius: vars.radius,
      shadows: vars.shadows,
    },
    atomics: [],
    components: [],
    patterns: [],
    warnings: ['Nur Tokens — Komponenten werden aus CSS nicht erkannt.'],
    meta: { model: 'css-ingest', source_url: sourceUrl, elapsed_ms: 0 },
  };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test server/lib/cssIngest.test.js`
Expected: PASS (all 5 tests).

- [ ] **Step 5: Commit**

```bash
git add server/lib/cssIngest.js server/lib/cssIngest.test.js
git commit -m "feat(server): cssIngest — typography/spacing/radius/shadows from variables"
```

---

## Task 3: cssIngest — declaration fallback + warnings

**Files:**
- Modify: `server/lib/cssIngest.js`
- Test: `server/lib/cssIngest.test.js`

- [ ] **Step 1: Add failing tests**

Append to `server/lib/cssIngest.test.js`:

```js
test('falls back to declarations when no variables, with low confidence + selector source', () => {
  const css = '.cta { background: #3b82f6; border-radius: 6px; } h1 { font-size: 2rem; }';
  const { tokens, warnings } = ingestCss(css);
  assert.deepEqual(tokens.colors, [
    { hex: '#3b82f6', role: 'gefunden', confidence: 'low', source: '.cta { background: … }' },
  ]);
  assert.equal(tokens.border_radius[0].value, '6px');
  assert.equal(tokens.border_radius[0].confidence, 'low');
  assert.equal(tokens.typography[0].size, 32);
  assert.ok(warnings.some((w) => w.includes('niedrige Confidence')));
});

test('declaration fallback does not duplicate values already found as variables', () => {
  const css = ':root { --color-primary: #022d2c; } .btn { background: #022d2c; color: #ffffff; }';
  const { tokens } = ingestCss(css);
  const primaries = tokens.colors.filter((c) => c.hex === '#022d2c');
  assert.equal(primaries.length, 1);
  assert.equal(primaries[0].source, '--color-primary');
  assert.ok(tokens.colors.some((c) => c.hex === '#ffffff' && c.confidence === 'low'));
});

test('empty / blank CSS yields empty token arrays, no throw', () => {
  const { tokens } = ingestCss('');
  assert.deepEqual(tokens.colors, []);
  assert.deepEqual(tokens.typography, []);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test server/lib/cssIngest.test.js`
Expected: FAIL — fallback not implemented.

- [ ] **Step 3: Add the fallback collector and wire it in**

In `server/lib/cssIngest.js`, add this function above `ingestCss`:

```js
function collectDeclarations(root, vars) {
  const seen = {
    colors: new Set(vars.colors.map((c) => c.hex)),
    fontSize: new Set(vars.fontSize.map((f) => f.size)),
    radius: new Set(vars.radius.map((r) => String(r.value))),
    shadows: new Set(vars.shadows.map((s) => s.css)),
  };
  const out = { colors: [], typography: [], radius: [], shadows: [] };
  root.walkRules((rule) => {
    rule.walkDecls((decl) => {
      const prop = decl.prop.toLowerCase();
      if (prop.startsWith('--')) return;
      const source = `${rule.selector} { ${decl.prop}: … }`;
      if (prop === 'color' || prop === 'background-color' || prop === 'background') {
        const hex = normalizeColor(decl.value);
        if (hex && !seen.colors.has(hex)) {
          seen.colors.add(hex);
          out.colors.push({ hex, role: 'gefunden', confidence: 'low', source });
        }
      } else if (prop === 'font-size') {
        const px = pxNumber(decl.value);
        if (px != null && !seen.fontSize.has(px)) {
          seen.fontSize.add(px);
          out.typography.push({ size: px, weight: '400', role: 'gefunden', sample: 'Aa', confidence: 'low', source });
        }
      } else if (prop === 'border-radius') {
        const val = decl.value.trim().endsWith('%') ? decl.value.trim() : remToPx(decl.value);
        if (!seen.radius.has(String(val))) {
          seen.radius.add(String(val));
          out.radius.push({ value: val, usage: 'gefunden', confidence: 'low', source });
        }
      } else if (prop === 'box-shadow') {
        const css = decl.value.trim();
        if (css !== 'none' && !seen.shadows.has(css)) {
          seen.shadows.add(css);
          out.shadows.push({ description: 'gefunden', css, confidence: 'low', source });
        }
      }
    });
  });
  return out;
}
```

Then replace the body of `ingestCss` (after `const vars = collectVariables(root);`) with:

```js
  const decls = collectDeclarations(root, vars);
  const usedFallback =
    decls.colors.length + decls.typography.length + decls.radius.length + decls.shadows.length > 0;
  const warnings = ['Nur Tokens — Komponenten werden aus CSS nicht erkannt.'];
  if (usedFallback) {
    warnings.push('Einige Werte stammen aus CSS-Deklarationen (niedrige Confidence) — bitte prüfen.');
  }
  return {
    summary: {
      source_description: 'Tokens aus CSS extrahiert',
      app_type: 'Website',
      color_mode: 'unknown',
      design_style: 'aus Stylesheet abgeleitet',
    },
    tokens: {
      colors: [...vars.colors, ...decls.colors],
      typography: [...buildTypography(vars), ...decls.typography],
      spacing: [...vars.spacing].sort((a, b) => a.value - b.value),
      border_radius: [...vars.radius, ...decls.radius],
      shadows: [...vars.shadows, ...decls.shadows],
    },
    atomics: [],
    components: [],
    patterns: [],
    warnings,
    meta: { model: 'css-ingest', source_url: sourceUrl, elapsed_ms: 0 },
  };
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test server/lib/cssIngest.test.js`
Expected: PASS (all 8 tests).

- [ ] **Step 5: Commit**

```bash
git add server/lib/cssIngest.js server/lib/cssIngest.test.js
git commit -m "feat(server): cssIngest — declaration fallback + warnings"
```

---

## Task 4: fetchSite — network layer (mocked fetch)

**Files:**
- Create: `server/lib/fetchSite.js`
- Test: `server/lib/fetchSite.test.js`

- [ ] **Step 1: Write the failing test**

```js
// server/lib/fetchSite.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fetchSite } from './fetchSite.js';

function mockFetch(map) {
  return async (url) => {
    if (!(url in map)) return { ok: false, status: 404, text: async () => '' };
    return { ok: true, status: 200, text: async () => map[url] };
  };
}

test('collects <style> blocks and resolves relative <link> stylesheets', async () => {
  const html = `<html><head>
    <style>:root{--color-primary:#022d2c}</style>
    <link rel="stylesheet" href="/css/app.css">
  </head></html>`;
  const fetchImpl = mockFetch({
    'http://x/demo': html,
    'http://x/css/app.css': '.btn{background:#022d2c}',
  });
  const { css, baseUrl } = await fetchSite('http://x/demo', { fetchImpl });
  assert.ok(css.includes('--color-primary:#022d2c'));
  assert.ok(css.includes('.btn{background:#022d2c}'));
  assert.equal(baseUrl, 'http://x/demo');
});

test('captures inline style="" attributes and survives a broken stylesheet', async () => {
  const html = `<div style="color:#fff"></div><link rel="stylesheet" href="/missing.css">`;
  const fetchImpl = mockFetch({ 'http://x/': html });
  const { css } = await fetchSite('http://x/', { fetchImpl });
  assert.ok(css.includes('color:#fff'));
});

test('throws a clear error when the page itself is unreachable', async () => {
  const fetchImpl = mockFetch({});
  await assert.rejects(() => fetchSite('http://x/', { fetchImpl }), /HTTP 404/);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test server/lib/fetchSite.test.js`
Expected: FAIL — module not found.

- [ ] **Step 3: Write implementation**

```js
// server/lib/fetchSite.js
async function fetchText(url, fetchImpl, timeoutMs) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetchImpl(url, {
      signal: ctrl.signal,
      headers: { 'User-Agent': 'DesignBridge/0.1 (+ingester)' },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status} bei ${url}`);
    return await res.text();
  } finally {
    clearTimeout(t);
  }
}

export async function fetchSite(url, { fetchImpl = fetch, timeoutMs = 10000 } = {}) {
  const html = await fetchText(url, fetchImpl, timeoutMs);
  const base = new URL(url);
  let css = '';

  for (const m of html.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/gi)) css += '\n' + m[1];
  for (const m of html.matchAll(/style\s*=\s*"([^"]*)"/gi)) css += `\n.inline { ${m[1]} }`;

  for (const tag of html.match(/<link\b[^>]*>/gi) ?? []) {
    if (!/rel\s*=\s*["']?stylesheet/i.test(tag)) continue;
    const href = /href\s*=\s*["']([^"']+)["']/i.exec(tag)?.[1];
    if (!href) continue;
    const cssUrl = new URL(href, base).href;
    try {
      css += '\n' + (await fetchText(cssUrl, fetchImpl, timeoutMs));
    } catch {
      /* skip a broken/blocked stylesheet, keep what we have */
    }
  }

  return { css, baseUrl: base.href };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test server/lib/fetchSite.test.js`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add server/lib/fetchSite.js server/lib/fetchSite.test.js
git commit -m "feat(server): fetchSite — fetch page + linked/inline CSS"
```

---

## Task 5: Endpoint POST /api/scan/url

**Files:**
- Modify: `server/routes/scan.js`

- [ ] **Step 1: Add imports and the route**

At the top of `server/routes/scan.js`, after the existing imports, add:

```js
import { fetchSite } from '../lib/fetchSite.js';
import { ingestCss } from '../lib/cssIngest.js';
```

Before `export default router;`, add:

```js
// POST /api/scan/url
router.post('/url', async (req, res) => {
  const url = req.body?.url;
  if (!url || !/^https?:\/\/\S+$/i.test(url)) {
    return res.status(400).json({ error: 'Bitte eine gültige http(s)-URL angeben.' });
  }
  try {
    console.log(`[scan/url] Fetching ${url}`);
    const { css } = await fetchSite(url);
    const result = ingestCss(css, { sourceUrl: url });
    res.json(result);
  } catch (err) {
    console.error('[scan/url] Error:', err.message);
    res.status(502).json({ error: `Seite konnte nicht gelesen werden: ${err.message}` });
  }
});
```

(`express.json()` is already enabled in `server/index.js`, so `req.body` is parsed.)

- [ ] **Step 2: Smoke the route manually against a data URL is not possible — verify wiring by starting the server**

Run (from repo root): `node server/index.js &` then `curl -s -X POST http://localhost:3047/api/scan/url -H 'Content-Type: application/json' -d '{"url":"not-a-url"}'`
Expected: `{"error":"Bitte eine gültige http(s)-URL angeben."}` (HTTP 400). Then stop the server: `kill %1`.

- [ ] **Step 3: Commit**

```bash
git add server/routes/scan.js
git commit -m "feat(server): POST /api/scan/url endpoint"
```

---

## Task 6: Demo site + serve at /demo + integration test

**Files:**
- Create: `demo-site/index.html`, `demo-site/styles.css`
- Modify: `server/index.js`
- Test: `server/lib/cssIngest.test.js` (integration against the real demo CSS file)

- [ ] **Step 1: Create the demo stylesheet**

```css
/* demo-site/styles.css */
:root {
  --color-primary: #022d2c;
  --color-on-primary: #ffffff;
  --color-surface: #ffffff;
  --color-surface-muted: #f4f6f6;
  --color-text: #1a1a1a;
  --color-border: #e2e8e7;
  --color-success: #2e7d32;
  --color-warning: #ed6c02;

  --font-size-base: 16px;
  --font-size-lg: 20px;
  --font-size-xl: 32px;
  --font-weight-base: 400;
  --font-weight-xl: 700;

  --space-2: 8px;
  --space-4: 16px;
  --space-6: 24px;

  --radius-sm: 4px;
  --radius-md: 8px;
  --radius-full: 999px;

  --shadow-card: 0 1px 3px rgba(0,0,0,0.1);
  --shadow-pop: 0 8px 24px rgba(0,0,0,0.12);
}

body { background: var(--color-surface-muted); color: var(--color-text); font-family: system-ui, sans-serif; margin: 0; padding: var(--space-6); font-size: var(--font-size-base); }
.btn { background: var(--color-primary); color: var(--color-on-primary); border: 0; border-radius: var(--radius-md); padding: var(--space-2) var(--space-4); font-weight: var(--font-weight-base); }
.card { background: var(--color-surface); border: 1px solid var(--color-border); border-radius: var(--radius-md); box-shadow: var(--shadow-card); padding: var(--space-6); margin-top: var(--space-4); }
.badge { background: var(--color-success); color: #fff; border-radius: var(--radius-full); padding: 2px var(--space-2); font-size: 12px; }
h1 { font-size: var(--font-size-xl); font-weight: var(--font-weight-xl); }
```

- [ ] **Step 2: Create the demo page**

```html
<!-- demo-site/index.html -->
<!doctype html>
<html lang="de">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>ACME — DesignBridge Demo</title>
  <link rel="stylesheet" href="./styles.css" />
</head>
<body>
  <h1>ACME Analytics</h1>
  <div class="card">
    <p>Eine kleine Demo-Seite mit echten CSS-Variablen.</p>
    <span class="badge">Neu</span>
    <p><button class="btn">Jetzt starten</button></p>
  </div>
</body>
</html>
```

- [ ] **Step 3: Serve it from Express**

In `server/index.js`, add near the other imports:

```js
import path from 'path';
import { fileURLToPath } from 'url';
```

After `app.use(express.json());`, add:

```js
const __dirname = path.dirname(fileURLToPath(import.meta.url));
app.use('/demo', express.static(path.join(__dirname, '../demo-site')));
```

- [ ] **Step 4: Add an integration test against the real demo CSS**

Append to `server/lib/cssIngest.test.js`:

```js
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

test('ingests the bundled demo stylesheet into a full token set', () => {
  const cssPath = fileURLToPath(new URL('../../demo-site/styles.css', import.meta.url));
  const css = readFileSync(cssPath, 'utf8');
  const { tokens } = ingestCss(css, { sourceUrl: 'http://localhost:3047/demo' });
  assert.ok(tokens.colors.length >= 8, 'expected the named colors');
  assert.ok(tokens.colors.every((c) => c.source.startsWith('--color') || c.confidence === 'low'));
  assert.ok(tokens.typography.some((t) => t.role === 'xl' && t.weight === '700'));
  assert.deepEqual(tokens.spacing.map((s) => s.value), [8, 16, 24]);
  assert.ok(tokens.border_radius.some((r) => r.value === '999px' && r.usage === 'full'));
  assert.ok(tokens.shadows.some((s) => s.description === 'card'));
});
```

- [ ] **Step 5: Run the full server suite**

Run: `node --test server/`
Expected: PASS (all cssIngest + fetchSite tests, including the demo integration test).

- [ ] **Step 6: Clean AppleDouble files and commit**

```bash
find demo-site -name '._*' -delete
git add demo-site/ server/index.js server/lib/cssIngest.test.js
git commit -m "feat(server): controlled /demo page + ingest integration test"
```

---

## Task 7: Client adapter — generalize to adaptScanResponse(raw, source)

**Files:**
- Modify: `web/src/lib/scanResultAdapter.js`
- Test: `web/src/lib/scanResultAdapter.test.js`

- [ ] **Step 1: Write the failing test**

```js
// web/src/lib/scanResultAdapter.test.js
import { describe, it, expect } from 'vitest';
import { adaptScanResponse, adaptImageScanResponse } from './scanResultAdapter.js';

const raw = {
  tokens: { colors: [{ hex: '#022d2c', role: 'primary', confidence: 'high', source: '--color-primary' }] },
  atomics: [], components: [], patterns: [],
};

describe('adaptScanResponse', () => {
  it('tags the source and is not mocked', () => {
    const out = adaptScanResponse(raw, 'url');
    expect(out.source).toBe('url');
    expect(out.mocked).toBe(false);
    expect(out.categories.find((c) => c.key === 'colors').count).toBe(1);
    expect(out.raw).toBe(raw);
  });

  it('image alias keeps source "image"', () => {
    expect(adaptImageScanResponse(raw).source).toBe('image');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd web && npx vitest run src/lib/scanResultAdapter.test.js`
Expected: FAIL — `adaptScanResponse` not exported.

- [ ] **Step 3: Generalize the adapter**

In `web/src/lib/scanResultAdapter.js`, rename `adaptImageScanResponse` to `adaptScanResponse` with a `source` param, and add the alias. Replace the function declaration line and the `source` field:

```js
export function adaptScanResponse(raw, source = 'image') {
```

Change `source: 'image',` inside the returned object to `source,`. Then append at the end of the file:

```js
export const adaptImageScanResponse = (raw) => adaptScanResponse(raw, 'image');
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd web && npx vitest run src/lib/scanResultAdapter.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add web/src/lib/scanResultAdapter.js web/src/lib/scanResultAdapter.test.js
git commit -m "refactor(web): adaptScanResponse(raw, source) + image alias"
```

---

## Task 8: Wire real URL submit in useImportSession

**Files:**
- Modify: `web/src/lib/useImportSession.js`

- [ ] **Step 1: Replace the URL mock with a real fetch**

In `web/src/lib/useImportSession.js`:

Change the import line:

```js
import { adaptScanResponse } from './scanResultAdapter.js';
import { mockRepoImport } from './importMocks.js';
```

Add a `submitUrl` helper next to `submitImage`:

```js
async function submitUrl(url) {
  const res = await fetch('/api/scan/url', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ url }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'URL-Scan fehlgeschlagen');
  return adaptScanResponse(data, 'url');
}
```

Update `submitImage` to use the adapter under its new name (the alias still works, but keep it consistent): change its last line to `return adaptScanResponse(data, 'image');` and update its import usage accordingly (the file no longer needs `adaptImageScanResponse`).

In the `submit` callback, change the URL branch:

```js
      if (source === 'image') next = await submitImage(payload.file);
      else if (source === 'url') next = await submitUrl(payload.url);
      else if (source === 'repo') next = await mockRepoImport(payload);
```

- [ ] **Step 2: Verify the web suite still passes (no regressions)**

Run: `cd web && npx vitest run`
Expected: PASS — all existing tests green (the URL mock is no longer referenced).

- [ ] **Step 3: Commit**

```bash
git add web/src/lib/useImportSession.js
git commit -m "feat(web): real URL import via POST /api/scan/url"
```

---

## Task 9: UrlTab — drop mock copy, add "Demo-Seite verwenden"

**Files:**
- Modify: `web/src/components/ImportModal/tabs/UrlTab.jsx`

- [ ] **Step 1: Update the tab**

In `web/src/components/ImportModal/tabs/UrlTab.jsx`, replace the mocked-hint `<div>` with a demo-fill button + a short real hint:

Remove:

```jsx
      <div className="text-[10px] text-zinc-500">
        URL scanning is mocked in this preview — submitting returns a sample token set after ~1.5 s.
      </div>
```

Add in its place:

```jsx
      <div className="flex items-center gap-2 text-[10px] text-zinc-500">
        <button
          type="button"
          onClick={() => setUrl('http://localhost:3047/demo')}
          className="px-2 py-1 rounded border border-zinc-200 text-zinc-700 hover:bg-zinc-50"
        >
          Demo-Seite verwenden
        </button>
        <span>Liest Farben, Schriften, Abstände, Radius & Schatten aus dem CSS der Seite.</span>
      </div>
```

- [ ] **Step 2: Verify build / no syntax errors**

Run: `cd web && npx vitest run` (mounts components in existing modal tests)
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add web/src/components/ImportModal/tabs/UrlTab.jsx
git commit -m "feat(web): UrlTab — 'Demo-Seite verwenden' button, real copy"
```

---

## Task 10: Show token provenance (↳ source) in tokenViews

**Files:**
- Modify: `web/src/components/library/tokenViews.jsx`
- Test: `web/src/components/library/tokenViews.test.jsx`

- [ ] **Step 1: Write the failing test**

```jsx
// web/src/components/library/tokenViews.test.jsx
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ColorSwatch, SpacingRow } from './tokenViews.jsx';

describe('token provenance line', () => {
  it('shows ↳ source when present', () => {
    render(<ColorSwatch color={{ hex: '#022d2c', role: 'primary', confidence: 'high', source: '--color-primary' }} />);
    expect(screen.getByText(/--color-primary/)).toBeInTheDocument();
    expect(screen.getByText(/↳/)).toBeInTheDocument();
  });

  it('omits the line when source is absent', () => {
    render(<ColorSwatch color={{ hex: '#022d2c', role: 'primary', confidence: 'high' }} />);
    expect(screen.queryByText(/↳/)).not.toBeInTheDocument();
  });

  it('renders source on a spacing row too', () => {
    render(<ul><SpacingRow item={{ value: 16, usage: '4', confidence: 'high', source: '--space-4' }} /></ul>);
    expect(screen.getByText(/--space-4/)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd web && npx vitest run src/components/library/tokenViews.test.jsx`
Expected: FAIL — no `↳` rendered.

- [ ] **Step 3: Add a shared provenance element and use it in each view**

In `web/src/components/library/tokenViews.jsx`, add below the imports:

```jsx
function Source({ value }) {
  if (!value) return null;
  return <span className="block text-[9px] font-mono text-zinc-400 truncate">↳ {value}</span>;
}
```

Then render `<Source value={...} />`:

- In `ColorSwatch`, after the role `<span>`: `<Source value={color.source} />`
- In `TypographyRow`, inside the right-hand `<span>` group, after the meta span: `<Source value={item.source} />`
- In `SpacingRow`, before `<ConfidencePill .../>`: `<Source value={item.source} />`
- In `RadiusRow`, before `<ConfidencePill .../>`: `<Source value={item.source} />`
- In `ShadowRow`, before `<ConfidencePill .../>`: `<Source value={item.source} />`

- [ ] **Step 4: Run test to verify it passes**

Run: `cd web && npx vitest run src/components/library/tokenViews.test.jsx`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add web/src/components/library/tokenViews.jsx web/src/components/library/tokenViews.test.jsx
git commit -m "feat(web): show token provenance (↳ source) in token views"
```

---

## Task 11: Full verification + browser smoke test

**Files:** none (verification only)

- [ ] **Step 1: Run both test suites**

Run: `node --test server/` then `cd web && npx vitest run`
Expected: server tests all PASS; web tests **84+ PASS** (81 prior + new adapter/tokenViews tests), 0 fail.

- [ ] **Step 2: Start the app**

Run: `lsof -ti:3047; lsof -ti:5173` (confirm nothing running), then `npm run dev`
Expected: backend on :3047, frontend on :5173.

- [ ] **Step 3: Browser smoke (use preview tools, not manual)**

1. Open the app (incognito), wait for the import modal (empty state).
2. Switch to the **URL** tab, click **"Demo-Seite verwenden"** (fills `http://localhost:3047/demo`), click **Import**.
3. ImportSuccess shows non-zero counts for Colors / Typography / Spacing / Border radius / Shadows, UI inventory = 0.
4. Click **Open Library → Tokens**: colors render as swatches, each with a `↳ --color-…` line; typography/spacing/radius/shadows likewise show `↳ --…` provenance.
5. Dashboard shows the token counts. No console errors.

Expected: real CSS-derived tokens with visible provenance; inventory empty (by design).

- [ ] **Step 4: Stop the server and finish**

Stop `npm run dev`. The branch is ready for review/merge per `superpowers:finishing-a-development-branch`.

---

## Self-Review (completed during authoring)

**Spec coverage:**
- Server endpoint `POST /api/scan/url` → Task 5. ✓
- `fetchSite.js` network layer → Task 4. ✓
- `cssIngest.js` variables-first + declaration fallback + normalization → Tasks 1–3. ✓
- Canonical server shape (matches `analyzeScreenshot`) → Tasks 1–3 (summary/tokens/atomics/components/patterns/warnings/meta). ✓
- Demo site served at `/demo` → Task 6. ✓
- Client adapter generalization → Task 7. ✓
- `submitUrl` wiring → Task 8. ✓
- UrlTab demo button + copy → Task 9. ✓
- Token provenance `source` field (data) → Tasks 1–3; (UI) → Task 10. ✓
- Inventory empty (Option A) → atomics/components/patterns `[]` in Tasks 1–3. ✓
- postcss dependency → Task 0. ✓
- Tests: cssIngest, fetchSite, demo-integration, adapter, tokenViews, browser smoke → Tasks 1–11. ✓

**Type/name consistency:** `ingestCss(cssText, {sourceUrl})`, `fetchSite(url, {fetchImpl})`, `adaptScanResponse(raw, source)`, `submitUrl(url)`, token `source` field — used identically across tasks. ✓

**Placeholder scan:** every code step shows complete code; no TBD/TODO. ✓
