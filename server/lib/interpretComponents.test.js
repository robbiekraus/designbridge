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

// Segmente ohne eigenen Crop (visual: null) → Fallback aufs Vollbild.
const SEGMENTS = [
  { id: 'seg_0', label: 'Stat Card', kind: 'component', bounds: null, visual: null, structure: null },
  { id: 'seg_1', label: 'Data Table', kind: 'component', bounds: null, visual: null, structure: null },
];

test('Prompt verlangt Daten-Treue: Zahlen, Achsen/Legende, Tooltip, aktive Zustände', async () => {
  const client = fakeClient({ interpretations: [] });
  await interpretComponents(tmpImage(), 'image/png', SEGMENTS, { client });
  const prompt = client.calls[0].messages[0].content
    .filter((b) => b.type === 'text').map((b) => b.text).join('\n');
  assert.match(prompt, /NUMBERS/i);
  assert.match(prompt, /axis tick labels/i);
  assert.match(prompt, /legend/i);
  assert.match(prompt, /tooltip/i);
  assert.match(prompt, /highlighted|selected|active/i);
  // Donut/Ring-Segmente als echte Arc-Pfade — dasharray-Tricks streifen im Figma-SVG-Import.
  assert.match(prompt, /arc paths/i);
  assert.match(prompt, /NEVER with stroke-dasharray/i);
});

test('liefert Interpretationen für angefragte Bausteine', async () => {
  const client = fakeClient({
    interpretations: [
      { name: 'Stat Card', html: '<div class="rounded-lg border p-4">Umsatz</div>', jsx: 'export function StatCard() { return null; }' },
      { name: 'Data Table', html: '<table class="w-full"><tr><td>Zeile</td></tr></table>', jsx: 'export function DataTable() { return null; }' },
    ],
  });
  const res = await interpretComponents(tmpImage(), 'image/png', SEGMENTS, { client });
  assert.equal(res.interpretations.length, 2);
  assert.deepEqual(res.failed, []);
  assert.equal(res.interpretations[0].name, 'Stat Card');
  assert.match(res.interpretations[0].html, /rounded-lg/);
});

test('EIN Call: Bild als base64-Block (Fallback) + Prompt enthält Baustein-Namen', async () => {
  const client = fakeClient({ interpretations: [] });
  await interpretComponents(tmpImage(), 'image/png', SEGMENTS, { client });
  assert.equal(client.calls.length, 1);
  const content = client.calls[0].messages[0].content;
  const imageBlocks = content.filter((b) => b.type === 'image');
  assert.equal(imageBlocks.length, 1); // Segmente ohne visual → EIN Vollbild als Fallback-Grounding
  assert.equal(imageBlocks[0].source.media_type, 'image/png');
  assert.ok(imageBlocks[0].source.data.length > 0);
  const text = content.filter((b) => b.type === 'text').map((b) => b.text).join('\n');
  assert.match(text, /Stat Card/);
  assert.match(text, /Data Table/);
});

test('fehlender oder leerer Baustein landet in failed, Rest liefert', async () => {
  const client = fakeClient({
    interpretations: [
      { name: 'Stat Card', html: '<div class="p-2">ok</div>', jsx: '' },
      { name: 'Data Table', html: '   ', jsx: 'x' }, // leer nach trim → failed
    ],
  });
  const res = await interpretComponents(tmpImage(), 'image/png', SEGMENTS, { client });
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
    () => interpretComponents(tmpImage(), 'image/png', SEGMENTS, { client }),
    /kein gültiges JSON/
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
    [{ id: 'seg_0', label: 'Stat Card', kind: 'component', bounds: null, visual: null, structure: null }],
    { client }
  );
  assert.equal(res.interpretations.length, 1);
  assert.equal(res.interpretations[0].name, 'Stat Card');
});

test('sends one image block per segment-with-visual and labels them', async () => {
  let captured;
  const fakeClient = { messages: { create: async (args) => {
    captured = args;
    return { content: [{ text: JSON.stringify({ interpretations: [
      { name: 'Stat Card', html: '<div class="p-4">42</div>', jsx: 'export function StatCard(){return null}' },
      { name: 'Line Chart Card', html: '<div class="p-4">chart</div>', jsx: 'export function LineChartCard(){return null}' },
    ] }) }] };
  } } };
  const segments = [
    { id: 'seg_0', label: 'Stat Card', kind: 'component', bounds: {x:0,y:0,w:0.2,h:0.2}, visual: { base64: 'AAAA', media_type: 'image/png' }, structure: null },
    { id: 'seg_1', label: 'Line Chart Card', kind: 'component', bounds: {x:0.2,y:0,w:0.3,h:0.3}, visual: { base64: 'BBBB', media_type: 'image/png' }, structure: null },
  ];
  const res = await interpretComponents('/nonexistent-full.png', 'image/png', segments, { client: fakeClient });

  const imageBlocks = captured.messages[0].content.filter((b) => b.type === 'image');
  assert.equal(imageBlocks.length, 2); // ein Crop je Segment, kein Voll-Bild nötig
  const text = captured.messages[0].content.filter((b)=>b.type==='text').map((b)=>b.text).join('\n');
  assert.match(text, /Stat Card/);
  assert.match(text, /Line Chart Card/);
  assert.equal(res.interpretations.length, 2);
  assert.equal(res.failed.length, 0);
});

