// Deterministischer HTML→plan-Konverter (Spec: docs/superpowers/specs/2026-07-13-scheibe3-figma-export-design.md, §Konverter).
// Übersetzt sanitisiertes KI-HTML in den Figma-Plan-Baum (PlanBox/PlanText/PlanSvg/PlanRef, siehe
// designbridge-plugin/src/writer/parsePayload.ts). Kein Netz, kein Claude, wirft nie.
//
// Task 2 (Kern): Tailwind-Subset-Mapping für box/text.
// Task 3 (diese Erweiterung): svg-Subtrees, component-ref-Erkennung/Hierarchie (Port der
// server/lib/recognizeComponents.js-Heuristik), Token-Bindung gegen tokens.colors.

import { slugify } from './slugify.js';

const SVG_MAX_CHARS = 20000;
const DATA_URI_RE = /^data:/i;
const HREF_LIKE_ATTRS = ['href', 'xlink:href', 'src'];

// Port von server/lib/recognizeComponents.js — dieselben Muster, damit Web und Server
// dieselben Bausteine erkennen (Spec §Konverter Punkt 2).
const VARIANT_WORDS = ['primary', 'secondary', 'ghost', 'outline', 'danger', 'link'];
const BUTTON_CLASS_RE = /\bbtn\b|button/;
const BADGE_CLASS_RE = /badge|chip|\btag\b/;

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

/** Farb-Utility-Klasse (bg-* oder text-*) auflösen. Arbitrary-Hex immer, benannt nur white/black.
 *  Liefert rohes Hex — Token-Bindung passiert separat in resolveColor() (siehe unten), damit
 *  dieselbe Auflösung sowohl für bg-* (fill) als auch text-* (color) die Tokens matcht. */
function resolveRawColor(rest) {
  const arbitrary = rest.match(ARBITRARY_HEX_RE);
  if (arbitrary) return arbitrary[1];
  if (NAMED_COLORS[rest]) return NAMED_COLORS[rest];
  return null;
}

/** Hex case-insensitiv gegen ctx.tokens.colors matchen. Zwei Shapes werden unterstützt:
 *  - { hex, name } — bereits disambiguierter Name, wie emitFigmaComponents.js ihn aus
 *    normalizeTokens(raw.tokens) durchreicht (assignNames vergibt bei Kollision primary/primary-2/…,
 *    siehe web/src/lib/emit/normalizeTokens.js). Dieser Name MUSS 1:1 zurückgegeben werden, sonst
 *    bindet applyFill im Plugin an den falschen (ersten) DesignBridge/Color/<name>-Style, weil ein
 *    erneutes slugify(role) die Kollisions-Suffixe verliert (Review-Fix: silent wrong-color bind).
 *  - { hex, role } — Rohform (z. B. direkt in Tests), Rückwärtskompatibilität: role wird slugifiziert.
 *  Kein Treffer → null. Spec §Konverter Punkt 5. */
function matchColorToken(hex, ctx) {
  const list = Array.isArray(ctx?.tokens?.colors) ? ctx.tokens.colors : [];
  const found = list.find((t) => typeof t?.hex === 'string' && t.hex.toLowerCase() === hex.toLowerCase());
  if (!found) return null;
  if (typeof found.name === 'string' && found.name) return found.name;
  return slugify(found.role) || null;
}

