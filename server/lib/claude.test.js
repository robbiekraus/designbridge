import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { analyzeScreenshot, mergeByName } from './claude.js';

function tmpImage() {
  const p = path.join(os.tmpdir(), `db-scan-${Math.random().toString(36).slice(2)}.png`);
  // 1x1 PNG
  fs.writeFileSync(p, Buffer.from('89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000a49444154789c6360000002000154a24f0d0000000049454e44ae426082', 'hex'));
  return p;
}

test('analyzeScreenshot: prompt asks for bbox and passes it through', async () => {
  const imgPath = tmpImage();
  let captured;
  const fakeClient = {
    messages: {
      create: async (args) => {
        captured = args;
        return { content: [{ text: JSON.stringify({
          summary: {}, tokens: {}, atoms: [],
          organisms: [{ name: 'Line Chart Card', confidence: 'high', notes: 'Sales', bbox: { x: 0.1, y: 0.2, w: 0.3, h: 0.4 } }],
          molecules: [], templates: [], warnings: [],
        }) }] };
      },
    },
  };
  const result = await analyzeScreenshot(imgPath, 'image/png', {}, { client: fakeClient });
  fs.unlinkSync(imgPath);

  const promptText = captured.messages[0].content.map((b) => b.text || '').join('');
  assert.match(promptText, /bbox/);
  assert.equal(result.organisms[0].bbox.w, 0.3);
  // 4096 war zu knapp für token-reiche Screenshots (Live-Fund 15.07.):
  // Gemini schnitt mitten im JSON ab.
  assert.ok(captured.max_tokens >= 16384, `max_tokens zu klein: ${captured.max_tokens}`);
});

test('analyzeScreenshot: normalisiert String-Größen ("64px") zu Zahlen — Gemini liefert px-Suffixe (Live-Fund 15.07.)', async () => {
  const imgPath = tmpImage();
  const fakeClient = {
    messages: {
      create: async () => ({ content: [{ text: JSON.stringify({
        summary: {}, atoms: [], molecules: [], organisms: [], templates: [], warnings: [],
        tokens: {
          colors: [{ hex: '#121212', role: 'background-primary', confidence: 'high' }],
          typography: [{ size: '64px', weight: '700', role: 'heading-xl', sample: 'Aa', confidence: 'high' }],
          spacing: [{ value: '16px', usage: 'chip padding', confidence: 'high' }],
          border_radius: [{ value: '2px', usage: 'buttons', confidence: 'medium' }],
          shadows: [],
        },
      }) }] }),
    },
  };
  const result = await analyzeScreenshot(imgPath, 'image/png', {}, { client: fakeClient });
  fs.unlinkSync(imgPath);

  assert.equal(result.tokens.typography[0].size, 64);
  assert.equal(result.tokens.spacing[0].value, 16);
});

test('analyzeScreenshot: verschmilzt gleichnamige Bausteine und vereinigt Varianten (Live-Fund 15.07.: dreimal "button")', async () => {
  const imgPath = tmpImage();
  const fakeClient = {
    messages: {
      create: async () => ({ content: [{ text: JSON.stringify({
        summary: {}, molecules: [], templates: [], warnings: [], tokens: {},
        atoms: [
          { name: 'button', variants: ['primary'], confidence: 'high', notes: 'Send message', bbox: { x: 0.1, y: 0.1, w: 0.2, h: 0.05 } },
          { name: 'button', variants: ['chip'], confidence: 'high', notes: '', bbox: { x: 0.5, y: 0.3, w: 0.1, h: 0.04 } },
          { name: 'Button', variants: [], confidence: 'medium', notes: '', bbox: { x: 0.6, y: 0.3, w: 0.1, h: 0.04 } },
          { name: 'status-dot', variants: [], confidence: 'high', notes: '', bbox: { x: 0.9, y: 0.0, w: 0.02, h: 0.02 } },
        ],
        organisms: [
          { name: 'contact-form', confidence: 'high', notes: '', bbox: { x: 0.5, y: 0.2, w: 0.4, h: 0.6 } },
          { name: 'contact-form', confidence: 'high', notes: '', bbox: { x: 0.5, y: 0.2, w: 0.4, h: 0.6 } },
        ],
      }) }] }),
    },
  };
  const result = await analyzeScreenshot(imgPath, 'image/png', {}, { client: fakeClient });
  fs.unlinkSync(imgPath);

  assert.equal(result.atoms.length, 2); // button (3× verschmolzen) + status-dot
  const button = result.atoms.find((a) => a.name.toLowerCase() === 'button');
  assert.deepEqual(button.variants, ['primary', 'chip']);
  assert.equal(button.notes, 'Send message');
  assert.deepEqual(button.bbox, { x: 0.1, y: 0.1, w: 0.2, h: 0.05 }); // erster Treffer behält seine bbox
  assert.equal(result.organisms.length, 1);
});

