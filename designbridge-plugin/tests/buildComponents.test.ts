// Unit tests for the per-kind created/updated breakdown in buildComponents.ts
// (Fix 5 — Zähl-Wording Plugin vs. App, docs/superpowers/specs/2026-07-17-testrunde6-fixes-design.md).
//
// buildComponents.ts talks to the `figma` global directly, and no figma-API mock
// exists in this plugin yet (see parsePlan.test.ts's note). We install a minimal
// hand-rolled mock here — just enough surface for the PLACEHOLDER path
// (createFrame/createText/loadFontAsync/createComponentFromNode) since the
// per-kind tally is exercised identically on both the placeholder and the
// template/variant path (same `result.createdByKind[comp.kind] += 1` call site
// shape) — no new package, no jsdom.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { ImportComponent } from '../src/writer/parsePayload';

// ─── Minimal figma mock (placeholder-path surface only) ────────────────────────

function makeNode(type: string): any {
  const node: any = {
    type,
    name: '',
    children: [] as any[],
    fills: [] as unknown[],
    appendChild(child: any) {
      node.children.push(child);
    },
    insertChild(index: number, child: any) {
      node.children.splice(index, 0, child);
    },
    remove() {
      node.removed = true;
    },
  };
  return node;
}

(globalThis as any).figma = {
  createFrame: () => makeNode('FRAME'),
  createText: () => makeNode('TEXT'),
  loadFontAsync: async () => undefined,
  createComponentFromNode: (node: any) => {
    node.type = 'COMPONENT';
    return node;
  },
};

// Imported AFTER the figma mock is installed — buildComponents only touches
// `figma` inside async function bodies, not at module top-level, so import
// order relative to the mock doesn't strictly matter, but this mirrors how
// the real plugin runtime provides the global before any writer code runs.
import { buildComponents, type SectionFrames } from '../src/writer/buildComponents';

function placeholderComponent(name: string, kind: ImportComponent['kind']): ImportComponent {
  return {
    name,
    kind,
    confidence: null,
    source: null,
    notes: null,
    placeholder: true,
    variants: [{ name: 'default', plan: null }],
  };
}

function makeSections(): SectionFrames {
  return {
    atomic: makeNode('SECTION'),
    component: makeNode('SECTION'),
    pattern: makeNode('SECTION'),
  } as unknown as SectionFrames;
}

test('mixed payload (3 atomic, 9 component, 1 pattern), all new: createdByKind matches', async () => {
  const components: ImportComponent[] = [
    ...['A1', 'A2', 'A3'].map((n) => placeholderComponent(n, 'atomic')),
    ...['C1', 'C2', 'C3', 'C4', 'C5', 'C6', 'C7', 'C8', 'C9'].map((n) => placeholderComponent(n, 'component')),
    placeholderComponent('P1', 'pattern'),
  ];
  const sections = makeSections();

  const result = await buildComponents(components, sections, new Map());

  assert.equal(result.created, 13);
  assert.equal(result.updated, 0);
  assert.deepEqual(result.createdByKind, { atomic: 3, component: 9, pattern: 1 });
  assert.deepEqual(result.updatedByKind, { atomic: 0, component: 0, pattern: 0 });
  assert.equal(result.placeholders, 13);
});

test('re-running against existing components tallies updatedByKind per kind', async () => {
  const components: ImportComponent[] = [
    placeholderComponent('A1', 'atomic'),
    placeholderComponent('A2', 'atomic'),
    placeholderComponent('P1', 'pattern'),
  ];
  const sections = makeSections();
  // Pre-seed one atomic and the pattern as already existing (by name) —
  // buildComponents' findByName() match drives the created/updated branch.
  const existingA1 = makeNode('COMPONENT');
  existingA1.name = 'A1';
  sections.atomic.appendChild(existingA1);
  const existingP1 = makeNode('COMPONENT');
  existingP1.name = 'P1';
  sections.pattern.appendChild(existingP1);

  const result = await buildComponents(components, sections, new Map());

  assert.equal(result.created, 1); // A2 only
  assert.equal(result.updated, 2); // A1 + P1
  assert.deepEqual(result.createdByKind, { atomic: 1, component: 0, pattern: 0 });
  assert.deepEqual(result.updatedByKind, { atomic: 1, component: 0, pattern: 1 });
});
