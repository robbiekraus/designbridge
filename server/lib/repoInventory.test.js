import { test } from 'node:test';
import assert from 'node:assert/strict';
import { recognizeRepoInventory } from './repoInventory.js';

const f = (path) => ({ path, content: '' });

test('components/ui files become high-confidence atoms in PascalCase', () => {
  const { atoms } = recognizeRepoInventory([
    f('components/ui/button.tsx'),
    f('components/ui/dropdown-menu.tsx'),
  ]);
  const names = atoms.map((a) => a.name).sort();
  assert.deepEqual(names, ['Button', 'DropdownMenu']);
  for (const a of atoms) {
    assert.equal(a.confidence, 'high');
    assert.equal(a.source, 'rules');
    assert.deepEqual(a.variants, []);
    assert.match(a.notes, /components\/ui\//);
  }
});

test('plain components/ files become low-confidence organisms', () => {
  const { organisms } = recognizeRepoInventory([f('src/components/Header.tsx')]);
  assert.deepEqual(organisms.map((c) => c.name), ['Header']);
  assert.equal(organisms[0].confidence, 'low');
});

test('layout.tsx and page.tsx become templates with tiered confidence', () => {
  const { templates } = recognizeRepoInventory([
    f('app/layout.tsx'),
    f('app/page.tsx'),
    f('app/dashboard/page.tsx'),
    f('pages/pricing.tsx'),
  ]);
  const byName = Object.fromEntries(templates.map((p) => [p.name, p]));
  assert.equal(byName['Layout'].confidence, 'med');
  assert.equal(byName['Seite: Start'].confidence, 'low');
  assert.ok(byName['Seite: Dashboard']);
  assert.ok(byName['Seite: Pricing']);
});

test('route-group directories lose their parens in page labels', () => {
  const { templates } = recognizeRepoInventory([f('app/(marketing)/page.tsx')]);
  assert.deepEqual(templates.map((p) => p.name), ['Seite: Marketing']);
});

test('catch-all dynamic segments produce readable labels without brackets', () => {
  const { templates } = recognizeRepoInventory([f('app/blog/[...slug]/page.tsx')]);
  assert.deepEqual(templates.map((p) => p.name), ['Seite: Slug']);
  assert.doesNotMatch(templates[0].name, /[[\]()]/);
});

test('optional catch-all segments produce readable labels without brackets', () => {
  const { templates } = recognizeRepoInventory([f('app/docs/[[...slug]]/page.tsx')]);
  assert.deepEqual(templates.map((p) => p.name), ['Seite: Slug']);
  assert.doesNotMatch(templates[0].name, /[[\]()]/);
});

test('dynamic pages that clean to the same label collapse into one template', () => {
  const { templates } = recognizeRepoInventory([
    f('app/blog/[...slug]/page.tsx'),
    f('app/docs/[[...slug]]/page.tsx'),
  ]);
  assert.deepEqual(templates.map((p) => p.name), ['Seite: Slug']);
});

test('dedupes by name per level and returns empty arrays when nothing matches', () => {
  const twice = recognizeRepoInventory([f('components/ui/button.tsx'), f('src/components/ui/button.jsx')]);
  assert.equal(twice.atoms.length, 1);
  const none = recognizeRepoInventory([f('README.md')]);
  assert.deepEqual(none, { atoms: [], organisms: [], templates: [] });
});

test('atoms/organisms tragen path, templates nicht', () => {
  const inv = recognizeRepoInventory([
    { path: 'src/components/ui/button.tsx', content: '' },
    { path: 'src/components/PricingCard.tsx', content: '' },
    { path: 'src/app/dashboard/page.tsx', content: '' },
  ]);
  assert.equal(inv.atoms[0].path, 'src/components/ui/button.tsx');
  assert.equal(inv.organisms[0].path, 'src/components/PricingCard.tsx');
  assert.equal(inv.templates[0].path, undefined);
});
