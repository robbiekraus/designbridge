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

test('extracts typography, pairing font-size with matching font-weight by role', () => {
  const css = ':root { --font-size-base: 1rem; --font-weight-base: 600; --font-size-lg: 24px; }';
  const { tokens } = ingestCss(css);
  assert.deepEqual(tokens.typography, [
    { size: 16, weight: '600', role: 'base', sample: 'Aa', confidence: 'high', source: '--font-size-base' },
    { size: 24, weight: '400', role: 'lg',   sample: 'Aa', confidence: 'high', source: '--font-size-lg' },
  ]);
});

test('extracts spacing (rem→px, sorted) and radius (% kept, px normalized)', () => {
  const css = ':root { --space-4: 1rem; --space-2: 8px; --radius-md: 0.5rem; --radius-full: 50%; }';
  const { tokens } = ingestCss(css);
  assert.deepEqual(tokens.spacing, [
    { value: 8,  usage: '2', confidence: 'high', source: '--space-2' },
    { value: 16, usage: '4', confidence: 'high', source: '--space-4' },
  ]);
  assert.deepEqual(tokens.border_radius, [
    { value: '8px', usage: 'md',   confidence: 'high', source: '--radius-md' },
    { value: '50%', usage: 'full', confidence: 'high', source: '--radius-full' },
  ]);
});

test('extracts shadows verbatim with role + source', () => {
  const css = ':root { --shadow-card: 0 1px 3px rgba(0,0,0,.1); }';
  const { tokens } = ingestCss(css);
  assert.deepEqual(tokens.shadows, [
    { description: 'card', css: '0 1px 3px rgba(0,0,0,.1)', confidence: 'high', source: '--shadow-card' },
  ]);
});
