import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { interpretComponents } from './interpretComponents.js';

// DS-Grounding, Scheibe 1 Schritt 4 (Spec 2026-07-23 §Q2/Q4): der Interpretations-Prompt lehrt das
// Modell das data-ds-component-Vokabular.

function tmpImage() {
  const p = path.join(os.tmpdir(), `db-ground-${Date.now()}.png`);
  fs.writeFileSync(p, Buffer.from('89504e47', 'hex'));
  return p;
}

function fakeClient() {
  const calls = [];
  return {
    calls,
    messages: { create: async (args) => { calls.push(args); return { content: [{ text: JSON.stringify({ interpretations: [] }) }] }; } },
  };
}

const SEGMENTS = [{ id: 'seg_0', label: 'Stat Card', kind: 'component', bounds: null, visual: null, structure: null }];

function promptOf(client) {
  return client.calls[0].messages[0].content.filter((b) => b.type === 'text').map((b) => b.text).join('\n');
}

test('Prompt lehrt data-ds-component-Grounding samt Vokabular', async () => {
  const client = fakeClient();
  await interpretComponents(tmpImage(), 'image/png', SEGMENTS, { client });
  const prompt = promptOf(client);
  assert.match(prompt, /data-ds-component/);
  assert.match(prompt, /DESIGN-SYSTEM GROUNDING/);
  assert.match(prompt, /KNOWN COMPONENTS/);
  assert.match(prompt, /- Button \(variant: default\|secondary/);
  // Q4: kein Zwang.
  assert.match(prompt, /do NOT force a component/i);
});

test('COMPONENTS bleibt die LETZTE Zeile (Test-Vertrag der Parser)', async () => {
  const client = fakeClient();
  await interpretComponents(tmpImage(), 'image/png', SEGMENTS, { client });
  const prompt = promptOf(client);
  assert.match(prompt, /COMPONENTS \(in order\): (\[.*\])$/);
});

test('leerer Katalog → kein Grounding-Teil (opt-out)', async () => {
  const client = fakeClient();
  await interpretComponents(tmpImage(), 'image/png', SEGMENTS, { client, catalog: [] });
  const prompt = promptOf(client);
  assert.doesNotMatch(prompt, /data-ds-component/);
  assert.doesNotMatch(prompt, /KNOWN COMPONENTS/);
});
