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
      width: null,
      height: null,
      gap: 0,
      strokeWeight: 1,
      primaryAlign: 'MIN',
      counterAlign: 'CENTER',
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

// ─── PlanBox: new v2 fields (width/height/gap/strokeWeight/primaryAlign/counterAlign) ──────

function boxPayload(boxOverrides: Record<string, unknown>): string {
  return JSON.stringify({
    designbridge: 'figma-import',
    colors: [],
    text: [],
    components: [
      {
        name: 'Test',
        kind: 'atomic',
        placeholder: false,
        variants: [{ name: 'default', plan: { type: 'box', ...boxOverrides } }],
      },
    ],
  });
}

function firstPlan(json: string) {
  const payload = parseImportPayload(json);
  return payload.components[0].variants[0].plan;
}

test('box: valid width/height/gap/strokeWeight/primaryAlign/counterAlign parse as given', () => {
  const plan = firstPlan(
    boxPayload({
      width: 320,
      height: 200,
      gap: 12,
      strokeWeight: 3,
      primaryAlign: 'SPACE_BETWEEN',
      counterAlign: 'MAX',
    })
  );
  assert.equal(plan?.width, 320);
  assert.equal(plan?.height, 200);
  assert.equal(plan?.gap, 12);
  assert.equal(plan?.strokeWeight, 3);
  assert.equal(plan?.primaryAlign, 'SPACE_BETWEEN');
  assert.equal(plan?.counterAlign, 'MAX');
});

test('box: all valid primaryAlign enum values parse as given', () => {
  for (const value of ['MIN', 'CENTER', 'MAX', 'SPACE_BETWEEN']) {
    const plan = firstPlan(boxPayload({ primaryAlign: value }));
    assert.equal(plan?.primaryAlign, value);
  }
});

test('box: all valid counterAlign enum values parse as given', () => {
  for (const value of ['MIN', 'CENTER', 'MAX']) {
    const plan = firstPlan(boxPayload({ counterAlign: value }));
    assert.equal(plan?.counterAlign, value);
  }
});

test('box: missing width/height default to null (HUG, unchanged behavior)', () => {
  const plan = firstPlan(boxPayload({}));
  assert.equal(plan?.width, null);
  assert.equal(plan?.height, null);
});

test('box: explicit null width/height stay null', () => {
  const plan = firstPlan(boxPayload({ width: null, height: null }));
  assert.equal(plan?.width, null);
  assert.equal(plan?.height, null);
});

test('box: non-number width/height fall back to null', () => {
  const plan = firstPlan(boxPayload({ width: 'wide', height: '200px' }));
  assert.equal(plan?.width, null);
  assert.equal(plan?.height, null);
});

test('box: missing gap defaults to 0', () => {
  const plan = firstPlan(boxPayload({}));
  assert.equal(plan?.gap, 0);
});

test('box: non-number gap falls back to default 0', () => {
  const plan = firstPlan(boxPayload({ gap: 'big' }));
  assert.equal(plan?.gap, 0);
});

test('box: missing strokeWeight defaults to 1', () => {
  const plan = firstPlan(boxPayload({}));
  assert.equal(plan?.strokeWeight, 1);
});

test('box: non-number strokeWeight falls back to default 1', () => {
  const plan = firstPlan(boxPayload({ strokeWeight: 'thick' }));
  assert.equal(plan?.strokeWeight, 1);
});

test('box: missing primaryAlign defaults to MIN', () => {
  const plan = firstPlan(boxPayload({}));
  assert.equal(plan?.primaryAlign, 'MIN');
});

test('box: invalid primaryAlign value falls back to default MIN', () => {
  const plan = firstPlan(boxPayload({ primaryAlign: 'JUSTIFY' }));
  assert.equal(plan?.primaryAlign, 'MIN');
});

test('box: missing counterAlign defaults to CENTER', () => {
  const plan = firstPlan(boxPayload({}));
  assert.equal(plan?.counterAlign, 'CENTER');
});

test('box: invalid counterAlign value falls back to default CENTER', () => {
  const plan = firstPlan(boxPayload({ counterAlign: 'SPACE_BETWEEN' }));
  assert.equal(plan?.counterAlign, 'CENTER');
});

test('box: backward-compat payload without any new fields parses with all v2 defaults', () => {
  const plan = firstPlan(boxPayload({ layout: 'column', padding: [1, 2, 3, 4], radius: 8 }));
  assert.deepEqual(plan, {
    type: 'box',
    layout: 'column',
    padding: [1, 2, 3, 4],
    radius: 8,
    fill: null,
    stroke: null,
    children: [],
    width: null,
    height: null,
    gap: 0,
    strokeWeight: 1,
    primaryAlign: 'MIN',
    counterAlign: 'CENTER',
  });
});

// ─── PlanText: new v2 fields (align/lineHeight) ─────────────────────────────

function textPayload(textOverrides: Record<string, unknown>): string {
  return payloadWith({ type: 'text', content: 'Hi', color: { hex: '#000000' }, ...textOverrides });
}

test('text: valid align values parse as given', () => {
  for (const value of ['left', 'center', 'right']) {
    const children = firstChild(textPayload({ align: value }));
    assert.equal((children[0] as { align?: string }).align, value);
  }
});

test('text: missing align defaults to left', () => {
  const children = firstChild(textPayload({}));
  assert.equal((children[0] as { align?: string }).align, 'left');
});

test('text: invalid align value falls back to default left', () => {
  const children = firstChild(textPayload({ align: 'justify' }));
  assert.equal((children[0] as { align?: string }).align, 'left');
});

test('text: valid numeric lineHeight parses as given', () => {
  const children = firstChild(textPayload({ lineHeight: 24 }));
  assert.equal((children[0] as { lineHeight?: number | null }).lineHeight, 24);
});

test('text: missing lineHeight defaults to null', () => {
  const children = firstChild(textPayload({}));
  assert.equal((children[0] as { lineHeight?: number | null }).lineHeight, null);
});

test('text: explicit null lineHeight stays null', () => {
  const children = firstChild(textPayload({ lineHeight: null }));
  assert.equal((children[0] as { lineHeight?: number | null }).lineHeight, null);
});

test('text: non-number lineHeight falls back to null', () => {
  const children = firstChild(textPayload({ lineHeight: 'tall' }));
  assert.equal((children[0] as { lineHeight?: number | null }).lineHeight, null);
});

test('text: backward-compat payload without any new fields parses with v2 defaults', () => {
  const children = firstChild(payloadWith({ type: 'text', content: 'Hi', color: { hex: '#000000' } }));
  assert.deepEqual(children[0], {
    type: 'text',
    content: 'Hi',
    fontSize: 14,
    fontWeight: 400,
    color: { token: null, hex: '#000000' },
    align: 'left',
    lineHeight: null,
  });
});
