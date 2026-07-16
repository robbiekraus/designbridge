// Unit tests for the live-first/localhost-fallback fetch helper used by the
// "Aus DesignBridge übernehmen" button. Pure logic, no DOM/figma global — runs
// under node:test after the esbuild bundle step (see scripts/build-tests.js).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fetchLatestExport, type FetchLikeResponse } from '../src/network/fetchLatestExport';

const LIVE = 'https://designbridge-production.up.railway.app/api/figma-export/latest';
const LOCAL = 'http://localhost:3047/api/figma-export/latest';

function okResponse(body: unknown): FetchLikeResponse {
  return { ok: true, status: 200, json: async () => body };
}

function errorResponse(status: number): FetchLikeResponse {
  return { ok: false, status, json: async () => ({}) };
}

test('uses the live URL when it connects successfully', async () => {
  const calls: string[] = [];
  const result = await fetchLatestExport([LIVE, LOCAL], async (url) => {
    calls.push(url);
    return okResponse({ hello: 'live' });
  });
  assert.equal(result.url, LIVE);
  assert.deepEqual(calls, [LIVE]);
  assert.deepEqual(await result.response.json(), { hello: 'live' });
});

test('falls back to localhost when the live URL throws a network error', async () => {
  const calls: string[] = [];
  const result = await fetchLatestExport([LIVE, LOCAL], async (url) => {
    calls.push(url);
    if (url === LIVE) throw new TypeError('Failed to fetch');
    return okResponse({ hello: 'local' });
  });
  assert.equal(result.url, LOCAL);
  assert.deepEqual(calls, [LIVE, LOCAL]);
  assert.deepEqual(await result.response.json(), { hello: 'local' });
});

test('does NOT fall back when the live URL connects but answers with an HTTP error (e.g. 404)', async () => {
  const calls: string[] = [];
  const result = await fetchLatestExport([LIVE, LOCAL], async (url) => {
    calls.push(url);
    return errorResponse(404);
  });
  assert.equal(result.url, LIVE);
  assert.deepEqual(calls, [LIVE]);
  assert.equal(result.response.ok, false);
  assert.equal(result.response.status, 404);
});

test('rejects with the last error when every URL throws a network error', async () => {
  const err = new TypeError('Failed to fetch');
  await assert.rejects(
    fetchLatestExport([LIVE, LOCAL], async () => {
      throw err;
    }),
    err
  );
});

test('rejects when no URLs are provided', async () => {
  await assert.rejects(fetchLatestExport([], async () => okResponse({})));
});
