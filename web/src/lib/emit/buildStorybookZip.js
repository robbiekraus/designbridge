import JSZip from 'jszip';
import { emitComponents } from './emitComponents.js';
import { emitStories } from './emitStories.js';

const STORYBOOK_MAIN = `// Von DesignBridge erzeugt — in ein Storybook-Projekt kippen (Storybook 8, react-vite).
export default {
  stories: ['../stories/**/*.stories.jsx'],
  addons: ['@storybook/addon-essentials'],
  framework: { name: '@storybook/react-vite', options: {} },
};
`;

function buildReadme(comps) {
  const lines = [
    '# DesignBridge — Storybook-Paket',
    '',
    'Aus einem Scan erzeugte Komponenten samt Stories (Component Story Format).',
    '',
    '## Reinlegen',
    '',
    '1. In ein bestehendes React+Vite-Projekt kopieren (oder `npx storybook@latest init`).',
    '2. `components/` und `stories/` sowie `.storybook/main.js` übernehmen.',
    '3. `npm run storybook` — die Bausteine erscheinen nach Ebene gruppiert.',
    '',
    '## Inhalt',
    '',
  ];
  for (const c of comps) {
    const story = emitStories(c).filename;
    const grounded = c.grounded?.length ? ` — shadcn: ${c.grounded.join(', ')}` : '';
    lines.push(`- \`stories/${story}\`${grounded}`);
  }
  return lines.join('\n') + '\n';
}

/**
 * Reine Datei-Map des Storybook-Pakets ({ pfad: inhalt }) — testbar ohne Zip-IO.
 */
export function storybookFiles(result) {
  const comps = emitComponents(result);
  const files = {};
  for (const c of comps) {
    files[`components/${c.filename}`] = c.code;
    const story = emitStories(c);
    files[`stories/${story.filename}`] = story.code;
  }
  files['.storybook/main.js'] = STORYBOOK_MAIN;
  files['README-storybook.md'] = buildReadme(comps);
  return files;
}

export async function buildStorybookZip(result) {
  const zip = new JSZip();
  const files = storybookFiles(result);
  for (const [path, content] of Object.entries(files)) zip.file(path, content);
  return zip.generateAsync({ type: 'blob' });
}
