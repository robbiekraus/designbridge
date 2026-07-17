// Deterministischer HTML→plan-Konverter (Spec: docs/superpowers/specs/2026-07-13-scheibe3-v2-computed-style-design.md).
// v2: liest ECHTE berechnete Stile statt Tailwind-Klassennamen zu raten. Sanitisiertes KI-HTML wird
// in einen unsichtbar-aber-layoutfähigen Container im echten `document` eingehängt, dann rekursiv per
// getComputedStyle(el) gelesen. Übersetzt in den Figma-Plan-Baum (PlanBox/PlanText/PlanSvg/PlanRef,
// siehe designbridge-plugin/src/writer/parsePayload.ts). Kein Netz, kein Claude, wirft nie.
//
// v1 (DOMParser/Klassen-Raten) ist Geschichte — siehe git-History dieser Datei für die alte Fassung.
// Was UNVERÄNDERT bleibt: svg-Subtree-Passthrough, component-ref-Erkennung/Hierarchie (Port von
// server/lib/recognizeComponents.js), Token-Bindung gegen tokens.colors, Nie-Werfen-Vertrag.

import { slugify } from './slugify.js';
import { PREVIEW_VIRTUAL_WIDTH } from '../previewWidth.js';

const SVG_MAX_CHARS = 20000;
const DATA_URI_RE = /^data:/i;
const HREF_LIKE_ATTRS = ['href', 'xlink:href', 'src'];

// Port von server/lib/recognizeComponents.js — dieselben Muster, damit Web und Server dieselben
// Bausteine erkennen (Spec §Konverter Punkt 2). Bleibt klassen-/tag-basiert: component-ref-Erkennung
// ist eine Struktur-Heuristik, keine Stil-Frage, und wird von der computed-style-Umstellung nicht berührt.
const VARIANT_WORDS = ['primary', 'secondary', 'ghost', 'outline', 'danger', 'link'];
const BUTTON_CLASS_RE = /\bbtn\b|button/;
const BADGE_CLASS_RE = /badge|chip|\btag\b/;

const DEFAULT_FONT_SIZE = 16;
const DEFAULT_FONT_WEIGHT = 400;

const JUSTIFY_MAP = {
  'flex-start': 'MIN',
  start: 'MIN',
  left: 'MIN',
  normal: 'MIN',
  center: 'CENTER',
  'flex-end': 'MAX',
  end: 'MAX',
  right: 'MAX',
  'space-between': 'SPACE_BETWEEN',
};

const ALIGN_ITEMS_MAP = {
  'flex-start': 'MIN',
  start: 'MIN',
  center: 'CENTER',
  'flex-end': 'MAX',
  end: 'MAX',
  stretch: 'CENTER',
  baseline: 'CENTER',
  normal: 'CENTER',
};

const TEXT_ALIGN_MAP = {
  left: 'left',
  start: 'left',
  right: 'right',
  end: 'right',
  center: 'center',
};

function getClasses(el) {
  const raw = typeof el.className === 'string' ? el.className : el.getAttribute?.('class') || '';
  return raw.split(/\s+/).filter(Boolean);
}

/** "12px" → 12, gerundet. Nicht-parsbar/leer → 0 (Default für Padding/Gap/Border). */
function pxOr0(value) {
  const n = parseFloat(value);
  return Number.isFinite(n) ? Math.round(n) : 0;
}

/** "12px" → 12, gerundet. Nicht-parsbar/leer → null (Default für width/height/lineHeight). */
function pxOrNull(value) {
  const n = parseFloat(value);
  return Number.isFinite(n) ? Math.round(n) : null;
}

/** rgb()/rgba() (wie getComputedStyle sie liefert) → Hex, lowercase. Voll-transparent
 *  (alpha 0) oder 'transparent'/leer → null (Spec §Mapping: background-color). */
