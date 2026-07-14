import { test } from 'node:test';
import assert from 'node:assert/strict';
import { recognizeRepoInventory } from './repoInventory.js';

const f = (path) => ({ path, content: '' });

test('components/ui files become high-confidence atomics in PascalCase', () => {
  const { atomics } = recognizeRepoInventory([
    f('components/ui/button.tsx'),
    f('components/ui/dropdown-menu.tsx'),
  ]);
  const names = atomics.map((a) => a.name).sort();
  assert.deepEqual(names, ['Button', 'DropdownMenu']);
  for (const a of atomics) {
    assert.equal(a.confidence, 'high');
    assert.equal(a.source, 'rules');
    assert.deepEqual(a.variants, []);
    assert.match(a.notes, /components\/ui\//);
  }
});

test('plain components/ files become low-confidence components', () => {
  const { components } = recognizeRepoInventory([f('src/components/Header.tsx')]);
  assert.deepEqual(components.map((c) => c.name), ['Header']);
  assert.equal(components[0].confidence, 'low');
});

test('layout and pages become patterns with tiered confidence', () => {
  const { patterns } = recognizeRepoInventory([
    f('app/layout.tsx'),
    f('app/page.tsx'),
    f('app/dashboard/page.tsx'),
    f('pages/pricing.tsx'),
  ]);
  const byName = Object.fromEntries(patterns.map((p) => [p.name, p]));
  assert.equal(byName['Layout'].confidence, 'med');
  assert.equal(byName['Seite: Start'].confidence, 'low');
  assert.ok(byName['Seite: Dashboard']);
  assert.ok(byName['Seite: Pricing']);
});

test('route-group directories lose their parens in page labels', () => {
  const { patterns } = recognizeRepoInventory([f('app/(marketing)/page.tsx')]);
  assert.deepEqual(patterns.map((p) => p.name), ['Seite: Marketing']);
});

test('catch-all dynamic segments produce readable labels without brackets', () => {
  const { patterns } = recognizeRepoInventory([f('app/blog/[...slug]/page.tsx')]);
  assert.deepEqual(patterns.map((p) => p.name), ['Seite: Slug']);
  assert.doesNotMatch(patterns[0].name, /[[\]()]/);
});

test('optional catch-all segments produce readable labels without brackets', () => {
  const { patterns } = recognizeRepoInventory([f('app/docs/[[...slug]]/page.tsx')]);
  assert.deepEqual(patterns.map((p) => p.name), ['Seite: Slug']);
  assert.doesNotMatch(patterns[0].name, /[[\]()]/);
});

test('dynamic pages that clean to the same label collapse into one pattern', () => {
  const { patterns } = recognizeRepoInventory([
    f('app/blog/[...slug]/page.tsx'),
    f('app/docs/[[...slug]]/page.tsx'),
  ]);
  assert.deepEqual(patterns.map((p) => p.name), ['Seite: Slug']);
});

test('dedupes by name per level and returns empty arrays when nothing matches', () => {
  const twice = recognizeRepoInventory([f('components/ui/button.tsx'), f('src/components/ui/button.jsx')]);
  assert.equal(twice.atomics.length, 1);
  const none = recognizeRepoInventory([f('README.md')]);
  assert.deepEqual(none, { atomics: [], components: [], patterns: [] });
});

test('atomics/components tragen path, patterns nicht', () => {
  const inv = recognizeRepoInventory([
    { path: 'src/components/ui/button.tsx', content: '' },
    { path: 'src/components/PricingCard.tsx', content: '' },
    { path: 'src/app/dashboard/page.tsx', content: '' },
  ]);
  assert.equal(inv.atomics[0].path, 'src/components/ui/button.tsx');
  assert.equal(inv.components[0].path, 'src/components/PricingCard.tsx');
  assert.equal(inv.patterns[0].path, undefined);
});