/** Farb-Utility-Klasse auflösen UND gegen Tokens binden — exakte ColorRef-Shape für applyFill. */
function resolveColorClass(rest, ctx) {
  const hex = resolveRawColor(rest);
  if (hex === null) return null;
  return { hex, token: matchColorToken(hex, ctx) };
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
      const color = resolveColorClass(cls.slice(3), ctx);
      if (color) {
        result.fill = color;
        result.boxTrigger = true;
        continue;
      }
    }

    if (cls.startsWith('text-')) {
      const rest = cls.slice(5);
      const color = resolveColorClass(rest, ctx);
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

const EMPTY_BOX = () => ({
  type: 'box',
  layout: 'row',
  padding: [0, 0, 0, 0],
  radius: 0,
  fill: null,
  stroke: null,
  children: [],
});

/** PlanRef.fallback muss laut Vertrag PlanBox|null sein (parsePayload.parseRefNode nutzt den
 *  Box-Parser) — ein rein-textuelles Subtree-Ergebnis wird wie am plan-Root in eine Box gepackt. */
function ensureBox(node) {
  if (node.type === 'box') return node;
  return { ...EMPTY_BOX(), children: [node] };
}

function isSvgElement(el) {
  return (el.tagName || '').toLowerCase() === 'svg';
}

/** true, wenn der Attributwert eine ECHT EXTERNE Ressourcen-Referenz ist — deckt http(s):,
 *  protokoll-relative (//) und jeden anderen Remote-Scheme ab. Security-Hardening (Review-Fix):
 *  importiertes KI-HTML/SVG darf keine Remote-Requests aus Figma triggern.
 *  Bewusst NICHT extern (bleiben erhalten): `data:`-URIs und reine Fragment-Refs (mit `#`),
 *  die interne SVG-Verweise sind — z. B. `<use href="#grad1">`/`fill="url(#grad1)"` in Chart-SVGs
 *  auf lokale Gradienten/clipPaths. Diese zu strippen würde genau die SVGs brechen, die wir erhalten wollen. */
function isExternalRef(value) {
  if (typeof value !== 'string') return false;
  const trimmed = value.trim();
  if (trimmed === '') return false;
  if (trimmed.startsWith('#')) return false;
  return !DATA_URI_RE.test(trimmed);
}

/** Externe Ressourcen-Referenzen (href/xlink:href/src ohne data:-URI) aus dem SVG-Subtree
 *  entfernen, bevor das Markup als PlanSvg emittiert wird (Spec-Erweiterung, Review-Fix:
 *  SSRF/Remote-Leak-Härtung). `<image>` mit externer Quelle wird komplett entfernt (ein Bild
 *  ohne Quelle ist nutzlos); auf allen anderen Elementen wird nur das betroffene Attribut
 *  entfernt (z. B. `<use xlink:href="...">` bleibt als Element erhalten). Jeder Fund erzeugt
 *  eine Warnung statt fatal zu sein — Konverter wirft nie (Spec §Konverter). */
function stripExternalRefs(root, ctx) {
  const elements = [root, ...(root.querySelectorAll ? Array.from(root.querySelectorAll('*')) : [])];
  for (const el of elements) {
    const tag = (el.tagName || '').toLowerCase();
    for (const attr of HREF_LIKE_ATTRS) {
      if (!el.hasAttribute?.(attr)) continue;
      const value = el.getAttribute(attr);
      if (!isExternalRef(value)) continue;
      if (tag === 'image') {
        el.remove();
        ctx.warnings.add(`SVG: <image> mit externer Quelle entfernt (${attr}="${value}").`);
        break; // Element ist weg — restliche Attribute dieses Elements nicht mehr prüfen.
      }
      el.removeAttribute(attr);
      ctx.warnings.add(`SVG: externe Ressourcen-Referenz entfernt (<${tag} ${attr}="${value}">).`);
    }
  }
}

/** SVG-Subtree → PlanSvg (Spec §Konverter Punkt 3). Markup verbatim (inkl. eigener Tags/Attribute),
 *  `<foreignObject>` vorher entfernt (kann beliebiges HTML/CSS enthalten, das Figma nicht rendert),
 *  externe Ressourcen-Refs entfernt (Review-Fix, s. stripExternalRefs), >20000 Zeichen gekappt +
 *  Warnung statt fatal. */
function convertSvgElement(el, ctx) {
  const clone = el.cloneNode(true);
  for (const fo of Array.from(clone.querySelectorAll?.('foreignObject') || [])) {
    fo.remove();
  }
  stripExternalRefs(clone, ctx);
  let markup = clone.outerHTML;
  if (markup.length > SVG_MAX_CHARS) {
    markup = markup.slice(0, SVG_MAX_CHARS);
    ctx.warnings.add(`SVG-Markup > ${SVG_MAX_CHARS} Zeichen — gekappt.`);
  }
  return { type: 'svg', markup };
}

/**
 * Bekannten Baustein-Namen für ein Element ermitteln (Port von server/lib/recognizeComponents.js —
 * Tag/Rolle/Klassen-Heuristik, dieselbe Reihenfolge: Button vor Suche vor Input vor Badge).
 * Liefert nur den Kandidaten-Namen/-Variante; ob er tatsächlich als component-ref gilt, hängt von
 * `ctx.knownComponents` ab (Spec §Konverter Punkt 2: nur exportierte Bausteine dürfen referenziert werden).
 */
function matchKnownComponent(el) {
  const tag = (el.tagName || '').toLowerCase();
  const classes = getClasses(el);
  const classStr = classes.join(' ').toLowerCase();
  const role = (el.getAttribute?.('role') || '').toLowerCase();
  const type = (el.getAttribute?.('type') || '').toLowerCase();

  if (tag === 'button' || role === 'button' || (tag === 'a' && BUTTON_CLASS_RE.test(classStr))) {
    const variant = VARIANT_WORDS.find((w) => classStr.includes(w)) ?? null;
    return { name: 'Button', variant };
  }

  if ((tag === 'input' && type === 'search') || role === 'search') {
    return { name: 'Suche', variant: null };
  }

  if ((tag === 'input' && type !== 'search') || tag === 'textarea' || tag === 'select') {
    return { name: 'Input', variant: null };
  }

  if (BADGE_CLASS_RE.test(classStr)) {
    return { name: 'Badge', variant: null };
  }

  return null;
}

/** Der eigentliche box/text-Nachbau (Task-2-Kernlogik) — ausgelagert, damit sowohl der normale
 *  Pfad als auch der component-ref-Fallback (Spec §Konverter Punkt 2) ihn nutzen können. */
function buildNormalNode(el, ctx) {
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

/**
 * Ein DOM-Element rekursiv in einen PlanNode übersetzen. Reihenfolge (Spec §Konverter):
 *   1. SVG-Subtree → PlanSvg, kein weiterer Abstieg.
 *   2. Bekannter Baustein (component-ref) → PlanRef mit Box/Text-Fallback, kein weiterer Abstieg
 *      IN DEN HAUPTBAUM (der Fallback selbst baut normal weiter — das ist, was Organismen dazu
 *      bringt, Moleküle/Atome zu referenzieren: der Matcher läuft bei jedem Kind erneut).
 *   3. Sonst normaler box/text-Nachbau (Task 2).
 */
function convertElement(el, ctx) {
  if (isSvgElement(el)) return convertSvgElement(el, ctx);

  const match = matchKnownComponent(el);
  if (match && ctx.knownComponents.some((c) => c.name === match.name)) {
    return { type: 'component-ref', name: match.name, variant: match.variant, fallback: ensureBox(buildNormalNode(el, ctx)) };
  }

  return buildNormalNode(el, ctx);
}

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
