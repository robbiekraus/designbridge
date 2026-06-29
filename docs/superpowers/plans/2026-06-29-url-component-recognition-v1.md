# URL-Komponenten-Erkennung v1 — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Der URL-Import erkennt Komponenten & Patterns — gratis per Regeln, optional per Claude veredelt — und füllt damit die bestehende Library-UI.

**Architecture:** Zwei Erkennungs-Stufen liefern dieselbe Server-Shape wie der Bild-Scan: `recognizeComponents(html, css)` (deterministisch, gratis) befüllt `atomics/components/patterns` schon beim `POST /api/scan/url`; ein neuer `POST /api/scan/url/ai` reicht HTML+CSS+Regel-Liste an Claude (`recognizeWithAi`) und liefert eine gemergte Liste. Der Client zeigt ein „Mit KI vertiefen"-Banner und Herkunfts-Pillen; die vorhandene `emitComponents`→Accordion-Pipeline bleibt unverändert.

**Tech Stack:** Node/Express (`server/`, ESM, `node --test`), React/Vite/Tailwind (`web/`, Vitest), `node-html-parser` (neu), `@anthropic-ai/sdk` (vorhanden), `postcss` (vorhanden).

**Referenz-Spec:** `docs/superpowers/specs/2026-06-29-url-component-recognition-v1-design.md`

---

### Task 0: Abhängigkeit `node-html-parser` installieren

**Files:**
- Modify: `package.json` (Root — hier liegt auch `postcss`)

- [ ] **Step 1: Installieren**

Run:
```bash
cd "/Volumes/4TB Shield/Vibe Coding Bootcamp/Projekte/Designbridge" && npm install node-html-parser
```
Expected: `node-html-parser` erscheint unter `dependencies` in `package.json`, Exit 0.

- [ ] **Step 2: Import smoke-testen**

Run:
```bash
node -e "import('node-html-parser').then(m => console.log(typeof m.parse))"
```
Expected: `function`

- [ ] **Step 3: Commit**

```bash
git add package.json package-lock.json
git commit -m "build: add node-html-parser for HTML component recognition"
```

---

### Task 1: `fetchSite` gibt zusätzlich `html` zurück

**Files:**
- Modify: `server/lib/fetchSite.js:16-37`
- Test: `server/lib/fetchSite.test.js` (existiert ggf. — Test anhängen, nicht überschreiben)

- [ ] **Step 1: Failing test anhängen**

In `server/lib/fetchSite.test.js`:
```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fetchSite } from './fetchSite.js';

test('fetchSite returns the raw html alongside css', async () => {
  const html = '<html><head><style>.a{color:red}</style></head><body><button>x</button></body></html>';
  const fakeFetch = async () => ({ ok: true, status: 200, text: async () => html });
  const result = await fetchSite('http://x/', { fetchImpl: fakeFetch });
  assert.equal(result.html, html);
  assert.match(result.css, /color:red/);
  assert.equal(result.baseUrl, 'http://x/');
});
```

- [ ] **Step 2: Test laufen lassen, Fehlschlag bestätigen**

Run: `npm run test:server`
Expected: FAIL — `result.html` ist `undefined`.

- [ ] **Step 3: Implementieren**

In `server/lib/fetchSite.js` die Rückgabe (Zeile 36) ändern:
```js
  return { html, css, baseUrl: base.href };
```

- [ ] **Step 4: Test laufen lassen, Erfolg bestätigen**

Run: `npm run test:server`
Expected: PASS (alle Server-Tests grün).

- [ ] **Step 5: Commit**

```bash
git add server/lib/fetchSite.js server/lib/fetchSite.test.js
git commit -m "feat(server): fetchSite returns html alongside css"
```

---

### Task 2: `recognizeComponents` — Atomics

**Files:**
- Create: `server/lib/recognizeComponents.js`
- Test: `server/lib/recognizeComponents.test.js`

- [ ] **Step 1: Failing tests schreiben**

`server/lib/recognizeComponents.test.js`:
```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { recognizeComponents } from './recognizeComponents.js';

const names = (arr) => arr.map((x) => x.name);

test('detects a Button from <button> with variants from classes', () => {
  const html = '<button class="btn btn-primary">A</button><button class="btn btn-secondary">B</button>';
  const { atomics } = recognizeComponents(html, '');
  const btn = atomics.find((a) => a.name === 'Button');
  assert.ok(btn);
  assert.equal(btn.confidence, 'high');
  assert.equal(btn.source, 'rules');
  assert.deepEqual(btn.variants, ['primary', 'secondary']);
});

test('collapses multiple buttons into a single Button entry', () => {
  const html = '<button>A</button><button>B</button><button>C</button>';
  const { atomics } = recognizeComponents(html, '');
  assert.equal(atomics.filter((a) => a.name === 'Button').length, 1);
});

test('distinguishes Suche from Input', () => {
  const html = '<input type="search"><input type="text"><textarea></textarea>';
  const { atomics } = recognizeComponents(html, '');
  assert.ok(names(atomics).includes('Suche'));
  assert.ok(names(atomics).includes('Input'));
});

test('detects Badge from class with low confidence', () => {
  const html = '<span class="badge">Neu</span>';
  const { atomics } = recognizeComponents(html, '');
  const badge = atomics.find((a) => a.name === 'Badge');
  assert.ok(badge);
  assert.equal(badge.confidence, 'low');
});
```

