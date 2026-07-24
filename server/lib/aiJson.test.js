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

// Live-Fund 24.07. (echter Prod-Scan, Storybook-Harness-Test): das Modell escaped im "html"-Feld
// gelegentlich NUR die äußeren Attribute (\"), lässt aber rohe Anführungszeichen in verschachtelten
// SVG-Attributen stehen (<svg width="20" .../>) — gültiges HTML, aber kaputtes JSON.
test('extractJson repariert rohe Anführungszeichen in einem verschachtelten SVG-Attribut (Live-Fund 24.07.)', () => {
  const raw = '{"interpretations": [{"name": "Search Bar", "html": "<div style=\\"display:flex\\"><svg width="20" height="20" viewBox="0 0 24 24" fill="none"></svg></div>", "model": "gemini"}]}';
  const parsed = extractJson(raw);
  assert.equal(parsed.interpretations[0].name, 'Search Bar');
  assert.equal(
    parsed.interpretations[0].html,
    '<div style="display:flex"><svg width="20" height="20" viewBox="0 0 24 24" fill="none"></svg></div>'
  );
  assert.equal(parsed.interpretations[0].model, 'gemini');
});

test('extractJson repariert mehrere rohe Anführungszeichen über mehrere Einträge hinweg', () => {
  const raw = '{"interpretations": ['
    + '{"name": "A", "html": "<svg viewBox="0 0 24 24"></svg>"}, '
    + '{"name": "B", "html": "<p>ok</p>"}'
    + ']}';
  const parsed = extractJson(raw);
  assert.equal(parsed.interpretations[0].html, '<svg viewBox="0 0 24 24"></svg>');
  assert.equal(parsed.interpretations[1].html, '<p>ok</p>');
});

test('extractJson wirft weiterhin bei echt abgeschnittenem JSON, auch mit rohen Anführungszeichen im Text (Reparatur maskiert keine echten Fehler)', () => {
  assert.throws(() => extractJson('{"html": "<svg width="20"'));
});

// Live-Fund 24.07., zweite Fehlerklasse derselben Ursache (komplexe Bausteine mit mehrzeiligem
// HTML): das Modell gibt rohe Zeilenumbrüche im String aus statt \n zu escapen.
test('extractJson repariert einen rohen Zeilenumbruch mitten in einem String (Live-Fund 24.07.)', () => {
  const raw = '{"interpretations": [{"name": "Sidebar", "html": "<div>\nLine two\n</div>"}]}';
  const parsed = extractJson(raw);
  assert.equal(parsed.interpretations[0].html, '<div>\nLine two\n</div>');
});

test('extractJson repariert rohe Anführungszeichen UND einen rohen Zeilenumbruch gemeinsam', () => {
  const raw = '{"html": "<svg width="20">\nicon\n</svg>"}';
  const parsed = extractJson(raw);
  assert.equal(parsed.html, '<svg width="20">\nicon\n</svg>');
});
