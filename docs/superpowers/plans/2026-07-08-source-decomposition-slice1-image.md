# Source Decomposition — Slice 1 (Image) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Zerlege importierte Bilder vor der Interpretation in abgegrenzte Einzel-Segmente (Bounding-Box → Crop) und interpretiere jeden Ausschnitt einzeln, damit die Library-Vorschauen treffsicher werden.

**Architecture:** Neue quellen-agnostische Decompose-Stufe zwischen Scan und Interpret. Ein `Segment`-Contract + `Decomposer`-Interface (jetzt `ImageDecomposer`, URL später). Der Scan liefert je Baustein eine `bbox`; der `ImageDecomposer` croppt mit `jimp`; `interpretComponents` wird ein Multi-Image-Call (je Segment ein Crop). Dazu ein Routing-Fix, damit das Template-Gate inhaltstragende Karten (Stat Card, Line Chart Card) nicht mehr generisch kapert.

**Tech Stack:** Node/Express (server, `node --test`), Vite/React (web, Vitest), `@anthropic-ai/sdk` (injizierbarer Client), `jimp@0.22.12` (server-seitiges Croppen).

**Referenz-Spec:** `docs/superpowers/specs/2026-07-08-source-decomposition-design.md`

**Arbeitsregeln (CLAUDE.md):** Nach Datei-Writes `find . -name '._*' -not -path '*/node_modules/*' -delete`. Keine destruktiven Git-Aktionen. Modellwahl je Task (Implementierung/Review: Sonnet; Koordination/Abnahme: Opus).

---

## File Structure

- `server/lib/claude.js` — MODIFY: injizierbarer Client + `bbox` im Scan-Prompt/-Output.
- `server/lib/decompose/index.js` — CREATE: `Segment`-Typdoku + `getDecomposer(kind)`-Fabrik (Naht).
- `server/lib/decompose/imageDecomposer.js` — CREATE: `decompose(source, inventory) → Segment[]`, croppt per `jimp`.
- `server/lib/decompose/imageDecomposer.test.js` — CREATE.
- `server/lib/decompose/index.test.js` — CREATE.
- `server/lib/interpretComponents.js` — MODIFY: Segmente + Multi-Image-Call.
- `server/lib/interpretComponents.test.js` — MODIFY.
- `server/lib/claude.test.js` — CREATE (Scan bbox/Client-Injektion).
- `server/routes/interpret.js` — MODIFY: Decompose→Interpret verdrahten.
- `server/lib/demoInterpretations.test.js` — MODIFY: neue Fixture-Bausteine.
- `server/fixtures/demo-dashboard.json` — MODIFY: `bbox` je Baustein.
- `server/fixtures/demo-interpretations.json` — MODIFY: Stat Card + Line Chart Card.
- `web/src/lib/components/templates/registry.js` — MODIFY: Blockliste inhaltstragender Tokens.
- `web/src/lib/components/templates/registry.test.js` — CREATE (falls fehlt) / MODIFY.
- `web/src/lib/interpret.js` — MODIFY: `bbox` durchreichen.
- `web/src/lib/interpret.test.js` — MODIFY.
- `package.json` — MODIFY: `jimp`-Dependency.

**Segment-Shape (verbindlich, in allen Tasks identisch):**
```js
/**
 * @typedef {Object} Segment
 * @property {string} id            // "seg_0", stabil im Import
 * @property {string} label         // Baustein-Name aus dem Scan
 * @property {string} kind          // 'atomic' | 'component' | 'pattern'
 * @property {string} [confidence]
 * @property {string} [notes]
 * @property {?{x:number,y:number,w:number,h:number}} bounds   // normiert 0..1, oder null
 * @property {?{base64:string, media_type:string}} visual      // Crop (PNG), oder null
 * @property {?{html:string, css:string}} structure            // URL später, jetzt null
 */
```

---

### Task 0: Branch, Dependency, Baseline

**Files:**
- Modify: `package.json`

- [ ] **Step 1: Feature-Branch anlegen**

Run:
```bash
cd "/Volumes/4TB Shield/Vibe Coding Bootcamp/Projekte/Designbridge"
git checkout -b feat/source-decomposition-slice1
```
Expected: `Switched to a new branch 'feat/source-decomposition-slice1'`

- [ ] **Step 2: jimp installieren (gepinnt)**

Run:
```bash
npm install jimp@0.22.12 --save-exact
```
Expected: `jimp` in `dependencies`, exit 0. Falls der Install fehlschlägt → **hier stoppen und melden** (blockiert den Rest).

- [ ] **Step 3: jimp-Import verifizieren**

Run:
```bash
node -e "const Jimp=require('jimp'); Jimp.create(4,4,0xff0000ff).then(i=>console.log('ok', i.getWidth(), i.getHeight()))"
```
Expected: `ok 4 4`

- [ ] **Step 4: Baseline-Tests grün**

Run:
```bash
npm run test:server
cd web && npx vitest run; cd ..
```
Expected: Server- und Web-Suite grün (Server ~93, Web ~152 — Zahlen aus RESUME, nur als Orientierung).