- [ ] **Step 2: Fehlschlag bestätigen**

Run: `npm run test:server`
Expected: FAIL — Modul existiert nicht.

- [ ] **Step 3: Implementieren (Atomics; components/patterns vorerst leer)**

`server/lib/recognizeComponents.js`:
```js
import { parse } from 'node-html-parser';

const VARIANT_WORDS = ['primary', 'secondary', 'ghost', 'outline', 'danger', 'link'];

function walk(node, fn) {
  if (!node) return;
  if (node.nodeType === 1) fn(node);
  for (const c of node.childNodes || []) walk(c, fn);
}

const classOf = (el) => (el.getAttribute('class') || '').toLowerCase();
const roleOf = (el) => (el.getAttribute('role') || '').toLowerCase();
const typeOf = (el) => (el.getAttribute('type') || '').toLowerCase();

function buttonVariants(buttons) {
  const found = new Set();
  for (const b of buttons) {
    const cls = classOf(b);
    for (const w of VARIANT_WORDS) if (cls.includes(w)) found.add(w);
  }
  return [...found].sort();
}

function recognizeAtomics(els) {
  const out = [];

  const buttons = els.filter(
    (el) =>
      el.tagName === 'BUTTON' ||
      roleOf(el) === 'button' ||
      (el.tagName === 'A' && /\bbtn\b|button/.test(classOf(el)))
  );
  if (buttons.length) {
    const solid = buttons.some((b) => b.tagName === 'BUTTON' || roleOf(b) === 'button');
    out.push({
      name: 'Button',
      variants: buttonVariants(buttons),
      confidence: solid ? 'high' : 'low',
      source: 'rules',
      notes: '',
    });
  }

  const searches = els.filter(
    (el) => (el.tagName === 'INPUT' && typeOf(el) === 'search') || roleOf(el) === 'search'
  );
  if (searches.length) out.push({ name: 'Suche', variants: [], confidence: 'high', source: 'rules', notes: '' });

  const inputs = els.filter(
    (el) =>
      (el.tagName === 'INPUT' && typeOf(el) !== 'search') ||
      el.tagName === 'TEXTAREA' ||
      el.tagName === 'SELECT'
  );
  if (inputs.length) out.push({ name: 'Input', variants: [], confidence: 'high', source: 'rules', notes: '' });

  const badges = els.filter((el) => /badge|chip|\btag\b/.test(classOf(el)));
  if (badges.length) out.push({ name: 'Badge', variants: [], confidence: 'low', source: 'rules', notes: '' });

  return out;
}

export function recognizeComponents(html, css) {
  const root = parse(html || '');
  const els = [];
  walk(root, (el) => els.push(el));
  return {
    atomics: recognizeAtomics(els),
    components: [],
    patterns: [],
  };
}
```

- [ ] **Step 4: Erfolg bestätigen**

Run: `npm run test:server`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add server/lib/recognizeComponents.js server/lib/recognizeComponents.test.js
git commit -m "feat(server): recognize atomic components (button/input/search/badge) from html"
```

---

### Task 3: `recognizeComponents` — Patterns (Landmarken)

**Files:**
- Modify: `server/lib/recognizeComponents.js`
- Test: `server/lib/recognizeComponents.test.js` (anhängen)

- [ ] **Step 1: Failing tests anhängen**

```js
test('detects patterns from HTML landmarks with med confidence', () => {
  const html = '<nav>n</nav><header><h1>t</h1></header><footer>f</footer><aside>a</aside>';
  const { patterns } = recognizeComponents(html, '');
  const names = patterns.map((p) => p.name);
  assert.deepEqual(names.sort(), ['Footer', 'Hero', 'Navbar', 'Sidebar']);
  for (const p of patterns) {
    assert.equal(p.confidence, 'med');
    assert.equal(p.source, 'rules');
    assert.match(p.notes, /Landmarke/);
  }
});

