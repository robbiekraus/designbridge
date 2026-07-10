# URL/DOM-Decompose (Scheibe ②) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Der URL-Import bekommt dieselbe automatische KI-Interpretation wie der Bild-Import — Quelle ist der echte DOM-Ausschnitt (HTML+CSS) je Baustein statt eines Bild-Crops.

**Architecture:** Der URL-Scan speichert HTML+CSS 15 min im neuen `pageStore` (Muster `imageStore`) und liefert `meta.import_id`. `recognizeComponents` wird instanzbasiert (jeder Baustein bekommt einen `selector`; unerkannte Container-Kandidaten kommen dazu). Der neue `UrlDecomposer` (Fabrik-Eintrag `'url'`) füllt `Segment.structure = {html, css}`. `interpretComponents` akzeptiert Struktur-Segmente als Textblöcke im (weiterhin einen) Claude-Call. Die Web-App lässt `source:'url'` in die bestehende Interpretations-Orchestrierung.

**Tech Stack:** Node/Express, `node-html-parser` (liegt in package.json), node:test (Server), Vitest (Web). Alle Tests mit Fake-Client — 0 Credits.

**Spec:** `docs/superpowers/specs/2026-07-10-url-decompose-slice2-design.md`

**Arbeitsregeln (CLAUDE.md):** kein Push ohne Robs OK · nach Datei-Writes `find . -name '._*' -delete` · Server-Tests `npm run test:server` · Web-Tests `cd web && npx vitest run`.

---

### Task 0: Feature-Branch

**Files:** keine.

- [ ] **Step 1: Branch anlegen**

```bash
cd "/Volumes/4TB Shield/Vibe Coding Bootcamp/Projekte/Designbridge"
git checkout main && git checkout -b feat/url-decompose-slice2
```

Erwartung: `git branch --show-current` → `feat/url-decompose-slice2`. Kein Commit nötig.

---

### Task 1: `pageStore` — HTML+CSS kurzlebig ablegen

**Files:**
- Create: `server/lib/pageStore.js`
- Test: `server/lib/pageStore.test.js`

Exakt das `imageStore`-Muster (`server/lib/imageStore.js`), nur ohne Datei-Löschung (reine Strings statt Tempdatei).

- [ ] **Step 1: Failing Test schreiben**

```js
// server/lib/pageStore.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { putPage, getPage, removePage, clearPages } from './pageStore.js';

test('putPage/getPage liefert html+css zurück', () => {
  const id = putPage('<html></html>', 'body{color:red}');
  const e = getPage(id);
  assert.equal(e.html, '<html></html>');
  assert.equal(e.css, 'body{color:red}');
  clearPages();
});

test('getPage nach removePage/TTL → null', async () => {
  const id = putPage('<p>x</p>', '', { ttlMs: 5 });
  await new Promise((r) => setTimeout(r, 20));
  assert.equal(getPage(id), null);
  const id2 = putPage('<p>y</p>', '');
  removePage(id2);
  assert.equal(getPage(id2), null);
  clearPages();
});
```

- [ ] **Step 2: Test läuft rot**

Run: `npm run test:server` — Erwartung: FAIL (`Cannot find module './pageStore.js'`).

- [ ] **Step 3: Implementierung**

```js
// server/lib/pageStore.js
// Kurzlebiger In-Memory-Store für gefetchte Seiten (HTML+CSS), damit die
// KI-Interpretation die Quelle nach dem Scan noch einmal ansehen kann.
// Muster: imageStore.js (ephemerer Übergabepuffer, TTL 15 min).
import crypto from 'crypto';

const TTL_MS = 15 * 60 * 1000;

const entries = new Map(); // id → { html, css, timer }

export function putPage(html, css, { ttlMs = TTL_MS } = {}) {
  const id = crypto.randomBytes(8).toString('hex');
  const timer = setTimeout(() => removePage(id), ttlMs);
  if (timer.unref) timer.unref();
  entries.set(id, { html, css, timer });
  return id;
}

export function getPage(id) {
  const e = entries.get(id);
  return e ? { html: e.html, css: e.css } : null;
}

export function removePage(id) {
  const e = entries.get(id);
  if (!e) return;
  clearTimeout(e.timer);
  entries.delete(id);
}

export function clearPages() {
  for (const id of [...entries.keys()]) removePage(id);
}
```

