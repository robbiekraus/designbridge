import test from 'node:test';
import assert from 'node:assert/strict';
import { access } from 'node:fs/promises';
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