test('detects navbar from role=navigation', () => {
  const { patterns } = recognizeComponents('<div role="navigation">x</div>', '');
  assert.ok(patterns.some((p) => p.name === 'Navbar'));
});
```

- [ ] **Step 2: Fehlschlag bestätigen**

Run: `npm run test:server`
Expected: FAIL — `patterns` ist leer.

- [ ] **Step 3: Implementieren**

In `server/lib/recognizeComponents.js` vor `recognizeComponents` einfügen:
```js
function recognizePatterns(els) {
  const out = [];
  const add = (pred, name, note) => {
    if (els.some(pred)) out.push({ name, variants: [], confidence: 'med', source: 'rules', notes: note });
  };
  add((el) => el.tagName === 'NAV' || roleOf(el) === 'navigation', 'Navbar', 'aus <nav>-Landmarke');
  add((el) => el.tagName === 'HEADER' || roleOf(el) === 'banner', 'Hero', 'aus <header>-Landmarke');
  add((el) => el.tagName === 'FOOTER' || roleOf(el) === 'contentinfo', 'Footer', 'aus <footer>-Landmarke');
  add((el) => el.tagName === 'ASIDE' || roleOf(el) === 'complementary', 'Sidebar', 'aus <aside>-Landmarke');
  return out;
}
```

Und in `recognizeComponents` die Rückgabe ändern:
```js
  return {
    atomics: recognizeAtomics(els),
    components: [],
    patterns: recognizePatterns(els),
  };
```

- [ ] **Step 4: Erfolg bestätigen**

Run: `npm run test:server`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add server/lib/recognizeComponents.js server/lib/recognizeComponents.test.js
git commit -m "feat(server): recognize page patterns from html landmarks"
```

---

### Task 4: `recognizeComponents` — Components (zusammengesetzt)

**Files:**
- Modify: `server/lib/recognizeComponents.js`
- Test: `server/lib/recognizeComponents.test.js` (anhängen)

- [ ] **Step 1: Failing tests anhängen**

```js
test('detects composed components: form, table, list, card', () => {
  const html = `
    <form><input type="text"></form>
    <table><tr><td>x</td></tr></table>
    <ul><li>1</li><li>2</li><li>3</li></ul>
    <div class="card">A</div><div class="card">B</div>`;
  const { components } = recognizeComponents(html, '');
  const names = components.map((c) => c.name).sort();
  assert.deepEqual(names, ['Card', 'Formular', 'Liste', 'Tabelle']);
});

test('ignores a form without fields and a short list', () => {
  const html = '<form></form><ul><li>1</li><li>2</li></ul>';
  const { components } = recognizeComponents(html, '');
  assert.equal(components.length, 0);
});
```

- [ ] **Step 2: Fehlschlag bestätigen**

Run: `npm run test:server`
Expected: FAIL — `components` ist leer.

- [ ] **Step 3: Implementieren**

In `server/lib/recognizeComponents.js` vor `recognizeComponents` einfügen:
```js
function recognizeComposed(els) {
  const out = [];

  const forms = els.filter(
    (el) => el.tagName === 'FORM' && el.querySelectorAll('input, textarea, select').length > 0
  );
  if (forms.length) out.push({ name: 'Formular', variants: [], confidence: 'med', source: 'rules', notes: '' });

  if (els.some((el) => el.tagName === 'TABLE'))
    out.push({ name: 'Tabelle', variants: [], confidence: 'med', source: 'rules', notes: '' });

  const lists = els.filter(
    (el) => (el.tagName === 'UL' || el.tagName === 'OL') && el.querySelectorAll('li').length >= 3
  );
  if (lists.length) out.push({ name: 'Liste', variants: [], confidence: 'med', source: 'rules', notes: '' });

  const classCounts = new Map();
  for (const el of els) {
    for (const c of classOf(el).split(/\s+/).filter(Boolean)) {
      classCounts.set(c, (classCounts.get(c) || 0) + 1);
    }
  }
  const card = [...classCounts.entries()].find(([c, n]) => /card|tile/.test(c) && n >= 2);
  if (card) out.push({ name: 'Card', variants: [], confidence: 'low', source: 'rules', notes: '' });

  return out;
}
```

Und die Rückgabe in `recognizeComponents`:
```js
  return {
    atomics: recognizeAtomics(els),
    components: recognizeComposed(els),
    patterns: recognizePatterns(els),
  };
```

- [ ] **Step 4: Erfolg bestätigen**

Run: `npm run test:server`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add server/lib/recognizeComponents.js server/lib/recognizeComponents.test.js
git commit -m "feat(server): recognize composed components (form/table/list/card)"
```

---

### Task 5: `/api/scan/url` füllt Inventory + Demo-Seite anreichern

**Files:**
- Modify: `server/routes/scan.js:7-8` (Import), `:76-90` (URL-Route)
- Modify: `demo-site/index.html`

- [ ] **Step 1: Import ergänzen**

In `server/routes/scan.js` nach Zeile 8 (`import { ingestCss } ...`):
```js
import { recognizeComponents } from '../lib/recognizeComponents.js';
```

- [ ] **Step 2: URL-Route erweitern**

Die `router.post('/url', ...)`-Handler-Mitte (aktuell `const { css } = await fetchSite(url); const result = ingestCss(...); res.json(result);`) ersetzen durch:
```js
    const { html, css } = await fetchSite(url);
    const result = ingestCss(css, { sourceUrl: url });
    const rec = recognizeComponents(html, css);
    result.atomics = rec.atomics;
    result.components = rec.components;
    result.patterns = rec.patterns;
    result.meta = { ...result.meta, source_url: url, ai_deepened: false };
    res.json(result);
