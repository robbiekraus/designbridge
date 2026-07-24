import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { readTheme, hslTripletToHex } from './themeReader.js';

const dirname = path.dirname(fileURLToPath(import.meta.url));
const GLOBALS = path.resolve(dirname, '../../fixtures/shadcn-repo/app/globals.css');

test('hslTripletToHex: shadcn-Tripel → korrektes Hex', () => {
  assert.equal(hslTripletToHex('0 0% 100%'), '#ffffff');
  assert.equal(hslTripletToHex('240 5.9% 10%'), '#18181b');
  assert.equal(hslTripletToHex('0 84.2% 60.2%'), '#ef4444');
});

test('hslTripletToHex: Unsinn → null (kein Absturz)', () => {
  assert.equal(hslTripletToHex('0.5rem'), null);
  assert.equal(hslTripletToHex('nope'), null);
  assert.equal(hslTripletToHex(''), null);
});

test('readTheme liest Farb-Slots als Hex + Rohwerte aus dem Fixture-Theme', async () => {
  const css = await readFile(GLOBALS, 'utf8');
  const { vars, colors } = readTheme(css);

  assert.equal(colors.background, '#ffffff');
  assert.equal(colors.primary, '#18181b');
  assert.equal(colors['primary-foreground'], '#fafafa');
  assert.equal(colors.destructive, '#ef4444');
  assert.equal(colors.border, colors.input); // beide 240 5.9% 90%

  // Nicht-Farbe bleibt nur roh, nicht in colors.
  assert.equal(vars.radius, '0.5rem');
  assert.equal(colors.radius, undefined);
});

test('readTheme: kein :root → leeres, sauberes Ergebnis', () => {
  assert.deepEqual(readTheme('.foo { color: red; }'), { vars: {}, colors: {} });
  assert.deepEqual(readTheme(null), { vars: {}, colors: {} });
});
