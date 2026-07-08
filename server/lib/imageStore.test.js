import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { putImage, getImage, removeImage, clearImages } from './imageStore.js';

function tmpFile() {
  const p = path.join(os.tmpdir(), `db-imgstore-${Date.now()}-${Math.random().toString(16).slice(2)}.png`);
  fs.writeFileSync(p, 'fake-png-bytes');
  return p;
}

beforeEach(() => clearImages());

test('putImage/getImage roundtrip liefert Pfad und Mimetype', () => {
  const p = tmpFile();
  const id = putImage(p, 'image/png');
  assert.equal(typeof id, 'string');
  assert.ok(id.length >= 8);
  assert.deepEqual(getImage(id), { path: p, mimetype: 'image/png' });
});

test('getImage mit unbekannter ID liefert null', () => {
  assert.equal(getImage('nope'), null);
});

test('removeImage entfernt Eintrag und löscht die Datei', async () => {
  const p = tmpFile();
  const id = putImage(p, 'image/png');
  removeImage(id);
  assert.equal(getImage(id), null);
  // unlink ist async-fire-and-forget — kurz warten
  await new Promise((r) => setTimeout(r, 50));
  assert.equal(fs.existsSync(p), false);
});

test('Eintrag verfällt nach TTL und Datei wird gelöscht', async () => {
  const p = tmpFile();
  const id = putImage(p, 'image/png', { ttlMs: 30 });
  assert.ok(getImage(id));
  await new Promise((r) => setTimeout(r, 120));
  assert.equal(getImage(id), null);
  assert.equal(fs.existsSync(p), false);
});

test('clearImages räumt alles ab', () => {
  const id1 = putImage(tmpFile(), 'image/png');
  const id2 = putImage(tmpFile(), 'image/jpeg');
  clearImages();
  assert.equal(getImage(id1), null);
  assert.equal(getImage(id2), null);
});
