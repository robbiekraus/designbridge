// Der Grounding-Katalog als echte Figma-Komponenten-Bibliothek (Spec: docs/superpowers/specs/
// 2026-07-25-katalog-als-figma-library-design.md §Verträge/Payload). Reine Funktionen, kein DOM.
//
// Zwei Rollen:
//   1. `emitFigmaCatalog` baut aus der Katalog-Option (shadcn-Default ODER User-Repo-Katalog) die
//      `catalog`-Liste des Figma-Payloads — je Eintrag ein Component-Set-Bauplan mit dem vollen
//      Kreuzprodukt seiner Varianten-Achsen, IMMER bei 1× (die Library ist die Wahrheit des Systems,
//      Skalierung ist Sache der Instanz — s. Spec §Entscheidung 1).
//   2. Namensvertrag (`catalogFigmaName`, `variantSelectionKey`), den `groundPlan` für die
//      component-refs der gescannten Bausteine benutzt. Beide Seiten MÜSSEN denselben Namen bilden,
//      sonst findet das Plugin die Komponente nicht — deshalb liegt der Vertrag hier an einer Stelle.

/** Namespace vor jedem Katalog-Namen in Figma. Verhindert Kollisionen mit gescannten Bausteinen
 *  („Button") und gruppiert die Library im Assets-Panel (Figma nutzt „/" als Gruppentrenner). */
export const CATALOG_NAMESPACE = 'DS/';

/** Deckel fürs Varianten-Kreuzprodukt pro Eintrag (Default-Katalog: Button = 6×4 = 24). Schützt vor
 *  Repo-Katalogen mit vielen Achsen, die sonst hunderte Figma-Komponenten pro Import erzeugen. */
export const MAX_VARIANTS_PER_ENTRY = 32;

/** Figma-Komponentenname eines Katalog-Eintrags. */
export function catalogFigmaName(name) {
  return `${CATALOG_NAMESPACE}${name}`;
}

/** Varianten-Achsen eines Eintrags in stabiler Reihenfolge, nur solche mit echten Optionslisten. */
function variantAxes(entry) {
  const axes = entry?.variants;
  if (!axes || typeof axes !== 'object') return [];
  return Object.keys(axes)
    .filter((axis) => Array.isArray(axes[axis]) && axes[axis].length > 0)
    .map((axis) => ({ axis, values: axes[axis] }));
}

/**
 * Varianten-Schlüssel in Figma-Konvention: `variant=secondary, size=lg`. Achsen in Katalog-
 * Reihenfolge, fehlende Achsen mit ihrem ERSTEN Listenwert (= Katalog-Default) gefüllt, damit
 * Ref-Seite und Library-Seite denselben Schlüssel bilden. Eintrag ohne Achsen → `'default'`.
 */
export function variantSelectionKey(entry, selection = {}) {
  const axes = variantAxes(entry);
  if (axes.length === 0) return 'default';
  return axes
    .map(({ axis, values }) => {
      const picked = selection?.[axis];
      const value = values.includes(picked) ? picked : values[0];
      return `${axis}=${value}`;
    })
    .join(', ');
}

/** Umkehrung von `variantSelectionKey` (Diagnose/Tests). `'default'` → `{}`. */
export function selectionFromVariantKey(key) {
  if (typeof key !== 'string' || key === 'default' || key === '') return {};
  const out = {};
  for (const part of key.split(',')) {
    const [axis, value] = part.split('=');
    if (axis && value !== undefined) out[axis.trim()] = value.trim();
  }
  return out;
}

/** Kreuzprodukt aller Achsen als Auswahl-Objekte, deterministische Reihenfolge (letzte Achse
 *  rotiert am schnellsten — dadurch stehen die Default-Werte vorne). */
function variantSelections(entry) {
  const axes = variantAxes(entry);
  if (axes.length === 0) return [{}];
  let combos = [{}];
  for (const { axis, values } of axes) {
    const next = [];
    for (const combo of combos) {
      for (const value of values) next.push({ ...combo, [axis]: value });
    }
    combos = next;
  }
  return combos;
}

