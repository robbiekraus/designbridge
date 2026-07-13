// Unit tests for the new `svg` / `component-ref` PlanNode validation in parsePayload.ts.
// Pure logic, no `figma` global — runs under node:test after an esbuild bundle step
// (see scripts/build-tests.js). No figma-API mocks exist in this plugin yet, so renderer
// branches (renderPlan/buildComponents) are not covered here — see report.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseImportPayload } from '../src/writer/parsePayload';

function payloadWith(planNode: unknown): string {
  return JSON.stringify({
    designbridge: 'figma-import',
    colors: [],
    text: [],
    components: [
      {
        name: 'Test',
        kind: 'atomic',
        placeholder: false,
        variants: [{ name: 'default', plan: { type: 'box', children: [planNode] } }],
      },
    ],
  });
}

function firstChild(json: string) {
  const payload = parseImportPayload(json);
  return payload.components[0].variants[0].plan?.children ?? [];
}

// ─── svg ───────────────────────────────────────────────────────────────────

test('svg: valid markup starting with <svg parses', () => {
  const children = firstChild(payloadWith({ type: 'svg', markup: '<svg viewBox="0 0 10 10"></svg>' }));
  assert.equal(children.length, 1);
  assert.deepEqual(children[0], { type: 'svg', markup: '<svg viewBox="0 0 10 10"></svg>' });
});

test('svg: markup not starting with <svg is skipped', () => {
  const children = firstChild(payloadWith({ type: 'svg', markup: '<div>not svg</div>' }));
  assert.equal(children.length, 0);
});

test('svg: non-string markup is skipped', () => {
  const children = firstChild(payloadWith({ type: 'svg', markup: 123 }));
  assert.equal(children.length, 0);
});

test('svg: missing markup is skipped', () => {
  const children = firstChild(payloadWith({ type: 'svg' }));
  assert.equal(children.length, 0);
});

// ─── component-ref ──────────────────────────────────────────────────────────

test('component-ref: valid with variant + box fallback parses', () => {
  const fallback = { type: 'box', layout: 'row', children: [] };
  const children = firstChild(
    payloadWith({ type: 'component-ref', name: 'Button', variant: 'primary', fallback })
  );
  assert.deepEqual(children[0], {
    type: 'component-ref',
    name: 'Button',
    variant: 'primary',
    fallback: {
      type: 'box',
      layout: 'row',
      padding: [0, 0, 0, 0],
      radius: 0,
      fill: null,
      stroke: null,
      children: [],
    },
  });
});

test('component-ref: null variant + null fallback parses', () => {
  const children = firstChild(
    payloadWith({ type: 'component-ref', name: 'Button', variant: null, fallback: null })
  );
  assert.deepEqual(children[0], { type: 'component-ref', name: 'Button', variant: null, fallback: null });
});

test('component-ref: missing fallback field defaults to null', () => {
  const children = firstChild(payloadWith({ type: 'component-ref', name: 'Button', variant: null }));
  assert.deepEqual(children[0], { type: 'component-ref', name: 'Button', variant: null, fallback: null });
});

test('component-ref: missing name is skipped (whole node dropped)', () => {
  const children = firstChild(payloadWith({ type: 'component-ref', variant: 'primary', fallback: null }));
  assert.equal(children.length, 0);
});

test('component-ref: non-string name is skipped', () => {
  const children = firstChild(payloadWith({ type: 'component-ref', name: 42, variant: null, fallback: null }));
  assert.equal(children.length, 0);
});

test('component-ref: invalid fallback shape (not a box) degrades to null fallback, ref stays valid', () => {
  const children = firstChild(
    payloadWith({ type: 'component-ref', name: 'Button', variant: null, fallback: { type: 'not-a-box' } })
  );
  assert.deepEqual(children[0], { type: 'component-ref', name: 'Button', variant: null, fallback: null });
});

test('component-ref: non-string variant falls back to null', () => {
  const children = firstChild(
    payloadWith({ type: 'component-ref', name: 'Button', variant: 7, fallback: null })
  );
  assert.deepEqual(children[0], { type: 'component-ref', name: 'Button', variant: null, fallback: null });
});
