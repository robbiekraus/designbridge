import { test } from 'node:test';
import assert from 'node:assert/strict';
import { deepenRepoWithAi, buildRepoDigest } from './deepenRepoWithAi.js';

function fakeClient(payload) {
  return { messages: { create: async () => ({ content: [{ text: JSON.stringify(payload) }] }) } };
}

const FILES = [
  { path: 'tailwind.config.js', content: 'module.exports = {}' },
  { path: 'components/ui/button.tsx', content: 'export function Button() {}' },
  { path: 'app/page.tsx', content: '' },
];

const EMPTY_BASELINE = { atoms: [], molecules: [], organisms: [], templates: [] };

test('returns merged lists from the model', async () => {
  const client = fakeClient({
    atoms: [{ name: 'Button', variants: ['default', 'ghost'], confidence: 'high', source: 'rules+ai', notes: '' }],
    molecules: [],
    organisms: [{ name: 'Card', confidence: 'med', source: 'ai', notes: '' }],
    templates: [],
    warnings: [],
  });
  const out = await deepenRepoWithAi(FILES, EMPTY_BASELINE, { client });
  assert.equal(out.atoms[0].source, 'rules+ai');
  assert.deepEqual(out.atoms[0].variants, ['default', 'ghost']);
  assert.equal(out.organisms[0].source, 'ai');
});

test('throws a clear error on invalid JSON', async () => {
  const client = { messages: { create: async () => ({ content: [{ text: 'not json' }] }) } };
  await assert.rejects(
    () => deepenRepoWithAi(FILES, EMPTY_BASELINE, { client }),
    /kein gültiges JSON/
  );
});

test('buildRepoDigest lists all paths but embeds only config and ui sources', () => {
  const { digest } = buildRepoDigest(FILES);
  assert.match(digest, /- app\/page\.tsx/);
  assert.match(digest, /=== components\/ui\/button\.tsx ===/);
  assert.ok(!digest.includes('=== app/page.tsx ==='));
});

test('adds a truncation warning when the digest was capped', async () => {
  const client = fakeClient({ atoms: [], molecules: [], organisms: [], templates: [], warnings: [] });
  const big = [{ path: 'tailwind.config.js', content: 'x'.repeat(100000) }];
  const out = await deepenRepoWithAi(big, EMPTY_BASELINE, { client });
  assert.ok(out.warnings.some((w) => /gekürzt/.test(w)));
});
