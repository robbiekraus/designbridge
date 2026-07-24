import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { parseCva, variantAxes } from './cvaParser.js';

const dirname = path.dirname(fileURLToPath(import.meta.url));
const BUTTON = path.resolve(dirname, '../../fixtures/shadcn-repo/components/ui/button.tsx');

test('parseCva liest base + Varianten-Achsen aus dem echten shadcn-Button-Fixture', async () => {
  const source = await readFile(BUTTON, 'utf8');
  const { base, variants, defaultVariants } = parseCva(source);

  assert.match(base, /inline-flex/);
  assert.match(base, /rounded-md/);

  assert.deepEqual(Object.keys(variants).sort(), ['size', 'variant']);
  assert.deepEqual(
    Object.keys(variants.variant),
    ['default', 'destructive', 'outline', 'secondary', 'ghost', 'link'],
  );
  assert.deepEqual(Object.keys(variants.size), ['default', 'sm', 'lg', 'icon']);

  // Klassen je Option korrekt zugeordnet (auch umgebrochene Strings).
  assert.equal(variants.variant.default, 'bg-primary text-primary-foreground hover:bg-primary/90');
  assert.equal(
    variants.variant.outline,
    'border border-input bg-background hover:bg-accent hover:text-accent-foreground',
  );
  assert.equal(variants.size.sm, 'h-9 rounded-md px-3');

  assert.deepEqual(defaultVariants, { variant: 'default', size: 'default' });
});

test('variantAxes liefert Katalog-Format (Achse → Optionsnamen)', async () => {
  const source = await readFile(BUTTON, 'utf8');
  const axes = variantAxes(parseCva(source));
  assert.deepEqual(axes, {
    variant: ['default', 'destructive', 'outline', 'secondary', 'ghost', 'link'],
    size: ['default', 'sm', 'lg', 'icon'],
  });
});

test('parseCva: inline-Beispiel mit einfachen Quotes und Extra-Achse', () => {
  const src = `const x = cva('base-a base-b', {
    variants: {
      tone: { info: 'bg-blue', warn: "bg-amber" },
      block: { true: 'w-full' },
    },
    defaultVariants: { tone: 'info' },
  })`;
  const parsed = parseCva(src);
  assert.equal(parsed.base, 'base-a base-b');
  assert.deepEqual(variantAxes(parsed), { tone: ['info', 'warn'], block: ['true'] });
  assert.equal(parsed.variants.tone.warn, 'bg-amber');
  assert.deepEqual(parsed.defaultVariants, { tone: 'info' });
});

test('parseCva: kein cva → sauberes leeres Ergebnis (degradiert, wirft nicht)', () => {
  assert.deepEqual(parseCva('export function Button(){ return null }'), {
    base: '', variants: {}, defaultVariants: {},
  });
  assert.deepEqual(parseCva(null), { base: '', variants: {}, defaultVariants: {} });
});

test('parseCva: cva nur mit base, ohne Config-Objekt', () => {
  const parsed = parseCva('cva("just-base classes")');
  assert.equal(parsed.base, 'just-base classes');
  assert.deepEqual(parsed.variants, {});
  assert.deepEqual(parsed.defaultVariants, {});
});
