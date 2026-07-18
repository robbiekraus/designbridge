import { isUiComponent, isComponentFile, isPageFile, isLayoutFile } from './repoFilePatterns.js';

export const pascal = (s) =>
  s.replace(/\.[^.]+$/, '')
    .split(/[-_.\s]/)
    .filter(Boolean)
    .map((w) => w[0].toUpperCase() + w.slice(1))
    .join('');

export function recognizeRepoInventory(files) {
  const atoms = new Map();
  const organisms = new Map();
  const templates = new Map();
  const put = (map, entry) => { if (!map.has(entry.name)) map.set(entry.name, entry); };

  for (const { path } of files) {
    const base = path.split('/').pop();
    if (isUiComponent(path)) {
      put(atoms, {
        name: pascal(base), variants: [], confidence: 'high', source: 'rules', notes: `aus ${path}`, path,
      });
    } else if (isComponentFile(path)) {
      put(organisms, { name: pascal(base), confidence: 'low', source: 'rules', notes: `aus ${path}`, path });
    } else if (isLayoutFile(path)) {
      // path mitführen: buildRepoComposition liest den Quellcode über
      // files[it.path] — ohne path bleiben Layout→Organism-Kanten unauffindbar
      // (Spec 2026-07-18-repo-composition-extraction).
      put(templates, {
        name: 'Layout', confidence: 'med', source: 'rules', notes: `aus ${path}`, path,
      });
    } else if (isPageFile(path)) {
      // Next.js route groups `(marketing)` and dynamic segments `[slug]`,
      // `[...slug]`, `[[...slug]]` → strip parens/brackets and leading dots.
      const cleanSegment = (s) => s.replace(/[()[\]]/g, '').replace(/^\.+/, '');
      const segs = path.split('/');
      let label = base.replace(/\.[^.]+$/, '');
      let i = segs.length - 2;
      if (label === 'page' || label === 'index') label = '';
      else label = cleanSegment(label);
      while (!label && i >= 0) {
        const seg = segs[i];
        if (seg === 'app' || seg === 'pages' || seg === 'src') break;
        label = cleanSegment(seg);
        i -= 1;
      }
      if (!label || label === 'app' || label === 'pages' || label === 'src') label = 'Start';
      // path mitführen (siehe Layout-Zweig oben) — gleiche Composition-Notwendigkeit.
      put(templates, {
        name: `Seite: ${pascal(label)}`, confidence: 'low', source: 'rules', notes: `aus ${path}`, path,
      });
    }
  }
  return {
    atoms: [...atoms.values()],
    organisms: [...organisms.values()],
    templates: [...templates.values()],
  };
}
