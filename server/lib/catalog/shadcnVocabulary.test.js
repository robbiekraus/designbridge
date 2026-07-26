import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SHADCN_VOCABULARY, catalogPromptBlock } from './shadcnVocabulary.js';

test('SHADCN_VOCABULARY enthält den Startsatz mit korrekten Namen', () => {
  const names = SHADCN_VOCABULARY.map((c) => c.name).sort();
  assert.deepEqual(names, [
    'Alert', 'Avatar', 'Badge', 'Breadcrumb', 'Button', 'Card', 'Checkbox', 'Input', 'Label',
    'Pagination', 'Progress', 'Separator', 'Skeleton', 'Switch', 'Tabs', 'Textarea', 'ToggleGroup',
  ]);
});

// Sync-Vertrag (Kopf-Kommentar dieser Datei): Namen UND Varianten-Achsen müssen mit
// web/src/lib/catalog/shadcn-default.js übereinstimmen. Der Vertrag stand bisher nur als Kommentar
// da — bei der Aufstockung am 26.07. war genau das die Fehlerquelle: erweitert man nur den
// Web-Katalog, kennt die KI die neuen Namen nicht und markiert sie nie; erweitert man nur das
// Vokabular, verwirft htmlToPlan die Marker (Q4-Validierung) und das Grounding fällt still aus.
// web/ und server/ sind getrennte Pakete, deshalb wird die Datei hier per Text gelesen statt
// importiert (ein Import über die Paketgrenze würde die Server-Suite an web/ ketten).
test('Sync-Vertrag: Namen und Varianten deckungsgleich mit dem Web-Katalog', async () => {
  const { readFile } = await import('node:fs/promises');
  const { fileURLToPath } = await import('node:url');
  const path = await import('node:path');
  const here = path.dirname(fileURLToPath(import.meta.url));
  const webCatalog = path.resolve(here, '../../../web/src/lib/catalog/shadcn-default.js');

  let src;
  try {
    src = await readFile(webCatalog, 'utf8');
  } catch {
    // In einem Deployment ohne web/ (Server-only-Image) ist die Prüfung nicht anwendbar.
    return;
  }

  // Nur die Einträge der Export-Liste, nicht die Namen der Plan-Funktionen darüber.
  const listeAb = src.indexOf('export const SHADCN_DEFAULT_CATALOG');
  const liste = src.slice(listeAb);
  const webNames = [...liste.matchAll(/^ {4}name: '([^']+)'/gm)].map((m) => m[1]).sort();
  const vocabNames = SHADCN_VOCABULARY.map((c) => c.name).sort();

  assert.deepEqual(
    vocabNames,
    webNames,
    'Vokabular und Web-Katalog sind auseinandergelaufen — beide Listen zusammen pflegen',
  );
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