function normalizeColor(value) {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim().toLowerCase();
  if (trimmed === '' || trimmed === 'transparent') return null;
  const match = trimmed.match(/^rgba?\(([^)]+)\)$/);
  if (!match) return null;
  const parts = match[1].split(',').map((p) => parseFloat(p.trim()));
  const [r, g, b, a = 1] = parts;
  if (![r, g, b].every(Number.isFinite)) return null;
  if (Number.isFinite(a) && a === 0) return null;
  const toHex = (n) => Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, '0');
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

/** Hex case-insensitiv gegen ctx.tokens.colors matchen. Zwei Shapes werden unterstützt:
 *  - { hex, name } — bereits disambiguierter Name, wie emitFigmaComponents.js ihn aus
 *    normalizeTokens(raw.tokens) durchreicht (assignNames vergibt bei Kollision primary/primary-2/…,
 *    siehe web/src/lib/emit/normalizeTokens.js). Dieser Name MUSS 1:1 zurückgegeben werden, sonst
 *    bindet applyFill im Plugin an den falschen (ersten) DesignBridge/Color/<name>-Style, weil ein
 *    erneutes slugify(role) die Kollisions-Suffixe verliert (Review-Fix: silent wrong-color bind).
 *  - { hex, role } — Rohform (z. B. direkt in Tests), Rückwärtskompatibilität: role wird slugifiziert.
 *  Kein Treffer → null. Verhalten identisch zu v1 (Spec §Token-Rückbindung), nur Eingabe ist jetzt
 *  rgb→hex statt Tailwind-Arbitrary-Hex. */
function matchColorToken(hex, ctx) {
  const list = Array.isArray(ctx?.tokens?.colors) ? ctx.tokens.colors : [];
  const found = list.find((t) => typeof t?.hex === 'string' && t.hex.toLowerCase() === hex.toLowerCase());
  if (!found) return null;
  if (typeof found.name === 'string' && found.name) return found.name;
  return slugify(found.role) || null;
}

/** Hex → vollständige ColorRef inkl. Token-Rückbindung. null-Hex bleibt null (kein fill/keine Farbe). */
function resolveColorRef(hex, ctx) {
  if (hex == null) return null;
  return { hex, token: matchColorToken(hex, ctx) };
}

function normalizeFontWeight(value) {
  if (value == null) return DEFAULT_FONT_WEIGHT;
  const str = String(value).trim().toLowerCase();
  if (str === 'normal') return 400;
  if (str === 'bold') return 700;
  const n = parseInt(str, 10);
  return Number.isFinite(n) ? n : DEFAULT_FONT_WEIGHT;
}

function normalizeTextAlign(value) {
  const key = typeof value === 'string' ? value.trim().toLowerCase() : '';
  return TEXT_ALIGN_MAP[key] ?? 'left';
}

/** line-height computed-Wert → px-Zahl oder null (Spec: 'normal' → null). Nur px-Werte werden
 *  interpretiert (unitless Multiplikatoren lösen echte Browser bereits vor getComputedStyle in px
 *  auf; jsdom tut das nicht — Spec §jsdom-Testgrenze). */
function normalizeLineHeight(value) {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim().toLowerCase();
  if (trimmed === '' || trimmed === 'normal') return null;
  if (trimmed.endsWith('px')) return pxOrNull(trimmed);
  const n = parseFloat(trimmed);
  return Number.isFinite(n) ? Math.round(n) : null;
}

/** display: flex/inline-flex/grid/inline-grid → true. Nur dann sind justify-content/align-items/
 *  flex-direction/gap überhaupt aussagekräftig (Spec §Mapping). */
function isFlexLike(display) {
  return typeof display === 'string' && /flex|grid/.test(display);
}

// Fix E (Testrunde 7, Spec §Fix E): CSS-Table-Displays, die ihre Kinder ZEILENWEISE stapeln
// (table selbst sowie die drei row-group-Varianten thead/tbody/tfoot) → 'column'. `table-row`
// dagegen ordnet seine Zellen HORIZONTAL nebeneinander an → 'row'. jsdom liefert diese Werte
// als UA-Default nativ über getComputedStyle (empirisch mit jsdom 29 geprüft, kein Raten nötig:
// table→"table", thead→"table-header-group", tbody→"table-row-group", tfoot→
// "table-footer-group", tr→"table-row", th/td→"table-cell"). `table-cell` ist bewusst NICHT
// hier gelistet — eine Zelle ist strukturell ein normaler Block-Container und fällt auf den
// Block-Default weiter unten durch (Element-Kinder → column, sonst row/Leaf), genau wie vor Fix E.
const TABLE_COLUMN_GROUP_DISPLAYS = new Set([
  'table',
  'inline-table',
  'table-row-group',
  'table-header-group',
  'table-footer-group',
]);