test('Prompt verbietet Platzhalter-Boxen für Icons und fordert vereinfachte SVGs (Live-Fund 15.07.)', async () => {
  let captured;
  const fakeClient = { messages: { create: async (args) => {
    captured = args;
    return { content: [{ text: JSON.stringify({ interpretations: [
      { name: 'social-icon', html: '<div></div>', jsx: 'export function SocialIcon(){return null}' },
    ] }) }] };
  } } };
  const segments = [
    { id: 'seg_0', label: 'social-icon', kind: 'atomic', bounds: {x:0,y:0,w:0.2,h:0.2}, visual: { base64: 'AAAA', media_type: 'image/png' }, structure: null },
  ];
  await interpretComponents('/nonexistent-full.png', 'image/png', segments, { client: fakeClient });

  const text = captured.messages[0].content.filter((b)=>b.type==='text').map((b)=>b.text).join('\n');
  assert.match(text, /NEVER render plain gray or placeholder boxes/);
});

test('segment without visual falls back to the full image', async () => {
  const fs = await import('fs'); const os = await import('os'); const path = await import('path');
  const full = path.join(os.tmpdir(), `db-full-${Math.random().toString(36).slice(2)}.png`);
  fs.writeFileSync(full, Buffer.from('89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000a49444154789c6360000002000154a24f0d0000000049454e44ae426082','hex'));
  let captured;
  const fakeClient = { messages: { create: async (args) => { captured = args; return { content:[{text: JSON.stringify({ interpretations:[{name:'Mystery', html:'<div>x</div>', jsx:'export function Mystery(){return null}'}] })}] }; } } };
  const segments = [{ id:'seg_0', label:'Mystery', kind:'component', bounds:null, visual:null, structure:null }];
  const res = await interpretComponents(full, 'image/png', segments, { client: fakeClient });
  fs.unlinkSync(full);
  const imageBlocks = captured.messages[0].content.filter((b)=>b.type==='image');
  assert.equal(imageBlocks.length, 1); // Voll-Bild als Fallback-Grounding
  assert.equal(res.interpretations[0].name, 'Mystery');
});

test('structure-Segmente gehen als Textblöcke in den Prompt, kein Bild nötig', async () => {
  let seen = null;
  const client = {
    messages: {
      create: async ({ messages }) => {
        seen = messages[0].content;
        return {
          content: [{ text: JSON.stringify({ interpretations: [
            { name: 'Stat Card', html: '<div class="rounded-lg">12.400 €</div>', jsx: 'export function StatCard(){return null}' },
          ] }) }],
        };
      },
    },
  };
  const segments = [{
    id: 'seg_0', label: 'Stat Card', kind: 'component',
    bounds: { selector: 'html > body > div' }, visual: null,
    structure: { html: '<div class="stat-card"><p>12.400 €</p></div>', css: '.stat-card{padding:16px}' },
  }];
  const res = await interpretComponents(null, null, segments, { client });
  assert.equal(res.interpretations[0].name, 'Stat Card');
  const textBlocks = seen.filter((b) => b.type === 'text').map((b) => b.text).join('\n');
  assert.ok(textBlocks.includes('stat-card'), 'Quell-HTML fehlt im Prompt');
  assert.ok(textBlocks.includes('.stat-card{padding:16px}'), 'CSS fehlt im Prompt');
  assert.ok(!seen.some((b) => b.type === 'image'), 'darf ohne imagePath kein Bild senden');
});

test('identische structure-Blöcke (Vollseiten-Fallback) gehen nur einmal in den Prompt', async () => {
  let seen = null;
  const client = {
    messages: {
      create: async ({ messages }) => {
        seen = messages[0].content;
        return {
          content: [{ text: JSON.stringify({ interpretations: [
            { name: 'A', html: '<div>a</div>', jsx: '' },
            { name: 'B', html: '<div>b</div>', jsx: '' },
          ] }) }],
        };
      },
    },
  };
  const shared = { html: '<html><body><p>VOLLSEITE</p></body></html>', css: 'p{color:red}' };
  const segments = [
    { id: 'seg_0', label: 'A', kind: 'component', bounds: null, visual: null, structure: shared },
    { id: 'seg_1', label: 'B', kind: 'component', bounds: null, visual: null, structure: shared },
  ];
  const res = await interpretComponents(null, null, segments, { client });
  assert.equal(res.interpretations.length, 2);
  const text = seen.filter((b) => b.type === 'text').map((b) => b.text).join('\n');
  const occurrences = text.split('VOLLSEITE').length - 1;
  assert.equal(occurrences, 1, 'Vollseiten-HTML darf nur einmal im Prompt stehen');
  assert.ok(text.includes('A, B'), 'beide Labels müssen am geteilten Block stehen');
});

test('Code-Segment: sendet SOURCE CODE, liefert html/jsx', async () => {
  const seen = { text: '' };
  const fakeClient = {
    messages: {
      create: async ({ messages }) => {
        seen.text = JSON.stringify(messages[0].content);
        return {
          content: [{
            text: JSON.stringify({
              interpretations: [{ name: 'PricingCard', html: '<div style="color:#111">Pro</div>', jsx: 'export function PricingCard(){return <div/>}' }],
            }),
          }],
        };
      },
    },
  };
  const segments = [{
    id: 'seg_0', label: 'PricingCard', kind: 'component',
    visual: null, structure: { code: 'export const PricingCard = () => <div>Pro</div>;', path: 'x.tsx', lang: 'tsx' },
  }];
  const out = await interpretComponents(null, null, segments, { client: fakeClient });
  assert.match(seen.text, /SOURCE CODE/);
  assert.equal(out.interpretations[0].name, 'PricingCard');
  assert.match(out.interpretations[0].html, /Pro/);
  assert.equal(out.failed.length, 0);
});
