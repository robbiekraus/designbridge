import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
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

test('falls back to declarations when no variables, with low confidence + selector source', () => {
  const css = '.cta { background: #3b82f6; border-radius: 6px; } h1 { font-size: 2rem; }';
  const { tokens, warnings } = ingestCss(css);
  assert.deepEqual(tokens.colors, [
    { hex: '#3b82f6', role: 'gefunden', confidence: 'low', source: '.cta { background: … }' },
  ]);
  assert.equal(tokens.border_radius[0].value, '6px');
  assert.equal(tokens.border_radius[0].confidence, 'low');
  assert.equal(tokens.typography[0].size, 32);
  assert.ok(warnings.some((w) => w.includes('niedrige Confidence')));
});

test('declaration fallback does not duplicate values already found as variables', () => {
  const css = ':root { --color-primary: #022d2c; } .btn { background: #022d2c; color: #ffffff; }';
  const { tokens } = ingestCss(css);
  const primaries = tokens.colors.filter((c) => c.hex === '#022d2c');
  assert.equal(primaries.length, 1);
  assert.equal(primaries[0].source, '--color-primary');
  assert.ok(tokens.colors.some((c) => c.hex === '#ffffff' && c.confidence === 'low'));
});

test('empty / blank CSS yields empty token arrays, no throw', () => {
  const { tokens } = ingestCss('');
  assert.deepEqual(tokens.colors, []);
  assert.deepEqual(tokens.typography, []);
});

test('ingests the bundled demo stylesheet into a full token set', () => {
  const cssPath = fileURLToPath(new URL('../../demo-site/styles.css', import.meta.url));
  const css = readFileSync(cssPath, 'utf8');
  const { tokens } = ingestCss(css, { sourceUrl: 'http://localhost:3047/demo' });
  assert.ok(tokens.colors.length >= 8, 'expected the named colors');
  assert.ok(tokens.colors.every((c) => c.source.startsWith('--color') || c.confidence === 'low'));
  assert.ok(tokens.typography.some((t) => t.role === 'xl' && t.weight === '700'));
  assert.deepEqual(tokens.spacing.map((s) => s.value), [8, 16, 24]);
  assert.ok(tokens.border_radius.some((r) => r.value === '999px' && r.usage === 'full'));
  assert.ok(tokens.shadows.some((s) => s.description === 'card'));
});