test('analyzeScreenshot: Prompt enthält den wörtlichen Atomic-Design-Definitionsblock (4 Ebenen)', async () => {
  const imgPath = tmpImage();
  let captured;
  const fakeClient = {
    messages: {
      create: async (args) => {
        captured = args;
        return { content: [{ text: JSON.stringify({ summary: {}, tokens: {}, atoms: [], molecules: [], organisms: [], templates: [], warnings: [] }) }] };
      },
    },
  };
  await analyzeScreenshot(imgPath, 'image/png', {}, { client: fakeClient });
  fs.unlinkSync(imgPath);
  const promptText = captured.messages.find((m) => Array.isArray(m.content)).content
    .map((b) => b.text || '').join('\n');
  assert.match(promptText, /a card, a chart and a table are ORGANISMS, not molecules/);
  assert.match(promptText, /Emit AT MOST ONE template for the whole screen/);
});

test('mergeByName behält die größte bbox statt der ersten', () => {
  const merged = mergeByName([
    { name: 'button', bbox: { x: 0.1, y: 0.1, w: 0.05, h: 0.03 } },
    { name: 'button', bbox: { x: 0.5, y: 0.5, w: 0.2, h: 0.1 } },
  ]);
  assert.equal(merged.length, 1);
  assert.deepEqual(merged[0].bbox, { x: 0.5, y: 0.5, w: 0.2, h: 0.1 });
});

test('mergeByName: erster Treffer behält seine bbox, wenn der zweite keine oder eine kleinere bbox hat', () => {
  const mergedNoBbox = mergeByName([
    { name: 'button', bbox: { x: 0.1, y: 0.1, w: 0.2, h: 0.1 } },
    { name: 'button' },
  ]);
  assert.deepEqual(mergedNoBbox[0].bbox, { x: 0.1, y: 0.1, w: 0.2, h: 0.1 });

  const mergedSmaller = mergeByName([
    { name: 'button', bbox: { x: 0.1, y: 0.1, w: 0.2, h: 0.1 } },
    { name: 'button', bbox: { x: 0.5, y: 0.5, w: 0.05, h: 0.03 } },
  ]);
  assert.deepEqual(mergedSmaller[0].bbox, { x: 0.1, y: 0.1, w: 0.2, h: 0.1 });
});

test('analyzeScreenshot: abgeschnittene Antwort (max_tokens) → klare deutsche Meldung', async () => {
  const imgPath = tmpImage();
  const fakeClient = {
    messages: {
      create: async () => ({
        content: [{ text: '{"summary": {"source_description": "A SaaS dashboard"}, "tokens": { "colors": [ {' }],
        stop_reason: 'max_tokens',
      }),
    },
  };
  await assert.rejects(
    () => analyzeScreenshot(imgPath, 'image/png', {}, { client: fakeClient }),
    /abgeschnitten.*erneut/s
  );
  fs.unlinkSync(imgPath);
});

test('analyzeScreenshot: ungültiges JSON ohne Abschneiden → deutsche Meldung mit Antwort-Anfang', async () => {
  const imgPath = tmpImage();
  const fakeClient = {
    messages: {
      create: async () => ({ content: [{ text: 'Hier ist das Ergebnis: {kaputt' }], stop_reason: 'end_turn' }),
    },
  };
  await assert.rejects(
    () => analyzeScreenshot(imgPath, 'image/png', {}, { client: fakeClient }),
    /kein gültiges JSON.*Hier ist das Ergebnis/s
  );
  fs.unlinkSync(imgPath);
});

test('analyzeScreenshot: Enthaltungs-Guard hebt Card→organism und korrigiert Screen→template (Ansatz B)', async () => {
  const imgPath = tmpImage();
  const fakeClient = {
    messages: {
      create: async () => ({ content: [{ text: JSON.stringify({
        summary: {}, tokens: {},
        // Card besteht aus Icon+Value (2 enthaltene Atome) → Organism-Boden hebt sie an.
        atoms: [
          { name: 'Card Icon', confidence: 'high', notes: '', bbox: { x: 0.06, y: 0.06, w: 0.05, h: 0.05 } },
          { name: 'Card Value', confidence: 'high', notes: '', bbox: { x: 0.15, y: 0.2, w: 0.1, h: 0.05 } },
        ],
        // KI-Fehlklassifikation wie im Live-Fund: die Card als molecule, der ganze Screen als organism.
        molecules: [{ name: 'Stat Card', confidence: 'high', notes: '', bbox: { x: 0.05, y: 0.05, w: 0.3, h: 0.3 } }],
        organisms: [{ name: 'Screen', confidence: 'high', notes: '', bbox: { x: 0, y: 0, w: 1, h: 1 } }],
        templates: [], warnings: [],
      }) }] }),
    },
  };
  const result = await analyzeScreenshot(imgPath, 'image/png', {}, { client: fakeClient });
  fs.unlinkSync(imgPath);

  assert.equal(result.molecules.find((m) => m.name === 'Stat Card'), undefined);
  const card = result.organisms.find((o) => o.name === 'Stat Card');
  assert.ok(card, 'Stat Card sollte in organisms gelandet sein');

  assert.equal(result.organisms.find((o) => o.name === 'Screen'), undefined);
  const screen = result.templates.find((t) => t.name === 'Screen');
  assert.ok(screen, 'Screen sollte in templates gelandet sein');

  assert.equal(result.templates.length, 1);
});
