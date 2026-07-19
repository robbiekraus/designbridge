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
import { PREVIEW_VIRTUAL_WIDTH, PREVIEW_VIRTUAL_HEIGHT } from '../previewWidth.js';

// Composition-Splice (Spec: docs/superpowers/specs/2026-07-18-composition-splice-parent-fidelity-
// design.md §1): Schwelle für „genug räumliche Überlappung, um ein Kind als component-ref-Instanz
// an Ort und Stelle zu splicen" statt es normal nachzubauen. Per Test kalibriert (Spec §Bewusste
// Grenzen).
export const SPLICE_MIN_IOU = 0.35;

// Composition-Splice v2 — Text-Anker-Matching (Spec: docs/superpowers/specs/2026-07-19-splice-
// text-anchor-matching-design.md §2): Schwelle für Token-Jaccard zwischen den Anker-Tokens eines
// Splice-Ziels und den Subtree-Tokens eines Kandidaten-Elements. Läuft als Phase 1 VOR dem
// IoU-Matching (s. computeSpliceAssignment). Beleg (Spec-Kopf): echte Treffer 1.0, echtes
// Rauschen ≤ 0.1 — 0.5 lässt Puffer für leicht abweichende Zahlen/Formatierungen zwischen zwei
// Gemini-Läufen, ohne echtes Rauschen durchzulassen.
export const SPLICE_MIN_TEXT = 0.5;

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

