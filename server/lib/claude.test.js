import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { analyzeScreenshot } from './claude.js';

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
          summary: {}, tokens: {}, atomics: [],
          components: [{ name: 'Line Chart Card', confidence: 'high', notes: 'Sales', bbox: { x: 0.1, y: 0.2, w: 0.3, h: 0.4 } }],
          patterns: [], warnings: [],
        }) }] };
      },
    },
  };
  const result = await analyzeScreenshot(imgPath, 'image/png', {}, { client: fakeClient });
  fs.unlinkSync(imgPath);

  const promptText = captured.messages[0].content.map((b) => b.text || '').join('');
  assert.match(promptText, /bbox/);
  assert.equal(result.components[0].bbox.w, 0.3);
  // 4096 war zu knapp für token-reiche Screenshots (Live-Fund 15.07.):
  // Gemini schnitt mitten im JSON ab.
  assert.ok(captured.max_tokens >= 16384, `max_tokens zu klein: ${captured.max_tokens}`);
});

test('analyzeScreenshot: normalisiert String-Größen ("64px") zu Zahlen — Gemini liefert px-Suffixe (Live-Fund 15.07.)', async () => {
  const imgPath = tmpImage();
  const fakeClient = {
    messages: {
      create: async () => ({ content: [{ text: JSON.stringify({
        summary: {}, atomics: [], components: [], patterns: [], warnings: [],
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
