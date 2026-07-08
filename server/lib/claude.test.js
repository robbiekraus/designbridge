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
});
