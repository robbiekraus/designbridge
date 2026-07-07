import { test } from 'node:test';
import assert from 'node:assert/strict';
import { setFigmaExport, getFigmaExport, clearFigmaExport } from './figmaExportStore.js';

test('figmaExportStore: empty by default after clear', () => {
  clearFigmaExport();
  assert.equal(getFigmaExport(), null);
});

test('figmaExportStore: stores and returns the latest payload', () => {
  const payload = { designbridge: 'figma-import', version: 1, colors: [{ name: 'primary', hex: '#000000' }], text: [] };
  setFigmaExport(payload);
  assert.deepEqual(getFigmaExport(), payload);
});

test('figmaExportStore: overwrites with the newest payload', () => {
  setFigmaExport({ designbridge: 'figma-import', version: 1, colors: [], text: [] });
  setFigmaExport({ designbridge: 'figma-import', version: 1, colors: [{ name: 'a', hex: '#fff' }], text: [] });
  assert.equal(getFigmaExport().colors.length, 1);
});

test('figmaExportStore: clear resets to null', () => {
  setFigmaExport({ designbridge: 'figma-import', version: 1, colors: [], text: [] });
  clearFigmaExport();
  assert.equal(getFigmaExport(), null);
});