/** Plan-Wurzel eines Katalog-Eintrags in der Form, die `parsePayload.parsePlan` akzeptiert:
 *  Box-Wurzel mit allen Pflichtfeldern. Alles andere (Text-Wurzel wie bei `Label`, kaputter Plan)
 *  → null, der Aufrufer überspringt den Eintrag. */
function normalizePlanRoot(plan) {
  if (!plan || typeof plan !== 'object' || plan.type !== 'box') return null;
  return {
    type: 'box',
    layout: plan.layout === 'column' ? 'column' : 'row',
    padding: Array.isArray(plan.padding) && plan.padding.length === 4 ? plan.padding : [0, 0, 0, 0],
    radius: typeof plan.radius === 'number' ? plan.radius : 0,
    fill: plan.fill ?? null,
    stroke: plan.stroke ?? null,
    strokeWeight: typeof plan.strokeWeight === 'number' ? plan.strokeWeight : 1,
    gap: typeof plan.gap === 'number' ? plan.gap : 0,
    width: plan.width ?? null,
    height: plan.height ?? null,
    primaryAlign: plan.primaryAlign ?? 'MIN',
    counterAlign: plan.counterAlign ?? 'CENTER',
    children: Array.isArray(plan.children) ? plan.children : [],
  };
}

/**
 * Baut die `catalog`-Liste des Figma-Payloads.
 *
 * @param {{ source?: string, components?: Array<object> }|null|undefined} catalogOption Dieselbe
 *   Katalog-Option, die `htmlToPlan`/`groundPlan` bekommen.
 * @param {{ warnings?: string[], maxVariants?: number }} [opts] `warnings` sammelt gedeckelte
 *   Einträge (landen über emitFigmaComponents im bestehenden raw.warnings-Kanal).
 * @returns {Array<{ name: string, catalogName: string, source: string|null, variants: Array<{ name: string, plan: object }> }>}
 */
export function emitFigmaCatalog(catalogOption, opts = {}) {
  const components = Array.isArray(catalogOption?.components) ? catalogOption.components : [];
  if (components.length === 0) return [];
  const warnings = Array.isArray(opts.warnings) ? opts.warnings : null;
  const maxVariants = opts.maxVariants ?? MAX_VARIANTS_PER_ENTRY;
  const source = typeof catalogOption?.source === 'string' ? catalogOption.source : null;

  const out = [];
  for (const entry of components) {
    if (!entry?.name || typeof entry.plan !== 'function') continue;

    const selections = variantSelections(entry);
    const capped = selections.length > maxVariants;
    const used = capped ? selections.slice(0, maxVariants) : selections;
    if (capped && warnings) {
      warnings.push(
        `Design-System-Bibliothek: „${entry.name}" hat ${selections.length} Varianten — auf ${maxVariants} gedeckelt.`,
      );
    }

    const variants = [];
    for (const selection of used) {
      let plan = null;
      try {
        plan = normalizePlanRoot(entry.plan(selection));
      } catch {
        plan = null; // kaputter Katalog-Eintrag darf den ganzen Export nicht sprengen
      }
      if (!plan) continue;
      variants.push({ name: variantSelectionKey(entry, selection), plan });
    }
    if (variants.length === 0) continue;

    out.push({ name: catalogFigmaName(entry.name), catalogName: entry.name, source, variants });
  }
  return out;
}

/**
 * Kann dieser Katalog-Eintrag als Figma-Instanz referenziert werden? Nur dann darf `groundPlan` einen
 * `component-ref` auf `DS/<Name>` emittieren — sonst existiert dort keine Komponente (Spec
 * §Verträge/Payload: Einträge mit Text-Wurzel werden übersprungen).
 */
export function catalogEntryHasFigmaComponent(entry) {
  if (!entry?.name || typeof entry.plan !== 'function') return false;
  try {
    return normalizePlanRoot(entry.plan(variantSelections(entry)[0])) !== null;
  } catch {
    return false;
  }
}