- [ ] **Step 5: Commit**

```bash
find . -name '._*' -not -path '*/node_modules/*' -delete
git add package.json package-lock.json
git commit -m "chore: add jimp@0.22.12 for segment cropping"
```

---

### Task 1: Routing-Fix — Template-Gate präziser (Leck 1)

**Files:**
- Modify: `web/src/lib/components/templates/registry.js`
- Test: `web/src/lib/components/templates/registry.test.js` (create if missing)

- [ ] **Step 1: Failing test schreiben**

`web/src/lib/components/templates/registry.test.js`:
```js
import { describe, it, expect } from 'vitest';
import { matchTemplate } from './registry.js';

describe('matchTemplate — content-bearing cards go to interpretation', () => {
  it('plain primitives still match a template', () => {
    expect(matchTemplate('Card')).toBeTruthy();
    expect(matchTemplate('Panel')).toBeTruthy();
    expect(matchTemplate('Button')).toBeTruthy();
    expect(matchTemplate('Search Input')).toBeTruthy();
    expect(matchTemplate('Icon Button')).toBeTruthy();
  });

  it('content-bearing cards do NOT match a template', () => {
    expect(matchTemplate('Stat Card')).toBeNull();
    expect(matchTemplate('Line Chart Card')).toBeNull();
    expect(matchTemplate('Metric Card')).toBeNull();
    expect(matchTemplate('Map Card')).toBeNull();
    expect(matchTemplate('Activity Feed Panel')).toBeNull();
  });

  it('is case-insensitive', () => {
    expect(matchTemplate('stat card')).toBeNull();
    expect(matchTemplate('CARD')).toBeTruthy();
  });
});
```

- [ ] **Step 2: Test laufen lassen — muss failen**

Run: `cd web && npx vitest run src/lib/components/templates/registry.test.js`
Expected: FAIL (`Stat Card` matcht heute das Card-Template → erwartet `null`, bekommt Objekt).

- [ ] **Step 3: Implementierung**

`web/src/lib/components/templates/registry.js`:
```js
import { buttonTemplate } from './button.js';
import { cardTemplate } from './card.js';
import { badgeTemplate } from './badge.js';
import { inputTemplate } from './input.js';

export const TEMPLATES = [buttonTemplate, cardTemplate, badgeTemplate, inputTemplate];

// Inhaltstragende Bausteine gehören interpretiert, nicht generisch bemalt:
// ein "… Card/Tile/Panel" mit spezifischem Inhalt (Chart, Metrik, Karte …)
// darf NICHT vom generischen Card-Template gekapert werden (Leck 1).
const CONTENT_TOKENS = /\b(chart|graph|stat|metric|kpi|map|line|bar|donut|pie|area|sparkline|activity|feed|list|table|calendar|timeline|gauge|progress|heatmap)\b/;

export function matchTemplate(name) {
  const n = String(name ?? '').toLowerCase();
  if (!n) return null;
  const t = TEMPLATES.find((tmpl) => tmpl.match(n)) ?? null;
  if (!t) return null;
  // Nur das Card-Template wird durch inhaltstragende Tokens „entschärft".
  if (t === cardTemplate && CONTENT_TOKENS.test(n)) return null;
  return t;
}
```

- [ ] **Step 4: Test laufen lassen — muss passen**

Run: `cd web && npx vitest run src/lib/components/templates/registry.test.js`
Expected: PASS.

- [ ] **Step 5: Voll-Suite Web grün (Regression)**

Run: `cd web && npx vitest run`
Expected: PASS. Falls Tests annehmen, dass „… Card"-Namen ein Template haben, prüfen und anpassen (die Verschärfung ist beabsichtigt).

- [ ] **Step 6: Commit**

```bash
cd "/Volumes/4TB Shield/Vibe Coding Bootcamp/Projekte/Designbridge"
find . -name '._*' -not -path '*/node_modules/*' -delete
git add web/src/lib/components/templates/registry.js web/src/lib/components/templates/registry.test.js
git commit -m "fix(routing): content-bearing cards route to interpretation, not generic template"
```

---

### Task 2: Scan liefert bbox + injizierbarer Client

**Files:**
- Modify: `server/lib/claude.js`
- Test: `server/lib/claude.test.js` (create)

- [ ] **Step 1: Failing test schreiben**

