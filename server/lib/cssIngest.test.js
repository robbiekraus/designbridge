import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ingestCss } from './cssIngest.js';

test('extracts colors from :root custom properties with role + source', () => {
  const css = ':root { --color-primary: #022d2c; --color-surface: #ffffff; }';
  const { tokens } = ingestCss(css, { sourceUrl: 'http://x/demo' });
  assert.deepEqual(tokens.colors, [
    { hex: '#022d2c', role: 'primary', confidence: 'high', source: '--color-primary' },
    { hex: '#ffffff', role: 'surface', confidence: 'high', source: '--color-surface' },
  ]);
});

test('normalizes #rgb shorthand and rgb() to #rrggbb', () => {
  const css = ':root { --color-a: #fff; --color-b: rgb(2, 45, 44); }';
  const { tokens } = ingestCss(css);
  assert.equal(tokens.colors[0].hex, '#ffffff');
  assert.equal(tokens.colors[1].hex, '#022d2c');
});
