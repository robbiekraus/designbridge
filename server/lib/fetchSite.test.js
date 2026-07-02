import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fetchSite } from './fetchSite.js';

function mockFetch(map) {
  return async (url) => {
    if (!(url in map)) return { ok: false, status: 404, text: async () => '' };
    return { ok: true, status: 200, text: async () => map[url] };
  };
}

test('collects <style> blocks and resolves relative <link> stylesheets', async () => {
  const html = `<html><head>
    <style>:root{--color-primary:#022d2c}</style>
    <link rel="stylesheet" href="/css/app.css">
  </head></html>`;
  const fetchImpl = mockFetch({
    'http://x/demo': html,
    'http://x/css/app.css': '.btn{background:#022d2c}',
  });
  const { css, baseUrl } = await fetchSite('http://x/demo', { fetchImpl });
  assert.ok(css.includes('--color-primary:#022d2c'));
  assert.ok(css.includes('.btn{background:#022d2c}'));
  assert.equal(baseUrl, 'http://x/demo');
});

test('captures inline style="" attributes and survives a broken stylesheet', async () => {
  const html = `<div style="color:#fff"></div><link rel="stylesheet" href="/missing.css">`;
  const fetchImpl = mockFetch({ 'http://x/': html });
  const { css } = await fetchSite('http://x/', { fetchImpl });
  assert.ok(css.includes('color:#fff'));
});

test('throws a clear error when the page itself is unreachable', async () => {
  const fetchImpl = mockFetch({});
  await assert.rejects(() => fetchSite('http://x/', { fetchImpl }), /HTTP 404/);
});

test('fetchSite returns the raw html alongside css', async () => {
  const html = '<html><head><style>.a{color:red}</style></head><body><button>x</button></body></html>';
  const fakeFetch = async () => ({ ok: true, status: 200, text: async () => html });
  const result = await fetchSite('http://x/', { fetchImpl: fakeFetch });
  assert.equal(result.html, html);
  assert.match(result.css, /color:red/);
  assert.equal(result.baseUrl, 'http://x/');
});