`server/lib/claude.test.js`:
```js
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { analyzeScreenshot } from './claude.js';

function tmpImage() {
  const p = path.join(os.tmpdir(), `db-scan-${Math.random().toString(36).slice(2)}.png`);
  // 1x1 PNG
  fs.writeFileSync(p, Buffer.from('89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000a49444154789c6360000002000154a24f0d0000000049454e44ae426082', 'hex'));
  return p;
}

test('analyzeScreenshot: prompt asks for bbox and passes it through', async () => {
  const imgPath = tmpImage();
  let captured;
  const fakeClient = {
    messages: {
      create: async (args) => {
        captured = args;
        return { content: [{ text: JSON.stringify({
          summary: {}, tokens: {}, atomics: [],
          components: [{ name: 'Line Chart Card', confidence: 'high', notes: 'Sales', bbox: { x: 0.1, y: 0.2, w: 0.3, h: 0.4 } }],
          patterns: [], warnings: [],
        }) }] };
      },
    },
  };
  const result = await analyzeScreenshot(imgPath, 'image/png', {}, { client: fakeClient });
  fs.unlinkSync(imgPath);

  const promptText = captured.messages[0].content.map((b) => b.text || '').join('');
  assert.match(promptText, /bbox/);
  assert.equal(result.components[0].bbox.w, 0.3);
});
```

- [ ] **Step 2: Test laufen lassen — muss failen**

Run: `node --test server/lib/claude.test.js`
Expected: FAIL (`analyzeScreenshot` akzeptiert heute kein `{ client }` → nutzt echten Client → Fehler/kein `captured`).

- [ ] **Step 3: Implementierung**

`server/lib/claude.js` — Client injizierbar machen und bbox in Schema + Regeln ergänzen:

Ersetze Zeile 4 (`const client = new Anthropic(...)`) — Client NICHT mehr auf Modulebene erzeugen.

Im `EXTRACTION_PROMPT` die drei Inventar-Zeilen um `bbox` erweitern:
```
  "atomics": [{ "name": "component name", "variants": ["variant names"], "confidence": "high|medium|low", "notes": "", "bbox": { "x": 0.0, "y": 0.0, "w": 0.0, "h": 0.0 } }],
  "components": [{ "name": "component name", "confidence": "high|medium|low", "notes": "", "bbox": { "x": 0.0, "y": 0.0, "w": 0.0, "h": 0.0 } }],
  "patterns": [{ "name": "pattern name", "confidence": "high|medium|low", "bbox": { "x": 0.0, "y": 0.0, "w": 0.0, "h": 0.0 } }],
```
In den Regeln ergänzen:
```
- For every atomic/component/pattern add "bbox": a TIGHT bounding box around that element AS IT APPEARS in the screenshot, as fractions of image size: x,y = top-left corner (0..1), w,h = width,height (0..1). If unsure, give your best estimate.
```

Signatur & Client:
```js
export async function analyzeScreenshot(imagePath, mimeType, extractTargets, { client } = {}) {
  const c = client ?? new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  // ... alles wie bisher, aber c.messages.create(...) statt client.messages.create(...)
```
(Rest der Funktion unverändert; `import Anthropic from '@anthropic-ai/sdk';` bleibt.)

- [ ] **Step 4: Test laufen lassen — muss passen**

Run: `node --test server/lib/claude.test.js`
Expected: PASS.

- [ ] **Step 5: Server-Suite grün**

Run: `npm run test:server`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
find . -name '._*' -not -path '*/node_modules/*' -delete
git add server/lib/claude.js server/lib/claude.test.js
git commit -m "feat(scan): emit per-element bbox and make Anthropic client injectable"
```

---

### Task 3: ImageDecomposer (crop per jimp)

**Files:**
- Create: `server/lib/decompose/imageDecomposer.js`
- Test: `server/lib/decompose/imageDecomposer.test.js`

- [ ] **Step 1: Failing test schreiben**

`server/lib/decompose/imageDecomposer.test.js`:
```js
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import os from 'os';
import path from 'path';
import Jimp from 'jimp';
import { imageDecomposer } from './imageDecomposer.js';

// 100x100: linke Hälfte rot, rechte Hälfte blau
async function makeSplitImage() {
  const img = await Jimp.create(100, 100, 0xff0000ff); // rot
  img.scan(50, 0, 50, 100, function (x, y, idx) {
    this.bitmap.data[idx] = 0;     // R
    this.bitmap.data[idx + 1] = 0; // G
    this.bitmap.data[idx + 2] = 255; // B
    this.bitmap.data[idx + 3] = 255; // A
  });
  const p = path.join(os.tmpdir(), `db-dec-${Math.random().toString(36).slice(2)}.png`);
  await img.writeAsync(p);
  return p;
}

test('crops the right region for a bbox and fills visual', async () => {
  const p = await makeSplitImage();
  const inv = [{ name: 'Right Half', kind: 'component', bbox: { x: 0.5, y: 0, w: 0.5, h: 1 } }];
  const segs = await imageDecomposer.decompose({ imagePath: p, mimetype: 'image/png' }, inv);
  fs.unlinkSync(p);

  assert.equal(segs.length, 1);
  assert.equal(segs[0].label, 'Right Half');
  assert.ok(segs[0].visual, 'visual gesetzt');
  const crop = await Jimp.read(Buffer.from(segs[0].visual.base64, 'base64'));
  assert.equal(crop.getWidth(), 50);
  assert.equal(crop.getHeight(), 100);
  const px = Jimp.intToRGBA(crop.getPixelColor(0, 0));
  assert.equal(px.b, 255); // blau → richtige (rechte) Region
  assert.equal(px.r, 0);
});

