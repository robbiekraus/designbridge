// Unit tests for formatImportSummary() — the pure message-formatter extracted
// out of ui.ts for Fix 5 (Zähl-Wording Plugin vs. App,
// docs/superpowers/specs/2026-07-17-testrunde6-fixes-design.md). No figma/DOM
// global needed: pure string formatting over an ImportSummary-shaped object.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { formatImportSummary } from '../src/writer/applyImport';

function baseSummary(overrides: Partial<Parameters<typeof formatImportSummary>[0]> = {}) {
  return {
    colorsCreated: 0,
    colorsUpdated: 0,
    textCreated: 0,
    textUpdated: 0,
    componentsCreated: 0,
    componentsUpdated: 0,
    placeholders: 0,
    skipped: [],
    ...overrides,
  };
}

test('spec example: 13 Bausteine neu with mixed-kind breakdown', () => {
  const text = formatImportSummary(
    baseSummary({
      colorsCreated: 10,
      textCreated: 4,
      componentsCreated: 13,
      componentsCreatedByKind: { atomic: 3, component: 9, pattern: 1 },
      placeholders: 5,
    })
  );
  assert.equal(
    text,
    '10 Farben neu, 4 Textstile neu, 13 Bausteine neu (3 Atomics, 9 Components, 1 Pattern), davon 5 Platzhalter'
  );
});

test('"Komponenten" is never used as the collective noun any more', () => {
  const text = formatImportSummary(
    baseSummary({
      componentsCreated: 13,
      componentsCreatedByKind: { atomic: 3, component: 9, pattern: 1 },
    })
  );
  assert.ok(!text.includes('Komponenten'));
  assert.ok(text.includes('Bausteine'));
});

test('singular kind labels: 1 Atomic / 1 Component / 1 Pattern (not pluralized)', () => {
  const text = formatImportSummary(
    baseSummary({
      componentsCreated: 3,
      componentsCreatedByKind: { atomic: 1, component: 1, pattern: 1 },
    })
  );
  assert.equal(text, '0 Farben neu, 0 Textstile neu, 3 Bausteine neu (1 Atomic, 1 Component, 1 Pattern)');
});

test('plural kind labels when count > 1', () => {
  const text = formatImportSummary(
    baseSummary({
      componentsCreated: 5,
      componentsCreatedByKind: { atomic: 3, component: 0, pattern: 2 },
    })
  );
  assert.equal(text, '0 Farben neu, 0 Textstile neu, 5 Bausteine neu (3 Atomics, 2 Patterns)');
});

test('kinds with count 0 are left out of the breakdown parentheses', () => {
  const text = formatImportSummary(
    baseSummary({
      componentsCreated: 9,
      componentsCreatedByKind: { atomic: 0, component: 9, pattern: 0 },
    })
  );
  assert.equal(text, '0 Farben neu, 0 Textstile neu, 9 Bausteine neu (9 Components)');
});

test('"X Bausteine aktualisiert" gets its own breakdown, independent of created', () => {
  const text = formatImportSummary(
    baseSummary({
      componentsCreated: 2,
      componentsCreatedByKind: { atomic: 2, component: 0, pattern: 0 },
      componentsUpdated: 4,
      componentsUpdatedByKind: { atomic: 0, component: 3, pattern: 1 },
    })
  );
  assert.equal(
    text,
    '0 Farben neu, 0 Textstile neu, 2 Bausteine neu (2 Atomics), 4 Bausteine aktualisiert (3 Components, 1 Pattern)'
  );
});

test('componentsCreated 0 omits the whole segment (unchanged behavior)', () => {
  const text = formatImportSummary(baseSummary({ colorsCreated: 2, textCreated: 1 }));
  assert.equal(text, '2 Farben neu, 1 Textstile neu');
});

test('missing byKind data degrades gracefully to no parentheses (backward compatible)', () => {
  const text = formatImportSummary(baseSummary({ componentsCreated: 6 }));
  assert.equal(text, '0 Farben neu, 0 Textstile neu, 6 Bausteine neu');
});

test('colorsUpdated / textUpdated wording is untouched; placeholders reads "davon N Platzhalter"', () => {
  const text = formatImportSummary(
    baseSummary({
      colorsCreated: 1,
      colorsUpdated: 2,
      textCreated: 3,
      textUpdated: 4,
      placeholders: 5,
    })
  );
  assert.equal(
    text,
    '1 Farben neu, 2 Farben aktualisiert, 3 Textstile neu, 4 Textstile aktualisiert, davon 5 Platzhalter'
  );
});

test('"davon N Platzhalter" makes clear placeholders are already counted within Bausteine neu, not additional', () => {
  const text = formatImportSummary(
    baseSummary({
      componentsCreated: 13,
      componentsCreatedByKind: { atomic: 3, component: 9, pattern: 1 },
      placeholders: 1,
    })
  );
  assert.ok(text.includes('davon 1 Platzhalter'));
  assert.ok(!text.includes(', 1 Platzhalter'));
});
