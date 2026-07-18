# Composition-Nesting Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Persist the atomic composition hierarchy as a canonical model (`raw.composition`) and compose parent bausteins from instances of their direct children on the Figma port — for both image (Scheibe 1) and code-repo (Scheibe 2) sources.

**Architecture:** A new pure `buildCompositionTree` derives direct parent→child edges from the same `contains`/`areaOf` relation the taxonomy guard already uses (image = bbox; repo = JSX/import graph via `buildRepoComposition`). The emitter's new `composePlan` turns any baustein with children into a layout frame of `component-ref` nodes — absolutely positioned when bbox is present (image), stacked in flow order otherwise (repo). The Figma plugin is unchanged: it already renders `component-ref` → instance with `absolute` positioning.

**Tech Stack:** Node (server, `node:test`), Vite/React (web, `vitest`), Jimp (image dims), TypeScript Figma plugin (`node:test` on built dist — no changes, regression test only).

**Specs:** `docs/superpowers/specs/2026-07-18-composition-nesting-figma-design.md` (Scheibe 1), `docs/superpowers/specs/2026-07-18-repo-composition-extraction-design.md` (Scheibe 2).

**Test commands:**
- Server: `npm run test:server` (from repo root) — or a single file: `node --test server/lib/taxonomy.test.js`
- Web: `cd web && npx vitest run src/lib/emit/composePlan.test.js`
- Plugin: `cd designbridge-plugin && npm run test:writer`

**Contract reminders (pinned):**
- `raw.composition = { children: { [name]: string[] }, roots: string[] }`
- Composition plan node child: `{ type:'component-ref', name, variant:null, absolute?:{x,y,width,height}, fallback: <box> }`
- `canvas = { w: 1024, h: round(1024 * image_height / image_width) }`
- Emit output for a parent: `{ …meta, source:'composed', placeholder:false, variants:[{ name:'default', plan }] }`

---

## SCHEIBE 1 — Fundament + Figma-Port

### Task 1: `buildCompositionTree` (pure, server)

**Files:**
- Modify: `server/lib/taxonomy.js` (add export `buildCompositionTree`)
- Test: `server/lib/taxonomy.test.js` (append tests)