test('no bbox → segment without visual', async () => {
  const p = await makeSplitImage();
  const inv = [{ name: 'Whatever', kind: 'component' }];
  const segs = await imageDecomposer.decompose({ imagePath: p, mimetype: 'image/png' }, inv);
  fs.unlinkSync(p);
  assert.equal(segs[0].visual, null);
  assert.equal(segs[0].bounds, null);
});

test('clamps out-of-range bbox to image bounds', async () => {
  const p = await makeSplitImage();
  const inv = [{ name: 'Overflow', kind: 'component', bbox: { x: 0.8, y: 0.8, w: 0.5, h: 0.5 } }];
  const segs = await imageDecomposer.decompose({ imagePath: p, mimetype: 'image/png' }, inv);
  fs.unlinkSync(p);
  const crop = await Jimp.read(Buffer.from(segs[0].visual.base64, 'base64'));
  assert.ok(crop.getWidth() > 0 && crop.getWidth() <= 20);  // 0.8..1.0 → ~20px
  assert.ok(crop.getHeight() > 0 && crop.getHeight() <= 20);
});
```

- [ ] **Step 2: Test laufen lassen — muss failen**

Run: `node --test server/lib/decompose/imageDecomposer.test.js`
Expected: FAIL (`imageDecomposer` existiert nicht).

- [ ] **Step 3: Implementierung**

`server/lib/decompose/imageDecomposer.js`:
```js
// ImageDecomposer: zerlegt ein Bild anhand der Scan-bboxes in Segmente mit
// echten Bild-Ausschnitten (Crops). Erfüllt das Decomposer-Interface:
// decompose(source, inventory) -> Segment[]
import Jimp from 'jimp';

function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

async function cropVisual(img, bbox) {
  const W = img.getWidth();
  const H = img.getHeight();
  let x = Math.round(clamp(bbox.x, 0, 1) * W);
  let y = Math.round(clamp(bbox.y, 0, 1) * H);
  let w = Math.round(clamp(bbox.w, 0, 1) * W);
  let h = Math.round(clamp(bbox.h, 0, 1) * H);
  w = clamp(w, 1, W - x);
  h = clamp(h, 1, H - y);
  const crop = img.clone().crop(x, y, w, h);
  const buf = await crop.getBufferAsync(Jimp.MIME_PNG);
  return { base64: buf.toString('base64'), media_type: 'image/png' };
}

export const imageDecomposer = {
  async decompose({ imagePath }, inventory) {
    let img = null;
    const segments = [];
    for (let i = 0; i < inventory.length; i++) {
      const item = inventory[i];
      const hasBox = item.bbox && typeof item.bbox.w === 'number' && item.bbox.w > 0 && item.bbox.h > 0;
      let visual = null;
      let bounds = null;
      if (hasBox) {
        if (!img) img = await Jimp.read(imagePath);
        bounds = { x: item.bbox.x, y: item.bbox.y, w: item.bbox.w, h: item.bbox.h };
        try {
          visual = await cropVisual(img, item.bbox);
        } catch {
          visual = null; // kaputte Box → Ganz-Bild-Fallback downstream
        }
      }
      segments.push({
        id: `seg_${i}`,
        label: item.name,
        kind: item.kind ?? 'component',
        confidence: item.confidence,
        notes: item.notes ?? '',
        bounds,
        visual,
        structure: null,
      });
    }
    return segments;
  },
};
```

- [ ] **Step 4: Test laufen lassen — muss passen**

Run: `node --test server/lib/decompose/imageDecomposer.test.js`
Expected: PASS (3 Tests).

- [ ] **Step 5: Commit**

```bash
find . -name '._*' -not -path '*/node_modules/*' -delete
git add server/lib/decompose/imageDecomposer.js server/lib/decompose/imageDecomposer.test.js
git commit -m "feat(decompose): ImageDecomposer crops segments from scan bboxes (jimp)"
```

---

### Task 4: Decomposer-Fabrik (die Naht)

**Files:**
- Create: `server/lib/decompose/index.js`
- Test: `server/lib/decompose/index.test.js`

- [ ] **Step 1: Failing test schreiben**

`server/lib/decompose/index.test.js`:
```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { getDecomposer } from './index.js';
import { imageDecomposer } from './imageDecomposer.js';

test('returns the image decomposer for kind "image"', () => {
  assert.equal(getDecomposer('image'), imageDecomposer);
});

test('throws for unknown source kinds', () => {
  assert.throws(() => getDecomposer('url'), /kein Decomposer/i);
  assert.throws(() => getDecomposer('nope'), /kein Decomposer/i);
});
```

- [ ] **Step 2: Test laufen lassen — muss failen**

Run: `node --test server/lib/decompose/index.test.js`
Expected: FAIL (`index.js` fehlt).

- [ ] **Step 3: Implementierung**

`server/lib/decompose/index.js`:
```js
// Die "Naht": quellen-agnostischer Decompose-Contract. Jeder Decomposer
// implementiert decompose(source, inventory) -> Promise<Segment[]>.
// Downstream (Interpret, Library) konsumiert Segmente und weiß nie, woher.
//
// @typedef {Object} Segment
// @property {string} id
// @property {string} label
// @property {string} kind            'atomic' | 'component' | 'pattern'
// @property {string} [confidence]
// @property {string} [notes]
// @property {?{x:number,y:number,w:number,h:number}} bounds   normiert 0..1
// @property {?{base64:string, media_type:string}} visual      Crop (PNG)
// @property {?{html:string, css:string}} structure            URL später
import { imageDecomposer } from './imageDecomposer.js';

