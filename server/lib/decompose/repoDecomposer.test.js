import test from 'node:test';
import assert from 'node:assert/strict';
import { repoDecomposer, liftRepoInventory, CODE_CAP } from './repoDecomposer.js';

const files = [
  { path: 'src/components/PricingCard.tsx', content: 'export const PricingCard = () => <div/>;' },
];

test('decompose hängt structure.code + lang an', async () => {
  const segs = await repoDecomposer.decompose(
    { files },
    [{ name: 'PricingCard', path: 'src/components/PricingCard.tsx' }],
  );
  assert.equal(segs[0].label, 'PricingCard');
  assert.equal(segs[0].structure.code, files[0].content);
  assert.equal(segs[0].structure.lang, 'tsx');
  assert.equal(segs[0].visual, null);
});

test('fehlende Datei → structure null, Segment bleibt gelistet', async () => {
  const segs = await repoDecomposer.decompose({ files }, [{ name: 'Ghost', path: 'nope.tsx' }]);
  assert.equal(segs[0].structure, null);
  assert.equal(segs[0].label, 'Ghost');
});

test('cap kürzt den Code + markiert notes', async () => {
  const big = [{ path: 'a.ts', content: 'x'.repeat(CODE_CAP + 50) }];
  const segs = await repoDecomposer.decompose({ files: big }, [{ name: 'A', path: 'a.ts' }], { cap: CODE_CAP });
  assert.equal(segs[0].structure.code.length, CODE_CAP);
  assert.match(segs[0].notes, /gekürzt/);
});

test('liftRepoInventory merged sourceCode + lang in die Items', async () => {
  const inv = [{ name: 'PricingCard', path: 'src/components/PricingCard.tsx' }];
  await liftRepoInventory(files, inv);
  assert.equal(inv[0].sourceCode, files[0].content);
  assert.equal(inv[0].lang, 'tsx');
});

test('leerer Datei-Inhalt (pfad-only Seiten/Layouts) → structure null, kein sourceCode', async () => {
  // extractRepoFiles liefert für Seiten/Layouts content:'' — das ist KEIN Material:
  // weder leeres sourceCode auf Items noch leere Code-Blöcke im Interpret-Prompt.
  const pathOnly = [{ path: 'app/dashboard/page.tsx', content: '' }];
  const segs = await repoDecomposer.decompose({ files: pathOnly }, [{ name: 'Page', path: 'app/dashboard/page.tsx' }]);
  assert.equal(segs[0].structure, null);
  const inv = [{ name: 'Page', path: 'app/dashboard/page.tsx' }];
  await liftRepoInventory(pathOnly, inv);
  assert.equal('sourceCode' in inv[0], false);
});

test('decompose cappt per Default auf CODE_CAP (Interpret-Route ruft ohne Optionen)', async () => {
  const big = [{ path: 'a.ts', content: 'x'.repeat(CODE_CAP + 50) }];
  const segs = await repoDecomposer.decompose({ files: big }, [{ name: 'A', path: 'a.ts' }]);
  assert.equal(segs[0].structure.code.length, CODE_CAP);
  assert.match(segs[0].notes, /gekürzt/);
});

test('fehlender kind → Fallback-Default "organism" (Pinned Contract)', async () => {
  const segs = await repoDecomposer.decompose({ files }, [{ name: 'Unbekannt', path: 'nope.tsx' }]);
  assert.equal(segs[0].kind, 'organism');
});
