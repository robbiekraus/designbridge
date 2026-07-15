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

test('returns merged lists from the model', async () => {
  const client = fakeClient({
    atomics: [{ name: 'Button', variants: ['default', 'ghost'], confidence: 'high', source: 'rules+ai', notes: '' }],
    components: [{ name: 'Card', confidence: 'med', source: 'ai', notes: '' }],
    patterns: [],
    warnings: [],
  });
  const baseline = { atomics: [], components: [], patterns: [] };
  const out = await deepenRepoWithAi(FILES, baseline, { client });
  assert.equal(out.atomics[0].source, 'rules+ai');
  assert.deepEqual(out.atomics[0].variants, ['default', 'ghost']);
  assert.equal(out.components[0].source, 'ai');
});

test('throws a clear error on invalid JSON', async () => {
  const client = { messages: { create: async () => ({ content: [{ text: 'not json' }] }) } };
  await assert.rejects(
    () => deepenRepoWithAi(FILES, { atomics: [], components: [], patterns: [] }, { client }),
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
  const client = fakeClient({ atomics: [], components: [], patterns: [], warnings: [] });
  const big = [{ path: 'tailwind.config.js', content: 'x'.repeat(100000) }];
  const out = await deepenRepoWithAi(big, { atomics: [], components: [], patterns: [] }, { client });
  assert.ok(out.warnings.some((w) => /gekürzt/.test(w)));
});