- [ ] **Step 4: Test läuft grün** — `npm run test:server` → alle pass (105 + 2 neue).

- [ ] **Step 5: Commit**

```bash
find . -name '._*' -delete
git add server/lib/pageStore.js server/lib/pageStore.test.js
git commit -m "feat(pageStore): ephemeral html+css store for url interpret (imageStore pattern)"
```

---

### Task 2: `recognizeComponents` instanzbasiert — `selector` je Baustein + unerkannte Kandidaten

**Files:**
- Modify: `server/lib/recognizeComponents.js`
- Test: `server/lib/recognizeComponents.test.js` (erweitern, bestehende Tests NICHT ändern)

Zwei Erweiterungen, beide rein additiv zur Antwort-Shape:
1. Jeder erkannte Baustein bekommt `selector` — ein selbst erzeugter Pfad `tag:nth-of-type(n) > …` von der Wurzel zur repräsentativen (ersten) Instanz. Kein `querySelector` nötig — Scheibe ② löst den Pfad selbst auf (Task 4).
2. Neue Funktion `recognizeCandidates`: Container (`div/section/article`, ≥2 Element-Kinder) mit ≥2× wiederholter Klasse, die keiner bekannten Kategorie und keinem Layout-Wort entspricht → Kandidat `{name: TitleCase(klasse), confidence:'low', source:'rules', notes:'unerkannter Baustein-Kandidat', selector}`. Max 5. Kandidaten landen in `components`.

- [ ] **Step 1: Failing Tests anhängen**

```js
// ans Ende von server/lib/recognizeComponents.test.js
test('erkannte Bausteine tragen einen selector-Pfad', () => {
  const r = recognizeComponents('<div><nav><a class="btn">x</a></nav><button>Ok</button></div>');
  const btn = r.atomics.find((a) => a.name === 'Button');
  assert.ok(btn.selector && /button|nav/.test(btn.selector));
  const nav = r.patterns.find((p) => p.name === 'Navbar');
  assert.match(nav.selector, /nav/);
});

test('wiederholte Klassen-Cluster werden Kandidaten mit selector', () => {
  const html = `<main>
    <div class="stat-card"><h3>Umsatz</h3><p>12.400 €</p></div>
    <div class="stat-card"><h3>Kunden</h3><p>87</p></div>
    <div class="row"><span>a</span><span>b</span></div>
  </main>`;
  const r = recognizeComponents(html);
  const cand = r.components.find((c) => c.name === 'Stat Card');
  assert.ok(cand, 'Kandidat Stat Card fehlt');
  assert.equal(cand.confidence, 'low');
  assert.equal(cand.notes, 'unerkannter Baustein-Kandidat');
  assert.ok(cand.selector.includes('div'));
  assert.ok(!r.components.some((c) => c.name === 'Row'), 'Layout-Klassen sind keine Kandidaten');
});
```

- [ ] **Step 2: Rot laufen lassen** — `npm run test:server` → FAIL (`selector` undefined / Kandidat fehlt).

- [ ] **Step 3: Implementierung**

In `server/lib/recognizeComponents.js` ergänzen (bestehende Funktionen umbauen, Verhalten der bisherigen Felder unverändert):

