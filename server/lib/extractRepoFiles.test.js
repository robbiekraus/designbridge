import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import os from 'node:os';
import { readdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import * as tar from 'tar';
import { extractRepoFiles, selectRepoFiles } from './extractRepoFiles.js';

const FIXTURE = path.join(path.dirname(fileURLToPath(import.meta.url)), '../fixtures/repo-fixture');

// Round-Trip: Tarball zur Laufzeit mit derselben Lib bauen — kein Netz, kein binäres Fixture.
async function fixtureTarball() {
  const chunks = [];
  // GitHub-Tarballs haben genau EINEN Wurzelordner "repo-sha/" → prefix simuliert das (strip:1 muss greifen).
  // Abweichung vom Plan: von INNERHALB des Fixture-Ordners packen, sonst entstehen zwei Pfad-Ebenen.
  const stream = tar.c({ gzip: true, cwd: FIXTURE, prefix: 'repo-abc123' }, await readdir(FIXTURE));
  for await (const chunk of stream) chunks.push(chunk);
  return Buffer.concat(chunks);
}

test('selectRepoFiles picks tailwind config, css, ui components and pages', async () => {
  const files = await selectRepoFiles(FIXTURE);
  const paths = files.map((f) => f.path);
  assert.ok(paths.includes('tailwind.config.js'));
  assert.ok(paths.includes('src/styles.css'));
  assert.ok(paths.includes('components/ui/button.tsx'));
  assert.ok(paths.includes('components/Header.tsx'));
  assert.ok(paths.includes('app/dashboard/page.tsx'));
  assert.ok(paths.includes('app/layout.tsx'));
});

test('selectRepoFiles skips node_modules and dist', async () => {
  const files = await selectRepoFiles(FIXTURE);
  assert.ok(files.every((f) => !f.path.includes('node_modules') && !f.path.startsWith('dist/')));
});

test('selectRepoFiles loads content only where needed', async () => {
  const files = await selectRepoFiles(FIXTURE);
  const byPath = Object.fromEntries(files.map((f) => [f.path, f]));
  assert.match(byPath['tailwind.config.js'].content, /primary/);
  assert.match(byPath['src/styles.css'].content, /--color-ink/);
  assert.match(byPath['components/ui/button.tsx'].content, /Button/);
  assert.equal(byPath['app/layout.tsx'].content, '');
});

test('extractRepoFiles unpacks a github-style tarball and cleans up its temp dir', async () => {
  const before = (await readdir(os.tmpdir())).filter((d) => d.startsWith('designbridge-repo-'));
  const files = await extractRepoFiles(await fixtureTarball());
  assert.ok(files.some((f) => f.path === 'tailwind.config.js'));
  const after = (await readdir(os.tmpdir())).filter((d) => d.startsWith('designbridge-repo-'));
  assert.equal(after.length, before.length, 'temp dir must be removed');
});

test('extractRepoFiles cleans up the temp dir even on a broken tarball', async () => {
  const before = (await readdir(os.tmpdir())).filter((d) => d.startsWith('designbridge-repo-'));
  await assert.rejects(() => extractRepoFiles(Buffer.from('definitiv kein tarball')));
  const after = (await readdir(os.tmpdir())).filter((d) => d.startsWith('designbridge-repo-'));
  assert.equal(after.length, before.length, 'temp dir must be removed on error too');
});