```

- [ ] **Step 3: Demo-Seite anreichern (damit die Regeln dort greifen)**

`demo-site/index.html` komplett ersetzen:
```html
<!doctype html>
<html lang="de">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>ACME — DesignBridge Demo</title>
  <link rel="stylesheet" href="/demo/styles.css" />
</head>
<body>
  <nav>
    <a href="#">Home</a>
    <form role="search"><input type="search" placeholder="Suchen…"></form>
  </nav>
  <header>
    <h1>ACME Analytics</h1>
    <p>Eine kleine Demo-Seite mit echten CSS-Variablen.</p>
    <button class="btn btn-primary">Jetzt starten</button>
    <button class="btn btn-secondary">Mehr</button>
  </header>
  <main>
    <div class="card"><h2>Karte A</h2><p>Text</p><span class="badge">Neu</span></div>
    <div class="card"><h2>Karte B</h2><p>Text</p></div>
    <ul><li>Punkt 1</li><li>Punkt 2</li><li>Punkt 3</li></ul>
    <form><input type="email" placeholder="E-Mail"><button class="btn">Abonnieren</button></form>
  </main>
  <footer><p>© ACME</p></footer>
</body>
</html>
```

- [ ] **Step 4: AppleDouble-Reste säubern (CLAUDE.md Regel 7 — `demo-site/` wird ausgeliefert)**

Run:
```bash
cd "/Volumes/4TB Shield/Vibe Coding Bootcamp/Projekte/Designbridge/demo-site" && find . -name '._*' -delete; cd ..
```

- [ ] **Step 5: Server-Tests bleiben grün**

Run: `npm run test:server`
Expected: PASS (keine Route-Tests betroffen; Verdrahtung wird im Browser-Smoke geprüft).

- [ ] **Step 6: Commit**

```bash
git add server/routes/scan.js demo-site/index.html
git commit -m "feat(server): /api/scan/url returns rule-based component inventory; enrich demo page"
```

---

### Task 6: `recognizeWithAi` — Claude-Veredelung (Fake-Client, keine Credits)

**Files:**
- Create: `server/lib/recognizeWithAi.js`
- Test: `server/lib/recognizeWithAi.test.js`

- [ ] **Step 1: Failing tests schreiben**

`server/lib/recognizeWithAi.test.js`:
```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { recognizeWithAi, trimHtml } from './recognizeWithAi.js';

function fakeClient(payload) {
  return { messages: { create: async () => ({ content: [{ text: JSON.stringify(payload) }] }) } };
}

test('returns merged lists from the model', async () => {
  const client = fakeClient({
    atomics: [{ name: 'Button', variants: ['primary'], confidence: 'high', source: 'rules+ai', notes: '' }],
    components: [{ name: 'Card', confidence: 'med', source: 'ai', notes: '' }],
    patterns: [{ name: 'Navbar', confidence: 'high', source: 'rules+ai', notes: 'Input → Suche' }],
    warnings: [],
  });
  const out = await recognizeWithAi('<button>x</button>', '', { atomics: [], components: [], patterns: [] }, { client });
  assert.equal(out.atomics[0].source, 'rules+ai');
  assert.equal(out.components[0].source, 'ai');
  assert.equal(out.patterns[0].notes, 'Input → Suche');
});

test('throws a clear error on invalid JSON', async () => {
  const client = { messages: { create: async () => ({ content: [{ text: 'not json' }] }) } };
  await assert.rejects(
    () => recognizeWithAi('<x>', '', { atomics: [], components: [], patterns: [] }, { client }),
    /invalid JSON/
  );
});

test('trimHtml strips scripts and caps length, flagging truncation', () => {
  const big = '<script>evil()</script>' + '<div>'.repeat(10000);
  const { html, truncated } = trimHtml(big);
  assert.ok(!html.includes('evil'));
  assert.ok(truncated);
});

test('adds a truncation warning when html was capped', async () => {
  const client = fakeClient({ atomics: [], components: [], patterns: [], warnings: [] });
  const big = '<div>'.repeat(10000);
  const out = await recognizeWithAi(big, '', { atomics: [], components: [], patterns: [] }, { client });
  assert.ok(out.warnings.some((w) => /gekürzt/.test(w)));
});
```

- [ ] **Step 2: Fehlschlag bestätigen**

Run: `npm run test:server`
Expected: FAIL — Modul existiert nicht.

- [ ] **Step 3: Implementieren**

`server/lib/recognizeWithAi.js`:
```js
import Anthropic from '@anthropic-ai/sdk';