/** Fix 6 (Testrunde 6, Spec §Fix 6): computed flex/grid → wie bisher entscheidet flexDirection
 *  row/column. NICHT-flex Container MIT Element-Kindern sind Block-Flow und stapeln ihre Kinder
 *  im Browser vertikal → 'column' (vorher fälschlich 'row', das im Figma-Plugin ein HORIZONTAL-
 *  Auto-Layout erzeugte und Inhalte wegclippte). Elemente OHNE Element-Kinder bleiben bei 'row'
 *  (unkritisch — werden ohnehin zu Text/Leaf-Boxen ohne Kinder zum Anordnen). `hasElementChildren`
 *  wird von den Aufrufstellen übergeben (el.children.length > 0), damit readLayout selbst kein
 *  DOM-Element braucht.
 *
 *  Fix E (Testrunde 7, Spec §Fix E): der Block-Default oben behandelte JEDEN Nicht-Flex-Container
 *  mit Element-Kindern gleich — auch <tr>, dessen computed display 'table-row' ist. Das plante
 *  jede Tabellenzeile als eigene Spalte, und eine ganze Tabelle kam als vertikaler Turm aus
 *  Einzelzellen an (Live-Befund: Figma-Datei `test1707 -3`, Reports Table H=2199px). Die
 *  CSS-Table-Displays werden deshalb VOR dem Block-Default explizit gemappt (s. oben).
 *
 *  Bekannte Grenze (dokumentiert, nicht gefixt — Spec §Fix E): jede Zeile (tr) wird unabhängig
 *  geplant, ihre Zellen bekommen kein gemeinsames Spaltenraster — Spaltenbreiten sind je Zeile
 *  HUG (aus dem jeweiligen Zell-Inhalt), nicht über alle Zeilen ausgerichtet. Reale Tabellen mit
 *  exakt fluchtenden Spalten brauchen ein eigenes Spalten-Layout-Konzept (eigene Scheibe). */
function readLayout(computed, hasElementChildren) {
  if (isFlexLike(computed.display)) {
    if (computed.flexDirection === 'column' || computed.flexDirection === 'column-reverse') return 'column';
    return 'row';
  }
  const display = computed.display;
  if (display === 'table-row') return 'row';
  if (TABLE_COLUMN_GROUP_DISPLAYS.has(display)) return 'column';
  return hasElementChildren ? 'column' : 'row';
}

function readAlignment(computed) {
  if (!isFlexLike(computed.display)) return { primaryAlign: 'MIN', counterAlign: 'CENTER' };
  return {
    primaryAlign: JUSTIFY_MAP[computed.justifyContent] ?? 'MIN',
    counterAlign: ALIGN_ITEMS_MAP[computed.alignItems] ?? 'CENTER',
  };
}

/** gap (Spec §Mapping: gap/column-gap (px) → gap). Primärachse bestimmt, welcher Shorthand-Teil
 *  zählt: row-Layout → column-gap (horizontaler Abstand), column-Layout → row-gap (vertikal). */
function readGap(computed, layout) {
  const raw = layout === 'column' ? computed.rowGap : computed.columnGap;
  return pxOr0(raw);
}

/** border-radius (Spec §Mapping: erster Wert, 9999-Kappung für „full"). */
function readRadius(computed) {
  const raw = pxOr0(computed.borderTopLeftRadius);
  return Math.min(raw, 9999);
}

/** background-color (Spec §Mapping: rgb→hex, dann Token-Rückbindung; transparent → null). */
function readFill(computed, ctx) {
  return resolveColorRef(normalizeColor(computed.backgroundColor), ctx);
}

