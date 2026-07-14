import test from 'node:test';
import assert from 'node:assert/strict';
import { putRepo, getRepo, removeRepo, clearRepos } from './repoStore.js';

test('putRepo/getRepo speichert Dateien + Meta', () => {
  const files = [{ path: 'a.tsx', content: 'x' }];
  const id = putRepo(files, { sourceUrl: 'gh/o/r' });
  const got = getRepo(id);
  assert.deepEqual(got.files, files);
  assert.equal(got.meta.sourceUrl, 'gh/o/r');
  removeRepo(id);
  assert.equal(getRepo(id), null);
});

test('TTL 0 räumt sofort ab', async () => {
  const id = putRepo([{ path: 'a', content: 'y' }], {}, { ttlMs: 0 });
  await new Promise((r) => setTimeout(r, 5));
  assert.equal(getRepo(id), null);
});

test('getRepo für unbekannte id ist null', () => {
  clearRepos();
  assert.equal(getRepo('nope'), null);
});
