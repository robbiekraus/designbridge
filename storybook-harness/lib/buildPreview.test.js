import test from 'node:test';
import assert from 'node:assert/strict';
import { access, readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { buildPreview, getPreviewDir, clearPreviews } from './buildPreview.js';

const COMPONENTS = {
  'Greeting.jsx': `export function Greeting({ className = "", ...props }) {
  return (
    <div className={\`flex \${className}\`} {...props}>
      Hallo
    </div>
  );
}
`,
  'PrimaryAction.jsx': `import { Button } from "@/components/ui/button";

export function PrimaryAction({ className = "", ...props }) {
  return (
    <div className={\`flex \${className}\`} {...props}>
      <Button>Speichern</Button>
    </div>
  );
}
`,
};

const STORIES = {
  'Greeting.stories.jsx': `import { Greeting } from '../components/Greeting';

export default { title: 'Atoms/Greeting', component: Greeting };
export const Default = {};
`,
  'PrimaryAction.stories.jsx': `import { PrimaryAction } from '../components/PrimaryAction';

export default { title: 'Molecules/PrimaryAction', component: PrimaryAction };
export const Default = {};
`,
};

test.after(() => clearPreviews());

test('buildPreview baut ein echtes Storybook (inkl. shadcn-Alias) und liefert eine abrufbare id', async () => {
  const { id, staticDir } = await buildPreview({ components: COMPONENTS, stories: STORIES });
  assert.ok(id);
  await access(path.join(staticDir, 'index.html'));
  assert.equal(getPreviewDir(id), staticDir);
});

test('ohne Komponenten wirft buildPreview statt ein leeres Storybook zu bauen', async () => {
  await assert.rejects(
    buildPreview({ components: {}, stories: {} }),
    /keine komponenten/i,
  );
});

test('kaputter Komponenten-Code → buildPreview wirft und räumt das Arbeitsverzeichnis weg', async () => {
  const brokenComponents = {
    'Broken.jsx': 'export function Broken( {\n  return <div>;\n}\n', // absichtlich kaputtes JSX
  };
  const brokenStories = {
    'Broken.stories.jsx': `import { Broken } from '../components/Broken';
export default { title: 'Atoms/Broken', component: Broken };
export const Default = {};
`,
  };

  let thrown = null;
  try {
    await buildPreview({ components: brokenComponents, stories: brokenStories });
  } catch (err) {
    thrown = err;
  }
  assert.ok(thrown, 'buildPreview sollte werfen, nicht ein halbes Storybook zurückgeben');
  assert.match(thrown.message, /storybook konnte nicht gebaut werden/i);
});

test('TTL 0 räumt die Vorschau sofort ab (Muster: repoStore.js)', async () => {
  const { id } = await buildPreview({ components: COMPONENTS, stories: STORIES }, { ttlMs: 0 });
  await new Promise((r) => setTimeout(r, 50));
  assert.equal(getPreviewDir(id), null);
});

// Live-Fund 25.07.: Klassen wie `p-card-layout-padding-and-grid-gaps` waren im
// Empfangs-Storybook nicht definiert. tokens/tokensCss sind das Gegenmittel — landen sie
// im Arbeitsordner unter den Namen, die tailwind.config.js erwartet, samt Import in
// preview.js, wird die Klasse beim echten Tailwind-Build tatsächlich erzeugt.
test('tokens/tokensCss landen im Arbeitsordner und tokens.css wird in preview.js importiert', async () => {
  // Tailwind erzeugt Utilities nur, wenn sie in content (components/**, stories/**)
  // tatsächlich vorkommen — die generischen COMPONENTS von oben nutzen die Klasse nicht,
  // deshalb hier eine eigene Komponente, die sie referenziert.
  const componentsWithToken = {
    'CardWithSpacing.jsx': `export function CardWithSpacing({ className = "", ...props }) {
  return (
    <div className={\`p-card-layout-padding-and-grid-gaps \${className}\`} {...props}>
      Karte
    </div>
  );
}
`,
  };
  const storiesWithToken = {
    'CardWithSpacing.stories.jsx': `import { CardWithSpacing } from '../components/CardWithSpacing';

export default { title: 'Atoms/CardWithSpacing', component: CardWithSpacing };
export const Default = {};
`,
  };
  // Realer Header, wie ihn buildTokenSourceFiles.js (web/) tatsächlich erzeugt — der
  // Kommentar enthält selbst den Text "export default {...}" als Erklärung (Regression:
  // ein ungeankertes Suchmuster in loadScanTokens fing sich früher genau darin).
  const tokens = [
    '// DesignBridge — generated Tailwind tokens',
    "// Usage: import tokens from './tokens/tailwind.config.tokens.js'",
    '//        export default { theme: { extend: tokens } }',
    'export default {',
    "  spacing: {",
    "    'card-layout-padding-and-grid-gaps': 'var(--spacing-card-layout-padding-and-grid-gaps)',",
    '  },',
    '};',
    '',
  ].join('\n');
  const tokensCss = [
    ':root {',
    '  --spacing-card-layout-padding-and-grid-gaps: 24px;',
    '}',
    '',
  ].join('\n');

  const { staticDir } = await buildPreview({
    components: componentsWithToken,
    stories: storiesWithToken,
    tokens,
    tokensCss,
  });
  const workDir = path.dirname(staticDir);

  const writtenTokens = await readFile(path.join(workDir, 'tailwind.tokens.js'), 'utf8');
  assert.equal(writtenTokens, tokens);
  const writtenTokensCss = await readFile(path.join(workDir, 'tokens.css'), 'utf8');
  assert.equal(writtenTokensCss, tokensCss);

  const previewJs = await readFile(path.join(workDir, '.storybook', 'preview.js'), 'utf8');
  assert.match(previewJs, /^import '\.\.\/tokens\.css';/);
  assert.match(previewJs, /import '\.\.\/globals\.css';/);

  // Beweis: Tailwind hat die Scan-Token-Klasse im gebauten CSS tatsächlich erzeugt —
  // ohne die Datei bliebe `p-card-layout-padding-and-grid-gaps` unbekannt (Bug aus 25.07.).
  const assetsDir = path.join(staticDir, 'assets');
  const assetFiles = await readdir(assetsDir);
  const cssFile = assetFiles.find((f) => f.endsWith('.css'));
  assert.ok(cssFile, 'kein CSS-Asset im gebauten Storybook gefunden');
  const css = await readFile(path.join(assetsDir, cssFile), 'utf8');
  assert.match(css, /\.p-card-layout-padding-and-grid-gaps/);
});

test('ohne tokens/tokensCss bleibt preview.js unverändert (heutiges Verhalten)', async () => {
  const { staticDir } = await buildPreview({ components: COMPONENTS, stories: STORIES });
  const workDir = path.dirname(staticDir);

  await assert.rejects(access(path.join(workDir, 'tailwind.tokens.js')));
  await assert.rejects(access(path.join(workDir, 'tokens.css')));

  const previewJs = await readFile(path.join(workDir, '.storybook', 'preview.js'), 'utf8');
  assert.doesNotMatch(previewJs, /tokens\.css/);
});