/** border-*-width + border-*-color → stroke + strokeWeight (Spec §Mapping: sichtbarer Rahmen,
 *  width>0 und nicht transparent). strokeWeight-Default bleibt 1, wenn kein Rahmen sichtbar ist
 *  (Vertrag: strokeWeight nur wirksam, wenn stroke !== null). */
function readBorder(computed, ctx) {
  const widths = [computed.borderTopWidth, computed.borderRightWidth, computed.borderBottomWidth, computed.borderLeftWidth].map(pxOr0);
  const colors = [computed.borderTopColor, computed.borderRightColor, computed.borderBottomColor, computed.borderLeftColor];
  const idx = widths.findIndex((w) => w > 0);
  if (idx === -1) return { stroke: null, strokeWeight: 1 };
  const hex = normalizeColor(colors[idx]);
  if (hex == null) return { stroke: null, strokeWeight: 1 };
  return { stroke: resolveColorRef(hex, ctx), strokeWeight: widths[idx] || 1 };
}

/** width/height (Spec §Mapping: NUR wenn das Element eine vom Content abweichende, gesetzte Größe
 *  hat — Heuristik: expliziter Inline-Style oder Flex-Basis; sonst null=HUG). Bewusst konservativ
 *  (Spec §Risiken „Über-Fixierung"): Größe aus einer CSS-Klasse/Kaskade (statt Inline-Style) zählt
 *  NICHT als „gesetzt" — sonst würde praktisch jede Box starr. */
function readSize(el, computed, layout) {
  const inlineWidth = el.style?.width;
  const inlineHeight = el.style?.height;
  const hasInlineWidth = !!inlineWidth && inlineWidth !== 'auto';
  const hasInlineHeight = !!inlineHeight && inlineHeight !== 'auto';

  const flexBasis = computed.flexBasis;
  const hasFlexBasis = isFlexLike(computed.display) && !!flexBasis && flexBasis !== 'auto' && flexBasis !== '0%' && flexBasis !== 'content';

  let width = null;
  let height = null;
  if (hasInlineWidth || (hasFlexBasis && layout !== 'column')) width = pxOrNull(computed.width);
  if (hasInlineHeight || (hasFlexBasis && layout === 'column')) height = pxOrNull(computed.height);
  return { width, height };
}

/** Entscheidet, ob ein Blatt-Element (keine Kind-ELEMENTE) trotzdem eine Box werden soll, weil es
 *  sichtbare Box-Stile trägt (Padding/Radius/Fill/Rahmen/Flex-Grid-Display/gesetzte Größe) — Ersatz
 *  für v1s klassenbasiertes `boxTrigger`, jetzt aus berechneten Stilen abgeleitet (Spec §Mapping). */
function hasBoxTrigger(el, computed) {
  if (isFlexLike(computed.display)) return true;
  if (['paddingTop', 'paddingRight', 'paddingBottom', 'paddingLeft'].some((p) => pxOr0(computed[p]) > 0)) return true;
  if (readRadius(computed) > 0) return true;
  if (normalizeColor(computed.backgroundColor) != null) return true;
  if ([computed.borderTopWidth, computed.borderRightWidth, computed.borderBottomWidth, computed.borderLeftWidth].some((w) => pxOr0(w) > 0)) return true;
  const { width, height } = readSize(el, computed, readLayout(computed, el.children.length > 0));
  if (width != null || height != null) return true;
  return false;
}

function buildTextNode(text, computed, ctx) {
  return {
    type: 'text',
    content: text,
    fontSize: pxOrNull(computed.fontSize) ?? DEFAULT_FONT_SIZE,
    fontWeight: normalizeFontWeight(computed.fontWeight),
    color: resolveColorRef(normalizeColor(computed.color) ?? '#000000', ctx),
    align: normalizeTextAlign(computed.textAlign),
    lineHeight: normalizeLineHeight(computed.lineHeight),
  };
}

