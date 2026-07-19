import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseFigmaUrl } from './figmaUrl.js';

test('parses a /design/:key/ url', () => {
  assert.deepEqual(parseFigmaUrl('https://www.figma.com/design/abc123/My-File'), { fileKey: 'abc123' });
});

test('parses a legacy /file/:key/ url', () => {
  assert.deepEqual(parseFigmaUrl('https://www.figma.com/file/xyz789/Other-File'), { fileKey: 'xyz789' });
});

test('ignores a node-id query parameter', () => {
  assert.deepEqual(
    parseFigmaUrl('https://www.figma.com/design/abc123/My-File?node-id=1-2&t=abc'),
    { fileKey: 'abc123' }
  );
});

test('works without a trailing file name segment', () => {
  assert.deepEqual(parseFigmaUrl('https://www.figma.com/design/abc123'), { fileKey: 'abc123' });
});

test('rejects non-figma hosts', () => {
  assert.throws(() => parseFigmaUrl('https://example.com/design/abc123'), /figma\.com/);
});

test('rejects figma urls without design or file segment', () => {
  assert.throws(() => parseFigmaUrl('https://www.figma.com/proto/abc123/My-File'), /Figma-Datei/);
});

test('rejects garbage input', () => {
  assert.throws(() => parseFigmaUrl('kein link'), /Ungültige URL/);
  assert.throws(() => parseFigmaUrl(''), /Ungültige URL/);
  assert.throws(() => parseFigmaUrl(undefined), /Ungültige URL/);
});
