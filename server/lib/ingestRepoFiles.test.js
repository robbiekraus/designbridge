import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { selectRepoFiles } from './extractRepoFiles.js';
import { ingestRepoFiles } from './ingestRepoFiles.js';

const FIXTURE = path.join(path.dirname(fileURLToPath(import.meta.url)), '../fixtures/repo-fixture');

test('produces the canonical server shape from the fixture repo', async () => {
  const files = await selectRepoFiles(FIXTURE);
  const result = ingestRepoFiles(files, { sourceUrl: 'https://github.com/a/b', branch: 'main' });

  const primary = result.tokens.colors.find((c) => c.hex === '#022d2c');
  assert.equal(primary.source, 'tailwind.config.js → theme.extend.colors.primary');
  const ink = result.tokens.colors.find((c) => c.hex === '#111827');
  assert.equal(ink.source, 'src/styles.css → --color-ink');

  assert.ok(result.tokens.spacing.some((s) => s.value === 24));          // --space-lg
  assert.ok(result.tokens.border_radius.some((r) => r.value === '12px')); // theme
  assert.ok(result.tokens.shadows.some((s) => /rgba/.test(s.css)));
  assert.ok(result.tokens.typography.some((t) => t.size === 16));        // fontSize.base 1rem

  assert.ok(result.atoms.some((a) => a.name === 'Button'));
  assert.ok(result.templates.some((p) => p.name === 'Layout'));

  assert.equal(result.meta.model, 'repo-ingest');
  assert.equal(result.meta.source_url, 'https://github.com/a/b');
  assert.equal(result.meta.branch, 'main');
  assert.equal(result.meta.ai_deepened, false);
});

test('skips non-hex tailwind colors like hsl(var(--border))', async () => {
  const files = [{ path: 'tailwind.config.js', content: `module.exports={theme:{extend:{colors:{border:'hsl(var(--border))'}}}}` }];
  const result = ingestRepoFiles(files);
  assert.equal(result.tokens.colors.length, 0);
});

test('dedupes tokens across tailwind and css (tailwind wins)', () => {
  const files = [
    { path: 'tailwind.config.js', content: `module.exports={theme:{extend:{colors:{primary:'#022d2c'}}}}` },
    { path: 'a.css', content: ':root { --color-primary: #022d2c; }' },
  ];
  const result = ingestRepoFiles(files);
  assert.equal(result.tokens.colors.length, 1);
  assert.match(result.tokens.colors[0].source, /tailwind\.config/);
});

test('warns when no tokens are found at all (but still returns 200-shape)', () => {
  const result = ingestRepoFiles([{ path: 'components/ui/button.tsx', content: 'x' }]);
  assert.ok(result.warnings.some((w) => /Keine Design-Tokens/.test(w)));
  assert.ok(result.atoms.length > 0);
});

test('carries computed-config warnings from the tailwind parser', async () => {
  const files = await selectRepoFiles(FIXTURE);
  const result = ingestRepoFiles(files);
  assert.ok(result.warnings.some((w) => /statisch nicht gelesen/.test(w)));
});