const MODEL = 'claude-sonnet-4-5';
const MAX_HTML = 20000;

export function trimHtml(html) {
  let out = (html || '')
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<svg[\s\S]*?<\/svg>/gi, '')
    .replace(/<!--[\s\S]*?-->/g, '');
  const truncated = out.length > MAX_HTML;
  if (truncated) out = out.slice(0, MAX_HTML);
  return { html: out, truncated };
}

function buildPrompt(html, css, ruleList) {
  return `You are a UI component recognition engine. You are given the HTML and CSS of a web page plus a draft list of components found by deterministic rules. Confirm correct entries, fix wrong ones, and add ones the rules missed.

Return ONLY valid JSON, no markdown, no preamble, in this shape:
{
  "atomics":    [{ "name": "...", "variants": ["..."], "confidence": "high|med|low", "source": "rules+ai|ai", "notes": "" }],
  "components": [{ "name": "...", "confidence": "high|med|low", "source": "rules+ai|ai", "notes": "" }],
  "patterns":   [{ "name": "...", "confidence": "high|med|low", "source": "rules+ai|ai", "notes": "" }],
  "warnings":   ["..."]
}

Rules:
- Use source "rules+ai" when an entry confirms or corrects one from the draft list; use "ai" for entries you add.
- When you correct a draft entry, describe the change in notes, e.g. "Input → Suche".
- Only report what the HTML actually supports. Be conservative.

DRAFT LIST (from rules):
${JSON.stringify(ruleList)}

CSS:
${css || ''}

HTML:
${html}`;
}

export async function recognizeWithAi(html, css, ruleList, { client } = {}) {
  const c = client ?? new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const { html: trimmed, truncated } = trimHtml(html);
  const response = await c.messages.create({
    model: MODEL,
    max_tokens: 4096,
    messages: [{ role: 'user', content: [{ type: 'text', text: buildPrompt(trimmed, css, ruleList) }] }],
  });
  const text = response.content.map((b) => b.text || '').join('');
  const clean = text.replace(/```json\n?|```\n?/g, '').trim();
  let parsed;
  try {
    parsed = JSON.parse(clean);
  } catch {
    throw new Error(`Claude returned invalid JSON. Raw: ${text.slice(0, 300)}`);
  }
  const warnings = Array.isArray(parsed.warnings) ? parsed.warnings : [];
  if (truncated) warnings.push('HTML war groß und wurde für die KI-Analyse gekürzt.');
  return {
    atomics: parsed.atomics ?? [],
    components: parsed.components ?? [],
    patterns: parsed.patterns ?? [],
    warnings,
  };
}
```

- [ ] **Step 4: Erfolg bestätigen**

Run: `npm run test:server`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add server/lib/recognizeWithAi.js server/lib/recognizeWithAi.test.js
git commit -m "feat(server): recognizeWithAi merges rule list via Claude (injectable client)"
```

---

### Task 7: `/api/scan/url/ai` Endpoint

**Files:**
- Modify: `server/routes/scan.js` (Import + neue Route nach `/url`)

- [ ] **Step 1: Import ergänzen**

Nach dem `recognizeComponents`-Import in `server/routes/scan.js`:
```js
import { recognizeWithAi } from '../lib/recognizeWithAi.js';
```

- [ ] **Step 2: Neue Route hinzufügen**

Direkt nach dem `router.post('/url', ...)`-Block, vor `export default router;`:
```js
// POST /api/scan/url/ai — optional Claude pass over the rule list
router.post('/url/ai', async (req, res) => {
  const url = req.body?.url;
  if (!url || !/^https?:\/\/\S+$/i.test(url)) {
    return res.status(400).json({ error: 'Bitte eine gültige http(s)-URL angeben.' });
  }
  try {
    console.log(`[scan/url/ai] Deepening ${url}`);
    const { html, css } = await fetchSite(url);
    const result = ingestCss(css, { sourceUrl: url });
    const baseline = recognizeComponents(html, css);
    const merged = await recognizeWithAi(html, css, baseline);
    result.atomics = merged.atomics;
    result.components = merged.components;
    result.patterns = merged.patterns;
    result.warnings = [...(result.warnings || []), ...(merged.warnings || [])];
    result.meta = { ...result.meta, source_url: url, ai_deepened: true };
    res.json(result);
  } catch (err) {
    console.error('[scan/url/ai] Error:', err.message);
    res.status(502).json({ error: `KI-Analyse fehlgeschlagen: ${err.message}` });
  }
});
```

- [ ] **Step 3: Server-Tests bleiben grün**

