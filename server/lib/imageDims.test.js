import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readImageDims } from './imageDims.js';

const here = path.dirname(fileURLToPath(import.meta.url));

test('readImageDims returns width/height for a PNG', async () => {
  const p = path.resolve(here, './fixtures/tiny.png');
  const dims = await readImageDims(p);
  assert.ok(dims.width > 0 && dims.height > 0);
});

test('readImageDims returns null on unreadable file', async () => {
  const dims = await readImageDims('/no/such/file.png');
  assert.equal(dims, null);
});