```js
// Pfad von der Wurzel zum Element — nur tag + :nth-of-type, damit Scheibe ②
// ihn ohne querySelector deterministisch auflösen kann.
function cssPath(el) {
  const parts = [];
  let node = el;
  while (node && node.nodeType === 1 && node.tagName) {
    const tag = node.tagName.toLowerCase();
    const parent = node.parentNode;
    const siblings = parent
      ? (parent.childNodes || []).filter((c) => c.nodeType === 1 && c.tagName === node.tagName)
      : [node];
    const idx = siblings.indexOf(node) + 1;
    parts.unshift(siblings.length > 1 ? `${tag}:nth-of-type(${idx})` : tag);
    node = parent;
  }
  return parts.join(' > ');
}

const LAYOUT_CLASS = /container|wrapper|row|col|grid|flex|inner|content|main|page|layout|section/;
const KNOWN_CLASS = /btn|button|badge|chip|\btag\b|card|tile/;
const titleCase = (cls) =>
  cls.split(/[-_]/).filter(Boolean).map((w) => w[0].toUpperCase() + w.slice(1)).join(' ');

function recognizeCandidates(els) {
  const CONTAINER = new Set(['DIV', 'SECTION', 'ARTICLE']);
  const byClass = new Map();
  for (const el of els) {
    if (!CONTAINER.has(el.tagName)) continue;
    const kids = (el.childNodes || []).filter((c) => c.nodeType === 1);
    if (kids.length < 2) continue;
    for (const c of classOf(el).split(/\s+/).filter(Boolean)) {
      if (!byClass.has(c)) byClass.set(c, []);
      byClass.get(c).push(el);
    }
  }
  const out = [];
  for (const [cls, list] of byClass) {
    if (list.length < 2 || LAYOUT_CLASS.test(cls) || KNOWN_CLASS.test(cls)) continue;
    out.push({
      name: titleCase(cls),
      variants: [],
      confidence: 'low',
      source: 'rules',
      notes: 'unerkannter Baustein-Kandidat',
      selector: cssPath(list[0]),
    });
    if (out.length >= 5) break;
  }
  return out;
}
```

Selektoren an die bestehenden Erkennungen hängen — je Kategorie die erste Instanz:
- `recognizeAtomics`: bei Button `selector: cssPath(buttons[0])`, bei Suche `cssPath(searches[0])`, Input `cssPath(inputs[0])`, Badge `cssPath(badges[0])`.
- `recognizePatterns`: `add` so umbauen, dass es das erste treffende Element behält: `const hit = els.find(pred); if (hit) out.push({ …, selector: cssPath(hit) });`
- `recognizeComposed`: Formular `cssPath(forms[0])`, Tabelle `cssPath(els.find(el => el.tagName === 'TABLE'))`, Liste `cssPath(lists[0])`, Card `cssPath(els.find(el => /card|tile/.test(classOf(el))))`.
- `recognizeComponents` (Export): `components: [...recognizeComposed(els), ...recognizeCandidates(els)]`.

WICHTIG: Ausnahme im Kandidaten-Test beachten — die Wurzel von node-html-parser hat `tagName === null`; die `while`-Bedingung in `cssPath` fängt das ab.

- [ ] **Step 4: Grün laufen lassen** — `npm run test:server` → alle pass, KEINE bestehenden Tests rot.

- [ ] **Step 5: Commit**

```bash
find . -name '._*' -delete
git add server/lib/recognizeComponents.js server/lib/recognizeComponents.test.js
git commit -m "feat(recognize): per-instance selector paths + unrecognized container candidates"
```

---

### Task 3: URL-Scan speichert die Seite und liefert `meta.import_id`

**Files:**
- Modify: `server/routes/scan.js` (nur Route `/url`, Zeilen ~92–111)

Routen haben in diesem Projekt keine Unit-Tests (Muster: dünne Route, Logik in libs) — Verifikation über Task 8 Browser-Smoke.

- [ ] **Step 1: Implementierung**

In `server/routes/scan.js`:

```js
// oben bei den Imports:
import { putPage } from '../lib/pageStore.js';

// in router.post('/url', …) nach recognizeComponents / vor res.json(result):
result.meta = { ...result.meta, ai_deepened: false, import_id: putPage(html, css) };
```

(Die bestehende Zeile `result.meta = { ...result.meta, ai_deepened: false };` wird ersetzt.)

- [ ] **Step 2: Kein Test bricht** — `npm run test:server` → alle pass.

- [ ] **Step 3: Commit**

```bash
find . -name '._*' -delete
git add server/routes/scan.js
git commit -m "feat(scan/url): stash fetched page in pageStore, return meta.import_id"
```

---

### Task 4: `UrlDecomposer` + Fabrik-Eintrag

**Files:**
- Create: `server/lib/decompose/urlDecomposer.js`
- Modify: `server/lib/decompose/index.js` (Registry + typedef-Kommentar)
- Test: `server/lib/decompose/urlDecomposer.test.js`

