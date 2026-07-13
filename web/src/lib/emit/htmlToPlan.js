// Deterministischer HTML→plan-Konverter (Spec: docs/superpowers/specs/2026-07-13-scheibe3-figma-export-design.md, §Konverter).
// Übersetzt sanitisiertes KI-HTML in den Figma-Plan-Baum (PlanBox/PlanText, siehe designbridge-plugin/src/writer/parsePayload.ts).
// Kein Netz, kein Claude, wirft nie.
//
// Scope dieser Datei (Task 2 des Slice-3-Plans): Tailwind-Subset-Mapping für box/text.
// NICHT hier: svg-Erkennung, component-ref-Erkennung/Hierarchie, Token-Bindung — das ist Task 3
// (Hook-Punkte sind unten in convertElement markiert, damit Task 3 dort andocken kann, ohne die
// Traversal-Struktur neu zu bauen).

const SPACING_SIDES = {
  p: [0, 1, 2, 3],
  px: [1, 3],
  py: [0, 2],
  pt: [0],
  pr: [1],
  pb: [2],
  pl: [3],
};
const PADDING_RE = /^(p|px|py|pt|pr|pb|pl)-([0-9]+(?:\.[0-9]+)?)$/;

const ROUNDED_MAP = { none: 0, sm: 2, md: 6, lg: 8, xl: 12, '2xl': 16, '3xl': 24, full: 9999 };
const ROUNDED_RE = /^rounded(?:-(none|sm|md|lg|xl|2xl|3xl|full))?$/;

const FONT_SIZE_MAP = { xs: 12, sm: 14, base: 16, lg: 18, xl: 20, '2xl': 24, '3xl': 30 };
const FONT_SIZE_RE = /^text-(xs|sm|base|lg|xl|2xl|3xl)$/;

const FONT_WEIGHT_MAP = { medium: 500, semibold: 600, bold: 700 };
const FONT_WEIGHT_RE = /^font-(medium|semibold|bold)$/;

