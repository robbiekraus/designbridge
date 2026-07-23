import { slugify } from './slugify.js';

// kind (Singular, wie in emitComponents) → Storybook-Sidebar-Gruppe.
const KIND_GROUP = {
  atom: 'Atoms',
  molecule: 'Molecules',
  organism: 'Organisms',
  template: 'Templates',
};

// Einfach-gequoteter JS-String-Literal (Stil der Emit-Schicht: einfache Quotes).
function sq(s) {
  return `'${String(s).replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`;
}

function toPascal(slug) {
  return slug
    .split('-')
    .filter(Boolean)
    .map((s) => s.charAt(0).toUpperCase() + s.slice(1))
    .join('');
}

// Variantenname → gültiger JS-Identifier für den Story-Export.
// '2xl' -> 'V2xl' (darf nicht mit Ziffer beginnen), 'with icon' -> 'WithIcon'.
function storyIdent(variant) {
  const pascal = toPascal(slugify(String(variant))) || 'Variant';
  return /^[A-Za-z]/.test(pascal) ? pascal : `V${pascal}`;
}

// Export-Namen aus dem emittierten Code lesen (robust gegen gehobenen Repo-Code
// mit fremdem Namen). Named export -> { ident, isDefault:false }; default export
// -> { ident: fallback, isDefault:true }; nichts erkannt -> Fallback als named.
function exportedName(code, fallback) {
  const named = /export\s+function\s+([A-Za-z0-9_$]+)/.exec(code)
    || /export\s+const\s+([A-Za-z0-9_$]+)\s*=/.exec(code);
  if (/export\s+default\s+function\s+([A-Za-z0-9_$]+)/.test(code)) {
    const m = /export\s+default\s+function\s+([A-Za-z0-9_$]+)/.exec(code);
    return { ident: m[1], isDefault: true };
  }
  if (/export\s+default/.test(code)) return { ident: fallback, isDefault: true };
  if (named) return { ident: named[1], isDefault: false };
  return { ident: fallback, isDefault: false };
}

/**
 * emitStories(component) — reiner Emitter. Input = ein Objekt aus emitComponents
 * ({ name, slug, filename, kind, variants, code, grounded }). Output =
 * { filename: '<Pascal>.stories.jsx', code } im Component-Story-Format (CSF3).
 */
export function emitStories(component) {
  const pascal = toPascal(slugify(component.slug || component.name || 'component')) || 'Component';
  const { ident, isDefault } = exportedName(component.code || '', pascal);
  const importClause = isDefault ? ident : `{ ${ident} }`;
  const importPath = `../components/${String(component.filename || `${pascal}.jsx`).replace(/\.(jsx|tsx|js|ts)$/, '')}`;
  const group = KIND_GROUP[component.kind] || 'Components';
  const title = `${group}/${component.name}`;

  const stories = ['export const Default = {};'];
  for (const v of component.variants || []) {
    stories.push(`export const ${storyIdent(v)} = { args: { variant: ${sq(v)} } };`);
  }

  const groundedNote = component.grounded?.length
    ? `// Rendert echte shadcn-Komponenten: ${component.grounded.join(', ')}\n`
    : '';

  const code = [
    `${groundedNote}import ${importClause} from '${importPath}';`,
    '',
    'export default {',
    `  title: ${sq(title)},`,
    `  component: ${ident},`,
    '};',
    '',
    ...stories,
    '',
  ].join('\n');

  return { filename: `${pascal}.stories.jsx`, code };
}