Run: `npm run test:server`
Expected: PASS (Verdrahtung über Browser-Smoke geprüft; Lib-Logik bereits getestet).

- [ ] **Step 4: Commit**

```bash
git add server/routes/scan.js
git commit -m "feat(server): POST /api/scan/url/ai deepens inventory via Claude"
```

---

### Task 8: `emitComponents` reicht `source` + `notes` durch

**Files:**
- Modify: `web/src/lib/emit/emitComponents.js:48-58`
- Test: `web/src/lib/emit/emitComponents.source.test.js`

- [ ] **Step 1: Failing test schreiben**

`web/src/lib/emit/emitComponents.source.test.js`:
```js
import { describe, it, expect } from 'vitest';
import { emitComponents } from './emitComponents.js';

describe('emitComponents source passthrough', () => {
  it('carries source and notes from the recognized item', () => {
    const result = {
      raw: {
        tokens: {},
        atomics: [{ name: 'Button', confidence: 'high', source: 'rules+ai', notes: 'Input → Suche' }],
        components: [],
        patterns: [],
      },
    };
    const items = emitComponents(result, 'atomic');
    expect(items[0].source).toBe('rules+ai');
    expect(items[0].notes).toBe('Input → Suche');
  });
});
```

- [ ] **Step 2: Fehlschlag bestätigen**

Run: `cd web && npx vitest run src/lib/emit/emitComponents.source.test.js`
Expected: FAIL — `source`/`notes` sind `undefined`.

- [ ] **Step 3: Implementieren**

In `web/src/lib/emit/emitComponents.js` im `out.push({ ... })` (Zeile 48-58) zwei Felder ergänzen:
```js
        confidence: item.confidence ?? null,
        source: item.source ?? null,
        notes: item.notes ?? null,
        hasPreview: Boolean(tpl),
```

- [ ] **Step 4: Erfolg bestätigen**

Run: `cd web && npx vitest run src/lib/emit/emitComponents.source.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add web/src/lib/emit/emitComponents.js web/src/lib/emit/emitComponents.source.test.js
git commit -m "feat(web): emitComponents passes through source and notes"
```

---

### Task 9: `SourcePill` + Anzeige in `LibraryObjectList`

**Files:**
- Create: `web/src/components/library/SourcePill.jsx`
- Test: `web/src/components/library/SourcePill.test.js`
- Modify: `web/src/components/library/LibraryObjectList.jsx`

- [ ] **Step 1: Failing test für die Mapping-Logik**

`web/src/components/library/SourcePill.test.js`:
```js
import { describe, it, expect } from 'vitest';
import { sourceLabel } from './SourcePill.jsx';

describe('sourceLabel', () => {
  it('maps known sources to a label', () => {
    expect(sourceLabel('rules+ai').label).toBe('Regeln + KI');
    expect(sourceLabel('ai').label).toBe('von KI');
    expect(sourceLabel('rules').label).toBe('nur Regeln');
  });
  it('returns null for missing/unknown source', () => {
    expect(sourceLabel(null)).toBeNull();
    expect(sourceLabel('xxx')).toBeNull();
  });
});
```

- [ ] **Step 2: Fehlschlag bestätigen**

Run: `cd web && npx vitest run src/components/library/SourcePill.test.js`
Expected: FAIL — Modul existiert nicht.

- [ ] **Step 3: `SourcePill` implementieren**

`web/src/components/library/SourcePill.jsx`:
```jsx
import React from 'react';

const MAP = {
  'rules+ai': { label: 'Regeln + KI', cls: 'bg-green-100 text-green-800' },
  ai: { label: 'von KI', cls: 'bg-amber-100 text-amber-800' },
  rules: { label: 'nur Regeln', cls: 'bg-zinc-100 text-zinc-600' },
};

export function sourceLabel(source) {
  return MAP[source] ?? null;
}

export default function SourcePill({ value }) {
  const m = sourceLabel(value);
  if (!m) return null;
  return (
    <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded ${m.cls}`}>{m.label}</span>
  );
}
```

- [ ] **Step 4: In `LibraryObjectList` einbinden**

In `web/src/components/library/LibraryObjectList.jsx`:

(a) Import nach `ConfidencePill` (Zeile 2):
```jsx
import SourcePill from './SourcePill.jsx';
```

(b) In der Accordion-Kopfzeile direkt nach `<ConfidencePill value={item.confidence} />` (Zeile 31):
```jsx
        <SourcePill value={item.source} />
```

(c) Im aufgeklappten Bereich, direkt nach dem schließenden `)}` des Varianten-Blocks (nach Zeile 56), den Korrektur-Hinweis ergänzen:
```jsx
          {item.notes && (
            <div className="text-[11px] text-amber-700 pt-1">{item.notes}</div>
          )}