Erfüllt den `Segment`-Contract: `structure = { html: outerHTML (Kappe 8000), css: Digest (Kappe 4000) }`, `bounds = { selector }` (URL-Variante laut Slice-1-Spec: „WO im Original — URL: DOM-Pfad"), `visual = null`. Selector-Miss → Segment ohne `structure` (Downstream-Fallback wie beim Bild ohne Crop).

- [ ] **Step 1: Failing Tests**

```js
// server/lib/decompose/urlDecomposer.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { urlDecomposer } from './urlDecomposer.js';

const HTML = `<html><body>
  <nav><a href="/">Home</a><a href="/x">X</a></nav>
  <div class="stat-card"><h3>Umsatz</h3><p>12.400 €</p></div>
  <div class="stat-card"><h3>Kunden</h3><p>87</p></div>
</body></html>`;
const CSS = `.stat-card{padding:16px;border-radius:8px}
nav{display:flex;gap:8px}
.unrelated{color:hotpink}`;

test('füllt structure mit Subtree-HTML und passendem CSS', async () => {
  const segs = await urlDecomposer.decompose({ html: HTML, css: CSS }, [
    { name: 'Stat Card', kind: 'component', selector: 'html > body > div:nth-of-type(1)' },
  ]);
  assert.equal(segs.length, 1);
  const s = segs[0];
  assert.equal(s.label, 'Stat Card');
  assert.ok(s.structure.html.includes('12.400 €'));
  assert.ok(s.structure.css.includes('.stat-card'));
  assert.ok(!s.structure.css.includes('.unrelated'));
  assert.deepEqual(s.bounds, { selector: 'html > body > div:nth-of-type(1)' });
  assert.equal(s.visual, null);
});

test('Selector-Miss → Segment ohne structure', async () => {
  const segs = await urlDecomposer.decompose({ html: HTML, css: CSS }, [
    { name: 'Ghost', kind: 'component', selector: 'html > body > article:nth-of-type(9)' },
    { name: 'NoSel', kind: 'component' },
  ]);
  assert.equal(segs[0].structure, null);
  assert.equal(segs[1].structure, null);
});

test('überlanges HTML wird gekappt', async () => {
  const big = `<html><body><div class="x">${'a'.repeat(20000)}</div></body></html>`;
  const segs = await urlDecomposer.decompose({ html: big, css: '' }, [
    { name: 'Big', kind: 'component', selector: 'html > body > div' },
  ]);
  assert.ok(segs[0].structure.html.length <= 8000);
});
```

- [ ] **Step 2: Rot** — `npm run test:server` → FAIL (Modul fehlt).

- [ ] **Step 3: Implementierung**

```js
// server/lib/decompose/urlDecomposer.js
// UrlDecomposer: löst die vom Scan gelieferten selector-Pfade im DOM auf und
// füllt Segment.structure mit dem echten Markup + relevantem CSS-Digest.
// Erfüllt das Decomposer-Interface: decompose(source, inventory) -> Segment[]
import { parse } from 'node-html-parser';

const HTML_CAP = 8000;
const CSS_CAP = 4000;

// Löst nur die selbst erzeugten Pfade auf (tag / tag:nth-of-type(n), ' > '-getrennt).
function resolveSelector(root, selector) {
  let node = root;
  for (const part of String(selector || '').split('>').map((s) => s.trim()).filter(Boolean)) {
    const m = part.match(/^([a-z0-9]+)(?::nth-of-type\((\d+)\))?$/i);
    if (!m || !node) return null;
    const [, tag, nth] = m;
    const kids = (node.childNodes || []).filter(
      (c) => c.nodeType === 1 && c.tagName && c.tagName.toLowerCase() === tag.toLowerCase()
    );
    node = nth ? kids[Number(nth) - 1] : kids[0];
    if (!node) return null;
  }
  return node === root ? null : node;
}

function walk(node, fn) {
  if (!node) return;
  if (node.nodeType === 1) fn(node);
  for (const c of node.childNodes || []) walk(c, fn);
}

function cssDigest(css, el) {
  const classes = new Set();
  const tags = new Set();
  walk(el, (n) => {
    if (n.tagName) tags.add(n.tagName.toLowerCase());
    for (const c of (n.getAttribute('class') || '').split(/\s+/).filter(Boolean)) classes.add(c);
  });
  const out = [];
  const re = /([^{}]+)\{([^{}]*)\}/g;
  let m;
  while ((m = re.exec(css))) {
    const sel = m[1].trim();
    const hitClass = [...classes].some((c) => sel.includes(`.${c}`));
    const hitTag = [...tags].some((t) =>
      new RegExp(`(^|[\\s,>+~])${t}([.:#\\s,>+~[]|$)`).test(sel)
    );
    if (hitClass || hitTag) out.push(`${sel}{${m[2].trim()}}`);
  }
  return out.join('\n').slice(0, CSS_CAP);
}