function buildBoxNode(el, computed, children, ctx) {
  const layout = readLayout(computed, el.children.length > 0);
  const { primaryAlign, counterAlign } = readAlignment(computed);
  const { stroke, strokeWeight } = readBorder(computed, ctx);
  const { width, height } = readSize(el, computed, layout);
  return {
    type: 'box',
    layout,
    padding: [
      pxOr0(computed.paddingTop),
      pxOr0(computed.paddingRight),
      pxOr0(computed.paddingBottom),
      pxOr0(computed.paddingLeft),
    ],
    radius: readRadius(computed),
    fill: readFill(computed, ctx),
    stroke,
    strokeWeight,
    gap: readGap(computed, layout),
    width,
    height,
    primaryAlign,
    counterAlign,
    children,
  };
}

/** Synthetische, stillos Box für Wrapper-Fälle (Mehrfach-Root, non-box-Root, PlanRef-Fallback-Text) —
 *  trägt trotzdem alle Vertragsfelder mit ihren Defaults (Spec §Vertrags-Erweiterung). */
function emptyBoxNode(children = []) {
  return {
    type: 'box',
    layout: 'row',
    padding: [0, 0, 0, 0],
    radius: 0,
    fill: null,
    stroke: null,
    strokeWeight: 1,
    gap: 0,
    width: null,
    height: null,
    primaryAlign: 'MIN',
    counterAlign: 'CENTER',
    children,
  };
}

/** PlanRef.fallback muss laut Vertrag PlanBox|null sein (parsePayload.parseRefNode nutzt den
 *  Box-Parser) — ein rein-textuelles Subtree-Ergebnis wird wie am plan-Root in eine Box gepackt. */
function ensureBox(node) {
  if (node.type === 'box') return node;
  return { ...emptyBoxNode(), children: [node] };
}

function isSvgElement(el) {
  return (el.tagName || '').toLowerCase() === 'svg';
}

/** true, wenn der Attributwert eine ECHT EXTERNE Ressourcen-Referenz ist — deckt http(s):,
 *  protokoll-relative (//) und jeden anderen Remote-Scheme ab. Security-Hardening: importiertes
 *  KI-HTML/SVG darf keine Remote-Requests aus Figma triggern, UND (v2, neu) keine Remote-Requests
 *  beim Offscreen-Mount ins Live-DOM auslösen (der Browser lädt Ressourcen echter, angehängter
 *  Elemente tatsächlich nach — anders als beim v1-DOMParser-Dokument, das nie angehängt wurde).
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
 *  entfernen. `<image>` mit externer Quelle wird komplett entfernt (ein Bild ohne Quelle ist
 *  nutzlos); auf allen anderen Elementen wird nur das betroffene Attribut entfernt (z. B.
 *  `<use xlink:href="...">` bleibt als Element erhalten). Jeder Fund erzeugt eine Warnung statt
 *  fatal zu sein — Konverter wirft nie. */
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

/** SVG-Subtree → PlanSvg. Markup verbatim (inkl. eigener Tags/Attribute), `<foreignObject>` vorher
 *  entfernt (kann beliebiges HTML/CSS enthalten, das Figma nicht rendert), externe Ressourcen-Refs
 *  entfernt (Defense-in-Depth — der Live-Baum wurde bereits vor dem Mounten gestrippt, s.
 *  htmlToPlan(); hier zusätzlich auf dem Klon, falls der Knoten nachträglich verändert wurde),
 *  >20000 Zeichen gekappt + Warnung statt fatal. */
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
 * Bleibt unverändert klassenbasiert — Struktur-Erkennung, keine Stil-Frage.
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

/** Der eigentliche box/text-Nachbau — ausgelagert, damit sowohl der normale Pfad als auch der
 *  component-ref-Fallback (Spec §Konverter Punkt 2) ihn nutzen können. Liest getComputedStyle(el)
 *  (Live-DOM, im echten `document` gemountet — Spec §Kernidee). */
