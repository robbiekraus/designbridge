import { isUiComponent, isComponentFile, isPageFile, isLayoutFile } from './repoFilePatterns.js';

const pascal = (s) =>
  s.replace(/\.[^.]+$/, '')
    .split(/[-_.\s]/)
    .filter(Boolean)
    .map((w) => w[0].toUpperCase() + w.slice(1))
    .join('');

export function recognizeRepoInventory(files) {
  const atomics = new Map();
  const components = new Map();
  const patterns = new Map();
  const put = (map, entry) => { if (!map.has(entry.name)) map.set(entry.name, entry); };

  for (const { path } of files) {
    const base = path.split('/').pop();
    if (isUiComponent(path)) {
      put(atomics, {
        name: pascal(base), variants: [], confidence: 'high', source: 'rules', notes: `aus ${path}`,
      });
    } else if (isComponentFile(path)) {
      put(components, { name: pascal(base), confidence: 'low', source: 'rules', notes: `aus ${path}` });
    } else if (isLayoutFile(path)) {
      put(patterns, { name: 'Layout', confidence: 'med', source: 'rules', notes: `aus ${path}` });
    } else if (isPageFile(path)) {
      const segs = path.split('/');
      let label = base.replace(/\.[^.]+$/, '');
      if (label === 'page' || label === 'index') label = segs[segs.length - 2] ?? '';
      if (!label || label === 'app' || label === 'pages' || label === 'src') label = 'Start';
      put(patterns, {
        name: `Seite: ${pascal(label)}`, confidence: 'low', source: 'rules', notes: `aus ${path}`,
      });
    }
  }
  return {
    atomics: [...atomics.values()],
    components: [...components.values()],
    patterns: [...patterns.values()],
  };
}