// Pattern-Fidelity-Scheibe „Stretch & Grow" (Spec 2026-07-18, §Vertrag): stretch/normal (CSS-
// Default von align-items, kein exotischer Sonderfall!) mappte bisher fälschlich auf CENTER — der
// Browser richtet Flex-Kinder ohne explizites align-items aber am Start der Gegenachse aus bzw.
// STRECKT sie über sie. baseline bleibt bewusst CENTER (kein Gegenstück im Plan-Vertrag).
const ALIGN_ITEMS_MAP = {
  'flex-start': 'MIN',
  start: 'MIN',
  center: 'CENTER',
  'flex-end': 'MAX',
  end: 'MAX',
  stretch: 'MIN',
  baseline: 'CENTER',
  normal: 'MIN',
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

// Pattern-Fidelity-Scheibe „Stretch & Grow" (Spec §Vertrag): Nicht-Flex-Container mappten bisher
// auf counterAlign CENTER — Block-Flow-Kinder werden im Browser aber am Start ausgerichtet/
// gestreckt, nie zufällig zentriert. Ändert bewusst auch Bestands-Pläne (Browser-Wahrheit).
function readAlignment(computed) {
  if (!isFlexLike(computed.display)) return { primaryAlign: 'MIN', counterAlign: 'MIN' };
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
 *  NICHT als „gesetzt" — sonst würde praktisch jede Box starr.
 *
 *  Pattern-Fidelity-Scheibe „Stretch & Grow" (Spec §Erkennung Punkt 5): Inline `width:100%`/
 *  `height:100%` auf einem NICHT-Wurzel-Element wird nicht mehr als px eingefroren (der Wert wäre
 *  ohnehin nur der unaufgelöste "100%"-String, s. jsdom-Testgrenze oben) — die Achse bleibt null
 *  (HUG), das eigentliche „Füllen" übernimmt `stretch`/`grow` (readStretchGrow). Andere Prozentwerte
 *  (z. B. `width:50%`) bleiben unverändert beim bisherigen px-Freeze. Wurzeln sind ausgenommen
 *  (`isRoot`): deren `100%` friert weiterhin px ein (Testrunde-8-Vertrag, WYSIWYG mit der
 *  1024px-Mess-Breite) — MIT EINER AUSNAHME (Fix A, Rob 18.07. abends): überragt der Inhalt diese
 *  geclampte Breite (`el.scrollWidth` > gemessene `computed.width`, z. B. eine Kartenreihe breiter
 *  als die 1024px-Mess-Breite), zählt für die WURZEL die tatsächliche Inhaltsbreite — sonst würde
 *  das Plugin (`clipsContent = width !== null`) den überragenden Teil abschneiden (Energy-/
 *  Category-Karte, Reports-Spalten verschwinden). Kein Überlauf (`scrollWidth <= computed.width`)
 *  → Wert bleibt wie bisher unverändert. */
function readSize(el, computed, layout, isRoot) {
  const inlineWidth = el.style?.width || '';
  const inlineHeight = el.style?.height || '';
  const hasInlineWidth = !!inlineWidth && inlineWidth !== 'auto';
  const hasInlineHeight = !!inlineHeight && inlineHeight !== 'auto';
  const widthIs100 = hasInlineWidth && inlineWidth.trim() === '100%';
  const heightIs100 = hasInlineHeight && inlineHeight.trim() === '100%';

  const flexBasis = computed.flexBasis;
  const hasFlexBasis = isFlexLike(computed.display) && !!flexBasis && flexBasis !== 'auto' && flexBasis !== '0%' && flexBasis !== 'content';

  let width = null;
  let height = null;
  if (hasInlineWidth && widthIs100 && !isRoot) {
    width = null;
  } else if (hasInlineWidth || (hasFlexBasis && layout !== 'column')) {
    width = pxOrNull(computed.width);
    if (isRoot && width != null) {
      const scrollWidth = Math.round(el.scrollWidth || 0);
      if (scrollWidth > width) width = scrollWidth;
    }
  }
  if (hasInlineHeight && heightIs100 && !isRoot) {
    height = null;
  } else if (hasInlineHeight || (hasFlexBasis && layout === 'column')) {
    height = pxOrNull(computed.height);
  }
  return { width, height };
}

/** Entscheidet, ob ein Blatt-Element (keine Kind-ELEMENTE) trotzdem eine Box werden soll, weil es
 *  sichtbare Box-Stile trägt (Padding/Radius/Fill/Rahmen/Flex-Grid-Display/gesetzte Größe) — Ersatz
 *  für v1s klassenbasiertes `boxTrigger`, jetzt aus berechneten Stilen abgeleitet (Spec §Mapping).
 *
 *  Pattern-Fidelity-Scheibe „Stretch & Grow" (Spec §Erkennung Punkt 5): die readSize()-Abfrage hier
 *  ruft bewusst IMMER mit `isRoot=true` auf — unabhängig vom tatsächlichen `isRoot` des Elements.
 *  Diese Stelle beantwortet nur „hat das Element überhaupt eine explizit gesetzte Größe (statt
 *  HUG)?", nicht „welcher px-Wert kommt am Ende raus?". Ein Inline-`width:100%`/`height:100%` ist
 *  so eine Größenabsicht — auch wenn sie sich (bei echten Nicht-Wurzeln) später zu stretch/grow statt
 *  eines eingefrorenen px-Werts auflöst (s. `readSize`, `buildBoxNode`) — und macht ein sonst
 *  stilloses Blatt genauso zur Box wie jede andere explizite Größe. */
function hasBoxTrigger(el, computed) {
  if (isFlexLike(computed.display)) return true;
  if (['paddingTop', 'paddingRight', 'paddingBottom', 'paddingLeft'].some((p) => pxOr0(computed[p]) > 0)) return true;
  if (readRadius(computed) > 0) return true;
  if (normalizeColor(computed.backgroundColor) != null) return true;
  if ([computed.borderTopWidth, computed.borderRightWidth, computed.borderBottomWidth, computed.borderLeftWidth].some((w) => pxOr0(w) > 0)) return true;
  const { width, height } = readSize(el, computed, readLayout(computed, el.children.length > 0), true);
  if (width != null || height != null) return true;
  return false;
}

// Pattern-Fidelity-Scheibe „Stretch & Grow" (Spec §Erkennung Punkt 4, zweiter Spiegelstrich):
// computed-`display`-Werte, die ein Kind unter einem NICHT-flex (Block-Flow) Elternteil block-level
// machen und damit für Stretch qualifizieren. `flex`/`grid` sind bewusst enthalten — ein
// Flex-/Grid-Container ist aus Sicht SEINES Elternteils weiterhin ein normales Block-Level-Element
// (nur seine eigenen Kinder ordnet er als Flex an). Inline-Displays (inline, inline-block,
// inline-flex, inline-grid) sind bewusst NICHT enthalten — sie strecken im Block-Flow nicht.
const BLOCK_LEVEL_DISPLAYS = new Set(['block', 'flex', 'grid', 'table', 'list-item', 'flow-root']);

/** flex-grow robust lesen (Spec §Erkennung Punkt 3, jsdom-Falle): die `flex:1`-Shorthand löst
 *  jsdom teils nicht zu `computed.flexGrow` auf — Fallback auf das rohe Inline-Style
 *  (`el.style.flexGrow`, von CSSStyleDeclaration bei Shorthand-Zuweisung mit-expandiert). */
function readFlexGrow(el, computed) {
  const raw = computed.flexGrow || el.style?.flexGrow || '';
  const n = parseFloat(raw);
  return Number.isFinite(n) ? n : 0;
}

/** Stretch/Grow-Erkennung für ein Element-Kind relativ zu seinem unmittelbaren Eltern-Kontext
 *  (Spec §Erkennung, Punkte 3–5). `parent` ist `{ computed, layout }` des Eltern-ELEMENTS oder
 *  `null` für Wurzeln — Punkt 2 („Wurzeln bekommen nie stretch/grow") wird hier zentral
 *  durchgesetzt. Punkt 1 („absolute gewinnt") prüft der Aufrufer VORHER und ruft diese Funktion für
 *  absolute Nodes gar nicht erst auf (s. buildNormalNode/convertElement).
 *
 *  `layout` im Elternkontext ist immer 'row' ODER 'column' (nie 'grid' o.ä. — readLayout normiert
 *  bereits), das mappt 1:1 auf die physische Achse: 'row'-Eltern → primär=Breite, gegen=Höhe;
 *  'column'-Eltern (inkl. simulierter Block-Flow-Spalte) → primär=Höhe, gegen=Breite. */
function readStretchGrow(el, computed, parent) {
  if (!parent) return { stretch: false, grow: false };

  const inlineWidth = el.style?.width || '';
  const inlineHeight = el.style?.height || '';
  const hasInlineWidth = !!inlineWidth && inlineWidth !== 'auto';
  const hasInlineHeight = !!inlineHeight && inlineHeight !== 'auto';
  const widthIs100 = hasInlineWidth && inlineWidth.trim() === '100%';
  const heightIs100 = hasInlineHeight && inlineHeight.trim() === '100%';

  const parentFlex = isFlexLike(parent.computed.display);
  let grow = false;
  let stretch = false;

  // Punkt 3: grow via flex-grow — nur unter flex-like Eltern aussagekräftig.
  if (parentFlex && readFlexGrow(el, computed) > 0) {
    grow = true;
  }

  // Punkt 4: stretch via alignSelf/alignItems (flex-like Eltern) bzw. Block-Flow (nicht-flex Eltern).
  if (parentFlex) {
    const alignSelf = computed.alignSelf;
    const effective = alignSelf && alignSelf !== 'auto' ? alignSelf : parent.computed.alignItems;
    if (effective === 'stretch' || effective === 'normal') {
      const counterHasInlineSize = parent.layout === 'column' ? hasInlineWidth : hasInlineHeight;
      if (!counterHasInlineSize) stretch = true;
    }
  } else if (parent.layout === 'column') {
    if (BLOCK_LEVEL_DISPLAYS.has(computed.display) && !hasInlineWidth) stretch = true;
  }

  // Punkt 5: Inline-100%-Sonderfall — width:100%/height:100% sind ein eigenständiges Stretch/Grow-
  // Signal (Achse relativ zum Eltern-Layout), unabhängig vom bisherigen Ergebnis oben (kann sich
  // z. B. mit Punkt 4 decken oder es ergänzen — beide Achsen können unabhängig voneinander gefüllt
  // werden). readSize() friert diese Achse dafür nicht mehr als px ein (s. dort).
  if (widthIs100) {
    if (parent.layout === 'row') grow = true;
    else stretch = true;
  }
  if (heightIs100) {
    if (parent.layout === 'row') stretch = true;
    else grow = true;
  }

  return { stretch, grow };
}

/** Hängt `stretch: true` / `grow: true` an einen bereits gebauten Node an — WEGGELASSEN statt
 *  `false` (gleiche Begründung wie bei `absolute`, s. readAbsolute-Kommentar). Wird NIE für svg-
 *  Nodes aufgerufen (Spec §Vertrag: „svg-Nodes bekommen NIE stretch/grow" — die Aufrufer lassen
 *  svg-Knoten aus, s. convertSvgElement). */
function attachStretchGrow(node, stretchGrow) {
  let result = node;
  if (stretchGrow.stretch) result = { ...result, stretch: true };
  if (stretchGrow.grow) result = { ...result, grow: true };
  return result;
}

// Bild-Platzhalter-Glyph (Spec: docs/superpowers/specs/2026-07-19-image-placeholder-glyph-design.md
// §Heuristik): Grenzwerte für Kriterium (B) — „Box mit Hintergrund-Fill, OHNE Element-Kinder, OHNE
// nicht-leeren Text". An v3-Payload verifiziert (trennt den 32×32-Logo-Fall sauber von Notification-
// Dots, Legenden-Chips und KPI-Icon-Kreisen, s. Spec §Heuristik).
const IMAGE_GLYPH_MIN_SIZE = 24;
const IMAGE_GLYPH_MIN_RATIO = 0.7;
const IMAGE_GLYPH_MAX_RATIO = 1.43;

/** Standard-„Bild"-Icon-Markup (Spec §Glyph), Größe = round(min(w,h)*0.6), min 12. Trägt bewusst
 *  KEIN stretch/grow/absolute (Spec: „skaliert nicht mit, konsistent mit svg-Regel"). */
function buildImageGlyphNode(minSide) {
  const size = Math.max(12, Math.round(minSide * 0.6));
  return {
    type: 'svg',
    markup: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="${size}" height="${size}" fill="none" stroke="#9ca3af" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="M21 15l-5-5L5 21"/></svg>`,
  };
}

/** Injiziert den Bild-Platzhalter-Glyph als einziges Kind einer sonst leeren Box (Spec §Integration):
 *  `<img>` (A) immer, sonst (B) nur wenn die Box ein Fill hat UND das gemessene Rect min(w,h)≥24 UND
 *  ~quadratisch (0.7..1.43) ist. Greift NUR bei echten Leafs — `node.children.length !== 0` (Text
 *  oder Element-Kind bereits gebaut) lässt den Node unverändert (Spec Tests 3–5). Box behält Fill/
 *  Radius/Größe, nur `children`/`primaryAlign`/`counterAlign` werden überschrieben (Spec §Glyph). */
function maybeInjectImageGlyph(node, el, isImg) {
  if (!node || node.type !== 'box' || node.children.length !== 0) return node;
  const rect = typeof el.getBoundingClientRect === 'function' ? el.getBoundingClientRect() : { width: 0, height: 0 };
  let minSide;
  if (isImg) {
    minSide = Math.min(rect.width, rect.height);
  } else {
    if (node.fill == null) return node;
    const minS = Math.min(rect.width, rect.height);
    if (minS < IMAGE_GLYPH_MIN_SIZE) return node;
    const ratio = rect.width / rect.height;
    if (!Number.isFinite(ratio) || ratio < IMAGE_GLYPH_MIN_RATIO || ratio > IMAGE_GLYPH_MAX_RATIO) return node;
    minSide = minS;
  }
  return { ...node, children: [buildImageGlyphNode(minSide)], primaryAlign: 'CENTER', counterAlign: 'CENTER' };
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

function buildBoxNode(el, computed, children, ctx, parent, isRoot, ownStretchGrow) {
  const layout = readLayout(computed, el.children.length > 0);
  const { primaryAlign, counterAlign } = readAlignment(computed);
  const { stroke, strokeWeight } = readBorder(computed, ctx);
  let { width, height } = readSize(el, computed, layout, isRoot);

  // Figma-Auto-Layout huggt NUR In-Flow-Kinder: Ein Parent, dessen Kinder (teils) absolut
  // positioniert sind, würde sonst kollabieren und die absoluten Kinder wegclippen
  // (Regression Figma-Test `test6`, 18.07. — Chart-Body bestand NUR aus absoluten Kindern).
  // Vertrag: fehlende Maße aus dem eigenen gemessenen Rect einfrieren; explizit gesetzte
  // Maße (readSize) behalten Vorrang.
  //
  // Wechselwirkung mit Stretch/Grow (Pattern-Fidelity-Scheibe „Stretch & Grow", Spec §Wechsel-
  // wirkung mit dem Absolute-Kinder-Freeze, Nachfix 18.07.): eine Achse, die bereits durch das
  // EIGENE stretch (Gegenachse) bzw. grow (Primärachse) DIESES Nodes — relativ zu SEINEM
  // Eltern-Layout — abgedeckt ist, wird NICHT zusätzlich aus dem Rect eingefroren; sie kommt zur
  // Laufzeit vom Parent. Welche physische Achse (Breite/Höhe) das ist, hängt vom Eltern-Layout ab
  // (`parent.layout`): 'row'-Eltern → Gegenachse=Höhe/Primärachse=Breite; 'column'-Eltern (bzw.
  // fehlender Parent) → umgekehrt.
  if ((width == null || height == null) && children.some((c) => c && c.absolute)) {
    const rect = el.getBoundingClientRect();
    const stretchAxis = ownStretchGrow.stretch && parent ? (parent.layout === 'row' ? 'height' : 'width') : null;
    const growAxis = ownStretchGrow.grow && parent ? (parent.layout === 'row' ? 'width' : 'height') : null;
    if (width == null && stretchAxis !== 'width' && growAxis !== 'width') {
      width = Math.max(1, Math.round(rect.width));
    }
    if (height == null && stretchAxis !== 'height' && growAxis !== 'height') {
      height = Math.max(1, Math.round(rect.height));
    }
  }
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
    counterAlign: 'MIN',
    children,
  };
}

/** PlanRef.fallback muss laut Vertrag PlanBox|null sein (parsePayload.parseRefNode nutzt den
 *  Box-Parser) — ein rein-textuelles Subtree-Ergebnis wird wie am plan-Root in eine Box gepackt. */
function ensureBox(node) {
  if (node.type === 'box') return node;
  return { ...emptyBoxNode(), children: [node] };
}

/** Scheibe A (Spec §Scheibe A): `position:absolute|fixed` → zusätzliches `absolute`-Feld mit
 *  Koordinaten/Größe relativ zum DIREKTEN Eltern-Element (bewusste Vereinfachung ggü. dem
 *  nächsten POSITIONIERTEN Vorfahren — abweichend nur bei dazwischenliegenden nicht-
 *  positionierten Ebenen, akzeptiert + dokumentiert lt. Spec). x/y = Rect-Differenz (kann negativ
 *  sein, KEIN Clamp), width/height = eigene Rect-Größe, alles Math.round, width/height min 1
 *  (ein Element mit 0 Ausdehnung ist im Plan/Plugin nicht sinnvoll darstellbar). `fixed` zählt
 *  wie `absolute` (Spec: „fixed zählt wie absolute" — wir bilden nur die Geometrie ab, nicht den
 *  Viewport-Bezug, den Figma ohnehin nicht kennt). Liefert `null`, wenn nicht positioniert, wenn
 *  das Element keinen Eltern-Element hat (z. B. der Mess-Container selbst), oder wenn `el` kein
 *  echtes Element ist (loser Textknoten ohne eigenes Element — s. buildNormalNode).
 *
 *  Entscheidung „Feld weglassen vs. null" (Spec verlangt Dokumentation): wir LASSEN DAS FELD WEG
 *  (kein `absolute: null` auf jedem Node), weil der bestehende Test-Korpus (418 Tests) volle
 *  Plan-Objekte per `toEqual` gegen Literale ohne `absolute`-Schlüssel prüft — `toEqual` behandelt
 *  eine fehlende Eigenschaft NICHT wie eine mit Wert `null` (nur `undefined` wird ignoriert), ein
 *  auf jedem Node gesetztes `absolute: null` hätte also den kompletten Bestandstest-Korpus
 *  gebrochen. Das Plugin parst das Feld ohnehin defensiv (Spec §Plugin: `parsePayload.ts` behandelt
 *  fehlend/undefined wie null). */
function readAbsolute(el, computed) {
  if (computed.position !== 'absolute' && computed.position !== 'fixed') return null;
  const parent = el.parentElement;
  if (!parent || typeof el.getBoundingClientRect !== 'function') return null;
  const rect = el.getBoundingClientRect();
  const parentRect = parent.getBoundingClientRect();
  return {
    x: Math.round(rect.left - parentRect.left),
    y: Math.round(rect.top - parentRect.top),
    width: Math.max(1, Math.round(rect.width)),
    height: Math.max(1, Math.round(rect.height)),
  };
}

/** Splice-Instanz-Slot-Sizing (Spec 2026-07-18-splice-instance-slot-sizing-design.md §Vertrag): wie
 *  `readAbsolute`, aber OHNE den `position:absolute|fixed`-Guard — liefert das gemessene Rect eines
 *  Elements relativ zu seinem DIREKTEN Eltern-Element unabhängig von dessen CSS-Positionierung
 *  (Flow-Elemente eingeschlossen). Nur für den Composition-Splice-Zweig gedacht (s. convertElement):
 *  eine gesplicte Instanz soll IMMER auf ihr gemessenes Slot-Rect dimensioniert werden, nicht nur
 *  wenn sie zufällig CSS-positioniert ist — sonst huggt sie im Plugin ihre Eigengröße (Root Cause
 *  „brennende" Instanzen in test12, s. Spec-Kopf).
 *
 *  `readAbsolute` selbst bleibt UNANGETASTET (der 418-Test-Korpus prüft Plan-Literale ohne
 *  `absolute`-Schlüssel per `toEqual` — ein zusätzlicher Aufruf-Pfad dort hätte dieses Risiko
 *  unnötig vergrößert; die neue Funktion lebt deshalb separat).
 *
 *  Liefert `null` bei fehlendem Eltern-Element ODER degeneriertem Rect (`rect.width <= 0 ||
 *  rect.height <= 0` — jsdom ohne gemocktes Rect liefert 0×0). Anders als `readAbsolute` wird die
 *  Größe hier NICHT auf mindestens 1 geklemmt: ein degeneriertes Rect ist kein sinnvoller Slot,
 *  Aufrufer fallen in diesem Fall bewusst auf stretch/grow zurück (kein Overflow-Schutz, aber auch
 *  kein Schaden — heutiges Verhalten, s. Spec §Bewusste Grenzen). */
function measureRectRelParent(el) {
  const parent = el.parentElement;
  if (!parent || typeof el.getBoundingClientRect !== 'function') return null;
  const rect = el.getBoundingClientRect();
  if (rect.width <= 0 || rect.height <= 0) return null;
  const parentRect = parent.getBoundingClientRect();
  return {
    x: Math.round(rect.left - parentRect.left),
    y: Math.round(rect.top - parentRect.top),
    width: Math.max(1, Math.round(rect.width)),
    height: Math.max(1, Math.round(rect.height)),
  };
}

/** Hängt `absolute` an einen bereits gebauten Node an — nur wenn `readAbsolute` etwas geliefert
 *  hat (s. Kommentar dort zur „weglassen statt null"-Entscheidung). Node bleibt in jedem Fall ein
 *  normales Kind im `children`-Array seines Elternknotens (Spec: aus dem Fluss nimmt erst das
 *  Figma-Plugin ihn per `layoutPositioning = 'ABSOLUTE'`). */
function withAbsolute(node, el, computed) {
  const absolute = readAbsolute(el, computed);
  return absolute ? { ...node, absolute } : node;
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

/** Injiziert fehlende viewBox/width/height auf dem geklonten Wurzel-<svg> aus dem gemessenen Rect
 *  des LIVE-Elements (Spec: docs/superpowers/specs/2026-07-19-svg-viewbox-injection-design.md).
 *  Gemini liefert Chart-SVGs ohne diese Attribute (nur CSS width:100%/height:100%) — beim Figma-
 *  Import nicht auflösbar → Fallback auf CSS-Default (~300×150) → Pfade jenseits davon werden
 *  abgeschnitten. Fix: Pixel-Koordinatenraum der Pfade (= gemessene Fläche) 1:1 als viewBox setzen.
 *  Nur bei echtem Rect (>0, jsdom-Default 0×0 ohne Mock → keine Injektion, Markup bleibt verbatim).
 *  Vorhandene Attribute werden NIE überschrieben (hasAttribute-Check, nicht leere Strings). */
function injectMissingSvgSize(clone, el) {
  const rect = typeof el.getBoundingClientRect === 'function' ? el.getBoundingClientRect() : { width: 0, height: 0 };
  if (!(rect.width > 0 && rect.height > 0)) return;
  const w = Math.max(1, Math.round(rect.width));
  const h = Math.max(1, Math.round(rect.height));
  if (!clone.hasAttribute('viewBox')) clone.setAttribute('viewBox', `0 0 ${w} ${h}`);
  if (!clone.hasAttribute('width')) clone.setAttribute('width', `${w}`);
  if (!clone.hasAttribute('height')) clone.setAttribute('height', `${h}`);
}

/** SVG-Subtree → PlanSvg. Markup verbatim (inkl. eigener Tags/Attribute), `<foreignObject>` vorher
 *  entfernt (kann beliebiges HTML/CSS enthalten, das Figma nicht rendert), externe Ressourcen-Refs
 *  entfernt (Defense-in-Depth — der Live-Baum wurde bereits vor dem Mounten gestrippt, s.
 *  htmlToPlan(); hier zusätzlich auf dem Klon, falls der Knoten nachträglich verändert wurde),
 *  fehlende Größen-Attribute aus dem gemessenen Rect injiziert (s. injectMissingSvgSize), >20000
 *  Zeichen gekappt + Warnung statt fatal. */
function convertSvgElement(el, ctx) {
  const clone = el.cloneNode(true);
  for (const fo of Array.from(clone.querySelectorAll?.('foreignObject') || [])) {
    fo.remove();
  }
  stripExternalRefs(clone, ctx);
  injectMissingSvgSize(clone, el);
  let markup = clone.outerHTML;
  if (markup.length > SVG_MAX_CHARS) {
    markup = markup.slice(0, SVG_MAX_CHARS);
    ctx.warnings.add(`SVG-Markup > ${SVG_MAX_CHARS} Zeichen — gekappt.`);
  }
  return withAbsolute({ type: 'svg', markup }, el, getComputedStyle(el));
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

/** IoU (Intersection over Union) zweier normierter Rechtecke {x,y,w,h} (0..1, gleicher Bezugsrahmen).
 *  Reine Funktion — kein DOM nötig (Spec §Tests: direkt mit Plain-Objects testbar). Degenerierte/
 *  nicht überlappende Rechtecke → 0 (kein `NaN`/Division durch 0 nach außen). */
export function iou(a, b) {
  if (!a || !b) return 0;
  const ax2 = a.x + a.w;
  const ay2 = a.y + a.h;
  const bx2 = b.x + b.w;
  const by2 = b.y + b.h;
  const ix1 = Math.max(a.x, b.x);
  const iy1 = Math.max(a.y, b.y);
  const ix2 = Math.min(ax2, bx2);
  const iy2 = Math.min(ay2, by2);
  const interArea = Math.max(0, ix2 - ix1) * Math.max(0, iy2 - iy1);
  const unionArea = a.w * a.h + b.w * b.h - interArea;
  if (unionArea <= 0) return 0;
  return interArea / unionArea;
}

/** Bestes noch nicht verbrauchtes Splice-Ziel für EIN Element-Rect (Spec §1: „Bester Treffer mit
 *  IoU ≥ SPLICE_MIN_IOU"). Reine Funktion (kein DOM) — `usedNames` wird vom Aufrufer geführt, damit
 *  jedes Ziel höchstens einmal vergeben wird. Gibt `null` zurück, wenn kein Ziel die Schwelle
 *  erreicht (auch bei leeren/undefinierten `targets` — wirft nie). */
export function bestSpliceMatch(elRectNorm, targets, usedNames) {
  if (!elRectNorm || !Array.isArray(targets) || targets.length === 0) return null;
  let best = null;
  let bestScore = -1;
  for (const target of targets) {
    if (!target?.name || !target.bbox) continue;
    if (usedNames?.has(target.name)) continue;
    const score = iou(elRectNorm, target.bbox);
    if (score > bestScore) {
      bestScore = score;
      best = target;
    }
  }
  if (!best || bestScore < SPLICE_MIN_IOU) return null;
  return { name: best.name };
}

/** Text → Token-Set (Spec §1: „lowercase → alles außer Buchstaben/Ziffern/./% durch Space
 *  ersetzen → Tokens mit Länge ≥ 2 behalten"). Single Source of Truth für BEIDE Seiten des
 *  Vergleichs (Anker-Tokens aus der Kind-Interpretation UND Subtree-Text eines Kandidaten-
 *  Elements müssen mit derselben Regel tokenisiert werden, sonst wäre der Jaccard-Score
 *  bedeutungslos). Nicht-String/leer → leeres Set, wirft nie. */
export function tokenizeAnchorText(text) {
  if (typeof text !== 'string' || !text) return new Set();
  const normalized = text.toLowerCase().replace(/[^a-z0-9.%]+/g, ' ');
  const tokens = normalized.split(/\s+/).filter((t) => t.length >= 2);
  return new Set(tokens);
}

/** Jaccard-Ähnlichkeit zweier Token-Sets (Spec §2: „Score = Token-Jaccard"). Reine Funktion —
 *  identische Sets → 1, disjunkte → 0, leeres Set auf einer oder beiden Seiten → 0 (nie
 *  NaN/Division durch 0 nach außen). */
export function textJaccard(setA, setB) {
  if (!(setA instanceof Set) || !(setB instanceof Set) || setA.size === 0 || setB.size === 0) return 0;
  let intersection = 0;
  for (const token of setA) {
    if (setB.has(token)) intersection += 1;
  }
  const union = setA.size + setB.size - intersection;
  if (union <= 0) return 0;
  return intersection / union;
}

/** Bestes noch nicht verbrauchtes Splice-Ziel für die Tokens EINES Kandidaten-Elements (Spec §2:
 *  „Score = Token-Jaccard … Schwelle SPLICE_MIN_TEXT"). Analog zu `bestSpliceMatch`, nur mit
 *  Text-Ankern statt Rects: `targets` sind Objekte `{ name, anchorTokens: Set<string> }`. Reine
 *  Funktion (kein DOM) — `usedNames` wird vom Aufrufer geführt. Liefert `null`, wenn kein Ziel
 *  die Schwelle erreicht (auch bei leeren/undefinierten `targets` — wirft nie). */
export function bestTextMatch(elTokens, targets, usedNames) {
  if (!(elTokens instanceof Set) || elTokens.size === 0) return null;
  if (!Array.isArray(targets) || targets.length === 0) return null;
  let best = null;
  let bestScore = -1;
  for (const target of targets) {
    if (!target?.name || !(target.anchorTokens instanceof Set) || target.anchorTokens.size === 0) continue;
    if (usedNames?.has(target.name)) continue;
    const score = textJaccard(elTokens, target.anchorTokens);
    if (score > bestScore) {
      bestScore = score;
      best = target;
    }
  }
  if (!best || bestScore < SPLICE_MIN_TEXT) return null;
  return { name: best.name };
}

/** Alle Element-Knoten (Wurzeln + jeder Nachfahre) in Dokumentreihenfolge — Kandidatenliste für die
 *  globale Splice-Zuordnung (s. computeSpliceAssignment). */
function collectCandidateElements(roots) {
  const list = [];
  const visit = (el) => {
    list.push(el);
    for (const child of Array.from(el.children || [])) visit(child);
  };
  for (const root of roots) visit(root);
  return list;
}

/** Rohes DOMRect → normiertes {x,y,w,h} relativ zu `ref` (ebenfalls ein rohes Rect). `null` bei
 *  degeneriertem Referenzrahmen (Breite/Höhe 0 — jsdom-Default ohne gemocktes Rect). */
function normalizeRectTo(rect, ref) {
  if (!ref || ref.width <= 0 || ref.height <= 0) return null;
  return {
    x: (rect.left - ref.left) / ref.width,
    y: (rect.top - ref.top) / ref.height,
    w: rect.width / ref.width,
    h: rect.height / ref.height,
  };
}

/** Umschließendes Rect mehrerer roher Rects (Spec §1: „Bei mehreren Roots: Referenz = umschließendes
 *  Rect aller Roots"). */
function unionRect(rects) {
  if (!rects.length) return null;
  const left = Math.min(...rects.map((r) => r.left));
  const top = Math.min(...rects.map((r) => r.top));
  const right = Math.max(...rects.map((r) => r.right));
  const bottom = Math.max(...rects.map((r) => r.bottom));
  return { left, top, width: right - left, height: bottom - top };
}

/** Plausibilitäts-Deckel für Phase 1 (Text-Anker, Spec 2026-07-19-splice-text-anchor-matching-
 *  design.md §2): (a) Element hat ein messbares Rect (Breite UND Höhe > 0) UND (b) Element-Fläche
 *  ≤ 80% der Referenzrahmen-Fläche (verhindert Wurzel-/Fast-Wurzel-Match, wenn ein Kind fast den
 *  gesamten Eltern-Text trägt). Die Ziel-bbox wird in Phase 1 bewusst NICHT geprüft (Spec §Bewusste
 *  Grenzen — sie ist das nachweislich unzuverlässige Signal, das Phase 1 gerade umgehen soll). */
const SPLICE_TEXT_MAX_AREA_RATIO = 0.8;

function isPlausibleTextCandidate(el, refArea) {
  if (typeof el.getBoundingClientRect !== 'function') return false;
  const rect = el.getBoundingClientRect();
  if (!(rect.width > 0 && rect.height > 0)) return false;
  if (refArea <= 0) return false;
  return rect.width * rect.height <= refArea * SPLICE_TEXT_MAX_AREA_RATIO;
}

/** Löst `spliceTargets` global gegen alle Elemente im gemounteten Baum auf. Zwei Phasen (Spec
 *  2026-07-19-splice-text-anchor-matching-design.md §Vertrag):
 *
 *  Phase 1 (Text-Anker, §2): für jedes Kandidaten-Element werden die Subtree-Text-Tokens gegen die
 *  `anchorTokens` ALLER Ziele mit nicht-leeren Ankern gescort (`bestTextMatch`), plausible Treffer
 *  (s. `isPlausibleTextCandidate`) ≥ SPLICE_MIN_TEXT gesammelt, dann global nach Score absteigend
 *  sortiert — bei GLEICHEM Score gewinnt das ÄUSSERSTE Element (Vorfahre schlägt Nachfahre über
 *  `Node.contains`; ohne Vorfahren-Beziehung entscheidet die Dokumentreihenfolge, die die stabile
 *  Sortierung hier bewahrt) — und gierig eindeutig zugeordnet (jedes Element/Ziel höchstens einmal).
 *
 *  Phase 2 (IoU-Fallback, §3, UNVERÄNDERTE Semantik): Ziele ohne anchorTokens ODER ohne Text-Match
 *  laufen exakt wie bisher gegen die in Phase 1 noch NICHT verbrauchten Elemente/Ziele —
 *  `usedNames`/`usedEls` werden über BEIDE Phasen hinweg geteilt.
 *
 *  Liefert `{ assignment: Map<Element,string>, usedNames: Set<string> }`. Bei degeneriertem
 *  Referenzrahmen (Breite/Höhe 0 — jsdom ohne gemocktes Rect) bleiben beide leer, kein Splice. */
function computeSpliceAssignment(roots, spliceTargets, refRect) {
  const usedNames = new Set();
  const assignment = new Map();
  if (!refRect || refRect.width <= 0 || refRect.height <= 0) return { assignment, usedNames };

  const usedEls = new Set();
  const refArea = refRect.width * refRect.height;

  // Phase 1: Text-Anker-Matching (Spec §2) — nur Ziele mit nicht-leeren anchorTokens nehmen teil.
  const textTargets = spliceTargets.filter((t) => t?.name && t.anchorTokens instanceof Set && t.anchorTokens.size > 0);
  if (textTargets.length) {
    const textCandidates = [];
    for (const el of collectCandidateElements(roots)) {
      if (!isPlausibleTextCandidate(el, refArea)) continue;
      const elTokens = tokenizeAnchorText(el.textContent || '');
      const match = bestTextMatch(elTokens, textTargets, new Set());
      if (!match) continue;
      const target = textTargets.find((t) => t.name === match.name);
      textCandidates.push({ el, name: match.name, score: textJaccard(elTokens, target.anchorTokens) });
    }
    // Sortierung: Score absteigend; bei Gleichstand Vorfahre vor Nachfahre (Tie-Break, Spec §2);
    // ohne Vorfahren-Beziehung bleibt die Dokumentreihenfolge erhalten (stabiler Sort).
    textCandidates.sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      if (a.el !== b.el) {
        if (a.el.contains(b.el)) return -1;
        if (b.el.contains(a.el)) return 1;
      }
      return 0;
    });
    for (const cand of textCandidates) {
      if (usedEls.has(cand.el) || usedNames.has(cand.name)) continue;
      assignment.set(cand.el, cand.name);
      usedEls.add(cand.el);
      usedNames.add(cand.name);
    }
  }

  // Phase 2: IoU-Fallback (Spec §3, unverändert) — nur Ziele, die Phase 1 nicht verbraucht hat,
  // gegen Elemente, die Phase 1 nicht verbraucht hat.
  const remainingTargets = spliceTargets.filter((t) => t?.name && !usedNames.has(t.name));
  const candidates = [];
  for (const el of collectCandidateElements(roots)) {
    if (usedEls.has(el)) continue;
    if (typeof el.getBoundingClientRect !== 'function') continue;
    const rectNorm = normalizeRectTo(el.getBoundingClientRect(), refRect);
    if (!rectNorm) continue;
    const match = bestSpliceMatch(rectNorm, remainingTargets, new Set());
    if (!match) continue;
    const target = remainingTargets.find((t) => t.name === match.name);
    candidates.push({ el, name: match.name, score: iou(rectNorm, target.bbox) });
  }
  candidates.sort((a, b) => b.score - a.score);

  for (const cand of candidates) {
    if (usedEls.has(cand.el) || usedNames.has(cand.name)) continue;
    assignment.set(cand.el, cand.name);
    usedEls.add(cand.el);
    usedNames.add(cand.name);
  }
  return { assignment, usedNames };
}

/** Der eigentliche box/text-Nachbau — ausgelagert, damit sowohl der normale Pfad als auch der
 *  component-ref-Fallback (Spec §Konverter Punkt 2) ihn nutzen können. Liest getComputedStyle(el)
 *  (Live-DOM, im echten `document` gemountet — Spec §Kernidee).
 *
 *  `parent` (Pattern-Fidelity-Scheibe „Stretch & Grow", Spec §Erkennung): der Eltern-Kontext
 *  `{ computed, layout }` DIESES Elements, oder `null` für Wurzeln (direkte Kinder des Mess-
 *  Containers — kein Figma-Parent zu füllen). Wird durchgereicht für die Stretch/Grow-Erkennung
 *  von `el` selbst; für die EIGENEN Kinder von `el` wird unten ein neuer Kontext aus `el`s
 *  computed/layout gebaut. `absolute` gewinnt über stretch/grow (Spec §Vertrag Punkt 1) — wird
 *  daher zuerst bestimmt, stretch/grow nur berechnet, wenn `el` nicht absolut positioniert ist. */
function buildNormalNode(el, ctx, parent) {
  const computed = getComputedStyle(el);
  const elementChildren = Array.from(el.children || []);
  const isRoot = parent === null;
  const isBox = elementChildren.length > 0 || hasBoxTrigger(el, computed);
  const isImg = (el.tagName || '').toLowerCase() === 'img';

  const absolute = readAbsolute(el, computed);
  const stretchGrow = absolute ? { stretch: false, grow: false } : readStretchGrow(el, computed, parent);

  if (!isBox) {
    const text = (el.textContent || '').trim();
    let baseNode = text
      ? buildTextNode(text, computed, ctx)
      : buildBoxNode(el, computed, [], ctx, parent, isRoot, stretchGrow);
    if (!text) baseNode = maybeInjectImageGlyph(baseNode, el, isImg);
    return absolute ? { ...baseNode, absolute } : attachStretchGrow(baseNode, stretchGrow);
  }

  const layout = readLayout(computed, elementChildren.length > 0);
  const childParent = { computed, layout };
  const children = [];
  for (const node of el.childNodes) {
    if (node.nodeType === 1) {
      children.push(convertElement(node, ctx, childParent));
    } else if (node.nodeType === 3) {
      const text = (node.textContent || '').trim();
      // Loser Textknoten hat kein eigenes Element → erbt die berechneten Font-Stile seines
      // Eltern-Elements (dieselbe Semantik wie v1, das die Eltern-classified-Werte wiederverwendete).
      // Bekommt NIE stretch/grow (Spec §Erkennung Punkt 4, dritter Spiegelstrich) — es wird
      // absichtlich nirgends daran angehängt.
      if (text) children.push(buildTextNode(text, computed, ctx));
    }
  }
  let boxNode = buildBoxNode(el, computed, children, ctx, parent, isRoot, stretchGrow);
  boxNode = maybeInjectImageGlyph(boxNode, el, isImg);
  return absolute ? { ...boxNode, absolute } : attachStretchGrow(boxNode, stretchGrow);
}

/**
 * Ein DOM-Element rekursiv in einen PlanNode übersetzen. Reihenfolge (Spec §Konverter):
 *   1. SVG-Subtree → PlanSvg, kein weiterer Abstieg.
 *   2. Bekannter Baustein (component-ref) → PlanRef mit Box/Text-Fallback, kein weiterer Abstieg
 *      IN DEN HAUPTBAUM (der Fallback selbst baut normal weiter — das ist, was Organismen dazu
 *      bringt, Moleküle/Atome zu referenzieren: der Matcher läuft bei jedem Kind erneut).
 *   3. Sonst normaler box/text-Nachbau (jetzt aus getComputedStyle statt Klassen-Raten).
 *
 * `parent` (Spec §Erkennung): Eltern-Kontext `{ computed, layout }` oder `null` für Wurzeln —
 * s. buildNormalNode. svg-Nodes bekommen NIE stretch/grow (Spec §Vertrag) — convertSvgElement
 * bekommt `parent` deshalb bewusst nicht gereicht, es bleibt bei reiner Absolute-Erkennung.
 *
 * Composition-Splice (Spec 2026-07-18-composition-splice-parent-fidelity-design.md §1): NACH dem
 * bestehenden component-ref-Zweig (Punkt 2) und VOR dem normalen Nachbau prüft ein dritter Zweig,
 * ob `el` einem der `ctx.spliceAssignment`-Ziele räumlich zugeordnet wurde (vorab global bestimmt,
 * s. computeSpliceAssignment) — auch hier kein weiterer Abstieg in den Hauptbaum, der Fallback wird
 * mit `spliceAssignment:null` gebaut (kein rekursives Selbst-Splicing im Fallback).
 */
function convertElement(el, ctx, parent = null) {
  if (isSvgElement(el)) return convertSvgElement(el, ctx);

  const match = matchKnownComponent(el);
  if (match && ctx.knownComponents.some((c) => c.name === match.name)) {
    // absolute/stretch/grow beziehen sich auf DIESEN component-ref-Knoten (das referenzierte
    // Element selbst), nicht auf den Fallback-Baum — buildNormalNode() unten baut den Fallback
    // bereits mit seinen eigenen (identischen) Feldern, falls zutreffend; hier zusätzlich für den
    // ref-Knoten, weil das Plugin bei erfolgreicher Referenz-Auflösung den Fallback verwirft
    // (Spec §Konverter).
    const computed = getComputedStyle(el);
    const absolute = readAbsolute(el, computed);
    const stretchGrow = absolute ? { stretch: false, grow: false } : readStretchGrow(el, computed, parent);
    const refNode = { type: 'component-ref', name: match.name, variant: match.variant, fallback: ensureBox(buildNormalNode(el, ctx, parent)) };
    return absolute ? { ...refNode, absolute } : attachStretchGrow(refNode, stretchGrow);
  }

  const spliceName = ctx.spliceAssignment?.get(el);
  if (spliceName) {
    const computed = getComputedStyle(el);
    const ctxNoSplice = { ...ctx, spliceAssignment: null };
    const refNode = { type: 'component-ref', name: spliceName, variant: null, fallback: ensureBox(buildNormalNode(el, ctxNoSplice, parent)) };
    // Composition-Fidelity v3 (Spec 2026-07-19-composition-fidelity-v3-flow-box-wrap-design.md
    // §Fix): eine gesplicte Instanz, die im FLUSS steht (kein CSS `position:absolute|fixed`), darf
    // nicht mehr bare `absolute` werden — das nimmt sie aus dem Fluss und ihre Geschwister rutschen
    // in ihren Platz (Overlap-Bug). Stattdessen: Flow-Box in Slot-Größe, die die Instanz als
    // absolut positioniertes Kind (0,0) enthält — die Box behält den Flow-Platz für Geschwister,
    // die Instanz wird vom Plugin (v2 applyAbsolute, shrink-only) auf min(natürlich, Slot) resized.
    const cssAbsolute = readAbsolute(el, computed);
    if (cssAbsolute) {
      // Element war schon CSS-absolut → bare absolute Instanz wie bisher (kein Flow-Platz nötig).
      return { ...refNode, absolute: cssAbsolute };
    }
    const rect = measureRectRelParent(el);
    if (rect) {
      const instance = { ...refNode, absolute: { x: 0, y: 0, width: rect.width, height: rect.height } };
      return {
        type: 'box', layout: 'column', padding: [0, 0, 0, 0], radius: 0, fill: null, stroke: null,
        strokeWeight: 1, gap: 0, width: rect.width, height: rect.height,
        primaryAlign: 'MIN', counterAlign: 'MIN', children: [instance],
      };
    }
    // Nur wenn beides null liefert (kein Parent / degeneriertes 0×0-Rect), Fallback auf stretch/grow.
    return attachStretchGrow(refNode, readStretchGrow(el, computed, parent));
  }

  return buildNormalNode(el, ctx, parent);
}

/** true, wenn irgendein NACHFAHRE (nicht der Node selbst — Wurzeln tragen nie stretch/grow) ein
 *  stretch- oder grow-Feld trägt. Steigt auch in component-ref-Fallbacks ab (das Plugin rendert
 *  bei fehlender Komponente den Fallback-Baum, dessen stretch-Kinder denselben bestimmten Parent
 *  brauchen). Grundlage für den Wurzel-Breiten-Freeze (s. freezeRootWidth). */
function subtreeHasStretchOrGrow(node) {
  if (!node || typeof node !== 'object') return false;
  const children = [];
  if (Array.isArray(node.children)) children.push(...node.children);
  if (node.fallback) children.push(node.fallback);
  return children.some((c) => c && (c.stretch === true || c.grow === true || subtreeHasStretchOrGrow(c)));
}

/** Wurzel-Breiten-Freeze (Spec-Nachtrag 18.07., Befund Figma-Test `test 7`): Der Plugin-Guard
 *  wendet STRETCH/GROW nur unter Parents mit bestimmter Achse an — eine Box-WURZEL ohne explizite
 *  Breite (real: Pattern „Dashboard Layout", „Reports Table") schaltet damit die gesamte
 *  Stretch-Kette ihres Unterbaums ab (Monats-Labels gestaucht, Titel/Wert verklebt). Fix: die im
 *  Mount GEMESSENE Wurzel-Breite einfrieren, aber nur wenn
 *  (a) die Wurzel eine Box ohne width ist,
 *  (b) der Unterbaum die Bestimmtheit überhaupt braucht (mind. ein stretch/grow), und
 *  (c) das Rect echt misst (> 0 — jsdom hat keine Layout-Engine und liefert 0; dort passiert
 *      nichts, der bestehende Testkorpus bleibt unberührt).
 *  Bewusst NUR die Breite: ein Höhen-Freeze würde jede Wurzel via clipsContent auf die Browser-
 *  Inhaltshöhe festnageln und bei Figmas abweichenden Font-Metriken Inhalte abschneiden — die
 *  Höhe bleibt HUG und wächst mit Figmas eigenem Textumbruch. */
function freezeRootWidth(node, el) {
  if (!node || node.type !== 'box' || node.width != null) return node;
  if (!subtreeHasStretchOrGrow(node)) return node;
  const width = Math.round(el.getBoundingClientRect().width);
  if (width <= 0) return node;
  return { ...node, width };
}

/**
 * @param {string} html Sanitisiertes KI-HTML.
 * @param {{ tokens?: object, knownComponents?: Array<{name: string, kind: string}>,
 *   spliceTargets?: Array<{name: string, bbox: {x:number,y:number,w:number,h:number},
 *   anchorTokens?: string[]}> }} [options]
 *   `spliceTargets`-bbox ist NORMIERT AUF DEN ELTERNTEIL (0..1) — Spec §1. `anchorTokens` (Spec
 *   2026-07-19-splice-text-anchor-matching-design.md §1) ist ein Array im Payload (JSON-
 *   kompatibel) — wird intern zu einem Set gemacht; fehlend/leer bedeutet: dieses Ziel läuft nur
 *   durch das IoU-Matching (Phase 2). Leer/undefinierte spliceTargets → identisches Verhalten zum
 *   bisherigen Nicht-Splice-Pfad.
 * @returns {{ plan: object|null, warnings: string[] }}
 */
export function htmlToPlan(html, { tokens = {}, knownComponents = [], spliceTargets = [] } = {}) {
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
    // Scheibe B (Spec §Scheibe B): zusätzlicher Höhen-Kontext, rein additiv — löst Prozent-
    // Höhen-Ketten (height:100% → height:30% in Bar-Segmenten) auf, die sonst ohne einen
    // Referenzwert zu 0px kollabieren (Höhen-Pendant zu PREVIEW_VIRTUAL_WIDTH oben).
    container.style.height = `${PREVIEW_VIRTUAL_HEIGHT}px`;
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

    // Composition-Splice (Spec §1): Referenzrahmen = Rect der (einzigen) Wurzel bzw. umschließendes
    // Rect aller Wurzeln bei mehreren Roots, dann global gegen alle Elemente auflösen (s.
    // computeSpliceAssignment). Leere/undefinierte spliceTargets → assignment bleibt leer, ctx.
    // spliceAssignment bleibt `null` → Verhalten 1:1 wie vorher (kein neuer Zweig greift in
    // convertElement).
    let spliceAssignment = null;
    if (Array.isArray(spliceTargets) && spliceTargets.length) {
      // anchorTokens kommen als Array im Payload (JSON-kompatibel) an — intern zu Set normiert,
      // damit textJaccard/bestTextMatch direkt darauf arbeiten können (Spec §1). Fehlend/kein
      // Array → leeres Set, das Ziel läuft dann nur durch Phase 2 (IoU).
      const normalizedSpliceTargets = spliceTargets.map((t) => ({
        ...t,
        anchorTokens: Array.isArray(t?.anchorTokens)
          ? new Set(t.anchorTokens.filter((tok) => typeof tok === 'string' && tok))
          : new Set(),
      }));
      const refRect = roots.length === 1 ? roots[0].getBoundingClientRect() : unionRect(roots.map((r) => r.getBoundingClientRect()));
      const resolved = computeSpliceAssignment(roots, normalizedSpliceTargets, refRect);
      spliceAssignment = resolved.assignment;
      const unmatched = spliceTargets.filter((t) => t?.name && !resolved.usedNames.has(t.name)).map((t) => t.name);
      if (unmatched.length) {
        warnings.add(`Composition-Splice: kein passendes Element gefunden für: ${unmatched.join(', ')} (weder Text-Anker noch IoU ≥ ${SPLICE_MIN_IOU}) — Inhalt bleibt Teil der Eltern-Interpretation.`);
      }
    }

    const ctx = { tokens, knownComponents, warnings, spliceAssignment };
    // Wurzel-Breiten-Freeze je Wurzel-ELEMENT (nicht auf dem synthetischen Mehrfach-Root-Wrapper,
    // der kein Element zum Messen hat) — Begründung s. freezeRootWidth.
    let plan;
    if (roots.length === 1) {
      plan = freezeRootWidth(convertElement(roots[0], ctx), roots[0]);
    } else {
      plan = { ...emptyBoxNode(), children: roots.map((el) => freezeRootWidth(convertElement(el, ctx), el)) };
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