const REGISTRY = {
  image: imageDecomposer,
  // 'url': urlDecomposer   // Scheibe ②
};

export function getDecomposer(sourceKind) {
  const d = REGISTRY[sourceKind];
  if (!d) throw new Error(`kein Decomposer für Quelle "${sourceKind}"`);
  return d;
}
```

- [ ] **Step 4: Test laufen lassen — muss passen**

Run: `node --test server/lib/decompose/index.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
find . -name '._*' -not -path '*/node_modules/*' -delete
git add server/lib/decompose/index.js server/lib/decompose/index.test.js
git commit -m "feat(decompose): source-agnostic Decomposer factory (the seam)"
```

---

### Task 5: interpretComponents als Multi-Image-Call

**Files:**
- Modify: `server/lib/interpretComponents.js`
- Modify: `server/lib/interpretComponents.test.js`

- [ ] **Step 1: Test aktualisieren (neue Signatur, Multi-Image)**

In `server/lib/interpretComponents.test.js` die Aufrufe auf die neue Signatur `interpretComponents(imagePath, mimetype, segments, { client })` umstellen und diesen Test ergänzen:
```js
test('sends one image block per segment-with-visual and labels them', async () => {
  let captured;
  const fakeClient = { messages: { create: async (args) => {
    captured = args;
    return { content: [{ text: JSON.stringify({ interpretations: [
      { name: 'Stat Card', html: '<div class="p-4">42</div>', jsx: 'export function StatCard(){return null}' },
      { name: 'Line Chart Card', html: '<div class="p-4">chart</div>', jsx: 'export function LineChartCard(){return null}' },
    ] }) }] };
  } } };
  const segments = [
    { id: 'seg_0', label: 'Stat Card', kind: 'component', bounds: {x:0,y:0,w:0.2,h:0.2}, visual: { base64: 'AAAA', media_type: 'image/png' }, structure: null },
    { id: 'seg_1', label: 'Line Chart Card', kind: 'component', bounds: {x:0.2,y:0,w:0.3,h:0.3}, visual: { base64: 'BBBB', media_type: 'image/png' }, structure: null },
  ];
  const res = await interpretComponents('/nonexistent-full.png', 'image/png', segments, { client: fakeClient });

  const imageBlocks = captured.messages[0].content.filter((b) => b.type === 'image');
  assert.equal(imageBlocks.length, 2); // ein Crop je Segment, kein Voll-Bild nötig
  const text = captured.messages[0].content.filter((b)=>b.type==='text').map((b)=>b.text).join('\n');
  assert.match(text, /Stat Card/);
  assert.match(text, /Line Chart Card/);
  assert.equal(res.interpretations.length, 2);
  assert.equal(res.failed.length, 0);
});

test('segment without visual falls back to the full image', async () => {
  // 1x1 PNG als Voll-Bild
  const fs = await import('fs'); const os = await import('os'); const path = await import('path');
  const full = path.join(os.tmpdir(), `db-full-${Math.random().toString(36).slice(2)}.png`);
  fs.writeFileSync(full, Buffer.from('89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000a49444154789c6360000002000154a24f0d0000000049454e44ae426082','hex'));
  let captured;
  const fakeClient = { messages: { create: async (args) => { captured = args; return { content:[{text: JSON.stringify({ interpretations:[{name:'Mystery', html:'<div>x</div>', jsx:'export function Mystery(){return null}'}] })}] }; } } };
  const segments = [{ id:'seg_0', label:'Mystery', kind:'component', bounds:null, visual:null, structure:null }];
  const res = await interpretComponents(full, 'image/png', segments, { client: fakeClient });
  fs.unlinkSync(full);
  const imageBlocks = captured.messages[0].content.filter((b)=>b.type==='image');
  assert.equal(imageBlocks.length, 1); // Voll-Bild als Fallback-Grounding
  assert.equal(res.interpretations[0].name, 'Mystery');
});
```
Bestehende Tests, die `interpretComponents(path, mime, components)` mit Namens-Objekten aufrufen, auf Segment-Objekte umstellen (label statt name, `visual:null`).

- [ ] **Step 2: Test laufen lassen — muss failen**

Run: `node --test server/lib/interpretComponents.test.js`
Expected: FAIL (alte Signatur baut keine Bild-Blöcke je Segment).

- [ ] **Step 3: Implementierung**

`server/lib/interpretComponents.js` — `sanitizeHtml` unverändert lassen. `buildPrompt` und `interpretComponents` ersetzen:
```js
function buildPrompt(segments, hasFullImageFallback) {
  const labels = segments.map((s) => s.label);
  return `You are a UI reconstruction engine. Below you receive one cropped image PER component (in order), each preceded by its name. ${hasFullImageFallback ? 'For any component WITHOUT its own crop, use the full screenshot provided first.' : ''}

For EACH component, reconstruct it as faithfully as possible to how it appears in ITS image.

Return ONLY valid JSON, no markdown, no preamble, in this shape:
{
  "interpretations": [
    { "name": "<exact component name>", "html": "<self-contained HTML using ONLY Tailwind utility classes>", "jsx": "<the same component as a React function component in shadcn/Tailwind style, exported with a PascalCase name>" }
  ]
}

Rules:
- Stay as close to the original as possible: copy the visible colors (as Tailwind arbitrary values like bg-[#4263EB]), spacing, radii, typography and REAL text content.
- html must be fully self-contained: Tailwind classes only, no <script>, no event handlers, no external images or fonts. Inline SVG is allowed (e.g. for simple chart shapes).
- For charts, reconstruct a simplified but recognizable visual (bars/lines/donut as divs or inline SVG) — not a live chart library.
- Keep each html snippet compact (one component).
- Produce one entry per component, using its EXACT name.

COMPONENTS (in order): ${JSON.stringify(labels)}`;
}

