import { test } from 'node:test';
import assert from 'node:assert/strict';
import { putPage, getPage, removePage, clearPages } from './pageStore.js';

test('putPage/getPage liefert html+css zurück', () => {
  const id = putPage('<html></html>', 'body{color:red}');
  const e = getPage(id);
  assert.equal(e.html, '<html></html>');
  assert.equal(e.css, 'body{color:red}');
  clearPages();
});

test('getPage nach removePage/TTL → null', async () => {
  const id = putPage('<p>x</p>', '', { ttlMs: 5 });
  await new Promise((r) => setTimeout(r, 20));
  assert.equal(getPage(id), null);
  const id2 = putPage('<p>y</p>', '');
  removePage(id2);
  assert.equal(getPage(id2), null);
  clearPages();
});