function buildNormalNode(el, ctx) {
  const computed = getComputedStyle(el);
  const elementChildren = Array.from(el.children || []);
  const isBox = elementChildren.length > 0 || hasBoxTrigger(el, computed);

  if (!isBox) {
    const text = (el.textContent || '').trim();
    if (text) return buildTextNode(text, computed, ctx);
    return buildBoxNode(el, computed, [], ctx);
  }

  const children = [];
  for (const node of el.childNodes) {
    if (node.nodeType === 1) {
      children.push(convertElement(node, ctx));
    } else if (node.nodeType === 3) {
      const text = (node.textContent || '').trim();
      // Loser Textknoten hat kein eigenes Element → erbt die berechneten Font-Stile seines
      // Eltern-Elements (dieselbe Semantik wie v1, das die Eltern-classified-Werte wiederverwendete).
      if (text) children.push(buildTextNode(text, computed, ctx));
    }
  }
  return buildBoxNode(el, computed, children, ctx);
}

/**
 * Ein DOM-Element rekursiv in einen PlanNode übersetzen. Reihenfolge (Spec §Konverter):
 *   1. SVG-Subtree → PlanSvg, kein weiterer Abstieg.
 *   2. Bekannter Baustein (component-ref) → PlanRef mit Box/Text-Fallback, kein weiterer Abstieg
 *      IN DEN HAUPTBAUM (der Fallback selbst baut normal weiter — das ist, was Organismen dazu
 *      bringt, Moleküle/Atome zu referenzieren: der Matcher läuft bei jedem Kind erneut).
 *   3. Sonst normaler box/text-Nachbau (jetzt aus getComputedStyle statt Klassen-Raten).
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
  let container = null;
  try {
    if (typeof html !== 'string' || !html.trim()) {
      return { plan: null, warnings: [] };
    }

    // Container OFF-SCREEN aber NICHT display:none/visibility:hidden — sonst löst der Browser
    // Layout (Flex/%) nicht auf (Spec §Kernidee Schritt 1). Breite = PREVIEW_VIRTUAL_WIDTH, dieselbe
    // virtuelle Breite, mit der InterpretedPreview.jsx die Vorschaukarte rendert (Vertrag: WYSIWYG —
    // was die Vorschau zeigt, kommt so in Figma an, siehe Spec Testrunde 8 §Fix 1).
    container = document.createElement('div');
    container.style.position = 'absolute';
    container.style.top = '0px';
    container.style.left = '-99999px';
    container.style.width = `${PREVIEW_VIRTUAL_WIDTH}px`;
    container.style.boxSizing = 'border-box';
    container.innerHTML = html;

    // Sicherheits-Härtung VOR dem Einhängen (Spec §Kernidee Schritt 1): externe Refs im gesamten
    // SVG-Subtree strippen, solange der Container noch nicht im Live-`document` hängt — sobald er
    // angehängt ist, versucht der Browser tatsächlich, Ressourcen echter Elemente nachzuladen
    // (anders als beim v1-DOMParser-Dokument, das nie angehängt wurde).
    for (const svg of Array.from(container.querySelectorAll('svg'))) {
      stripExternalRefs(svg, { warnings });
    }

    document.body.appendChild(container);

    const roots = Array.from(container.children);
    if (roots.length === 0) {
      return { plan: null, warnings: Array.from(warnings) };
    }

    const ctx = { tokens, knownComponents, warnings };
    let plan;
    if (roots.length === 1) {
      plan = convertElement(roots[0], ctx);
    } else {
      plan = { ...emptyBoxNode(), children: roots.map((el) => convertElement(el, ctx)) };
    }

    // Der Vertrag verlangt PlanBox|null am Wurzelknoten — ein rein-textuelles Root-Element
    // (z. B. `<span>Hi</span>`) wird in eine leere Box eingepackt.
    if (plan.type !== 'box') {
      plan = { ...emptyBoxNode(), children: [plan] };
    }

    return { plan, warnings: Array.from(warnings) };
  } catch (err) {
    return { plan: null, warnings: [`Konvertierung fehlgeschlagen: ${err?.message || String(err)}`] };
  } finally {
    // Container IMMER entfernen — auch im Fehlerfall (Spec §Kernidee Schritt 4). Kein Leck ins
    // sichtbare Live-DOM, egal was oben passiert ist.
    container?.remove();
  }
}
