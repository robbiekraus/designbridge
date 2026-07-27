// Deterministischer plan→Tailwind/JSX-Emitter (Spec: docs/superpowers/specs/2026-07-19-plan-to-
// tailwind-emitter-design.md). Reine Funktion: kanonischer plan-Baum (box/text/svg/component-ref,
// Vertrag s. htmlToPlan.js) → shadcn/Tailwind-React-Komponente als Code-String. Werktreu mit
// arbitrary values (gap-[12px], bg-[#022d2c]) — Token-Snapping ist Scheibe 2. Kein DOM nötig.
//
// Bewusste Grenzen v1 (Spec §Bewusst NICHT in Scheibe 1): `absolute` wird ignoriert (Tailwind
// bleibt aufs Flow-Raster), SVG-`style`-Attribute entfallen.
//
// DS-Grounding (Spec 2026-07-23-slice1-ds-grounding-default-catalog-design.md §Q3): ein Katalog-
// component-ref (trägt `catalog` + `import`) rendert die ECHTE Komponente (`<Button variant=…>`)
// samt gesammeltem Import am Dateikopf. Ein scan-interner Ref (ohne `catalog`) rendert weiterhin
// seinen fallback-Box-Baum.

const INDENT = '  ';

/** px-Zahl → arbitrary-Klasse `<prefix>-[Npx]`, nur für > 0. */
function pxClass(prefix, n) {
  return Number.isFinite(n) && n > 0 ? `${prefix}-[${Math.round(n)}px]` : null;
}

const SNAP_TOLERANCE_PX = 2;

/** Nächstes Token in `scale` (Array {px,name}) zu `px`, nur wenn |diff| ≤ tol. Gleichstand → erstes
 *  (Listen-Reihenfolge). Fehlende/leere Skala oder kein Treffer → null. Reine Funktion. */
export function snapToken(px, scale, tol = SNAP_TOLERANCE_PX) {
  if (!Array.isArray(scale) || !Number.isFinite(px)) return null;
  let best = null;
  let bestDiff = Infinity;
  for (const t of scale) {
    if (!t || !Number.isFinite(t.px)) continue;
    const diff = Math.abs(t.px - px);
    if (diff < bestDiff) { bestDiff = diff; best = t; }
  }
  return best && bestDiff <= tol ? best.name : null;
}

/** Spacing-Wert → `<prefix>-<token>` (gesnappt) oder `<prefix>-[Npx]`. px<=0 → null. */
function spacingClass(prefix, px, scale) {
  if (!(Number.isFinite(px) && px > 0)) return null;
  const name = snapToken(px, scale);
  return name ? `${prefix}-${name}` : `${prefix}-[${Math.round(px)}px]`;
}

/** radius → `rounded-full` (≥9999) / `rounded-<token>` (gesnappt) / `rounded-[Npx]`; ≤0 → null. */
function radiusClass(radius, scale) {
  if (!(Number.isFinite(radius) && radius > 0)) return null;
  if (radius >= 9999) return 'rounded-full';
  const name = snapToken(radius, scale);
  return name ? `rounded-${name}` : `rounded-[${Math.round(radius)}px]`;
}

/** {hex, token}|null → Klassensymbol: `token` (gebunden) oder `[#hex]`; null wenn beides fehlt. */
function colorSymbol(ref) {
  if (!ref || (!ref.hex && !ref.token)) return null;
  return ref.token ? ref.token : `[${ref.hex}]`;
}

/** Typografie-Token, dessen px (±tol) UND weight (exakt) passen; sonst null. Verhindert Bindung
 *  eines 14/400-Fließtexts an ein 14/600-Token. */
function snapFont(fontSize, fontWeight, scale, tol = SNAP_TOLERANCE_PX) {
  if (!Array.isArray(scale) || !Number.isFinite(fontSize)) return null;
  let best = null;
  let bestDiff = Infinity;
  for (const t of scale) {
    if (!t || !Number.isFinite(t.px) || t.weight !== fontWeight) continue;
    const diff = Math.abs(t.px - fontSize);
    if (diff <= tol && diff < bestDiff) { bestDiff = diff; best = t; }
  }
  return best ? best.name : null;
}

/** padding [t,r,b,l] → minimale Tailwind-Klassenliste (all-equal → p-, t=b&l=r → px-/py-, sonst
 *  einzeln); jedes ausgegebene Symbol gesnappt oder arbitrary. Kollaps rein über px-Gleichheit. */
