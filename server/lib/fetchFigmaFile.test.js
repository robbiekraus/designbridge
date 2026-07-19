import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fetchFigmaFile } from './fetchFigmaFile.js';

function fakeFetch(routes) {
  return async (url, opts) => {
    const hit = routes.find((r) => String(url).includes(r.match));
    if (!hit) return { ok: false, status: 404, json: async () => ({}) };
    return {
      ok: hit.status ? hit.status < 400 : true,
      status: hit.status ?? 200,
      json: async () => hit.json ?? {},
      _opts: opts,
    };
  };
}

test('happy path: fetches document + styles, and variables when available', async () => {
  let sawToken = null;
  const fetchImpl = async (url, opts) => {
    if (String(url).includes('/v1/files/abc123/variables/local')) {
      sawToken = opts.headers['X-Figma-Token'];
      return { ok: true, status: 200, json: async () => ({ meta: { variables: { v1: { id: 'v1' } } } }) };
    }
    if (String(url).includes('/v1/files/abc123')) {
      return {
        ok: true, status: 200,
        json: async () => ({ document: { id: '0:0' }, styles: { s1: { name: 'Primary' } } }),
      };
    }
    return { ok: false, status: 404, json: async () => ({}) };
  };
  const out = await fetchFigmaFile({ fileKey: 'abc123', token: 'tok', fetchImpl });
  assert.deepEqual(out.document, { id: '0:0' });
  assert.deepEqual(out.styles, { s1: { name: 'Primary' } });
  assert.deepEqual(out.variables, { v1: { id: 'v1' } });
  assert.equal(sawToken, 'tok');
});

test('variables endpoint 403 (no enterprise) → variables:null, no throw', async () => {
  const fetchImpl = fakeFetch([
    { match: '/variables/local', status: 403 },
    { match: '/v1/files/abc123', json: { document: { id: '0:0' }, styles: {} } },
  ]);
  const out = await fetchFigmaFile({ fileKey: 'abc123', token: 'tok', fetchImpl });
  assert.equal(out.variables, null);
});

test('variables endpoint network error → variables:null, no throw', async () => {
  const fetchImpl = async (url) => {
    if (String(url).includes('/variables/local')) throw new Error('boom');
    return { ok: true, status: 200, json: async () => ({ document: { id: '0:0' }, styles: {} }) };
  };
  const out = await fetchFigmaFile({ fileKey: 'abc123', token: 'tok', fetchImpl });
  assert.equal(out.variables, null);
});

test('403 on main file → deutsche Meldung', async () => {
  const fetchImpl = fakeFetch([{ match: '/v1/files/abc123', status: 403 }]);
  await assert.rejects(
    () => fetchFigmaFile({ fileKey: 'abc123', token: 'bad', fetchImpl }),
    /Figma-Token ungültig oder kein Zugriff/
  );
});

test('404 on main file → deutsche Meldung', async () => {
  const fetchImpl = fakeFetch([{ match: '/v1/files/abc123', status: 404 }]);
  await assert.rejects(
    () => fetchFigmaFile({ fileKey: 'abc123', token: 'tok', fetchImpl }),
    /Figma-Datei nicht gefunden/
  );
});

test('429 on main file → deutsche Meldung', async () => {
  const fetchImpl = fakeFetch([{ match: '/v1/files/abc123', status: 429 }]);
  await assert.rejects(
    () => fetchFigmaFile({ fileKey: 'abc123', token: 'tok', fetchImpl }),
    /Rate-Limit/
  );
});

test('other HTTP error on main file → generic deutsche Meldung with status', async () => {
  const fetchImpl = fakeFetch([{ match: '/v1/files/abc123', status: 500 }]);
  await assert.rejects(
    () => fetchFigmaFile({ fileKey: 'abc123', token: 'tok', fetchImpl }),
    /konnte nicht geladen werden: 500/
  );
});
