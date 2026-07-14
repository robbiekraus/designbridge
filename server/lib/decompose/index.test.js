import test from 'node:test';
import assert from 'node:assert/strict';
import { getDecomposer } from './index.js';
import { imageDecomposer } from './imageDecomposer.js';
import { urlDecomposer } from './urlDecomposer.js';

test('returns the image decomposer for kind "image"', () => {
  assert.equal(getDecomposer('image'), imageDecomposer);
});

test('returns the url decomposer for kind "url"', () => {
  assert.equal(getDecomposer('url'), urlDecomposer);
});

test('throws for unknown source kinds', () => {
  assert.throws(() => getDecomposer('pdf'), /kein Decomposer/i);
  assert.throws(() => getDecomposer('nope'), /kein Decomposer/i);
});

test('getDecomposer("repo") liefert den repoDecomposer', () => {
  const d = getDecomposer('repo');
  assert.equal(typeof d.decompose, 'function');
});