export async function interpretComponents(imagePath, mimetype, segments, { client } = {}) {
  const c = client ?? new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const withVisual = segments.filter((s) => s.visual && s.visual.base64);
  const withoutVisual = segments.filter((s) => !(s.visual && s.visual.base64));
  const hasFullImageFallback = withoutVisual.length > 0;

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
  content.push({ type: 'text', text: buildPrompt(segments, hasFullImageFallback) });

  const response = await c.messages.create({
    model: MODEL,
    max_tokens: 16384,
    messages: [{ role: 'user', content }],
  });

  const text = response.content.map((b) => b.text || '').join('');
  const clean = text.replace(/```json\n?|```\n?/g, '').trim();
  let parsed;
  try { parsed = JSON.parse(clean); }
  catch { throw new Error(`Claude returned invalid JSON. Raw: ${text.slice(0, 300)}`); }

  const byName = new Map((parsed.interpretations ?? []).map((i) => [String(i.name ?? '').trim(), i]));
  const interpretations = [];
  const failed = [];
  for (const s of segments) {
    const it = byName.get(s.label.trim());
    const html = sanitizeHtml(it?.html);
    if (!it || !html.trim()) { failed.push(s.label); continue; }
    interpretations.push({ name: s.label, html, jsx: typeof it.jsx === 'string' && it.jsx.trim() ? it.jsx : '' });
  }
  return { interpretations, failed };
}
```
(`import Anthropic from '@anthropic-ai/sdk'; import fs from 'fs';` und `const MODEL='claude-sonnet-4-5';` bleiben.)

- [ ] **Step 4: Test laufen lassen — muss passen**

Run: `node --test server/lib/interpretComponents.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
find . -name '._*' -not -path '*/node_modules/*' -delete
git add server/lib/interpretComponents.js server/lib/interpretComponents.test.js
git commit -m "feat(interpret): multi-image call — one crop per segment, full-image fallback"
```

---

### Task 6: Route verdrahten (Decompose → Interpret)

**Files:**
- Modify: `server/routes/interpret.js`
- Test: (vorhandene Route-Tests, falls in `interpretComponents.test.js` oder separater Datei — sonst hier ergänzen)

- [ ] **Step 1: Implementierung**

`server/routes/interpret.js` — im `try`-Block Decompose einschieben; `loadDemoInterpretations` und Fehlerpfade unverändert:
```js
import { getDecomposer } from '../lib/decompose/index.js';
// ... bestehende Imports bleiben ...

// innerhalb router.post('/components', ...):
  try {
    console.log(`[interpret] ${components.length} Bausteine für Import ${importId}`);
    const segments = await getDecomposer('image').decompose(
      { imagePath: image.path, mimetype: image.mimetype },
      components,
    );
    const result = await interpretComponents(image.path, image.mimetype, segments);
    res.json(result);
  } catch (err) {
    // ... unverändert (DEMO_FALLBACK → loadDemoInterpretations(components.map(c=>c.name)), sonst 502) ...
  }
```
`components` aus dem Request tragen jetzt `bbox` (Web reicht sie durch). `loadDemoInterpretations` bleibt namensbasiert.

- [ ] **Step 2: Route-Test schreiben/aktualisieren**

Falls es einen Route-Test gibt, prüfen dass er mit injiziertem Decompose/Interpret weiter grün ist. Sonst diesen Smoke ergänzen (`server/routes/interpret.test.js`, mit supertest-freiem Handleraufruf oder vorhandenem Muster im Repo — dem existierenden Route-Test-Stil folgen). Minimal: mit `DEMO_FALLBACK=1` und unbekanntem `import_id` → 410; mit gültigem Bild + leerem/fehlerhaftem Client → Fixture-Fallback.

- [ ] **Step 3: Server-Suite grün**

Run: `npm run test:server`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
find . -name '._*' -not -path '*/node_modules/*' -delete
git add server/routes/interpret.js server/routes/interpret.test.js 2>/dev/null; git add -A server/routes
git commit -m "feat(interpret route): decompose image into segments before interpreting"
```

