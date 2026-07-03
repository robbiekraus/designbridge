import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseTailwindTheme } from './tailwindTheme.js';

const CONFIG = `
const plugin = require('tailwindcss/plugin');
module.exports = {
  theme: {
    spacing: { sm: '0.5rem' },
    extend: {
      colors: {
        primary: '#022d2c',
        blue: { 500: '#3b82f6' },
        border: 'hsl(var(--border))',
      },
      borderRadius: { card: '12px' },
      boxShadow: { card: '0 1px 3px rgba(0,0,0,.1)' },
      fontSize: { base: '1rem', xl: ['1.25rem', { lineHeight: '1.75rem' }] },
      width: { logo: calcWidth() },
    },
  },
};`;

test('reads literal entries from theme and theme.extend', () => {
  const { entries } = parseTailwindTheme(CONFIG);
  assert.deepEqual(entries.colors.find((c) => c.name === 'primary'), {
    name: 'primary', value: '#022d2c', path: 'theme.extend.colors.primary',
  });
  assert.equal(entries.spacing.find((s) => s.name === 'sm').value, '0.5rem');
  assert.equal(entries.radius.find((r) => r.name === 'card').value, '12px');
  assert.equal(entries.shadows.find((s) => s.name === 'card').value, '0 1px 3px rgba(0,0,0,.1)');
});

test('flattens one nesting level for colors', () => {
  const { entries } = parseTailwindTheme(CONFIG);
  const nested = entries.colors.find((c) => c.name === 'blue-500');
  assert.equal(nested.value, '#3b82f6');
});

test('takes the first string literal from array values (fontSize)', () => {
  const { entries } = parseTailwindTheme(CONFIG);
  assert.equal(entries.fontSize.find((f) => f.name === 'xl').value, '1.25rem');
  assert.equal(entries.fontSize.find((f) => f.name === 'base').value, '1rem');
});

test('keeps non-hex color strings for the caller to filter', () => {
  const { entries } = parseTailwindTheme(CONFIG);
  assert.equal(entries.colors.find((c) => c.name === 'border').value, 'hsl(var(--border))');
});

test('never executes code and warns about computed values', () => {
  const { warnings } = parseTailwindTheme(CONFIG);
  assert.ok(warnings.some((w) => /statisch nicht gelesen/.test(w)));
});

test('returns empty entries without a theme block', () => {
  const { entries, warnings } = parseTailwindTheme('module.exports = {};');
  assert.equal(entries.colors.length, 0);
  assert.deepEqual(warnings, []);
});

test('line comment with apostrophe does not derail the theme scan', () => {
  const cfg = `module.exports = {
  theme: {
    // don't edit these colors
    extend: { colors: { primary: '#022d2c' } },
  },
};`;
  const { entries, warnings } = parseTailwindTheme(cfg);
  assert.deepEqual(entries.colors.find((c) => c.name === 'primary'), {
    name: 'primary', value: '#022d2c', path: 'theme.extend.colors.primary',
  });
  assert.deepEqual(warnings, []);
});

test('block comment containing braces and quotes inside theme is ignored', () => {
  const cfg = `module.exports = {
  theme: {
    /* { legacy: 'x' } */
    extend: {
      colors: { primary: '#022d2c' /* was '#000' } */ },
      spacing: { sm: '0.5rem' },
    },
  },
};`;
  const { entries, warnings } = parseTailwindTheme(cfg);
  assert.equal(entries.colors.find((c) => c.name === 'primary').value, '#022d2c');
  assert.equal(entries.spacing.find((s) => s.name === 'sm').value, '0.5rem');
  assert.deepEqual(warnings, []);
});

test('slashes inside string literals are not treated as comments', () => {
  const cfg = `module.exports = {
  content: ['./app//*.js', './src/**/*.jsx'],
  theme: {
    extend: { colors: { hero: 'https://example.com/x.png', primary: '#022d2c' } },
  },
};`;
  const { entries } = parseTailwindTheme(cfg);
  assert.equal(entries.colors.find((c) => c.name === 'hero').value, 'https://example.com/x.png');
  assert.equal(entries.colors.find((c) => c.name === 'primary').value, '#022d2c');
});

test('unbalanced theme block yields empty entries plus a warning', () => {
  const cfg = 'module.exports = { theme: { colors: {';
  const { entries, warnings } = parseTailwindTheme(cfg);
  assert.equal(entries.colors.length, 0);
  assert.ok(warnings.length > 0);
  assert.ok(warnings.some((w) => /nicht vollständig gelesen/.test(w)));
});

test('handles typescript configs with satisfies', () => {
  const ts = `import type { Config } from 'tailwindcss';
export default { theme: { extend: { colors: { ink: '#111827' } } } } satisfies Config;`;
  const { entries } = parseTailwindTheme(ts);
  assert.equal(entries.colors.find((c) => c.name === 'ink').value, '#111827');
});
