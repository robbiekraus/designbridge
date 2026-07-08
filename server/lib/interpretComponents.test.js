import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { interpretComponents, sanitizeHtml } from './interpretComponents.js';

function tmpImage() {
  const p = path.join(os.tmpdir(), `db-interp-${Date.now()}.png`);
  fs.writeFileSync(p, Buffer.from('89504e47', 'hex')); // PNG-Magic reicht — wird nur base64-gelesen
  return p;
}

function fakeClient(responseObj) {
  const calls = [];
  return {
    calls,
    messages: {
      create: async (args) => {
        calls.push(args);
        return { content: [{ text: JSON.stringify(responseObj) }] };
      },
    },
  };
}

const COMPONENTS = [
  { name: 'Stat Card', kind: 'component', variants: [], notes: '' },
  { name: 'Data Table', kind: 'component', variants: [], notes: '' },
];

test('liefert Interpretationen für angefragte Bausteine', async () => {
  const client = fakeClient({
    interpretations: [
      { name: 'Stat Card', html: '<div class="rounded-lg border p-4">Umsatz</div>', jsx: 'export function StatCard() { return null; }' },
      { name: 'Data Table', html: '<table class="w-full"><tr><td>Zeile</td></tr></table>', jsx: 'export function DataTable() { return null; }' },
    ],
  });
  const res = await interpretComponents(tmpImage(), 'image/png', COMPONENTS, { client });
  assert.equal(res.interpretations.length, 2);
  assert.deepEqual(res.failed, []);
  assert.equal(res.interpretations[0].name, 'Stat Card');
  assert.match(res.interpretations[0].html, /rounded-lg/);
});

test('EIN Call: Bild als base64-Block + Prompt enthält Baustein-Namen', async () => {
  const client = fakeClient({ interpretations: [] });
  await interpretComponents(tmpImage(), 'image/png', COMPONENTS, { client });
  assert.equal(client.calls.length, 1);
  const content = client.calls[0].messages[0].content;
  assert.equal(content[0].type, 'image');
  assert.equal(content[0].source.media_type, 'image/png');
  assert.ok(content[0].source.data.length > 0);
  assert.match(content[1].text, /Stat Card/);
  assert.match(content[1].text, /Data Table/);
});

test('fehlender oder leerer Baustein landet in failed, Rest liefert', async () => {
  const client = fakeClient({
    interpretations: [
      { name: 'Stat Card', html: '<div class="p-2">ok</div>', jsx: '' },
      { name: 'Data Table', html: '   ', jsx: 'x' }, // leer nach trim → failed
    ],
  });
  const res = await interpretComponents(tmpImage(), 'image/png', COMPONENTS, { client });
  assert.equal(res.interpretations.length, 1);
  assert.deepEqual(res.failed, ['Data Table']);
});

test('script-Tags und on*-Attribute werden gestrippt', () => {
  const dirty = '<div class="p-2" onclick="evil()"><script>alert(1)</script>Hi<img src=x onerror=evil()></div>';
  const clean = sanitizeHtml(dirty);
  assert.doesNotMatch(clean, /<script/i);
  assert.doesNotMatch(clean, /onclick/i);
  assert.doesNotMatch(clean, /onerror/i);
  assert.match(clean, /Hi/);
});

test('ungültiges JSON von Claude wirft verständlichen Fehler', async () => {
  const client = { messages: { create: async () => ({ content: [{ text: 'Sorry, kann ich nicht.' }] }) } };
  await assert.rejects(
    () => interpretComponents(tmpImage(), 'image/png', COMPONENTS, { client }),
    /invalid JSON/
  );
});

test('sanitizeHtml entfernt iframe, object, embed, base und meta-refresh', () => {
  const dirty = '<div><iframe src="x"></iframe><object data="data:text/html;base64,PHNjcmlwdD4="></object><embed src="x"><base href="//evil"><meta http-equiv="refresh" content="0;url=//evil">Keep</div>';
  const clean = sanitizeHtml(dirty);
  assert.doesNotMatch(clean, /<iframe/i);
  assert.doesNotMatch(clean, /<object/i);
  assert.doesNotMatch(clean, /<embed/i);
  assert.doesNotMatch(clean, /<base/i);
  assert.doesNotMatch(clean, /http-equiv/i);
  assert.match(clean, /Keep/);
});

test('sanitizeHtml entfernt javascript: URIs in href/src', () => {
  const dirty = `<a href="javascript:evil()">x</a><img src='javascript:evil()'><a href=javascript:evil()>y</a>`;
  const clean = sanitizeHtml(dirty);
  assert.doesNotMatch(clean, /javascript:/i);
});

test('Namens-Matching toleriert umgebende Leerzeichen', async () => {
  const client = { messages: { create: async () => ({ content: [{ text: JSON.stringify({ interpretations: [{ name: '  Stat Card  ', html: '<div class="p-2">ok</div>', jsx: '' }] }) }] }) } };
  const res = await interpretComponents(
    tmpImage(),
    'image/png',
    [{ name: 'Stat Card', kind: 'component', variants: [], notes: '' }],
    { client }
  );
  assert.equal(res.interpretations.length, 1);
  assert.equal(res.interpretations[0].name, 'Stat Card');
});