function paddingClasses([t, r, b, l], scale) {
  if (!t && !r && !b && !l) return [];
  if (t === r && r === b && b === l) return [spacingClass('p', t, scale)].filter(Boolean);
  const out = [];
  if (t === b && l === r) {
    const px = spacingClass('px', l, scale);
    const py = spacingClass('py', t, scale);
    if (px) out.push(px);
    if (py) out.push(py);
    return out;
  }
  for (const [prefix, v] of [['pt', t], ['pr', r], ['pb', b], ['pl', l]]) {
    const c = spacingClass(prefix, v, scale);
    if (c) out.push(c);
  }
  return out;
}

const JUSTIFY_CLASS = { CENTER: 'justify-center', MAX: 'justify-end', SPACE_BETWEEN: 'justify-between' };
const ITEMS_CLASS = { CENTER: 'items-center', MAX: 'items-end', STRETCH: 'items-stretch' };

/** Layout/Abstand/Größe-Klassen (flex/justify/items/self-stretch/flex-1/w/h/gap/padding). Wird
 *  sowohl für normale Boxen als auch für die Fallback-Wurzel gegroundeter Container verwendet
 *  (Spec 2026-07-25 §Umbau: „Layout, Abstände, Größe … kommen aus der Interpretation"). */
function layoutClasses(node, tokens) {
  const out = [];
  // Vertikale Stapel-Garantie (Live-Fund 25.07. im Storybook-Sichttest, Spec 2026-07-25 §Zielbild
  // „Figma und Storybook identisch"): `layout:'column'` heißt im kanonischen Modell IMMER „Kinder
  // stapeln" — Figmas Auto-Layout macht das auch ohne gap. In HTML gilt das NICHT: ohne `flex` legt
  // der normale Fluss inline-Kinder (Text wird als `<span>` emittiert) nebeneinander. Eine Spalte
  // ohne gap/Alignment-Signal (kommt bei KI-Interpretationen real vor) rutschte dadurch in eine
  // Zeile — im Figma-Export korrekt gestapelt, im Storybook nicht. Mehrere Kinder + column →
  // explizit `flex flex-col`, damit beide Ableitungen dasselbe zeigen.
  const stacksChildren = node.layout === 'column' && (node.children?.length ?? 0) > 1;
  const isFlex = node.layout === 'row' || stacksChildren || node.gap > 0
    || node.primaryAlign !== 'MIN' || node.counterAlign !== 'MIN';
  if (isFlex) {
    out.push('flex');
    if (node.layout === 'column') out.push('flex-col');
    if (JUSTIFY_CLASS[node.primaryAlign]) out.push(JUSTIFY_CLASS[node.primaryAlign]);
    if (ITEMS_CLASS[node.counterAlign]) out.push(ITEMS_CLASS[node.counterAlign]);
    // Gegenachse MIN explizit machen (Live-Fund 25.07., Spec 2026-07-25 §Zielbild): Figmas MIN heißt
    // „Kinder huggen und liegen am Anfang", CSS-Flex dehnt sie per Default (`items-stretch`) auf die
    // volle Gegenachse. Sichtbar am „Details"-Button in der KPI-Karte: in Figma schmal, im Storybook
    // über die ganze Kartenbreite. Kinder, die WIRKLICH füllen sollen, tragen `stretch` und damit ihr
    // eigenes `self-stretch` — das gewinnt gegen `items-start`, exakt wie `layoutAlign:'STRETCH'` in
    // Figma gegen counterAlign MIN gewinnt.
    else if (node.counterAlign === 'MIN') out.push('items-start');
  }
  if (node.stretch) out.push('self-stretch');
  if (node.grow) out.push('flex-1');
  // Sizing (Element-Größen, keine Spacing-Tokens → bleibt arbitrary)
  const w = pxClass('w', node.width);
  const h = pxClass('h', node.height);
  if (w) out.push(w);
  if (h) out.push(h);
  // Spacing (gesnappt)
  const gap = spacingClass('gap', node.gap, tokens?.spacing);
  if (gap) out.push(gap);
  out.push(...paddingClasses(node.padding, tokens?.spacing));
  return out;
}

/** Visuelle Hüllen-Klassen (bg/border/rounded). Wird für gegroundete Container bewusst NUR vom
 *  Katalog geliefert (shadcns `Card` bringt `rounded-lg border bg-card shadow-sm`) — die visuellen
 *  Klassen der Fallback-Wurzel werden dort verworfen (Spec 2026-07-25 §Umbau). */
