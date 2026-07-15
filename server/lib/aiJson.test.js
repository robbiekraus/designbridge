import test from 'node:test';
import assert from 'node:assert/strict';
import { extractJson } from './aiJson.js';

test('extractJson parst sauberes JSON unverändert', () => {
  assert.deepEqual(extractJson('{"a": 1}'), { a: 1 });
});

test('extractJson ignoriert eine überzählige schließende Klammer am Ende (Live-Fund 15.07., gemini-3.1-flash-lite)', () => {
  const raw = '{\n  "tokens": { "colors": [] },\n  "warnings": ["x"]\n}\n}';
  assert.deepEqual(extractJson(raw), { tokens: { colors: [] }, warnings: ['x'] });
});

test('extractJson entfernt Markdown-Zäune', () => {
  assert.deepEqual(extractJson('```json\n{"a": 1}\n```'), { a: 1 });
});

test('extractJson ignoriert Preamble-Text vor dem JSON', () => {
  assert.deepEqual(extractJson('Here is the JSON you asked for: {"a": 1}'), { a: 1 });
});

test('extractJson stolpert nicht über Klammern in Strings', () => {
  assert.deepEqual(extractJson('{"css": "grid { gap: 4px }", "b": "}"}'), { css: 'grid { gap: 4px }', b: '}' });
});

test('extractJson stolpert nicht über escapte Anführungszeichen', () => {
  assert.deepEqual(extractJson('{"a": "sagt \\"hi\\" {"}'), { a: 'sagt "hi" {' });
});

test('extractJson wirft bei abgeschnittenem JSON', () => {
  assert.throws(() => extractJson('{"tokens": { "colors": [ {'));
});

test('extractJson wirft, wenn gar kein JSON-Objekt enthalten ist', () => {
  assert.throws(() => extractJson('not json'));
});