- [ ] **Step 1: Write failing tests** — append to `server/lib/taxonomy.test.js` (reuse the file's existing `areaOf`/`contains` helpers defined at top):

```js
import { buildCompositionTree } from './taxonomy.js';

// helper: item with bbox ref
const it_ = (name, kind, x, y, w, h) => ({ name, kind, ref: { x, y, w, h } });

test('buildCompositionTree: direct edges, grandchild hangs on molecule not template', () => {
  const items = [
    it_('Template', 'template', 0, 0, 1, 1),
    it_('SidebarNav', 'organism', 0, 0, 0.25, 1),
    it_('SearchMol', 'molecule', 0.01, 0.02, 0.2, 0.05),
    it_('IconAtom', 'atom', 0.02, 0.025, 0.03, 0.03),
  ];
  const { children, roots } = buildCompositionTree(items, { areaOf, contains });
  assert.deepEqual(roots, ['Template']);
  assert.deepEqual(children['Template'], ['SidebarNav']);      // only direct child
  assert.deepEqual(children['SidebarNav'], ['SearchMol']);
  assert.deepEqual(children['SearchMol'], ['IconAtom']);       // grandchild NOT on Template
  assert.equal(children['IconAtom'], undefined);
});

test('buildCompositionTree: two siblings ordered by y then x', () => {
  const items = [
    it_('Parent', 'organism', 0, 0, 1, 1),
    it_('Lower', 'molecule', 0.1, 0.6, 0.2, 0.1),
    it_('Upper', 'molecule', 0.1, 0.1, 0.2, 0.1),
  ];
  const { children } = buildCompositionTree(items, { areaOf, contains });
  assert.deepEqual(children['Parent'], ['Upper', 'Lower']);
});

test('buildCompositionTree: item without bbox is leaf and root', () => {
  const items = [
    it_('Parent', 'organism', 0, 0, 1, 1),
    { name: 'NoBox', kind: 'atom', ref: {} },
  ];
  const { children, roots } = buildCompositionTree(items, { areaOf, contains });
  assert.ok(roots.includes('NoBox'));
  assert.equal(children['NoBox'], undefined);
  assert.equal((children['Parent'] || []).includes('NoBox'), false);
});

test('buildCompositionTree: multiple roots', () => {
  const items = [
    it_('Template', 'template', 0, 0, 0.6, 1),
    it_('Stray', 'organism', 0.7, 0, 0.2, 0.2),
    it_('Child', 'molecule', 0.01, 0.01, 0.1, 0.1),
  ];
  const { roots } = buildCompositionTree(items, { areaOf, contains });
  assert.deepEqual(roots.sort(), ['Stray', 'Template']);
});
```

- [ ] **Step 2: Run, verify fail** — `node --test server/lib/taxonomy.test.js` → FAIL ("buildCompositionTree is not a function").

- [ ] **Step 3: Implement** — append to `server/lib/taxonomy.js`:

```js
/**
 * buildCompositionTree(items, { areaOf, contains }) -> { children, roots }
 * Direkter Elternteil von B = der flächenKLEINSTE A (A≠B) mit contains(A,B).
 * Nur direkte Kanten. Kinder je Elternteil in Lesereihenfolge (y, dann x der ref).
 * Quellen-agnostisch: contains/areaOf injiziert (Bild: bbox; Repo: eigener Aufruf).
 */
export function buildCompositionTree(items, { areaOf, contains }) {
  const children = {};
  const hasParent = new Set();
  for (let i = 0; i < items.length; i++) {
    const b = items[i];
    let parentIdx = -1;
    let parentArea = Infinity;
    for (let j = 0; j < items.length; j++) {
      if (j === i) continue;
      if (!contains(items[j].ref, b.ref)) continue;
      const a = areaOf(items[j].ref);
      if (a < parentArea) { parentArea = a; parentIdx = j; }
    }
    if (parentIdx !== -1) {
      const pName = items[parentIdx].name;
      (children[pName] ??= []).push(b);       // push item; sort+map to names below
      hasParent.add(b.name);
    }
  }
  // Kinder nach y, dann x sortieren und auf Namen reduzieren.
  const readY = (ref) => (ref && typeof ref.y === 'number' ? ref.y : 0);
  const readX = (ref) => (ref && typeof ref.x === 'number' ? ref.x : 0);
  for (const key of Object.keys(children)) {
    children[key] = children[key]
      .slice()
      .sort((p, q) => (readY(p.ref) - readY(q.ref)) || (readX(p.ref) - readX(q.ref)))
      .map((c) => c.name);
  }
  const roots = items.filter((x) => !hasParent.has(x.name)).map((x) => x.name);
  return { children, roots };
}
```

- [ ] **Step 4: Run, verify pass** — `node --test server/lib/taxonomy.test.js` → PASS (all incl. existing `classifyByContainment`).

- [ ] **Step 5: Commit**

```bash
git add server/lib/taxonomy.js server/lib/taxonomy.test.js
git commit -m "feat(taxonomy): buildCompositionTree — direkte Enthaltungs-Kanten als Baum"
```

---

### Task 2: Wire tree into `applyContainmentGuard` + return composition

**Files:**
- Modify: `server/lib/claude.js` (`applyContainmentGuard` ~L86-116; use in `analyzeScreenshot` return ~L196-201)
- Test: `server/lib/claude.test.js` (append; if absent, create with the node:test header)

- [ ] **Step 1: Write failing test** — append to `server/lib/claude.test.js`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { applyContainmentGuard } from './claude.js';

test('applyContainmentGuard returns composition with direct edges', () => {
  const template = { name: 'Dashboard', bbox: { x: 0, y: 0, w: 1, h: 1 } };
  const organism = { name: 'Sidebar', bbox: { x: 0, y: 0, w: 0.25, h: 1 } };
  const atom = { name: 'Logo', bbox: { x: 0.02, y: 0.02, w: 0.05, h: 0.05 } };
  const out = applyContainmentGuard([atom], [], [organism], [template]);
  assert.ok(out.composition, 'composition present');
  assert.deepEqual(out.composition.children['Dashboard'], ['Sidebar']);
  assert.deepEqual(out.composition.children['Sidebar'], ['Logo']);
  assert.deepEqual(out.composition.roots, ['Dashboard']);
});
```

> Note: `applyContainmentGuard` must be `export`ed (currently module-local). Add `export`.

- [ ] **Step 2: Run, verify fail** — `node --test server/lib/claude.test.js` → FAIL (not exported / no composition).

- [ ] **Step 3: Implement** — in `server/lib/claude.js`:
  1. Change `function applyContainmentGuard(` → `export function applyContainmentGuard(`.
  2. Import: change the existing import line to `import { classifyByContainment, buildCompositionTree, CONTAIN_RATIO } from './taxonomy.js';`.
  3. Build the tree from the SAME classified items and return it. Replace the return block:

```js
  const classified = classifyByContainment(flat, { areaOf, contains });

  const buckets = { atom: [], molecule: [], organism: [], template: [] };
  for (const entry of classified) {
    const kind = buckets[entry.kind] ? entry.kind : 'organism';
    buckets[kind].push(entry.ref);
  }
  const composition = buildCompositionTree(classified, { areaOf, contains });
  return {
    atoms: buckets.atom,
    molecules: buckets.molecule,
    organisms: buckets.organism,
    templates: buckets.template,
    composition,
  };
```

  4. In `analyzeScreenshot`, where the guard result is spread into the buckets, also carry `composition`. Find where `applyContainmentGuard(...)` is called (it feeds atoms/molecules/organisms/templates into the result) and add `composition` to the returned `result` object (so `result.composition` exists).

- [ ] **Step 4: Run, verify pass** — `node --test server/lib/claude.test.js` and `npm run test:server` → PASS.

- [ ] **Step 5: Commit**

```bash
git add server/lib/claude.js server/lib/claude.test.js
git commit -m "feat(scan): raw.composition aus dem Bild-Pfad (Guard liefert Baum mit)"
```

---

### Task 3: Image pixel dimensions into `raw.meta`

**Files:**
- Modify: `server/routes/scan.js` (image route ~L57-117, where `result.meta.image_filename`/`import_id` are stamped)
- Test: `server/routes/scan.test.js` (append or create) — assert meta fields set via a small fixture image.

- [ ] **Step 1: Write failing test** — append to `server/routes/scan.test.js` a test that stamps dims. Since the route is Express, prefer a focused unit: extract a helper `readImageDims(imagePath)` and test it against a known fixture.

Create helper file `server/lib/imageDims.js` + test `server/lib/imageDims.test.js`:

```js
// server/lib/imageDims.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readImageDims } from './imageDims.js';

const here = path.dirname(fileURLToPath(import.meta.url));

test('readImageDims returns width/height for a PNG', async () => {
  // Use any committed PNG fixture under Testdaten; adjust path to an existing small PNG.
  const p = path.resolve(here, '../../Testdaten/Reports/02.png');
  const dims = await readImageDims(p);
  assert.ok(dims.width > 0 && dims.height > 0);
});

test('readImageDims returns null on unreadable file', async () => {
  const dims = await readImageDims('/no/such/file.png');
  assert.equal(dims, null);
});
```

> If `Testdaten/Reports/02.png` is not present at that relative path, point the test at any committed PNG (search: `git ls-files '*.png' | head`).

- [ ] **Step 2: Run, verify fail** — `node --test server/lib/imageDims.test.js` → FAIL (no module).

- [ ] **Step 3: Implement** `server/lib/imageDims.js`:

```js
import Jimp from 'jimp';

/** Bild-Pixelmaße via Jimp (schon Projekt-Dependency). Fehler → null. */
export async function readImageDims(imagePath) {
  try {
    const img = await Jimp.read(imagePath);
    return { width: img.getWidth(), height: img.getHeight() };
  } catch {
    return null;
  }
}
```

Then in `server/routes/scan.js` image route, after `analyzeScreenshot` returns `result`, before `res.json(result)`:

```js
import { readImageDims } from '../lib/imageDims.js'; // top of file
// ...after result is built, alongside the existing meta stamping:
const dims = await readImageDims(imagePath);
if (dims) {
  result.meta.image_width = dims.width;
  result.meta.image_height = dims.height;
} else {
  (result.warnings ??= []).push('Bildmaße nicht lesbar — quadratischer Fallback für Komposition.');
}
```

- [ ] **Step 4: Run, verify pass** — `node --test server/lib/imageDims.test.js` → PASS.

- [ ] **Step 5: Commit**

```bash
git add server/lib/imageDims.js server/lib/imageDims.test.js server/routes/scan.js
git commit -m "feat(scan): meta.image_width/height für die Kompositions-Canvas"
```

---

### Task 4: `composePlan` helper (web) — spatial + flow

**Files:**
- Create: `web/src/lib/emit/composePlan.js`
- Test: `web/src/lib/emit/composePlan.test.js`

- [ ] **Step 1: Write failing tests**:

```js
import { describe, it, expect } from 'vitest';
import { composePlan } from './composePlan.js';

const canvas = { w: 1024, h: 768 };

describe('composePlan — spatial (bbox present)', () => {
  const parent = { name: 'Dashboard', bbox: { x: 0, y: 0, w: 1, h: 1 } };
  const kids = [
    { name: 'Sidebar', bbox: { x: 0, y: 0, w: 0.25, h: 1 } },
    { name: 'Main',    bbox: { x: 0.25, y: 0.1, w: 0.75, h: 0.9 } },
  ];
  it('emits a box of absolutely-positioned component-refs', () => {
    const plan = composePlan(parent, kids, canvas);
    expect(plan.type).toBe('box');
    expect(plan.width).toBe(1024);
    expect(plan.height).toBe(768);
    expect(plan.children.map((c) => c.type)).toEqual(['component-ref', 'component-ref']);
    expect(plan.children[0]).toMatchObject({
      name: 'Sidebar', variant: null,
      absolute: { x: 0, y: 0, width: 256, height: 768 },
    });
    expect(plan.children[1].absolute).toEqual({ x: 256, y: 77, width: 768, height: 691 });
    expect(plan.children[0].fallback.type).toBe('box'); // fallback present
  });
  it('clamps negative offsets to 0', () => {
    const p = { name: 'P', bbox: { x: 0.5, y: 0.5, w: 0.5, h: 0.5 } };
    const c = [{ name: 'C', bbox: { x: 0.4, y: 0.4, w: 0.2, h: 0.2 } }]; // starts before parent
    const plan = composePlan(p, c, canvas);
    expect(plan.children[0].absolute.x).toBe(0);
    expect(plan.children[0].absolute.y).toBe(0);
  });
});

describe('composePlan — flow (a child without bbox)', () => {
  const parent = { name: 'Layout' }; // no bbox
  const kids = [{ name: 'SidebarNav' }, { name: 'Header' }];
  it('emits a column box of component-refs without absolute', () => {
    const plan = composePlan(parent, kids, canvas);
    expect(plan.type).toBe('box');
    expect(plan.layout).toBe('column');
    expect(plan.children.map((c) => c.name)).toEqual(['SidebarNav', 'Header']);
    expect(plan.children.every((c) => c.type === 'component-ref' && !c.absolute)).toBe(true);
  });
});
```

> `y` for `Main`: (0.1)*768 = 76.8 → round 77; height 0.9*768=691.2 → 691. `x` 0.25*1024=256; width 0.75*1024=768. Verify these match your PlanBox defaults; adjust the `toMatchObject`/`toEqual` only if the box default fields differ.

- [ ] **Step 2: Run, verify fail** — `cd web && npx vitest run src/lib/emit/composePlan.test.js` → FAIL (no module).

- [ ] **Step 3: Implement** `web/src/lib/emit/composePlan.js`:

```js
// Komponiert einen Eltern-Baustein aus component-ref-Instanzen seiner direkten Kinder.
// Räumlich (alle bbox) → absolute Positionen; sonst Fluss (column, Reihenfolge).
// Vertrag: 2026-07-18-composition-nesting-figma-design.md §PINNED CONTRACT 4.

const clamp0 = (n) => Math.max(0, Math.round(n));

function boxDefaults(overrides = {}) {
  return {
    type: 'box',
    layout: 'column',
    width: null,
    height: null,
    fill: null,
    stroke: null,
    strokeWeight: 0,
    radius: 0,
    padding: [0, 0, 0, 0],
    gap: 0,
    primaryAlign: 'MIN',
    counterAlign: 'MIN',
    children: [],
    ...overrides,
  };
}

function noticeFallback(name) {
  return boxDefaults({ children: [] }); // minimal; Plugin verwirft ihn bei erfolgreicher Referenz
}

function ref(name, absolute) {
  const node = { type: 'component-ref', name, variant: null, fallback: noticeFallback(name) };
  if (absolute) node.absolute = absolute;
  return node;
}

export function composePlan(parentItem, childItems, canvas) {
  const spatial =
    parentItem?.bbox && childItems.length > 0 && childItems.every((c) => c && c.bbox);

  if (!spatial) {
    return boxDefaults({ children: childItems.map((c) => ref(c.name, null)) });
  }

  const p = parentItem.bbox;
  const children = childItems.map((c) =>
    ref(c.name, {
      x: clamp0((c.bbox.x - p.x) * canvas.w),
      y: clamp0((c.bbox.y - p.y) * canvas.h),
      width: Math.round(c.bbox.w * canvas.w),
      height: Math.round(c.bbox.h * canvas.h),
    })
  );
  return boxDefaults({
    width: Math.round(p.w * canvas.w),
    height: Math.round(p.h * canvas.h),
    children,
  });
}
```

> Match `boxDefaults` field names EXACTLY to the PlanBox shape consumed by the plugin (`web/src/lib/emit/htmlToPlan.js` builds boxes — mirror `layout`, `primaryAlign`, `counterAlign`, `gap`, `padding`, `radius`, `fill`, `stroke`, `strokeWeight`, `width`, `height`, `children`). If htmlToPlan uses different defaults/keys, align to it (single source: the plugin's `parsePlan`/`renderPlan`).

- [ ] **Step 4: Run, verify pass** — `cd web && npx vitest run src/lib/emit/composePlan.test.js` → PASS.

- [ ] **Step 5: Commit**

```bash
git add web/src/lib/emit/composePlan.js web/src/lib/emit/composePlan.test.js
git commit -m "feat(emit): composePlan — Eltern aus component-ref-Instanzen (räumlich+Fluss)"
```

---

### Task 5: Use composition in `emitFigmaComponents`

**Files:**
- Modify: `web/src/lib/emit/emitFigmaComponents.js`
- Test: `web/src/lib/emit/emitFigmaComponents.test.js` (append or create)

- [ ] **Step 1: Write failing test**:

```js
import { describe, it, expect } from 'vitest';
import { emitFigmaComponents } from './emitFigmaComponents.js';

const baseResult = () => ({
  raw: {
    tokens: { colors: [], typography: [], spacing: [], border_radius: [], shadows: [] },
    atoms: [{ name: 'Logo', bbox: { x: 0.02, y: 0.02, w: 0.05, h: 0.05 } }],
    molecules: [],
    organisms: [{ name: 'Sidebar', bbox: { x: 0, y: 0, w: 0.25, h: 1 } }],
    templates: [{ name: 'Dashboard', bbox: { x: 0, y: 0, w: 1, h: 1 } }],
    warnings: [],
    meta: { image_width: 1024, image_height: 768 },
    composition: {
      children: { Dashboard: ['Sidebar'], Sidebar: ['Logo'] },
      roots: ['Dashboard'],
    },
  },
  interpretations: {},
});

describe('emitFigmaComponents — composition', () => {
  it('parents with children are composed of component-refs, not htmlToPlan', () => {
    const out = emitFigmaComponents(baseResult());
    const dashboard = out.find((c) => c.name === 'Dashboard');
    expect(dashboard.source).toBe('composed');
    expect(dashboard.placeholder).toBe(false);
    const plan = dashboard.variants[0].plan;
    expect(plan.children.map((c) => c.type)).toEqual(['component-ref']);
    expect(plan.children[0].name).toBe('Sidebar');
    const sidebar = out.find((c) => c.name === 'Sidebar');
    expect(sidebar.source).toBe('composed');
    expect(sidebar.variants[0].plan.children[0].name).toBe('Logo');
  });
  it('leaf baustein without children keeps existing placeholder path', () => {
    const out = emitFigmaComponents(baseResult());
    const logo = out.find((c) => c.name === 'Logo');
    expect(logo.source).not.toBe('composed');
    expect(logo.placeholder).toBe(true); // no interpretation, no template
  });
});
```

- [ ] **Step 2: Run, verify fail** — `cd web && npx vitest run src/lib/emit/emitFigmaComponents.test.js` → FAIL.

- [ ] **Step 3: Implement** — in `emitFigmaComponents.js`:
  1. `import { composePlan } from './composePlan.js';` and the virtual width: `import { PREVIEW_VIRTUAL_WIDTH } from '../previewWidth.js';`
  2. After `const raw = result?.raw;` guard, build a name→item index across all buckets (with bbox) and read composition + canvas:

```js
  const composition = raw.composition || { children: {}, roots: [] };
  const itemByName = new Map();
  for (const [rawKey] of KINDS) {
    for (const item of (Array.isArray(raw[rawKey]) ? raw[rawKey] : [])) itemByName.set(item.name, item);
  }
  const iw = raw.meta?.image_width, ih = raw.meta?.image_height;
  const canvas = { w: PREVIEW_VIRTUAL_WIDTH, h: iw && ih ? Math.round(PREVIEW_VIRTUAL_WIDTH * ih / iw) : PREVIEW_VIRTUAL_WIDTH };
```

  3. Inside the per-item loop, BEFORE the `tpl.planFor` branch, add the composition branch:

```js
      const childNames = composition.children?.[item.name];
      if (Array.isArray(childNames) && childNames.length) {
        const childItems = childNames.map((n) => itemByName.get(n)).filter(Boolean);
        out.push({
          ...meta,
          placeholder: false,
          source: 'composed',
          variants: [{ name: 'default', plan: composePlan(item, childItems, canvas) }],
        });
        continue;
      }
```

- [ ] **Step 4: Run, verify pass** — `cd web && npx vitest run src/lib/emit/emitFigmaComponents.test.js` and `cd web && npx vitest run` → PASS.

- [ ] **Step 5: Commit**

```bash
git add web/src/lib/emit/emitFigmaComponents.js web/src/lib/emit/emitFigmaComponents.test.js
git commit -m "feat(emit): Eltern-Bausteine aus raw.composition komponieren (component-ref)"
```

---

### Task 6: Plugin regression test — component-ref + absolute together

**Files:**
- Modify: `designbridge-plugin/tests/renderPlan.test.ts` (append)

- [ ] **Step 1: Write test** — append a case that a composition-style PlanBox (box with a `component-ref` child carrying `absolute`) creates an instance positioned absolutely. Reuse the file's existing figma stub. Model the assertion on how the stub records `createInstance`, `layoutPositioning`, and `resize` (mirror existing component-ref/absolute tests in this file; if the stub lacks a components registry, extend it minimally so `findComponentByName` resolves one COMPONENT named `Sidebar`).

```ts
test('composition plan: component-ref child with absolute → positioned instance', async () => {
  // Arrange a stub COMPONENT "Sidebar" discoverable via sections, then render:
  const plan = {
    type: 'box', layout: 'column', width: 1024, height: 768,
    primaryAlign: 'MIN', counterAlign: 'MIN', gap: 0, padding: [0,0,0,0],
    radius: 0, fill: null, stroke: null, strokeWeight: 0,
    children: [{
      type: 'component-ref', name: 'Sidebar', variant: null,
      absolute: { x: 0, y: 0, width: 256, height: 768 },
      fallback: { type:'box', layout:'column', width:null, height:null, primaryAlign:'MIN', counterAlign:'MIN', gap:0, padding:[0,0,0,0], radius:0, fill:null, stroke:null, strokeWeight:0, children:[] },
    }],
  };
  const frame = await renderPlan(plan as any, new Map(), [], sectionsWithComponent('Sidebar'));
  // Assert: an instance was created and positioned ABSOLUTE at 0,0 sized 256x768
  // (follow the stub's recording API used by existing tests in this file).
});
```

> This task confirms the contract; it should PASS without touching plugin source. If the stub needs a discoverable component, add a tiny `sectionsWithComponent(name)` helper in the test file that returns `SectionFrames` whose `organism` section contains a stub COMPONENT of that name (mirror `findComponentByName` in `renderPlan.ts`).

- [ ] **Step 2: Run** — `cd designbridge-plugin && npm run test:writer` → PASS (no source change). If it fails because absolute isn't applied to instances, STOP and report — that would mean a real plugin gap (spec assumption L317-322 says it is applied).

- [ ] **Step 3: Commit**

```bash
git add designbridge-plugin/tests/renderPlan.test.ts
git commit -m "test(plugin): Regression — component-ref-Kind mit absolute wird positioniert"
```

---

### Task 7: Scheibe-1 full verification

- [ ] Run all suites: `npm run test:server`; `cd web && npx vitest run`; `cd designbridge-plugin && npm run typecheck && npm run test:writer`. All green.
- [ ] Grep contracts: `grep -rn "composition" server/lib web/src/lib/emit | grep -v test` — field name consistent; `grep -rn "source:.*composed" web/src/lib/emit`.
- [ ] No plugin source changed (only test): `git diff --name-only <scheibe1-start>..HEAD | grep designbridge-plugin/src` → empty.

---

## SCHEIBE 2 — Code-rein (Repo-Composition)

### Task 8: `buildRepoComposition` (pure, server)

**Files:**
- Create: `server/lib/repoComposition.js`
- Test: `server/lib/repoComposition.test.js`

- [ ] **Step 1: Write failing tests**:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildRepoComposition } from './repoComposition.js';

const items = [
  { name: 'Layout', path: 'src/components/Layout.tsx' },
  { name: 'SidebarNav', path: 'src/components/SidebarNav.tsx' },
  { name: 'Header', path: 'src/components/Header.tsx' },
  { name: 'Button', path: 'src/components/ui/Button.tsx' },
];
const files = {
  'src/components/Layout.tsx':
    "import SidebarNav from './SidebarNav';\nimport Header from './Header';\nexport default function Layout(){return(<div><SidebarNav/><Header/></div>);}",
  'src/components/SidebarNav.tsx':
    "import Button from './ui/Button';\nexport default function SidebarNav(){return(<nav><Button/></nav>);}",
  'src/components/Header.tsx': "export default function Header(){return <header/>;}",
  'src/components/ui/Button.tsx': "export default function Button(){return <button/>;}",
};

test('direct edges from JSX usage', () => {
  const { children, roots } = buildRepoComposition(items, files);
  assert.deepEqual(children['Layout'].sort(), ['Header', 'SidebarNav']);
  assert.deepEqual(children['SidebarNav'], ['Button']);
  assert.deepEqual(roots, ['Layout']);
});

test('transitive reduction: Button hangs on SidebarNav not Layout', () => {
  const f = { ...files,
    'src/components/Layout.tsx':
      "import SidebarNav from './SidebarNav';\nimport Button from './ui/Button';\nexport default function Layout(){return(<div><SidebarNav/><Button/></div>);}" };
  const { children } = buildRepoComposition(items, f);
  assert.ok(!children['Layout'].includes('Button'));
  assert.deepEqual(children['SidebarNav'], ['Button']);
});

test('no edge for non-imported identifier of same name', () => {
  const f = { ...files,
    'src/components/Header.tsx': "export default function Header(){return <Button/>;}" }; // uses but not imported
  const { children } = buildRepoComposition(items, f);
  assert.equal((children['Header'] || []).includes('Button'), false);
});

test('ambiguous identifier produces no edge', () => {
  const amb = [...items, { name: 'Button2', path: 'src/components/ui/Button.tsx' }]; // same basename Button
  const { children } = buildRepoComposition(amb, files);
  // "Button" is ambiguous → SidebarNav gets no Button edge
  assert.equal((children['SidebarNav'] || []).includes('Button'), false);
});

test('html tags ignored', () => {
  const { children } = buildRepoComposition(items, files);
  assert.equal((children['Button'] || []).length, 0); // <button> lowercase ignored
});

test('children in first-appearance order', () => {
  const f = { ...files,
    'src/components/Layout.tsx':
      "import Header from './Header';\nimport SidebarNav from './SidebarNav';\nexport default function Layout(){return(<div><Header/><SidebarNav/></div>);}" };
  const { children } = buildRepoComposition(items, f);
  assert.deepEqual(children['Layout'], ['Header', 'SidebarNav']);
});
```

- [ ] **Step 2: Run, verify fail** — `node --test server/lib/repoComposition.test.js` → FAIL.

- [ ] **Step 3: Implement** `server/lib/repoComposition.js`:

```js
// Liest die echte Verschachtelung aus dem Repo-Code (statische JSX-Nutzung importierter
// Komponenten). Rein, deterministisch. Vertrag: raw.composition (children/roots).
// Spec: 2026-07-18-repo-composition-extraction-design.md.

function baseIdent(path) {
  const base = String(path || '').split('/').pop() || '';
  return base.replace(/\.(t|j)sx?$/, '');
}

// importierte Bezeichner einer Datei (default + named), grob per Regex.
function importedIdents(src) {
  const set = new Set();
  const re = /import\s+([^;]+?)\s+from\s+['"][^'"]+['"]/g;
  let m;
  while ((m = re.exec(src))) {
    const clause = m[1];
    const def = clause.match(/^\s*([A-Za-z_$][\w$]*)/);
    if (def && /^[A-Z]/.test(def[1])) set.add(def[1]);
    const named = clause.match(/\{([^}]*)\}/);
    if (named) {
      for (const part of named[1].split(',')) {
        const id = part.trim().split(/\s+as\s+/).pop().trim();
        if (/^[A-Z][\w$]*$/.test(id)) set.add(id);
      }
    }
  }
  return set;
}

// JSX-Verwendungen (<Ident ...) mit Groß-Anfang.
function jsxUsages(src) {
  const order = [];
  const seen = new Set();
  const re = /<([A-Z][\w$]*)[\s/>]/g;
  let m;
  while ((m = re.exec(src))) {
    if (!seen.has(m[1])) { seen.add(m[1]); order.push(m[1]); }
  }
  return order;
}

export function buildRepoComposition(items, files) {
  // Bezeichner → Baustein-Name; mehrdeutige verwerfen.
  const identToNames = new Map();
  for (const it of items) {
    const id = baseIdent(it.path);
    if (!id) continue;
    (identToNames.get(id) ?? identToNames.set(id, []).get(id)).push(it.name);
  }
  const identToName = new Map();
  for (const [id, names] of identToNames) {
    if (names.length === 1) identToName.set(id, names[0]);
  }
  const nameToPath = new Map(items.map((it) => [it.name, it.path]));

  // Direkte JSX-Kanten (nur importierte, eindeutige Bezeichner).
  const rawChildren = {}; // name -> [childName in order]
  for (const it of items) {
    const src = files[it.path] || '';
    const imported = importedIdents(src);
    const kids = [];
    for (const id of jsxUsages(src)) {
      if (!imported.has(id)) continue;
      const childName = identToName.get(id);
      if (!childName || childName === it.name) continue;
      if (!kids.includes(childName)) kids.push(childName);
    }
    if (kids.length) rawChildren[it.name] = kids;
  }

  // Transitive Reduktion: Kante A->C entfernen, wenn A->B und B ~> C (erreichbar).
  const reachable = (start, target) => {
    const stack = [...(rawChildren[start] || [])];
    const seen = new Set();
    while (stack.length) {
      const n = stack.pop();
      if (n === target) return true;
      if (seen.has(n)) continue;
      seen.add(n);
      stack.push(...(rawChildren[n] || []));
    }
    return false;
  };
  const children = {};
  for (const [parent, kids] of Object.entries(rawChildren)) {
    const direct = kids.filter((c) =>
      !kids.some((other) => other !== c && reachable(other, c)));
    if (direct.length) children[parent] = direct;
  }

  const hasParent = new Set();
  for (const kids of Object.values(children)) for (const c of kids) hasParent.add(c);
  const roots = items.map((it) => it.name).filter((n) => !hasParent.has(n));
  return { children, roots };
}
```

> Note: cycle safety — `reachable` uses a `seen` set, so a cyclic graph won't loop forever; a self-closing cycle simply won't be reduced away and both edges remain (acceptable; add a warning channel only if a real repo trips it).

- [ ] **Step 4: Run, verify pass** — `node --test server/lib/repoComposition.test.js` → PASS.

- [ ] **Step 5: Commit**

```bash
git add server/lib/repoComposition.js server/lib/repoComposition.test.js
git commit -m "feat(repo): buildRepoComposition — Verschachtelung aus JSX-/Import-Graph"
```

---

### Task 9: Wire repo composition into scan routes

**Files:**
- Modify: `server/lib/ingestRepoFiles.js` (return `composition`) OR `server/routes/scan.js` (both repo routes) — put it where the classified inventory AND the file set are both available.
- Test: `server/lib/ingestRepoFiles.test.js` (append or create) — feed a small file map + inventory, assert `result.composition.children` non-empty.

- [ ] **Step 1: Write failing test** — mirror Task 8's fixture but through `ingestRepoFiles` (or the chosen wiring point), asserting `result.composition.children['Layout']` contains the organisms and `result.composition.roots` includes `Layout`.

- [ ] **Step 2: Run, verify fail.**

- [ ] **Step 3: Implement** — import `buildRepoComposition`; after inventory classification + file extraction, set `result.composition = buildRepoComposition(allItems, files)` where `allItems` = concat of atoms/molecules/organisms/templates (each carrying `path`) and `files` = the extracted path→content map (from `repoStore`/`extractRepoFiles`). Ensure BOTH `/api/scan/repo` and `/api/scan/repo/ai` populate it.

- [ ] **Step 4: Run, verify pass** — `npm run test:server` → PASS.

- [ ] **Step 5: Commit**

```bash
git add server/lib/ingestRepoFiles.js server/routes/scan.js server/lib/ingestRepoFiles.test.js
git commit -m "feat(repo): raw.composition aus dem Code-Graph in beide Repo-Routen"
```

---

### Task 10: End-to-end — repo composition flows through the emitter

**Files:**
- Test: `web/src/lib/emit/emitFigmaComponents.test.js` (append)

- [ ] **Step 1: Write test** — a `result.raw` with repo-style composition (children WITHOUT bbox) → the parent emit entry is `composed` in FLOW mode (`layout:'column'`, `component-ref` children without `absolute`):

```js
it('repo composition (no bbox) → composed parent in flow mode', () => {
  const result = { raw: {
    tokens: { colors: [], typography: [], spacing: [], border_radius: [], shadows: [] },
    atoms: [{ name: 'Button', path: 'ui/Button.tsx' }],
    molecules: [],
    organisms: [{ name: 'SidebarNav', path: 'SidebarNav.tsx' }],
    templates: [{ name: 'Layout', path: 'Layout.tsx' }],
    warnings: [], meta: {},
    composition: { children: { Layout: ['SidebarNav'], SidebarNav: ['Button'] }, roots: ['Layout'] },
  }, interpretations: {} };
  const out = emitFigmaComponents(result);
  const layout = out.find((c) => c.name === 'Layout');
  expect(layout.source).toBe('composed');
  expect(layout.variants[0].plan.layout).toBe('column');
  expect(layout.variants[0].plan.children[0]).toMatchObject({ type: 'component-ref', name: 'SidebarNav' });
  expect(layout.variants[0].plan.children[0].absolute).toBeUndefined();
});
```

- [ ] **Step 2: Run, verify pass** — should PASS with no code change (composePlan flow-mode from Task 4). `cd web && npx vitest run src/lib/emit/emitFigmaComponents.test.js`.

- [ ] **Step 3: Commit**

```bash
git add web/src/lib/emit/emitFigmaComponents.test.js
git commit -m "test(emit): Repo-Komposition (ohne bbox) fließt als Fluss-Modus durch"
```

---

### Task 11 (OPTIONAL, YAGNI-guarded): molecule promotion via graph

Only if it stays small and well-tested. A `components/ui` atom that renders other atoms AND is rendered by a `components/*` organism → promote to `molecule`. If uncertain or broad, SKIP and note as a follow-up slice. Do not risk misclassification for the nesting core.

---

### Task 12: Scheibe-2 verification + finalize

- [ ] Full suites green (server + web).
- [ ] **Live-API proof (both scheiben):**
  - Image: run an image import via the running server; `curl -s localhost:3047/api/figma-export/latest | jq '.components[] | select(.source=="composed") | {name, kids: (.variants[0].plan.children | map(.name))}'` — template shows organism children as component-refs.
  - Repo: import a small repo (or `rk-landing`); check the scan response `raw.composition` and the export payload's `composed` entries. (rk-landing = Tailwind-4 → 0 tokens expected; structure must still nest.)
- [ ] Update `RESUME.md` (both scheiben, test counts, "no plugin change / no reload for Scheibe 1", live-proof result) and the `project-designbridge-roadmap` memory.
- [ ] Push to `main` (Rob's workflow: direct, no PR). ⚠️ Web/server auto-deploy on Railway.

---

## Self-Review notes (author)

- **Spec coverage:** Scheibe-1 §1 model→Task 1/2; §3 meta dims→Task 3; §4 composePlan→Task 4; emit→Task 5; §5 no-plugin-change→Task 6. Scheibe-2 §1 buildRepoComposition→Task 8; §2 wiring→Task 9; §3 no emit change→Task 10; §4 molecules→Task 11 (optional).
- **Type consistency:** `composition.children`/`roots`, `source:'composed'`, `component-ref` node with `name`/`variant:null`/`absolute?`/`fallback` used identically across Tasks 1,2,4,5,8,9,10.
- **Open verification point:** Task 6 must confirm the plugin applies `absolute` to instance children (spec assumes yes from renderPlan.ts L312-322). If it doesn't, that becomes a small real plugin task — flagged, not hidden.
- **PlanBox field alignment:** Tasks 4/6 call out that `boxDefaults` must mirror the exact PlanBox shape from `htmlToPlan.js`/plugin `parsePlan` — the implementer verifies field names against that single source before finalizing.