function visualClasses(node, tokens) {
  const out = [];
  const fillSym = colorSymbol(node.fill);
  if (fillSym) out.push(`bg-${fillSym}`);
  const strokeSym = colorSymbol(node.stroke);
  if (strokeSym) {
    out.push('border', `border-${strokeSym}`);
    if (Number.isFinite(node.strokeWeight) && node.strokeWeight !== 1) out.push(`border-[${node.strokeWeight}px]`);
  }
  const radius = radiusClass(node.radius, tokens?.radius);
  if (radius) out.push(radius);
  return out;
}

function boxClasses(node, tokens) {
  return [...layoutClasses(node, tokens), ...visualClasses(node, tokens)];
}

/** Ein Plan-Knoten → JSX-String (mehrzeilig, mit `depth` eingerückt). */
function walk(node, depth, tokens, componentName) {
  const pad = INDENT.repeat(depth);
  if (!node || typeof node !== 'object') return '';
  if (node.type === 'text') return walkText(node, depth, tokens);
  if (node.type === 'svg') return walkSvg(node, depth);
  if (node.type === 'component-ref') {
    // DS-Grounding (Spec 2026-07-23 §Q3/Schritt 3): ein Katalog-ref (trägt `catalog` + `import`)
    // rendert die ECHTE Komponente (`<Button variant=…>Text</Button>`) — Import wird in planToJsx
    // gesammelt. Scan-interne Refs (kein `catalog`) rendern wie bisher ihren fallback-Box-Baum.
    if (node.catalog) return walkCatalogRef(node, depth, componentName, tokens);
    return walk(node.fallback, depth, tokens, componentName);
  }

  // box
  const cls = boxClasses(node, tokens).join(' ');
  const classAttr = cls ? ` className="${cls}"` : '';
  const kids = (node.children || []).map((c) => walk(c, depth + 1, tokens, componentName)).filter(Boolean);
  if (!kids.length) return `${pad}<div${classAttr} />`;
  return `${pad}<div${classAttr}>\n${kids.join('\n')}\n${pad}</div>`;
}

const FONT_WEIGHT_NAME = { 400: 'font-normal', 500: 'font-medium', 600: 'font-semibold', 700: 'font-bold' };

/** Textinhalt JSX-sicher machen: & zuerst, dann < > { }. In JSX-Text dekodieren HTML-Entities;
 *  { und } müssen escaped werden, da sie sonst einen JS-Ausdruck öffnen. */
function escapeJsxText(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/\{/g, '&#123;')
    .replace(/\}/g, '&#125;');
}

function textClasses(node, tokens) {
  const out = [];
  const fontName = snapFont(node.fontSize, node.fontWeight, tokens?.fonts);
  if (fontName) {
    out.push(`text-${fontName}`, `font-${fontName}`);
  } else {
    out.push(`text-[${Math.round(node.fontSize)}px]`);
    out.push(FONT_WEIGHT_NAME[node.fontWeight] || `font-[${node.fontWeight}]`);
  }
  const colorSym = colorSymbol(node.color);
  if (colorSym) out.push(`text-${colorSym}`);
  if (node.align === 'center') out.push('text-center');
  else if (node.align === 'right') out.push('text-right');
  if (node.lineHeight != null) out.push(`leading-[${Math.round(node.lineHeight)}px]`);
  if (node.stretch) out.push('self-stretch');
  if (node.grow) out.push('flex-1');
  return out;
}

function walkText(node, depth, tokens) {
  const pad = INDENT.repeat(depth);
  const cls = textClasses(node, tokens).join(' ');
  return `${pad}<span className="${cls}">${escapeJsxText(node.content)}</span>`;
}

// Endliche kebab→camelCase-Map (Spec §svg). class→className separat behandelt; style entfällt v1.
const SVG_ATTR_RENAME = {
  'stroke-width': 'strokeWidth', 'stroke-linecap': 'strokeLinecap', 'stroke-linejoin': 'strokeLinejoin',
  'fill-rule': 'fillRule', 'clip-rule': 'clipRule', 'stop-color': 'stopColor', 'stop-opacity': 'stopOpacity',
  'fill-opacity': 'fillOpacity', 'stroke-opacity': 'strokeOpacity', 'stroke-dasharray': 'strokeDasharray',
  'stroke-dashoffset': 'strokeDashoffset', 'text-anchor': 'textAnchor', 'stroke-miterlimit': 'strokeMiterlimit',
  'clip-path': 'clipPath',
};

/** SVG-Markup-String JSX-sicher machen (Spec §svg): endliche Attribut-Umbenennung, class→className,
 *  style- und xlink:href-Attribute entfernen. Reine String-Transformation, kein DOM. */
