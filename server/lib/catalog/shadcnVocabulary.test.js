import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SHADCN_VOCABULARY, catalogPromptBlock } from './shadcnVocabulary.js';

test('SHADCN_VOCABULARY enthält den Startsatz mit korrekten Namen', () => {
  const names = SHADCN_VOCABULARY.map((c) => c.name).sort();
  assert.deepEqual(names, ['Avatar', 'Badge', 'Button', 'Card', 'Checkbox', 'Input', 'Label', 'Separator']);
});

test('catalogPromptBlock: Komponente mit Varianten → Achsen in Klammern', () => {
  const block = catalogPromptBlock();
  assert.match(block, /- Button \(variant: default\|secondary\|destructive\|outline\|ghost\|link; size: default\|sm\|lg\|icon\)/);
  assert.match(block, /- Badge \(variant: default\|secondary\|destructive\|outline\)/);
});

test('catalogPromptBlock: Komponente ohne Varianten → nur der Name', () => {
  const block = catalogPromptBlock();
  assert.match(block, /^- Input$/m);
  assert.match(block, /^- Separator$/m);
});

test('catalogPromptBlock: leeres Vokabular → leerer String', () => {
  assert.equal(catalogPromptBlock([]), '');
});