const ARBITRARY_HEX_RE = /^\[(#[0-9a-fA-F]{3,8})\]$/;
const NAMED_COLORS = { white: '#ffffff', black: '#000000' };

const GAP_RE = /^gap-([0-9]+(?:\.[0-9]+)?)$/;
const LAYOUT_CLASSES = new Set(['flex', 'inline-flex', 'grid']);

const DEFAULT_FONT_SIZE = 16;
const DEFAULT_FONT_WEIGHT = 400;
const DEFAULT_TEXT_COLOR = { hex: '#000000', token: null };

function getClasses(el) {
  const raw = typeof el.className === 'string' ? el.className : el.getAttribute?.('class') || '';
  return raw.split(/\s+/).filter(Boolean);
}

/** Farb-Utility-Klasse (bg-* oder text-*) auflösen. Arbitrary-Hex immer, benannt nur white/black. */
function resolveColorClass(prefix, rest) {
  const arbitrary = rest.match(ARBITRARY_HEX_RE);
  if (arbitrary) return { hex: arbitrary[1], token: null };
  if (NAMED_COLORS[rest]) return { hex: NAMED_COLORS[rest], token: null };
  return null;
}

/**
 * Eine Tailwind-Klassenliste einmal klassifizieren (box- UND text-Vokabular gemeinsam, damit
 * dieselbe Klassenliste sowohl für eine Box als auch — falls das Element eigenen Text trägt —
 * für den Text-Kind-Node wiederverwendet werden kann, ohne Warnungen doppelt zu erzeugen).
 * Unbekannte Klassen landen dedupliziert in ctx.warnings.
 */
function classify(classes, ctx) {
  const result = {
    layout: 'row',
    padding: [0, 0, 0, 0],
    radius: 0,
    fill: null,
    fontSize: null,
    fontWeight: null,
    color: null,
    boxTrigger: false,
  };

  for (const cls of classes) {
    if (cls === 'flex-col') {
      result.layout = 'column';
      result.boxTrigger = true;
      continue;
    }
    if (cls === 'flex-row') {
      result.layout = 'row';
      result.boxTrigger = true;
      continue;
    }
    if (LAYOUT_CLASSES.has(cls)) {
      result.boxTrigger = true;
      continue;
    }

    const padMatch = cls.match(PADDING_RE);
    if (padMatch) {
      const value = parseFloat(padMatch[2]) * 4;
      for (const idx of SPACING_SIDES[padMatch[1]]) result.padding[idx] = value;
      result.boxTrigger = true;
      continue;
    }

    const roundedMatch = cls.match(ROUNDED_RE);
    if (roundedMatch) {
      result.radius = roundedMatch[1] ? ROUNDED_MAP[roundedMatch[1]] : 4;
      result.boxTrigger = true;
      continue;
    }

    if (cls.startsWith('bg-')) {
      const color = resolveColorClass('bg', cls.slice(3));
      if (color) {
        result.fill = color;
        result.boxTrigger = true;
        continue;
      }
    }

    if (cls.startsWith('text-')) {
      const rest = cls.slice(5);
      const color = resolveColorClass('text', rest);
      if (color) {
        result.color = color;
        continue;
      }
      const sizeMatch = cls.match(FONT_SIZE_RE);
      if (sizeMatch) {
        result.fontSize = FONT_SIZE_MAP[sizeMatch[1]];
        continue;
      }
    }

    const weightMatch = cls.match(FONT_WEIGHT_RE);
    if (weightMatch) {
      result.fontWeight = FONT_WEIGHT_MAP[weightMatch[1]];
      continue;
    }

    const gapMatch = cls.match(GAP_RE);
    if (gapMatch) {
      // Plugin-PlanBox hat (Stand Task 1) kein itemSpacing-Feld — bewusst weglassen statt raten.
      ctx.warnings.add(`gap-* wird noch nicht abgebildet (kein itemSpacing-Feld im Plan): ${cls}`);
      continue;
    }

    ctx.warnings.add(`Klasse ignoriert: ${cls}`);
  }

  return result;
}

function buildTextNode(content, classified) {
  return {
    type: 'text',
    content,
    fontSize: classified.fontSize ?? DEFAULT_FONT_SIZE,
    fontWeight: classified.fontWeight ?? DEFAULT_FONT_WEIGHT,
    color: classified.color ?? DEFAULT_TEXT_COLOR,
  };
}

function buildBoxNode(classified, children) {
  return {
    type: 'box',
    layout: classified.layout,
    padding: classified.padding,
    radius: classified.radius,
    fill: classified.fill,
    stroke: null,
    children,
  };
}

/**
 * Ein DOM-Element rekursiv in einen PlanNode übersetzen.
 *
 * Hook-Punkte für Task 3 (Hierarchie/svg/Token-Bindung) — hier andocken, ohne diese Funktion
 * umzubauen:
 *   1. SVG-Subtree-Erkennung: `if (el.tagName?.toLowerCase() === 'svg') return { type: 'svg', markup: ... }`
 *      (inkl. foreignObject-Entfernung + 20kB-Kappung).
 *   2. component-ref-Erkennung: VOR der box/text-Entscheidung gegen `ctx.knownComponents` matchen
 *      (Tag/Rolle/Klassen-Heuristik + VARIANT_WORDS) — bei Treffer `{ type:'component-ref', name,
 *      variant, fallback: <dieser Box-Nachbau> }` zurückgeben und NICHT weiter absteigen.
 *   3. Token-Bindung: `classify()` löst Farben aktuell immer als `{ hex, token: null }` auf — Task 3
 *      matcht `hex` gegen `ctx.tokens` und befüllt `token`.
 */
function convertElement(el, ctx) {
  const classes = getClasses(el);
  const classified = classify(classes, ctx);
  const elementChildren = Array.from(el.children || []);
  const isBox = elementChildren.length > 0 || classified.boxTrigger;

  if (!isBox) {
    const text = (el.textContent || '').trim();
    if (text) return buildTextNode(text, classified);
    return buildBoxNode(classified, []);
  }

  const children = [];
  for (const node of el.childNodes) {
    if (node.nodeType === 1) {
      children.push(convertElement(node, ctx));
    } else if (node.nodeType === 3) {
      const text = (node.textContent || '').trim();
      if (text) children.push(buildTextNode(text, classified));
    }
  }
  return buildBoxNode(classified, children);
}

const EMPTY_BOX = () => ({
  type: 'box',
  layout: 'row',
  padding: [0, 0, 0, 0],
  radius: 0,
  fill: null,
  stroke: null,
  children: [],
});

/**
 * @param {string} html Sanitisiertes KI-HTML.
 * @param {{ tokens?: object, knownComponents?: Array<{name: string, kind: string}> }} [options]
 * @returns {{ plan: object|null, warnings: string[] }}
 */
export function htmlToPlan(html, { tokens = {}, knownComponents = [] } = {}) {
  const warnings = new Set();
  try {
    if (typeof html !== 'string' || !html.trim()) {
      return { plan: null, warnings: [] };
    }

    const doc = new DOMParser().parseFromString(html, 'text/html');
    const roots = Array.from(doc.body?.children || []);
    if (roots.length === 0) {
      return { plan: null, warnings: [] };
    }

    const ctx = { tokens, knownComponents, warnings };
    let plan;
    if (roots.length === 1) {
      plan = convertElement(roots[0], ctx);
    } else {
      plan = { ...EMPTY_BOX(), children: roots.map((el) => convertElement(el, ctx)) };
    }

    // Der Vertrag verlangt PlanBox|null am Wurzelknoten — ein rein-textuelles Root-Element
    // (z. B. `<span>Hi</span>`) wird in eine leere Box eingepackt.
    if (plan.type !== 'box') {
      plan = { ...EMPTY_BOX(), children: [plan] };
    }

    return { plan, warnings: Array.from(warnings) };
  } catch (err) {
    return { plan: null, warnings: [`Konvertierung fehlgeschlagen: ${err?.message || String(err)}`] };
  }
}