function svgMarkupToJsx(markup) {
  let out = String(markup);
  for (const [kebab, camel] of Object.entries(SVG_ATTR_RENAME)) {
    out = out.replace(new RegExp(`(\\s)${kebab}=`, 'g'), `$1${camel}=`);
  }
  out = out.replace(/(\s)class=/g, '$1className=');
  // style="…" und xlink:href="…" (inkl. einfacher Anführungszeichen) entfernen.
  out = out.replace(/\s(?:style|xlink:href)=("[^"]*"|'[^']*')/g, '');
  return out;
}

function walkSvg(node, depth) {
  const pad = INDENT.repeat(depth);
  return pad + svgMarkupToJsx(node.markup);
}

// --- DS-Grounding: Katalog-Refs als echte Komponenten (Spec 2026-07-23 §Q3/Schritt 3) ------------

/** Sichtbaren Text eines (fallback-)Subtrees einsammeln → Kind-Inhalt der Katalog-Komponente
 *  (z. B. Button-Label). Reine Funktion; Whitespace kollabiert. Steigt für verschachtelte
 *  Katalog-Refs (die keine `children`, nur `fallback` haben) in deren `fallback` ab — sonst
 *  verschwindet der Text eines Blatt-Refs (z. B. ein Badge in einem Button) spurlos
 *  (Live-Fund: das „3.1%" eines Badge in einer Card, Spec 2026-07-25 §Umbau Punkt 3). */
function extractText(node) {
  if (!node || typeof node !== 'object') return '';
  if (node.type === 'text') return node.content || '';
  if (node.type === 'component-ref') return extractText(node.fallback);
  let s = '';
  for (const c of node.children || []) s += `${extractText(c)} `;
  return s;
}

/** Validierte Katalog-Props → JSX-Attribut-String. shadcn-Default-Werte ("default") werden
 *  weggelassen (idiomatisch: `<Button>` statt `<Button variant="default">`). Reihenfolge = props. */
function catalogPropAttrs(props) {
  if (!props || typeof props !== 'object') return '';
  return Object.entries(props)
    .filter(([, v]) => v != null && v !== 'default')
    .map(([k, v]) => `${k}="${v}"`)
    .join(' ');
}

/** Lokaler Bindungsname für einen Katalog-Import: kollidiert der Katalog-Name mit dem eigenen
 *  Komponentennamen (z. B. ein gescanntes Atom "Avatar" wrappt shadcns `Avatar`), müssen Import und
 *  `export function` unterschiedlich heißen — sonst „Identifier 'Avatar' has already been declared"
 *  (Live-Fund 24.07., Storybook-Harness). Import + JSX-Tag nutzen denselben Alias. */
function catalogLocalName(name, componentName) {
  return name === componentName ? `${name}Primitive` : name;
}

/** Darf ein Katalog-Ref als Container komponiert werden (Kinder statt Text-Extraktion)? Spec
 *  2026-07-25 §Entscheidung 3: `voidElement` gewinnt IMMER über `container`, und ohne Fallback-
 *  Kinder gibt es sowieso nichts zu komponieren. */
function isCatalogContainer(node) {
  return Boolean(node.container) && !node.voidElement && (node.fallback?.children?.length > 0);
}

/** Ersten Text-Knoten (mit eigenem fontSize/fontWeight/color, ANDERS als extractText — das nur den
 *  nackten Inhalt sammelt) im fallback-Subtree finden. Live-Fund 27.07. (EcoMetrics-Scan, „Plant Item
 *  Row"): ein gegroundeter Avatar-Fallback-Buchstabe („B") verlor beim Grounding jede Stilinfo —
 *  <Avatar>B</Avatar> ohne jede Klasse rendert als dünne, unzentrierte System-Schrift statt der
 *  interpretierten Initialen-Optik. Steigt wie extractText/collectSvgNodes in verschachtelte Refs ab. */
function firstStyledText(node) {
  if (!node || typeof node !== 'object') return null;
  if (node.type === 'text') return node;
  if (node.type === 'component-ref') return firstStyledText(node.fallback);
  for (const c of node.children || []) {
    const found = firstStyledText(c);
    if (found) return found;
  }
  return null;
}

/** Sicherer Klassen-Ausschnitt für einen Katalog-Fallback-Buchstaben: NUR Schriftgröße/-gewicht/
 *  -farbe (via dieselbe Snap-Logik wie textClasses), bewusst OHNE align/lineHeight/stretch/grow —
 *  die landen hier auf dem Katalog-Tag selbst (z. B. <Avatar>, ein flex-Element fester Größe), nicht
 *  auf einem eigenen <span>, und stretch/flex-1 aus dem ORIGINAL-Kontext des Fallback-Textknotens
 *  wären dort falsch angewendet. */
function avatarFallbackClasses(textNode, tokens) {
  if (!textNode) return [];
  const out = [];
  const fontName = snapFont(textNode.fontSize, textNode.fontWeight, tokens?.fonts);
  if (fontName) {
    out.push(`text-${fontName}`, `font-${fontName}`);
  } else if (textNode.fontSize) {
    out.push(`text-[${Math.round(textNode.fontSize)}px]`);
    out.push(FONT_WEIGHT_NAME[textNode.fontWeight] || (textNode.fontWeight ? `font-[${textNode.fontWeight}]` : null));
  }
  const colorSym = colorSymbol(textNode.color);
  if (colorSym) out.push(`text-${colorSym}`);
  return out.filter(Boolean);
}

/** Live-Fund 27.07. Abend (EcoMetrics-Scan „User Avatar" + „Jane Smith" in „Sidebar Navigation"):
 *  ein gegroundeter Avatar-Fallback OHNE Text, aber mit Bild-/Illustrations-Inhalt (SVG-Portrait
 *  statt Initialen) verlor bislang JEDE Stilinfo der gemessenen Hülle — nur das nackte SVG landete
 *  im `<Avatar>`-Tag, dessen Katalog-Default (`h-10 w-10 bg-muted`, 40×40 grau) die gemessene echte
 *  Größe (hier 31×32) UND Hintergrundfarbe (hier #3b33cc) komplett überschrieb. Sichtbar als falsch
 *  großer, falsch eingefärbter Avatar (Robs Befund „Profil ist verschossen") — verifiziert im echten
 *  Browser (`web/verification/user-avatar-emit-in-browser.html`) gegen `Testdaten/ecometrics-scan-
 *  27-07-abend.json`, sowohl für die alleinstehende „User Avatar"-Interpretation als auch für den
 *  strukturell ANDERS aufgebauten Avatar-Ausschnitt in „Sidebar Navigation" (eigene Interpretation,
 *  kein Splice in jsdom/Emit — s. CLAUDE.md). Analog zu `avatarFallbackClasses` (Text-Fall), aber für
 *  Größe + Hintergrund statt Typografie. `!`-important, weil Tailwinds generierte Stylesheet-
 *  Reihenfolge über Kollisionen entscheidet, nicht die Position im `class`-Attribut (wie schon bei
 *  den Card-Slots, s. walkCatalogSlots) — sonst gewinnt teils der Katalog-Default trotz spezifischerer
 *  Klasse. Bewusst OHNE radius-Override: die runde Form bleibt Katalog-Vorgabe (`rounded-full`) — das
 *  Interpretations-HTML nestet die eigentliche Rundung oft in einem inneren div, nicht an der von uns
 *  gegroundeten Wurzel, ein Radius-Override würde also eher zufällig richtig oder falsch liegen. */
function avatarFallbackVisualClasses(fallbackRoot) {
  if (!fallbackRoot || typeof fallbackRoot !== 'object') return [];
  const out = [];
  const w = Number.isFinite(fallbackRoot.width) && fallbackRoot.width > 0 ? Math.round(fallbackRoot.width) : null;
  const h = Number.isFinite(fallbackRoot.height) && fallbackRoot.height > 0 ? Math.round(fallbackRoot.height) : null;
  if (w) out.push(`!w-[${w}px]`);
  if (h) out.push(`!h-[${h}px]`);
  const bgSym = colorSymbol(fallbackRoot.fill);
  if (bgSym) out.push(`!bg-${bgSym}`);
  return out;
}

/** Sichtbare SVG-Knoten eines (fallback-)Subtrees einsammeln (Dokumentreihenfolge, beliebig tief,
 *  steigt auch in Fallbacks verschachtelter Refs ab) — spiegelt extractText strukturell. Live-Fund
 *  25.07. (Prod-Scan): ein Icon-Button-Fallback trägt NUR ein SVG, keinen Text; ohne diese Sammlung
 *  verschwindet das Icon spurlos (leeres, selbstschließendes Tag). */
function collectSvgNodes(node) {
  if (!node || typeof node !== 'object') return [];
  if (node.type === 'svg') return [node];
  if (node.type === 'component-ref') return collectSvgNodes(node.fallback);
  const out = [];
  for (const c of node.children || []) out.push(...collectSvgNodes(c));
  return out;
}

/** Container-Fallback-Kinder in Header/Content aufteilen (Spec 2026-07-25-sub-komponenten-slots-
 *  design.md §Entscheidung 1): erstes Kind → Header, Rest → Content. Nur ab ≥2 Kindern — bei genau
 *  einem Kind bringt ein Slot nichts, `null` signalisiert dem Aufrufer „unveränderter flacher Fall". */
function splitSlotChildren(children) {
  if (!Array.isArray(children) || children.length < 2) return null;
  return { header: [children[0]], content: children.slice(1) };
}

/** Rendert einen Katalog-Container-Ref MIT Sub-Komponenten-Slots (Spec 2026-07-25-sub-komponenten-
 *  slots-design.md): der gemessene Unterbaum landet nicht mehr flach unter `<Card>`, sondern auf
 *  `<CardHeader>` (erstes Kind) und `<CardContent>` (Rest) — idiomatisches shadcn-Markup, gleiche
 *  Optik. Beide Slot-Tags neutralisieren ihr eigenes hartkodiertes Padding per `!`-Important — die
 *  einzige verlässliche Art, eine fremde shadcn-Komponente von außen zu überschreiben (Tailwind
 *  entscheidet Kollisionen gleicher Spezifität über die generierte Stylesheet-Reihenfolge, NICHT
 *  über die Position im `class`-Attribut). `Card` selbst behält seine volle gemessene Klasse (inkl.
 *  Gap) unverändert; `CardContent` bekommt denselben Gap erneut für seine jetzt darin
 *  verschachtelten Geschwister (Padding/Sizing/Stretch/Grow dabei neutral, die gehören zu `Card`). */
function walkCatalogSlots(node, split, depth, componentName, tokens, tag, classAttr, attrStr) {
  const pad = INDENT.repeat(depth);
  const innerPad = INDENT.repeat(depth + 1);
  const headerTag = catalogLocalName(node.slots.header.name, componentName);
  const contentTag = catalogLocalName(node.slots.content.name, componentName);

  const headerKids = split.header.map((c) => walk(c, depth + 2, tokens, componentName)).filter(Boolean);
  const headerBlock = `${innerPad}<${headerTag} className="!p-0">\n${headerKids.join('\n')}\n${innerPad}</${headerTag}>`;

  const contentLayout = layoutClasses(
    { ...node.fallback, padding: [0, 0, 0, 0], stretch: false, grow: false, width: null, height: null },
    tokens,
  );
  const contentClasses = ['!p-0', ...contentLayout].join(' ');
  const contentKids = split.content.map((c) => walk(c, depth + 2, tokens, componentName)).filter(Boolean);
  const contentBlock = `${innerPad}<${contentTag} className="${contentClasses}">\n${contentKids.join('\n')}\n${innerPad}</${contentTag}>`;

  return `${pad}<${tag}${classAttr}${attrStr}>\n${headerBlock}\n${contentBlock}\n${pad}</${tag}>`;
}

function walkCatalogRef(node, depth, componentName, tokens) {
  const pad = INDENT.repeat(depth);
  const importName = node.import?.name || node.name || 'Component';
  const tag = catalogLocalName(importName, componentName);
  const attrs = catalogPropAttrs(node.props);
  const attrStr = attrs ? ` ${attrs}` : '';

  if (isCatalogContainer(node)) {
    // Komposition (Spec 2026-07-25 §Kernidee): Hülle (bg/border/rounded) kommt aus dem Katalog,
    // deshalb NUR layoutClasses der Fallback-Wurzel — ihre visualClasses werden bewusst verworfen.
    // stretch/grow gehören dem REF-Knoten selbst (der sie heute komplett verliert), zusätzlich zu
    // dem, was die Fallback-Wurzel schon an Layout mitbringt.
    const cls = layoutClasses(node.fallback, tokens);
    if (node.stretch && !cls.includes('self-stretch')) cls.push('self-stretch');
    if (node.grow && !cls.includes('flex-1')) cls.push('flex-1');
    const classAttr = cls.length ? ` className="${cls.join(' ')}"` : '';

    const split = node.slots && splitSlotChildren(node.fallback.children);
    if (split) return walkCatalogSlots(node, split, depth, componentName, tokens, tag, classAttr, attrStr);

    const kids = (node.fallback.children || []).map((c) => walk(c, depth + 1, tokens, componentName)).filter(Boolean);
    return `${pad}<${tag}${classAttr}${attrStr}>\n${kids.join('\n')}\n${pad}</${tag}>`;
  }

  // Katalog-Komponenten, die ein natives HTML-Void-Element rendern (z. B. Input → <input>), dürfen
  // NIE JSX-Children bekommen — React wirft sonst zur Laufzeit (Live-Fund 24.07., echter Prod-Scan:
  // die KI-Interpretation hatte Platzhaltertext im Input-Fallback-HTML).
  const text = node.voidElement ? '' : extractText(node.fallback).replace(/\s+/g, ' ').trim();
  if (text) {
    // `styledFallbackText` (Katalog-Eintrag, Spec-Anhang „Avatar-Fallback-Stil", Live-Fund 27.07.):
    // ohne dieses Opt-in bleibt hier bewusst ALLES beim alten Verhalten (Button/Badge/… bekommen ihre
    // Typografie schon von der echten shadcn-Komponente selbst) — nur Katalog-Einträge, deren echte
    // Komponente KEINE eigene Fallback-Typografie mitbringt (Avatar: der Root-Span zentriert/stylt
    // seinen Inhalt nicht selbst), holen sich Schriftgröße/-gewicht/-farbe aus dem interpretierten
    // Fallback zurück + Basis-Zentrierung, statt als nackter, unformatierter Text zu rendern.
    if (node.styledFallbackText) {
      const cls = ['flex', 'items-center', 'justify-center', ...avatarFallbackClasses(firstStyledText(node.fallback), tokens)];
      return `${pad}<${tag} className="${cls.join(' ')}"${attrStr}>${escapeJsxText(text)}</${tag}>`;
    }
    return `${pad}<${tag}${attrStr}>${escapeJsxText(text)}</${tag}>`;
  }
  // Kein sichtbarer Text — Live-Fund 25.07. (Prod-Scan): trägt der Fallback stattdessen ein Icon
  // (SVG), rendern wir es als Kind statt das Tag leer zu lassen (Spec 2026-07-25 §Blatt-Zweig). Ein
  // voidElement bleibt IMMER selbstschließend, auch wenn sein Fallback ein SVG enthält.
  if (!node.voidElement) {
    const svgNodes = collectSvgNodes(node.fallback);
    if (svgNodes.length) {
      const kids = svgNodes.map((s) => walkSvg(s, depth + 1)).join('\n');
      // `styledFallbackText` (s. avatarFallbackVisualClasses): ein Bild-/Illustrations-Avatar ohne
      // Text braucht dieselbe Rettung der gemessenen Hülle wie der Text-Fall oben — sonst verschwindet
      // die interpretierte Größe/Farbe hinter dem 40×40-grauen Katalog-Default.
      if (node.styledFallbackText) {
        const cls = ['flex', 'items-center', 'justify-center', ...avatarFallbackVisualClasses(node.fallback)];
        return `${pad}<${tag} className="${cls.join(' ')}"${attrStr}>\n${kids}\n${pad}</${tag}>`;
      }
      return `${pad}<${tag}${attrStr}>\n${kids}\n${pad}</${tag}>`;
    }
  }
  return `${pad}<${tag}${attrStr} />`;
}

/** Einen einzelnen `{name, from}`-Import in die Modul→Namen-Map eintragen (still bei fehlenden
 *  Feldern). Gemeinsam genutzt von collectCatalogImports fürs Katalog-Ref selbst und für dessen
 *  Sub-Komponenten-Slots (Spec 2026-07-25-sub-komponenten-slots-design.md). */
function addImport(byModule, imp) {
  if (!imp?.name || !imp?.from) return;
  const set = byModule.get(imp.from) || new Set();
  set.add(imp.name);
  byModule.set(imp.from, set);
}

/** Katalog-Imports im gerenderten Baum sammeln → Map<from, Set<name>>. Spiegelt walk: ein Katalog-ref
 *  wird als Komponente gerendert (Import zählt, kein Abstieg in seinen fallback); ein scan-interner
 *  Ref rendert seinen fallback → dort weiter absteigen. */
function collectCatalogImports(node, byModule) {
  if (!node || typeof node !== 'object') return;
  if (node.type === 'component-ref') {
    if (node.catalog && node.import?.name && node.import?.from) {
      addImport(byModule, node.import);
      // Container-Refs komponieren ihre Fallback-Kinder (walkCatalogRef) — deren eigene Katalog-
      // Imports (z. B. ein Badge in einer Card) müssen also mitgesammelt werden. Blatt-Refs rendern
      // ihren fallback nie (nur extrahierten Text) → dort bleibt es beim reinen Import-Zählen.
      if (isCatalogContainer(node)) {
        for (const c of node.fallback.children || []) collectCatalogImports(c, byModule);
        // Sub-Komponenten-Slots (Spec 2026-07-25-sub-komponenten-slots-design.md): wird tatsächlich
        // gesplittet (≥2 Kinder), rendert walkCatalogRef zusätzlich CardHeader/CardContent — deren
        // Imports müssen mit ins Dateikopf-Set, sonst fehlt der Import zur gerenderten JSX.
        if (node.slots && splitSlotChildren(node.fallback.children)) {
          addImport(byModule, node.slots.header.import);
          addImport(byModule, node.slots.content.import);
        }
      }
      return;
    }
    collectCatalogImports(node.fallback, byModule);
    return;
  }
  for (const c of node.children || []) collectCatalogImports(c, byModule);
}

/** Namen der im Plan gegroundeten Katalog-Komponenten (sortiert, dedupliziert) — für das grounded-
 *  Flag in der UI (Spec 2026-07-23 §Q4/Schritt 5). Spiegelt walk: in einen Katalog-ref nicht weiter
 *  absteigen (sein fallback wird nicht gerendert), in scan-interne Refs schon. */
export function groundedComponentNames(plan) {
  const names = new Set();
  const visit = (node) => {
    if (!node || typeof node !== 'object') return;
    if (node.type === 'component-ref') {
      if (node.catalog && node.name) {
        names.add(node.name);
        // Container-Refs komponieren ihre Fallback-Kinder → deren Katalog-Namen (z. B. Badge in
        // einer Card) gehören mit in die UI-Pille. Blatt-Refs steigen nicht ab (walk rendert ihren
        // fallback nie).
        if (isCatalogContainer(node)) {
          for (const c of node.fallback.children || []) visit(c);
        }
        return;
      }
      visit(node.fallback);
      return;
    }
    for (const c of node.children || []) visit(c);
  };
  visit(plan);
  return [...names].sort();
}

/** Gesammelte Katalog-Imports → sortierte `import { … } from "…";`-Zeilen (je Modul zusammengefasst).
 *  Ein Katalog-Name, der mit `componentName` kollidiert, wird importseitig aliasiert (`catalogLocalName`)
 *  — derselbe Alias, den `walkCatalogRef` fürs JSX-Tag verwendet. */
function buildImportLines(plan, componentName) {
  const byModule = new Map();
  collectCatalogImports(plan, byModule);
  return [...byModule.keys()].sort().map((from) => {
    const names = [...byModule.get(from)].sort()
      .map((n) => {
        const local = catalogLocalName(n, componentName);
        return local === n ? n : `${n} as ${local}`;
      })
      .join(', ');
    return `import { ${names} } from "${from}";`;
  });
}

export function planToJsx(plan, { name, tokens } = {}) {
  const componentName = name || 'Component';
  const body = walk(plan, 3, tokens, componentName); // 3 Ebenen Einrückung: export→return→( → Wurzel-Element
  // Wurzelklassen an den className-Passthrough hängen (Spec §Wrapper): das Wurzel-<div> trägt
  // seine eigenen Klassen + ${className}. Wir hängen den Passthrough in das gerenderte Wurzel-Tag.
  const rooted = injectClassNamePassthrough(body);
  const importLines = buildImportLines(plan, componentName);
  return [
    ...importLines,
    ...(importLines.length ? [''] : []),
    `export function ${componentName}({ className = "", ...props }) {`,
    `  return (`,
    rooted,
    `  );`,
    `}`,
    ``,
  ].join('\n');
}

/** Hängt ` ${className}` + {...props} an das äußerste Wurzel-Tag (Spec §Wrapper: className-Passthrough).
 *  Robust für beide Formen (`<div className="…">` und `<div />`/`<div>`). */
function injectClassNamePassthrough(body) {
  // Wurzelzeile ist die erste nicht-leere Zeile; ihr öffnendes Tag bekommt den Passthrough.
  const nl = body.indexOf('\n');
  const firstLine = nl === -1 ? body : body.slice(0, nl);
  const rest = nl === -1 ? '' : body.slice(nl);
  let injected;
  if (/className="/.test(firstLine)) {
    injected = firstLine.replace(/className="([^"]*)"/, 'className={`$1 ${className}`}');
  } else {
    // Kein className → nach dem Tag-Namen einfügen (funktioniert für `<div />` und `<div>`).
    injected = firstLine.replace(/^(\s*)<(\w+)/, '$1<$2 className={className}');
  }
  // {...props} zusätzlich ans Wurzel-Tag hängen (vor `/>` bzw. vor `>`).
  injected = injected.replace(/\s*(\/?)>/, ' {...props}$1>');
  return injected + rest;
}