```

- [ ] **Step 5: Erfolg bestätigen**

Run: `cd web && npx vitest run src/components/library/SourcePill.test.js`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add web/src/components/library/SourcePill.jsx web/src/components/library/SourcePill.test.js web/src/components/library/LibraryObjectList.jsx
git commit -m "feat(web): show source provenance pill and correction notes on objects"
```

---

### Task 10: `deepenWithAi` Client-Funktion

**Files:**
- Create: `web/src/lib/aiDeepen.js`
- Test: `web/src/lib/aiDeepen.test.js`

- [ ] **Step 1: Failing tests schreiben**

`web/src/lib/aiDeepen.test.js`:
```js
import { describe, it, expect, vi, afterEach } from 'vitest';
import { deepenWithAi } from './aiDeepen.js';

const result = { source: 'url', raw: { meta: { source_url: 'http://x/demo' } } };

afterEach(() => vi.restoreAllMocks());

describe('deepenWithAi', () => {
  it('posts the url and returns an adapted url-result', async () => {
    const serverShape = { tokens: {}, atomics: [{ name: 'Button', confidence: 'high', source: 'rules+ai' }], components: [], patterns: [], meta: { ai_deepened: true } };
    global.fetch = vi.fn(async () => ({ ok: true, json: async () => serverShape }));
    const next = await deepenWithAi(result);
    expect(global.fetch).toHaveBeenCalledWith('/api/scan/url/ai', expect.objectContaining({ method: 'POST' }));
    expect(next.source).toBe('url');
    expect(next.raw.meta.ai_deepened).toBe(true);
  });

  it('throws when the server responds with an error', async () => {
    global.fetch = vi.fn(async () => ({ ok: false, json: async () => ({ error: 'keine Credits' }) }));
    await expect(deepenWithAi(result)).rejects.toThrow('keine Credits');
  });

  it('throws when no source url is present', async () => {
    await expect(deepenWithAi({ source: 'url', raw: { meta: {} } })).rejects.toThrow(/URL/);
  });
});
```

- [ ] **Step 2: Fehlschlag bestätigen**

Run: `cd web && npx vitest run src/lib/aiDeepen.test.js`
Expected: FAIL — Modul existiert nicht.

- [ ] **Step 3: Implementieren**

`web/src/lib/aiDeepen.js`:
```js
import { adaptScanResponse } from './scanResultAdapter.js';

export async function deepenWithAi(result) {
  const url = result?.raw?.meta?.source_url;
  if (!url) throw new Error('Keine URL zum Vertiefen vorhanden.');
  const res = await fetch('/api/scan/url/ai', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ url }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'KI-Analyse fehlgeschlagen');
  return adaptScanResponse(data, 'url');
}
```

- [ ] **Step 4: Erfolg bestätigen**

Run: `cd web && npx vitest run src/lib/aiDeepen.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add web/src/lib/aiDeepen.js web/src/lib/aiDeepen.test.js
git commit -m "feat(web): deepenWithAi posts to /api/scan/url/ai and adapts the result"
```

---

### Task 11: `AiDeepenBanner` + App-Verdrahtung

**Files:**
- Create: `web/src/components/library/AiDeepenBanner.jsx`
- Test: `web/src/components/library/AiDeepenBanner.test.js`
- Modify: `web/src/App.jsx`

- [ ] **Step 1: Failing test für die Sichtbarkeits-Logik**

`web/src/components/library/AiDeepenBanner.test.js`:
```js
import { describe, it, expect } from 'vitest';
import { shouldShowDeepenBanner } from './AiDeepenBanner.jsx';

describe('shouldShowDeepenBanner', () => {
  it('shows for a fresh url import', () => {
    expect(shouldShowDeepenBanner({ source: 'url', raw: { meta: { ai_deepened: false } } })).toBe(true);
  });
  it('hides once deepened', () => {
    expect(shouldShowDeepenBanner({ source: 'url', raw: { meta: { ai_deepened: true } } })).toBe(false);
  });
  it('hides for non-url sources', () => {
    expect(shouldShowDeepenBanner({ source: 'image', raw: { meta: {} } })).toBe(false);
  });
});
```

- [ ] **Step 2: Fehlschlag bestätigen**

Run: `cd web && npx vitest run src/components/library/AiDeepenBanner.test.js`
Expected: FAIL — Modul existiert nicht.

- [ ] **Step 3: `AiDeepenBanner` implementieren**

