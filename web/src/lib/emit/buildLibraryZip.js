import JSZip from 'jszip';
import { buildExports } from './index.js';
import { emitComponents } from './emitComponents.js';
import { emitStories } from './emitStories.js';

function buildReadme(exports, comps) {
  const lines = ['# DesignBridge Library Export', ''];
  if (exports) lines.push('## Tokens', '- tokens/tokens.css', '- tokens/tokens.json', '- tokens/tailwind.config.tokens.js', '');
  if (comps.length) {
    lines.push('## Components');
    for (const c of comps) lines.push(`- components/${c.filename}`);
    lines.push('', '## Storybook', '- .storybook/main.js');
    for (const c of comps) lines.push(`- stories/${emitStories(c).filename}`);
  }
  return lines.join('\n') + '\n';
}

export async function buildLibraryZip(result) {
  const zip = new JSZip();
  const exports = buildExports(result);
  if (exports) {
    zip.file('tokens/tokens.css', exports.css);
    zip.file('tokens/tailwind.config.tokens.js', exports.tailwind);
    zip.file('tokens/tokens.json', exports.json);
  }
  const comps = emitComponents(result);
  for (const c of comps) {
    zip.file(`components/${c.filename}`, c.code);
    const story = emitStories(c);
    zip.file(`stories/${story.filename}`, story.code);
  }
  if (comps.length) {
    zip.file('.storybook/main.js', [
      "// Von DesignBridge erzeugt — Storybook 8 (react-vite).",
      'export default {',
      "  stories: ['../stories/**/*.stories.jsx'],",
      "  addons: ['@storybook/addon-essentials'],",
      "  framework: { name: '@storybook/react-vite', options: {} },",
      '};',
      '',
    ].join('\n'));
  }
  zip.file('README.md', buildReadme(exports, comps));
  return zip.generateAsync({ type: 'blob' });
}
