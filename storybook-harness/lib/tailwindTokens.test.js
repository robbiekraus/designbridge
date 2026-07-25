import test from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { loadScanTokens, mergeExtend } from './tailwindTokens.js';

test('loadScanTokens: {} wenn die Datei fehlt', () => {
  assert.deepEqual(loadScanTokens('/pfad/existiert/nicht/tailwind.tokens.js'), {});
});

test('loadScanTokens: wertet ein export-default-Objekt-Literal aus (kein Modul-Import)', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'tailwind-tokens-'));
  const file = path.join(dir, 'tailwind.tokens.js');
  await writeFile(
    file,
    [
      '// DesignBridge — generated Tailwind tokens',
      'export default {',
      "  colors: {",
      "    'background-card': 'var(--color-background-card)',",
      '  },',
      '};',
      '',
    ].join('\n'),
    'utf8',
  );
  try {
    const tokens = loadScanTokens(file);
    assert.deepEqual(tokens, { colors: { 'background-card': 'var(--color-background-card)' } });
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

// Regression: emitTailwind.js' echter Header-Kommentar enthält selbst den Text
// "export default { theme: { extend: tokens } }" als Erklärung — ein ungeankertes
// Suchmuster fängt sich darin statt im echten Statement weiter unten (live beobachtet
// beim End-to-End-Beweis mit dem echten prod-scan-raw.json-Export).
test('loadScanTokens: ignoriert "export default" innerhalb von Kommentarzeilen (echter emitTailwind-Header)', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'tailwind-tokens-'));
  const file = path.join(dir, 'tailwind.tokens.js');
  await writeFile(
    file,
    [
      '// DesignBridge — generated Tailwind tokens',
      "// Usage: import tokens from './tokens/tailwind.config.tokens.js'",
      '//        export default { theme: { extend: tokens } }',
      'export default {',
      "  spacing: {",
      "    'card-layout-padding-and-grid-gaps': 'var(--spacing-card-layout-padding-and-grid-gaps)',",
      '  },',
      '};',
      '',
    ].join('\n'),
    'utf8',
  );
  try {
    const tokens = loadScanTokens(file);
    assert.deepEqual(tokens, {
      spacing: { 'card-layout-padding-and-grid-gaps': 'var(--spacing-card-layout-padding-and-grid-gaps)' },
    });
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('loadScanTokens: {} bei kaputtem Inhalt statt zu werfen', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'tailwind-tokens-'));
  const file = path.join(dir, 'tailwind.tokens.js');
  await writeFile(file, 'export default { kaputt', 'utf8');
  try {
    assert.deepEqual(loadScanTokens(file), {});
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('mergeExtend: Scan-Tokens gewinnen bei Namensgleichheit, Rest von base bleibt', () => {
  const base = {
    colors: { card: { DEFAULT: 'hsl(var(--card))' }, border: 'hsl(var(--border))' },
    borderRadius: { lg: 'var(--radius)' },
  };
  const extra = {
    colors: { 'background-card': 'var(--color-background-card)', border: 'var(--color-border)' },
    spacing: { 'card-layout-padding-and-grid-gaps': 'var(--spacing-card-layout-padding-and-grid-gaps)' },
  };
  const merged = mergeExtend(base, extra);

  // Neue Scan-Farbe kommt dazu, bestehende shadcn-Farbe bleibt erhalten …
  assert.equal(merged.colors['background-card'], 'var(--color-background-card)');
  assert.deepEqual(merged.colors.card, { DEFAULT: 'hsl(var(--card))' });
  // … außer bei Namensgleichheit: da gewinnt der Scan.
  assert.equal(merged.colors.border, 'var(--color-border)');
  // borderRadius kommt unverändert von base, weil extra dort nichts mitbringt.
  assert.deepEqual(merged.borderRadius, { lg: 'var(--radius)' });
  // Ein komplett neuer theme-Key (spacing) wird übernommen.
  assert.deepEqual(merged.spacing, { 'card-layout-padding-and-grid-gaps': 'var(--spacing-card-layout-padding-and-grid-gaps)' });
});

test('mergeExtend: ohne Scan-Tokens bleibt base unverändert (heutiges Verhalten)', () => {
  const base = { colors: { card: { DEFAULT: 'hsl(var(--card))' } } };
  assert.deepEqual(mergeExtend(base, {}), base);
  assert.deepEqual(mergeExtend(base, undefined), base);
});
