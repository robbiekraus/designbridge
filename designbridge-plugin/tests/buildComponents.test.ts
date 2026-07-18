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
    atom: makeNode('SECTION'),
    molecule: makeNode('SECTION'),
    organism: makeNode('SECTION'),
    template: makeNode('SECTION'),
  } as unknown as SectionFrames;
}

test('mixed payload (3 atom, 9 organism, 1 template), all new: createdByKind matches', async () => {
  const components: ImportComponent[] = [
    ...['A1', 'A2', 'A3'].map((n) => placeholderComponent(n, 'atom')),
    ...['C1', 'C2', 'C3', 'C4', 'C5', 'C6', 'C7', 'C8', 'C9'].map((n) => placeholderComponent(n, 'organism')),
    placeholderComponent('P1', 'template'),
  ];
  const sections = makeSections();

  const result = await buildComponents(components, sections, new Map());

  assert.equal(result.created, 13);
  assert.equal(result.updated, 0);
  assert.deepEqual(result.createdByKind, { atom: 3, molecule: 0, organism: 9, template: 1 });
  assert.deepEqual(result.updatedByKind, { atom: 0, molecule: 0, organism: 0, template: 0 });
  assert.equal(result.placeholders, 13);
});

test('re-running against existing components tallies updatedByKind per kind', async () => {
  const components: ImportComponent[] = [
    placeholderComponent('A1', 'atom'),
    placeholderComponent('A2', 'atom'),
    placeholderComponent('P1', 'template'),
  ];
  const sections = makeSections();
  // Pre-seed one atom and the template as already existing (by name) —
  // buildComponents' findByName() match drives the created/updated branch.
  const existingA1 = makeNode('COMPONENT');
  existingA1.name = 'A1';
  sections.atom.appendChild(existingA1);
  const existingP1 = makeNode('COMPONENT');
  existingP1.name = 'P1';
  sections.template.appendChild(existingP1);

  const result = await buildComponents(components, sections, new Map());

  assert.equal(result.created, 1); // A2 only
  assert.equal(result.updated, 2); // A1 + P1
  assert.deepEqual(result.createdByKind, { atom: 1, molecule: 0, organism: 0, template: 0 });
  assert.deepEqual(result.updatedByKind, { atom: 1, molecule: 0, organism: 0, template: 1 });
});
