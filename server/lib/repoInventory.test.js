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

test('dedupes by name per level and returns empty arrays when nothing matches', () => {
  const twice = recognizeRepoInventory([f('components/ui/button.tsx'), f('src/components/ui/button.jsx')]);
  assert.equal(twice.atomics.length, 1);
  const none = recognizeRepoInventory([f('README.md')]);
  assert.deepEqual(none, { atomics: [], components: [], patterns: [] });
});