`web/src/components/library/AiDeepenBanner.jsx`:
```jsx
import React, { useState } from 'react';
import { deepenWithAi } from '../../lib/aiDeepen.js';

export function shouldShowDeepenBanner(result) {
  return result?.source === 'url' && !result?.raw?.meta?.ai_deepened;
}

export default function AiDeepenBanner({ result, onDeepened }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  if (!shouldShowDeepenBanner(result)) return null;

  const run = async () => {
    setBusy(true);
    setError(null);
    try {
      const next = await deepenWithAi(result);
      onDeepened(next);
    } catch (e) {
      setError(e.message || String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mb-6 flex items-center gap-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3">
      <div className="flex-1">
        <div className="text-sm font-medium text-amber-900">Komponenten &amp; Patterns noch nicht analysiert</div>
        {error ? (
          <div className="text-xs text-amber-700">KI-Analyse gerade nicht möglich — die Regel-Funde bleiben erhalten.</div>
        ) : (
          <div className="text-xs text-amber-700">Die festen Regeln haben eine erste Liste erstellt. Mit KI vertiefen für mehr Genauigkeit.</div>
        )}
      </div>
      <button
        onClick={run}
        disabled={busy}
        className="text-xs px-3 py-1.5 rounded bg-zinc-900 text-white font-medium hover:bg-zinc-700 disabled:opacity-50"
      >
        {busy ? 'Analysiere…' : 'Mit KI vertiefen'}
      </button>
    </div>
  );
}
```

- [ ] **Step 4: In `App.jsx` einbinden**

(a) Import nach `EmptyState` (Zeile 10):
```jsx
import AiDeepenBanner from './components/library/AiDeepenBanner.jsx';
```

(b) Handler neben `handleImported` (nach Zeile 35):
```jsx
  const handleDeepened = (result) => {
    saveLastImport(result);
    setLastImport(result);
  };
```

(c) Den `<main>`-Block (Zeile 105-107) ersetzen:
```jsx
        <main className="flex-1 overflow-y-auto">
          <div className="p-8">
            {lastImport && <AiDeepenBanner result={lastImport} onDeepened={handleDeepened} />}
            {renderPage()}
          </div>
        </main>
```

- [ ] **Step 5: Erfolg bestätigen**

Run: `cd web && npx vitest run src/components/library/AiDeepenBanner.test.js`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add web/src/components/library/AiDeepenBanner.jsx web/src/components/library/AiDeepenBanner.test.js web/src/App.jsx
git commit -m "feat(web): AiDeepenBanner triggers Claude deepening from the library"
```

---

### Task 12: Voll-Verifikation + Browser-Smoke

**Files:** keine (nur Verifikation; bei nötigen Fixes deren Dateien committen)

- [ ] **Step 1: Alle Server-Tests**

Run: `npm run test:server`
Expected: PASS — inkl. neuer `recognizeComponents`/`recognizeWithAi`/`fetchSite`-Tests.

- [ ] **Step 2: Alle Web-Tests**

Run: `cd web && npx vitest run`
Expected: PASS — Baseline (86) + neue Tests, keine Regressionen.

- [ ] **Step 3: Build**

Run: `cd web && npx vite build`
Expected: Build ohne Fehler.

- [ ] **Step 4: App starten** (vorher Ports prüfen)

Run:
```bash
lsof -ti:3047; lsof -ti:5173
```
Wenn frei: `npm run dev` (Backend :3047, Frontend :5173).

- [ ] **Step 5: Browser-Smoke per preview_*-Workflow**

1. Frontend öffnen, Import-Dialog → URL-Tab → „Demo-Seite verwenden" (`http://localhost:3047/demo`) → Import.
2. Erwartet: Inventory zeigt Atomics (Button/Input/Suche/Badge), Components (Formular/Liste/Card), Patterns (Navbar/Hero/Footer) — alle mit grauer „nur Regeln"-Pille. Banner „Komponenten & Patterns noch nicht analysiert" sichtbar.
3. „Mit KI vertiefen" klicken.
   - Mit Credits: Banner verschwindet, Pillen werden grün/gelb, ggf. Korrektur-Notiz sichtbar, keine Konsolenfehler.
   - Ohne Credits: ruhige Fehlerzeile im Banner, Regel-Liste bleibt vollständig erhalten (Fehlerpfad demonstriert).
4. `preview_console_logs` prüfen: keine Fehler. `preview_screenshot` als Beleg.

- [ ] **Step 6: Abschluss-Commit (falls Fixes nötig waren)**

```bash
git add -A
git commit -m "test: verify url component recognition end-to-end"
```

---

## Hinweise für die Ausführung

- **Push:** Nach Abschluss mit Rob über `git push` nach `origin/main` sprechen (Regel 5 — kein eigenmächtiger Push).
- **Credits:** Der echte Claude-Lauf in Task 12 braucht Guthaben. Ist keins da, gilt der Fehlerpfad als bestandener Test (gratis Liste bleibt erhalten).
- **Reihenfolge:** Tasks sind streng abhängig (0→12); Server-Tasks (1-7) und Web-Tasks (8-11) sind je intern gekoppelt, aber 8-11 setzen die Server-Shape aus 5/7 nur konzeptionell voraus und können parallel zu späteren Server-Tasks laufen.
