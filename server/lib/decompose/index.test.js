import test from 'node:test';
import assert from 'node:assert/strict';
import { getDecomposer } from './index.js';
import { imageDecomposer } from './imageDecomposer.js';

test('returns the image decomposer for kind "image"', () => {
  assert.equal(getDecomposer('image'), imageDecomposer);
});

test('throws for unknown source kinds', () => {
  assert.throws(() => getDecomposer('url'), /kein Decomposer/i);
  assert.throws(() => getDecomposer('nope'), /kein Decomposer/i);
});
