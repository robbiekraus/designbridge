import test from 'node:test';
import assert from 'node:assert/strict';
import Jimp from 'jimp';
import { downscaleForVision } from './imageResize.js';

async function makePng(width, height) {
  const img = new Jimp(width, height, 0x336699ff);
  return img.getBufferAsync(Jimp.MIME_PNG);
}

test('downscaleForVision: großes Bild (Langkante > maxEdge) wird proportional auf maxEdge herunterskaliert', async () => {
  const buffer = await makePng(2880, 1440); // 2:1, Langkante = Breite
  const out = await downscaleForVision(buffer, 'image/png', { maxEdge: 1500 });

  assert.equal(out.resized, true);
  const img = await Jimp.read(out.buffer);
  assert.equal(img.getWidth(), 1500);
  assert.equal(img.getHeight(), 750); // Aspekt 2:1 erhalten
  assert.ok(out.mime === 'image/png' || out.mime === 'image/jpeg');
});

test('downscaleForVision: Langkante <= maxEdge bleibt unverändert (kein Re-Encode)', async () => {
  const buffer = await makePng(800, 600);
  const out = await downscaleForVision(buffer, 'image/png', { maxEdge: 1500 });

  assert.equal(out.resized, false);
  assert.equal(out.mime, 'image/png');
  assert.ok(out.buffer.equals(buffer), 'Buffer muss unverändert (identisch) durchgereicht werden');
});

test('downscaleForVision: Standard-maxEdge ist 1500, wenn keine Option übergeben wird', async () => {
  const buffer = await makePng(3000, 1000);
  const out = await downscaleForVision(buffer, 'image/png');
  assert.equal(out.resized, true);
  const img = await Jimp.read(out.buffer);
  assert.equal(img.getWidth(), 1500);
});

test('downscaleForVision: unlesbarer Buffer (z.B. WebP, von Jimp 0.22 nicht unterstützt) → Original unverändert, kein Throw', async () => {
  const garbage = Buffer.from('RIFF....WEBPVP8 not-a-real-webp-body', 'utf8');
  const out = await downscaleForVision(garbage, 'image/webp', { maxEdge: 1500 });

  assert.equal(out.resized, false);
  assert.equal(out.mime, 'image/webp');
  assert.ok(out.buffer.equals(garbage));
});

test('downscaleForVision: Hochkant-Bild — Langkante ist die Höhe', async () => {
  const buffer = await makePng(900, 3600); // 1:4, Langkante = Höhe
  const out = await downscaleForVision(buffer, 'image/png', { maxEdge: 1500 });

  assert.equal(out.resized, true);
  const img = await Jimp.read(out.buffer);
  assert.equal(img.getHeight(), 1500);
  assert.equal(img.getWidth(), 375); // 900 * (1500/3600) = 375
});
