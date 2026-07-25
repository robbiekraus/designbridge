// buildRepoCatalog — DS-Grounding Scheibe 2, Schritt 5. Fügt die Teile zusammen:
// aus je einer geparsten cva (base/variants/defaultVariants, aus dem server-seitigen cvaParser)
// + dem Theme (aus themeReader) ein Katalog-Objekt im EXAKT gleichen Format wie
// SHADCN_DEFAULT_CATALOG → { name, import:{name,from}, variants, props, match:{tag,hints}, plan }.
// Damit ist der Repo-Katalog ein Drop-in für den Default (htmlToPlan/planToJsx bleiben unverändert).
//
// Pur & web-seitig: bekommt die bereits geparsten Einträge übergeben, importiert NICHT server/
// (die Repo-Lese-/cva-Belange liegen in server/lib/catalog). Bridging passiert in der Verdrahtung
// (Schritt 6).

import { twToPlan } from './twToPlan.js';

// Bekannte shadcn-Primitives → Erkennungs-tag + Hints (wie im Default-Katalog kuratiert).
// Fallback für unbekannte Dateinamen: tag 'div', Hint = der Slug selbst.
const PRIMITIVE = {
  button: { tag: 'button', hints: ['button', 'btn', 'cta'] },
  input: { tag: 'input', hints: ['input', 'field', 'textfield'] },
  label: { tag: 'label', hints: ['label'] },
  badge: { tag: 'span', hints: ['badge', 'tag', 'chip', 'status', 'pill'] },
  card: { tag: 'div', hints: ['card', 'panel', 'tile'] },
  checkbox: { tag: 'input', hints: ['checkbox', 'check'] },
  avatar: { tag: 'div', hints: ['avatar', 'profile', 'user-pic'] },
  separator: { tag: 'div', hints: ['separator', 'divider', 'hr'] },
};

const KNOWN_PROPS = ['asChild', 'disabled', 'placeholder', 'checked'];

// Container-Einträge (Spec 2026-07-25-komposition-gegroundeter-bausteine-design.md §Entscheidung 3):
// dürfen den interpretierten Unterbaum TRAGEN statt ihn zu einem Label einzuschmelzen. Im Default-
// Katalog steht das Flag von Hand am Eintrag; für ein fremdes Repo ist der Dateiname das einzige
// verfügbare Signal (die cva sagt nichts über Slots). Bekannte Grenze: ein eigenwillig benannter
// Container im User-Repo bleibt Blatt — also heutiges Verhalten, kein Rückschritt.
const CONTAINER_SLUGS = new Set([
  'card', 'panel', 'dialog', 'sheet', 'alert', 'popover', 'accordion', 'drawer',
]);

function slugFromPath(p) {
  const file = String(p).split('/').pop() || '';
  return file.replace(/\.(tsx|jsx|ts|js)$/i, '');
}

function pascal(slug) {
  return slug
    .split(/[-_]/)
    .filter(Boolean)
    .map((s) => s.charAt(0).toUpperCase() + s.slice(1))
    .join('');
}

/** Dateipfad → Import-Pfad nach shadcn-Konvention (@ = Repo-Wurzel). */
function importFrom(p) {
  const norm = String(p).replace(/\.(tsx|jsx|ts|js)$/i, '');
  const idx = norm.indexOf('components/');
  const rel = idx >= 0 ? norm.slice(idx) : norm.replace(/^\.?\//, '');
  return `@/${rel}`;
}

/** Achsen → Optionsnamen (Katalog-`variants`-Format). Inline gehalten, damit web nicht server importiert. */
function variantAxes(cva) {
  const out = {};
  for (const [axis, opts] of Object.entries(cva?.variants || {})) out[axis] = Object.keys(opts);
  return out;
}

/** Klassen-String für eine Varianten-Auswahl: base + je Achse die gewählte (oder Default-)Option. */
function classForSelection(cva, sel) {
  const parts = [cva.base || ''];
  for (const axis of Object.keys(cva.variants || {})) {
    const chosen = sel?.[axis] ?? cva.defaultVariants?.[axis];
    const cls = chosen != null ? cva.variants[axis]?.[chosen] : undefined;
    if (cls) parts.push(cls);
  }
  return parts.filter(Boolean).join(' ');
}

function detectProps(source) {
  if (typeof source !== 'string') return [];
  return KNOWN_PROPS.filter((p) => new RegExp(`\\b${p}\\b`).test(source));
}

/**
 * @param {Array<{ path:string, cva:{base,variants,defaultVariants}, source?:string }>} entries
 * @param {{colors?:object,vars?:object}} theme  aus themeReader
 * @returns {Array} Katalog im Format von SHADCN_DEFAULT_CATALOG
 */
/** Wie buildRepoCatalog, aber in die Katalog-Option-Form { source, components } gebracht,
 *  die htmlToPlan/emitComponents erwarten (analog SHADCN_DEFAULT_CATALOG_OPTION). */
export function repoCatalogOption(entries, theme = { colors: {}, vars: {} }) {
  return { source: 'user-repo', components: buildRepoCatalog(entries, theme) };
}

export function buildRepoCatalog(entries, theme = { colors: {}, vars: {} }) {
  if (!Array.isArray(entries)) return [];
  return entries.map((entry) => {
    const slug = slugFromPath(entry.path);
    const name = pascal(slug) || 'Component';
    const cva = entry.cva || { base: '', variants: {}, defaultVariants: {} };
    const prim = PRIMITIVE[slug] || { tag: 'div', hints: [slug] };
    return {
      name,
      import: { name, from: importFrom(entry.path) },
      variants: variantAxes(cva),
      props: detectProps(entry.source),
      match: { tag: prim.tag, hints: prim.hints },
      // plan(sel) — reine Funktion, Defaults aus defaultVariants; label = Komponentenname.
      plan: (sel = {}) => twToPlan(classForSelection(cva, sel), { theme, label: name }),
      ...(CONTAINER_SLUGS.has(slug) ? { container: true } : {}),
    };
  });
}