export const urlDecomposer = {
  async decompose({ html, css }, inventory) {
    const root = parse(html || '');
    return inventory.map((item, i) => {
      const el = item.selector ? resolveSelector(root, item.selector) : null;
      const structure = el
        ? { html: (el.outerHTML || '').slice(0, HTML_CAP), css: cssDigest(css || '', el) }
        : null;
      return {
        id: `seg_${i}`,
        label: item.name,
        kind: item.kind ?? 'component',
        confidence: item.confidence,
        notes: item.notes ?? '',
        bounds: el ? { selector: item.selector } : null,
        visual: null,
        structure,
      };
    });
  },
};
```

In `server/lib/decompose/index.js`:

```js
import { imageDecomposer } from './imageDecomposer.js';
import { urlDecomposer } from './urlDecomposer.js';

const REGISTRY = {
  image: imageDecomposer,
  url: urlDecomposer,
};
```

Und den typedef-Kommentar für `bounds` präzisieren:
`// @property {?{x:number,y:number,w:number,h:number}|{selector:string}} bounds   Bild: normiert 0..1 · URL: DOM-Pfad`
sowie `// @property {?{html:string, css:string}} structure    URL: echtes Markup` (das „später" streichen).

- [ ] **Step 4: Grün** — `npm run test:server` → alle pass; auch `decompose/index.test.js` (Fabrik-Test kennt jetzt `'url'` — falls der bestehende Test „unbekannte Quelle wirft" mit `'url'` testet, auf `'pdf'` o. ä. umstellen und das im Commit erwähnen).

- [ ] **Step 5: Commit**

```bash
find . -name '._*' -delete
git add server/lib/decompose/
git commit -m "feat(decompose): UrlDecomposer resolves selector paths into structure segments"
```

---

### Task 5: `interpretComponents` versteht Struktur-Segmente (Text statt Bild)

**Files:**
- Modify: `server/lib/interpretComponents.js`
- Test: `server/lib/interpretComponents.test.js` (erweitern)

Segmente mit `structure` gehen als Textblöcke in denselben (einen) Call. Vollbild-Fallback greift nur noch, wenn ein `imagePath` existiert UND Segmente weder `visual` noch `structure` haben. Signatur bleibt `(imagePath, mimetype, segments, { client })` — beim URL-Pfad ist `imagePath = null`.

- [ ] **Step 1: Failing Test**

```js
// an server/lib/interpretComponents.test.js anhängen — Fake-Client-Muster
// der bestehenden Tests wiederverwenden (Client, der content entgegennimmt
// und eine feste JSON-Antwort liefert).
test('structure-Segmente gehen als Textblöcke in den Prompt, kein Bild nötig', async () => {
  let seen = null;
  const client = {
    messages: {
      create: async ({ messages }) => {
        seen = messages[0].content;
        return {
          content: [{ text: JSON.stringify({ interpretations: [
            { name: 'Stat Card', html: '<div class="rounded-lg">12.400 €</div>', jsx: 'export function StatCard(){return null}' },
          ] }) }],
        };
      },
    },
  };
  const segments = [{
    id: 'seg_0', label: 'Stat Card', kind: 'component',
    bounds: { selector: 'html > body > div' }, visual: null,
    structure: { html: '<div class="stat-card"><p>12.400 €</p></div>', css: '.stat-card{padding:16px}' },
  }];
  const res = await interpretComponents(null, null, segments, { client });
  assert.equal(res.interpretations[0].name, 'Stat Card');
  const textBlocks = seen.filter((b) => b.type === 'text').map((b) => b.text).join('\n');
  assert.ok(textBlocks.includes('stat-card'), 'Quell-HTML fehlt im Prompt');
  assert.ok(textBlocks.includes('.stat-card{padding:16px}'), 'CSS fehlt im Prompt');
  assert.ok(!seen.some((b) => b.type === 'image'), 'darf ohne imagePath kein Bild senden');
});
```

- [ ] **Step 2: Rot** — `npm run test:server` → FAIL (aktuell wirft `fs.readFileSync(null)` oder es fehlen die Textblöcke).

- [ ] **Step 3: Implementierung**

In `interpretComponents`:

```js
export async function interpretComponents(imagePath, mimetype, segments, { client } = {}) {
  const c = client ?? new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const withVisual = segments.filter((s) => s.visual && s.visual.base64);
  const withStructure = segments.filter((s) => s.structure && s.structure.html);
  const bare = segments.filter(
    (s) => !(s.visual && s.visual.base64) && !(s.structure && s.structure.html)
  );
  const hasFullImageFallback = bare.length > 0 && !!imagePath;

  const content = [];
  if (hasFullImageFallback) {
    const base64 = fs.readFileSync(imagePath).toString('base64');
    content.push({ type: 'text', text: 'FULL SCREENSHOT (fallback for components without their own crop):' });
    content.push({ type: 'image', source: { type: 'base64', media_type: mimetype, data: base64 } });
  }
  for (const s of withVisual) {
    content.push({ type: 'text', text: `Component: ${s.label}` });
    content.push({ type: 'image', source: { type: 'base64', media_type: s.visual.media_type, data: s.visual.base64 } });
  }
  for (const s of withStructure) {
    content.push({
      type: 'text',
      text: `Component: ${s.label}\nSOURCE HTML:\n${s.structure.html}\nRELEVANT CSS:\n${s.structure.css || '(none)'}`,
    });
  }
  content.push({ type: 'text', text: buildPrompt(segments, hasFullImageFallback, withStructure.length > 0) });
  // … Rest unverändert (messages.create, JSON-Parse, sanitize, byName-Merge)
```

`buildPrompt(segments, hasFullImageFallback, hasStructure)` bekommt einen dritten Parameter und ergänzt bei `hasStructure` diese Regel im Rules-Block:

```
- For components given as SOURCE HTML + CSS: translate the REAL markup into clean Tailwind — keep the exact text content, structure, states and visual properties (colors, spacing, radii) expressed by the source CSS. Do not invent content that is not in the source.
```

und im Intro-Satz: `Below you receive one cropped image OR the source HTML+CSS per component (in order), each preceded by its name.`

- [ ] **Step 4: Grün** — `npm run test:server` → alle pass, bestehende interpret-Tests unverändert grün.

- [ ] **Step 5: Commit**

```bash
find . -name '._*' -delete
git add server/lib/interpretComponents.js server/lib/interpretComponents.test.js
git commit -m "feat(interpret): accept structure segments as text blocks — url path needs no image"
```

---

### Task 6: Interpret-Route kennt beide Stores + URL-Demo-Fixture

**Files:**
- Modify: `server/routes/interpret.js`
- Create: `server/fixtures/demo-url-interpretations.json`
- Test: `server/lib/demoUrlFixture.test.js` (Konsistenz-Test Fixture ↔ demo-site)

- [ ] **Step 1: Route umbauen**

```js
// oben:
import { getPage } from '../lib/pageStore.js';

// loadDemoInterpretations bekommt den Dateinamen:
function loadDemoInterpretations(requestedNames, file = 'demo-interpretations.json') {
  const all = JSON.parse(fs.readFileSync(path.join(__dirname, `../fixtures/${file}`), 'utf8'));
  // … Rest unverändert
}

// im Handler statt „const image = getImage(importId); if (!image) 410":
const image = getImage(importId);
const page = image ? null : getPage(importId);
if (!image && !page) {
  return res.status(410).json({ error: 'Quelle nicht mehr verfügbar — bitte erneut importieren.' });
}
const kind = image ? 'image' : 'url';
const segments = await getDecomposer(kind).decompose(
  image ? { imagePath: image.path, mimetype: image.mimetype } : { html: page.html, css: page.css },
  components,
);
const result = await interpretComponents(image?.path ?? null, image?.mimetype ?? null, segments);

// im DEMO_FALLBACK-Catch:
const file = kind === 'url' ? 'demo-url-interpretations.json' : 'demo-interpretations.json';
return res.json(loadDemoInterpretations(components.map((c) => c.name), file));
```

- [ ] **Step 2: URL-Fixture erstellen**

`server/fixtures/demo-url-interpretations.json` — gleiche Shape wie `demo-interpretations.json` (`[{ "name", "html", "jsx" }]`). Die Einträge müssen die Bausteine abdecken, die `recognizeComponents` auf `demo-site/index.html` als interpretationsbedürftig liefert (Kandidaten + Card o. ä.). Vorgehen: `node -e` einmalig laufen lassen —

```bash
node -e "
import('./server/lib/recognizeComponents.js').then(async ({ recognizeComponents }) => {
  const fs = await import('fs');
  const html = fs.readFileSync('demo-site/index.html', 'utf8');
  const r = recognizeComponents(html);
  console.log(JSON.stringify({ atomics: r.atomics.map(a=>a.name), components: r.components.map(c=>c.name), patterns: r.patterns.map(p=>p.name) }, null, 2));
});"
```

Für jeden gelisteten Namen ohne Hand-Template (Registry: `web/src/lib/components/templates/registry.js` → `matchTemplate`) einen Fixture-Eintrag schreiben: kompaktes Tailwind-`html` (selbsttragend, keine Scripts) + passendes `jsx` (PascalCase-Export). Stil-Vorbild: bestehende `demo-interpretations.json`.

- [ ] **Step 3: Konsistenz-Test schreiben (rot, falls Fixture lückenhaft)**

```js
// server/lib/demoUrlFixture.test.js
// Sichert: die URL-Demo-Fixture deckt alle Bausteine ab, die ein Scan der
// mitgelieferten demo-site als Kandidaten liefert (DEMO-Smoke bleibt stabil).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import { recognizeComponents } from './recognizeComponents.js';

test('demo-url-interpretations deckt die demo-site-Kandidaten ab', () => {
  const html = fs.readFileSync(new URL('../../demo-site/index.html', import.meta.url), 'utf8');
  const r = recognizeComponents(html);
  const fixture = JSON.parse(
    fs.readFileSync(new URL('../fixtures/demo-url-interpretations.json', import.meta.url), 'utf8')
  );
  const have = new Set(fixture.map((f) => f.name));
  const candidates = r.components.filter((c) => c.notes === 'unerkannter Baustein-Kandidat');
  for (const c of candidates) {
    assert.ok(have.has(c.name), `Fixture-Eintrag fehlt für Kandidat "${c.name}"`);
  }
});
```

- [ ] **Step 4: Grün** — `npm run test:server` → alle pass (Fixture ggf. ergänzen bis der Test grün ist).

- [ ] **Step 5: Commit**

```bash
find . -name '._*' -delete
git add server/routes/interpret.js server/fixtures/demo-url-interpretations.json server/lib/demoUrlFixture.test.js
git commit -m "feat(interpret route): pageStore lookup + kind switch + url demo fixture"
```

---

### Task 7: Web — URL-Importe laufen durch dieselbe Interpretation

**Files:**
- Modify: `web/src/lib/interpret.js` (2 Stellen)
- Test: `web/src/lib/interpret.test.js` (erweitern)

- [ ] **Step 1: Failing Tests**

```js
// an web/src/lib/interpret.test.js anhängen — bestehende Test-Helfer
// (Result-Fixtures, fetch-Mock-Muster) wiederverwenden.
it('componentsNeedingInterpretation reicht selector durch', () => {
  const result = {
    raw: { meta: { import_id: 'x' }, atomics: [], patterns: [],
      components: [{ name: 'Unbekanntes Ding', selector: 'html > body > div' }] },
    interpretations: {},
  };
  const todo = componentsNeedingInterpretation(result);
  expect(todo[0].selector).toBe('html > body > div');
});

it('runInterpretation läuft auch für source url', async () => {
  global.fetch = vi.fn(async () => ({
    ok: true,
    json: async () => ({ interpretations: [{ name: 'Unbekanntes Ding', html: '<div/>', jsx: '' }], failed: [] }),
  }));
  const result = {
    source: 'url',
    raw: { meta: { import_id: 'x' }, atomics: [], patterns: [],
      components: [{ name: 'Unbekanntes Ding', selector: 'html > body > div' }] },
    interpretations: {},
  };
  const next = await runInterpretation(result);
  expect(next.interpretations['Unbekanntes Ding']).toBeTruthy();
});
```

- [ ] **Step 2: Rot** — `cd web && npx vitest run src/lib/interpret.test.js` → FAIL (selector fehlt / url-Gate blockt).

- [ ] **Step 3: Implementierung**

In `web/src/lib/interpret.js`:

```js
// in componentsNeedingInterpretation, ins push-Objekt:
        selector: item.selector ?? null,

// in runInterpretation, das Gate:
  if (!['image', 'url'].includes(result?.source) || !importId || todo.length === 0) return null;
```

- [ ] **Step 4: Grün** — `cd web && npx vitest run` → alle pass (161 + 2 neue).

- [ ] **Step 5: Commit**

```bash
find . -name '._*' -delete
git add web/src/lib/interpret.js web/src/lib/interpret.test.js
git commit -m "feat(web): url imports flow through the same auto-interpretation as images"
```

---

### Task 8: Full-Verify + Browser-Smoke (DEMO, 0 Credits)

**Files:** keine Code-Änderungen (nur ggf. Fixes aus Findings, je eigener Commit).

- [ ] **Step 1: Alle Suiten**

```bash
npm run test:server           # Erwartung: ~112+ pass, 0 fail
cd web && npx vitest run      # Erwartung: ~163+ pass, 0 fail
cd ../designbridge-plugin && npm run typecheck && npm run build
```

- [ ] **Step 2: Browser-Smoke (DEMO_FALLBACK — 0 Credits)**

1. demo-site lokal serven: `python3 -m http.server 8899 -d demo-site` (Hintergrund).
2. `npm run dev:demo` (Backend :3047 + Web :5173).
3. http://localhost:5173 öffnen → `New Import` → Tab **URL** → `http://localhost:8899` importieren.
4. Erwartung: Import gelingt; Library zeigt die erkannten Bausteine; **Kandidaten ohne Template bekommen eine KI-Vorschau** (Fixture) mit gelber Pille „von KI interpretiert"; Code-Bereich zeigt `jsx`; keine Konsolenfehler.
5. Gegenprobe Bild-Import (Regression): `Testdaten/Reports/02.png` importieren → verhält sich wie vor der Scheibe.
6. `410`-Pfad: Backend neu starten (Store leer), in der Library „Erneut versuchen" → deutsche Fehlermeldung, kein Crash.

- [ ] **Step 3: Live-Verifikation markieren (nur mit Credits)**

Ohne Credits NICHT durchführbar. In der Abschluss-Zusammenfassung als **offen** vermerken: „Reale Übersetzungsqualität an einer echten fremden URL erst mit aufgefüllten API-Credits verifizierbar — kein Gate (ADR-001)."

- [ ] **Step 4: RESUME.md aktualisieren + Commit**

Kurzer Statusblock nach dem Muster der bisherigen Einträge (was gebaut, Testzahlen, was offen). Commit: `docs(resume): url decompose slice 2 built and smoke-tested`.

**KEIN PUSH, KEIN MERGE** — wartet auf Robs Review (CLAUDE-Regel 5).

---

## Self-Review-Notizen (bereits eingearbeitet)

- Spec-Abdeckung: instanzbasierte Erkennung → Task 2 · pageStore/Option A → Task 1+3 · UrlDecomposer/Fabrik → Task 4 · text-basierter Interpret → Task 5 · Route/kind-Weiche/Fixture → Task 6 · Web-Gate + selector → Task 7 · Fehlerpfade/410/DEMO → Task 6+8 · Browser-Smoke → Task 8. Keine Lücken.
- Typ-Konsistenz: `selector` (string, `tag:nth-of-type(n) > …`) wird in Task 2 erzeugt, Task 4 aufgelöst, Task 7 durchgereicht. `structure = {html, css}` in Task 4 erzeugt, Task 5 konsumiert. `putPage(html, css) → id` / `getPage(id) → {html, css}` in Task 1 definiert, Task 3+6 benutzt.
- Bekannte Vorsicht: bestehender Fabrik-Test in `decompose/index.test.js` könnte `'url'` als „unbekannt" testen → Task 4 Step 4 behandelt das explizit.
