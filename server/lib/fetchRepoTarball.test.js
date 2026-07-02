import { test } from 'node:test';
import assert from 'node:assert/strict';
import { downloadRepoTarball } from './fetchRepoTarball.js';

const TAR = Buffer.from('fake-tarball');

function fakeFetch(routes) {
  return async (url) => {
    const hit = routes.find((r) => url.includes(r.match));
    if (!hit) return { ok: false, status: 404, headers: { get: () => null } };
    return {
      ok: hit.status ? hit.status < 400 : true,
      status: hit.status ?? 200,
      headers: { get: (h) => (h === 'content-length' ? hit.length ?? null : null) },
      json: async () => hit.json,
      arrayBuffer: async () => (hit.body ?? TAR),
    };
  };
}

test('uses the explicit branch without touching the github api', async () => {
  let apiCalled = false;
  const fetchImpl = async (url) => {
    if (url.includes('api.github.com')) apiCalled = true;
    return fakeFetch([{ match: 'codeload.github.com/a/b/tar.gz/refs/heads/dev' }])(url);
  };
  const out = await downloadRepoTarball({ owner: 'a', repo: 'b', branch: 'dev' }, { fetchImpl });
  assert.equal(out.branch, 'dev');
  assert.ok(Buffer.isBuffer(out.buffer));
  assert.equal(apiCalled, false);
});

test('resolves the default branch via the github api', async () => {
  const fetchImpl = fakeFetch([
    { match: 'api.github.com/repos/a/b', json: { default_branch: 'trunk' } },
    { match: '/tar.gz/refs/heads/trunk' },
  ]);
  const out = await downloadRepoTarball({ owner: 'a', repo: 'b' }, { fetchImpl });
  assert.equal(out.branch, 'trunk');
});

test('falls back to main/master when the api is rate-limited', async () => {
  const fetchImpl = fakeFetch([
    { match: 'api.github.com', status: 403 },
    { match: '/tar.gz/refs/heads/master' },
  ]);
  const out = await downloadRepoTarball({ owner: 'a', repo: 'b' }, { fetchImpl });
  assert.equal(out.branch, 'master');
});

test('reports rate limit when fallbacks also miss', async () => {
  const fetchImpl = fakeFetch([{ match: 'api.github.com', status: 403 }]);
  await assert.rejects(() => downloadRepoTarball({ owner: 'a', repo: 'b' }, { fetchImpl }), /Rate-Limit/);
});

test('404 on the api means repo not found', async () => {
  const fetchImpl = fakeFetch([{ match: 'api.github.com', status: 404 }]);
  await assert.rejects(() => downloadRepoTarball({ owner: 'a', repo: 'b' }, { fetchImpl }), /nicht gefunden/);
});

test('rejects oversized repos via content-length and via buffer size', async () => {
  const big = fakeFetch([{ match: '/tar.gz/', length: String(99 * 1024 * 1024) }]);
  await assert.rejects(
    () => downloadRepoTarball({ owner: 'a', repo: 'b', branch: 'main' }, { fetchImpl: big }),
    /zu groß/
  );
  const sneaky = fakeFetch([{ match: '/tar.gz/', body: Buffer.alloc(64) }]);
  await assert.rejects(
    () => downloadRepoTarball({ owner: 'a', repo: 'b', branch: 'main' }, { fetchImpl: sneaky, maxBytes: 16 }),
    /zu groß/
  );
});
