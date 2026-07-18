# Composition-Splice Implementation Plan

> REQUIRED SUB-SKILL: superpowers:subagent-driven-development / test-driven-development. Steps use `- [ ]`.

**Goal:** Composed parents render from their own interpretation and splice `component-ref` instances at spatially-matched child regions (image path), fixing test10's broken templates/organisms.

**Spec:** `docs/superpowers/specs/2026-07-18-composition-splice-parent-fidelity-design.md` (pinned contract + tests).

**Test commands:** Web `cd web && npx vitest run`; Server `npm run test:server`; Plugin `cd designbridge-plugin && npm run test:writer` (must stay untouched).

---

### Task 1: `spliceTargets` in `htmlToPlan` (rect-IoU → component-ref)
**Files:** `web/src/lib/emit/htmlToPlan.js`, test `web/src/lib/emit/htmlToPlan.test.js` (append).

- [ ] **Step 1 — failing tests.** Per spec §Tests. jsdom returns 0-rects → **stub `getBoundingClientRect`** per element with `Object.defineProperty(el, 'getBoundingClientRect', { value: () => ({x,y,width,height,top,left,right,bottom}) })` set inside the test after mounting is not accessible — so instead test the pure matching helper directly (see Step 3) AND one integration test that injects rects. Concretely:
  - Extract a pure helper `bestSpliceMatch(elRectNorm, targets, usedNames) -> {name}|null` (IoU ≥ SPLICE_MIN_IOU) and unit-test it directly (no DOM): overlap match, no-match (<0.35), competition (higher IoU wins), each target once.
  - One `htmlToPlan` integration test: build html with two `<div data-t>` children, monkey-patch their `getBoundingClientRect` + the root's before calling — assert the plan contains `component-ref` nodes with correct names + `fallback`, and `spliceTargets:[]` → identical to no-splice.
- [ ] **Step 2 — run, verify fail.**
- [ ] **Step 3 — implement.** Add `SPLICE_MIN_IOU = 0.35`, `iou(a,b)`, `bestSpliceMatch(...)` (pure). In `htmlToPlan`: accept `spliceTargets` in options; after mount, set `ctx.spliceRoot = roots[0]` (or bounding rect of all roots), `ctx.spliceTargets`, `ctx.splicedNames = new Set()`. In `convertElement`, after the `matchKnownComponent` branch and before `buildNormalNode`: if `ctx.spliceTargets?.length`, compute `el`'s normalized rect vs `ctx.spliceRoot`, call `bestSpliceMatch`; on hit → return `attachStretchGrow`/absolute-wrapped `{ type:'component-ref', name, variant:null, fallback: ensureBox(buildNormalNode(el, ctxNoSplice, parent)) }`, add name to `splicedNames`. Build `ctxNoSplice` = `{...ctx, spliceTargets: null}`. After conversion, push a warning listing targets not in `splicedNames`.
- [ ] **Step 4 — run, verify pass.**
- [ ] **Step 5 — commit** `feat(emit): htmlToPlan spliceTargets — component-ref an räumlich gematchtem Kind-Bereich`.

### Task 2: `emitFigmaComponents` uses splice for parents with interpretation
**Files:** `web/src/lib/emit/emitFigmaComponents.js`, test append.

- [ ] **Step 1 — failing tests.** Per spec §Tests Integration: parent+children+`interpretations[parent].html`+child bbox → `source:'composed-spliced'`, plan has component-ref at child pos + parent structure; parent+children WITHOUT interpretation → fallback `composePlan` (`source:'composed'`); repo (children no bbox) → `composePlan` flow; leaf unchanged; pinned child→parent bbox normalization for a non-(0,0) organism parent.
- [ ] **Step 2 — run, verify fail.**
- [ ] **Step 3 — implement.** In the composition branch: if `result.interpretations?.[item.name]?.html` AND every child has bbox AND item has bbox → compute `spliceTargets` (child bbox normalized to parent bbox per spec) → `htmlToPlan(interp.html, { tokens:{colors:namedColors}, knownComponents, spliceTargets })`; if plan → push `{...meta, placeholder:false, source:'composed-spliced', variants:[{name:'default', plan}]}`. Else fall back to existing `composePlan` path (`source:'composed'`). Keep `composePlan` import.
- [ ] **Step 4 — run, verify pass; full web suite.**
- [ ] **Step 5 — commit** `feat(emit): komponierte Eltern splicen Instanzen in ihre eigene Interpretation (composed-spliced)`.

### Task 3: Full verification
- [ ] `cd web && npx vitest run`; `npm run test:server`; `cd designbridge-plugin && npm run typecheck && npm run test:writer` (untouched). All green. AppleDouble cleanup. Confirm no plugin src changed.

---

## Self-review
- Spec coverage: §1 htmlToPlan→Task1; §2 emit wiring+fallback→Task2. §3 no-plugin-change→Task3 confirm.
- The pure `bestSpliceMatch` helper sidesteps jsdom's 0-rect limitation for reliable unit tests; one monkey-patched integration test covers the wiring.
- Fallback to `composePlan` preserves Scheibe-1/2 (repo/no-interp) behavior — no regression.