---

### Task 7: Web reicht bbox durch

**Files:**
- Modify: `web/src/lib/interpret.js`
- Modify: `web/src/lib/interpret.test.js`

- [ ] **Step 1: Failing test schreiben**

In `web/src/lib/interpret.test.js` ergänzen:
```js
it('passes bbox through and routes content-bearing cards to interpretation', () => {
  const result = { raw: { components: [
    { name: 'Card', confidence: 'high', notes: '', bbox: { x:0,y:0,w:0.1,h:0.1 } },        // Template → raus
    { name: 'Stat Card', confidence: 'high', notes: 'Sales', bbox: { x:0.1,y:0,w:0.2,h:0.2 } }, // interpretieren
  ] } };
  const todo = componentsNeedingInterpretation(result);
  const names = todo.map((t) => t.name);
  expect(names).toContain('Stat Card');
  expect(names).not.toContain('Card');
  expect(todo.find((t) => t.name === 'Stat Card').bbox).toEqual({ x:0.1,y:0,w:0.2,h:0.2 });
});
```
(`componentsNeedingInterpretation` ggf. im Import ergänzen.)

- [ ] **Step 2: Test laufen lassen — muss failen**

Run: `cd web && npx vitest run src/lib/interpret.test.js`
Expected: FAIL (heute wird `bbox` nicht mitgegeben).

- [ ] **Step 3: Implementierung**

In `web/src/lib/interpret.js`, im `componentsNeedingInterpretation`-Push, `bbox` ergänzen:
```js
      out.push({
        name: item.name,
        kind,
        variants: item.variants ?? [],
        notes: item.notes ?? '',
        bbox: item.bbox ?? null,
      });
```

- [ ] **Step 4: Test laufen lassen — muss passen**

Run: `cd web && npx vitest run src/lib/interpret.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
cd "/Volumes/4TB Shield/Vibe Coding Bootcamp/Projekte/Designbridge"
find . -name '._*' -not -path '*/node_modules/*' -delete
git add web/src/lib/interpret.js web/src/lib/interpret.test.js
git commit -m "feat(web): pass per-component bbox to the interpret endpoint"
```

---

### Task 8: Demo-Fixtures (ohne Credits sichtbar)

**Files:**
- Modify: `server/fixtures/demo-dashboard.json`
- Modify: `server/fixtures/demo-interpretations.json`
- Modify: `server/lib/demoInterpretations.test.js`

- [ ] **Step 1: bbox in demo-dashboard.json ergänzen**

Für jeden Eintrag in `atomics`, `components`, `patterns` ein plausibles `bbox` (normiert 0..1, grobe Dashboard-Anordnung) ergänzen. Beispiele (Werte sinnvoll über das Bild verteilen, nicht überlappend-identisch):
```jsonc
{ "name": "Stat Card", "confidence": "high", "notes": "…", "bbox": { "x": 0.05, "y": 0.18, "w": 0.20, "h": 0.15 } }
{ "name": "Line Chart Card", "confidence": "high", "notes": "Your Sales / Income Details", "bbox": { "x": 0.28, "y": 0.18, "w": 0.42, "h": 0.30 } }
{ "name": "Donut Chart", "confidence": "high", "notes": "…", "bbox": { "x": 0.72, "y": 0.18, "w": 0.24, "h": 0.30 } }
```
(Für alle übrigen Bausteine analog eine grobe, unterschiedliche Box.)

- [ ] **Step 2: Interpretationen für die neu gerouteten Bausteine ergänzen**

In `server/fixtures/demo-interpretations.json` Einträge für **Stat Card** und **Line Chart Card** hinzufügen (visuell klar unterscheidbar):
```jsonc
{
  "name": "Stat Card",
  "html": "<div class=\"rounded-xl border border-[#e5e7eb] bg-white p-4 w-56\"><p class=\"text-xs text-[#6b7280]\">Total Sales</p><p class=\"mt-1 text-2xl font-semibold text-[#111827]\">$12,480</p><p class=\"mt-1 text-xs text-[#16a34a]\">+8.2% vs last week</p></div>",
  "jsx": "export function StatCard(){return (<div className=\"rounded-xl border bg-white p-4 w-56\"><p className=\"text-xs text-muted-foreground\">Total Sales</p><p className=\"mt-1 text-2xl font-semibold\">$12,480</p><p className=\"mt-1 text-xs text-green-600\">+8.2% vs last week</p></div>);}"
},
{
  "name": "Line Chart Card",
  "html": "<div class=\"rounded-xl border border-[#e5e7eb] bg-white p-4 w-80\"><p class=\"text-sm font-medium text-[#111827]\">Income Details</p><svg viewBox=\"0 0 300 120\" class=\"mt-2 w-full h-28\"><polyline fill=\"none\" stroke=\"#4263EB\" stroke-width=\"3\" points=\"0,90 50,70 100,80 150,40 200,55 250,20 300,35\"/></svg></div>",
  "jsx": "export function LineChartCard(){return (<div className=\"rounded-xl border bg-white p-4 w-80\"><p className=\"text-sm font-medium\">Income Details</p><svg viewBox=\"0 0 300 120\" className=\"mt-2 w-full h-28\"><polyline fill=\"none\" stroke=\"#4263EB\" strokeWidth=\"3\" points=\"0,90 50,70 100,80 150,40 200,55 250,20 300,35\"/></svg></div>);}"
}
```

