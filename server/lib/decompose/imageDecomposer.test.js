import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import os from 'os';
import path from 'path';
import Jimp from 'jimp';
import { imageDecomposer } from './imageDecomposer.js';

// 100x100: linke Hälfte rot, rechte Hälfte blau
async function makeSplitImage() {
  const img = await Jimp.create(100, 100, 0xff0000ff); // rot
  img.scan(50, 0, 50, 100, function (x, y, idx) {
    this.bitmap.data[idx] = 0;     // R
    this.bitmap.data[idx + 1] = 0; // G
    this.bitmap.data[idx + 2] = 255; // B
    this.bitmap.data[idx + 3] = 255; // A
  });
  const p = path.join(os.tmpdir(), `db-dec-${Math.random().toString(36).slice(2)}.png`);
  await img.writeAsync(p);
  return p;
}

test('crops the right region for a bbox and fills visual', async () => {
  const p = await makeSplitImage();
  const inv = [{ name: 'Right Half', kind: 'component', bbox: { x: 0.5, y: 0, w: 0.5, h: 1 } }];
  const segs = await imageDecomposer.decompose({ imagePath: p, mimetype: 'image/png' }, inv);
  fs.unlinkSync(p);

  assert.equal(segs.length, 1);
  assert.equal(segs[0].label, 'Right Half');
  assert.ok(segs[0].visual, 'visual gesetzt');
  const crop = await Jimp.read(Buffer.from(segs[0].visual.base64, 'base64'));
  assert.equal(crop.getWidth(), 50);
  assert.equal(crop.getHeight(), 100);
  const px = Jimp.intToRGBA(crop.getPixelColor(0, 0));
  assert.equal(px.b, 255); // blau → richtige (rechte) Region
  assert.equal(px.r, 0);
});

test('no bbox → segment without visual', async () => {
  const p = await makeSplitImage();
  const inv = [{ name: 'Whatever', kind: 'component' }];
  const segs = await imageDecomposer.decompose({ imagePath: p, mimetype: 'image/png' }, inv);
  fs.unlinkSync(p);
  assert.equal(segs[0].visual, null);
  assert.equal(segs[0].bounds, null);
});

test('clamps out-of-range bbox to image bounds', async () => {
  const p = await makeSplitImage();
  const inv = [{ name: 'Overflow', kind: 'component', bbox: { x: 0.8, y: 0.8, w: 0.5, h: 0.5 } }];
  const segs = await imageDecomposer.decompose({ imagePath: p, mimetype: 'image/png' }, inv);
  fs.unlinkSync(p);
  const crop = await Jimp.read(Buffer.from(segs[0].visual.base64, 'base64'));
  assert.ok(crop.getWidth() > 0 && crop.getWidth() <= 20);  // 0.8..1.0 → ~20px
  assert.ok(crop.getHeight() > 0 && crop.getHeight() <= 20);
});
