import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { buildCatalogFromRepo } from './buildCatalogFromRepo.js';

const dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(dirname, '../../..');

async function fixtureFiles() {
  const button = await readFile(path.join(root, 'server/fixtures/shadcn-repo/components/ui/button.tsx'), 'utf8');
  const globals = await readFile(path.join(root, 'server/fixtures/shadcn-repo/app/globals.css'), 'utf8');
  return [
    { path: 'components/ui/button.tsx', content: button },
    { path: 'app/globals.css', content: globals },
    { path: 'app/page.tsx', content: 'export default function Page(){return null}' }, // ignoriert
  ];
}

test('buildCatalogFromRepo: Vokabular + Entries + Theme aus echten Repo-Dateien', async () => {
  const { vocabulary, entries, theme } = buildCatalogFromRepo(await fixtureFiles());

  // Vokabular: nur components/ui, mit echten cva-Achsen.
  assert.equal(vocabulary.length, 1);
  assert.equal(vocabulary[0].name, 'Button');
  assert.deepEqual(vocabulary[0].variants, {
    variant: ['default', 'destructive', 'outline', 'secondary', 'ghost', 'link'],
    size: ['default', 'sm', 'lg', 'icon'],
  });

  // Entries tragen die geparste cva + Source (für web/repoCatalogOption).
  assert.equal(entries.length, 1);
  assert.equal(entries[0].path, 'components/ui/button.tsx');
  assert.match(entries[0].cva.base, /inline-flex/);

  // Theme aus globals.css.
  assert.equal(theme.colors.primary, '#18181b');
});

test('buildCatalogFromRepo: kein components/ui / kein Theme → leer, kein Absturz', () => {
  const r = buildCatalogFromRepo([{ path: 'src/app.tsx', content: 'x' }]);
  assert.deepEqual(r.entries, []);
  assert.deepEqual(r.vocabulary, []);
  assert.deepEqual(r.theme, { vars: {}, colors: {} });
  assert.deepEqual(buildCatalogFromRepo(null).entries, []);
});