- [ ] **Step 3: demoInterpretations-Test aktualisieren**

In `server/lib/demoInterpretations.test.js` sicherstellen/ergänzen, dass die Fixture jetzt **Stat Card** und **Line Chart Card** enthält und diese unterschiedliches `html` haben:
```js
test('fixture covers newly-routed content cards distinctly', () => {
  const all = JSON.parse(fs.readFileSync(fixturePath, 'utf8'));
  const byName = Object.fromEntries(all.map((i) => [i.name, i]));
  assert.ok(byName['Stat Card'] && byName['Line Chart Card']);
  assert.notEqual(byName['Stat Card'].html, byName['Line Chart Card'].html);
});
```
(`fixturePath`/`fs` dem bestehenden Test-Stil der Datei entnehmen.)

- [ ] **Step 4: JSON-Gültigkeit + Server-Suite**

Run:
```bash
node -e "require('./server/fixtures/demo-dashboard.json'); require('./server/fixtures/demo-interpretations.json'); console.log('json ok')"
npm run test:server
```
Expected: `json ok` + PASS.

- [ ] **Step 5: Commit**

```bash
find . -name '._*' -not -path '*/node_modules/*' -delete
git add server/fixtures/demo-dashboard.json server/fixtures/demo-interpretations.json server/lib/demoInterpretations.test.js
git commit -m "test(demo): bboxes + distinct interpretations for Stat Card and Line Chart Card"
```

---

### Task 9: Full-Verify + Browser-Smoke

**Files:** keine (Verifikation)

- [ ] **Step 1: Alle Suiten**

Run:
```bash
npm run test:server
cd web && npx vitest run; cd ..
cd designbridge-plugin && npm run typecheck && npm run build; cd ..
```
Expected: alles grün. Server > Baseline (neue Decompose/Scan-Tests), Web > Baseline.

- [ ] **Step 2: Browser-Smoke (DEMO_FALLBACK)**

Run: `npm run dev:demo` (Backend :3047 + Web :5173). Dann via Preview-Tools:
- http://localhost:5173 öffnen, Bild importieren (`Testdaten/Reports/02.png`).
- In der Library die Components-Seite prüfen: **Stat Card** und **Line Chart Card** zeigen jetzt **unterschiedliche**, gerenderte iframe-Vorschauen mit gelber „von KI interpretiert"-Pille (nicht mehr die identische generische Karte).
- Screenshot als Beleg ziehen.

- [ ] **Step 3: Live-Verifikation markieren (nur mit Credits)**

Ohne Credits NICHT durchführbar (Scan/Interpret fallen auf Fixtures). In der Zusammenfassung klar als **offen** vermerken: „Reale Treffsicherheit an echtem Screenshot erst mit aufgefüllten API-Credits verifizierbar."

- [ ] **Step 4: Kein Push ohne Robs OK**

Branch `feat/source-decomposition-slice1` lokal lassen. Zusammenfassung + Diff-Übersicht für Robs Morgen-Review bereitstellen.

---

## Self-Review (durchgeführt)

**Spec-Abdeckung:** Routing-Fix (Leck 1) → Task 1. Scan-bbox → Task 2. Segment-Contract + Fabrik → Task 3/4. ImageDecomposer/Crop (jimp) → Task 3. Multi-Image-Interpret (Grounding, Leck 2) → Task 5. Route-Verdrahtung → Task 6. bbox-Durchreichung Web → Task 7. Demo-Fixtures ohne Credits → Task 8. Verify + Live-Vorbehalt → Task 9. Rendering/Library unverändert (Spec §7) → kein Task nötig.

**Platzhalter:** keine „TBD/TODO"; Code in allen Code-Schritten vorhanden.

**Typ-Konsistenz:** `Segment` identisch in Task 3/4/5 (`label`, `bounds`, `visual{base64,media_type}`, `structure`). `interpretComponents(imagePath, mimetype, segments, {client})` konsistent Task 5/6. `getDecomposer('image')` Task 4/6. `matchTemplate` Rückgabe Objekt|null Task 1/7.

**Bekanntes Risiko:** jimp-API auf 0.22.12 gepinnt (Task 0), Import in Step 3 verifiziert; bei Install-Fehler früher Stopp.
