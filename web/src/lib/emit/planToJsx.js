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

function boxClasses(node, tokens) {
  const out = [];
  const isFlex = node.layout === 'row' || node.gap > 0 || node.primaryAlign !== 'MIN' || node.counterAlign !== 'MIN';
  if (isFlex) {
    out.push('flex');
    if (node.layout === 'column') out.push('flex-col');
    if (JUSTIFY_CLASS[node.primaryAlign]) out.push(JUSTIFY_CLASS[node.primaryAlign]);
    if (ITEMS_CLASS[node.counterAlign]) out.push(ITEMS_CLASS[node.counterAlign]);
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
  // Visual
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

/** Ein Plan-Knoten → JSX-String (mehrzeilig, mit `depth` eingerückt). */
function walk(node, depth, tokens) {
  const pad = INDENT.repeat(depth);
  if (!node || typeof node !== 'object') return '';
  if (node.type === 'text') return walkText(node, depth, tokens);
  if (node.type === 'svg') return walkSvg(node, depth);
  if (node.type === 'component-ref') {
    // DS-Grounding (Spec 2026-07-23 §Q3/Schritt 3): ein Katalog-ref (trägt `catalog` + `import`)
    // rendert die ECHTE Komponente (`<Button variant=…>Text</Button>`) — Import wird in planToJsx
    // gesammelt. Scan-interne Refs (kein `catalog`) rendern wie bisher ihren fallback-Box-Baum.
    if (node.catalog) return walkCatalogRef(node, depth);
    return walk(node.fallback, depth, tokens);
  }

  // box
  const cls = boxClasses(node, tokens).join(' ');
  const classAttr = cls ? ` className="${cls}"` : '';
  const kids = (node.children || []).map((c) => walk(c, depth + 1, tokens)).filter(Boolean);
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
 *  (z. B. Button-Label). Reine Funktion; Whitespace kollabiert. */
function extractText(node) {
  if (!node || typeof node !== 'object') return '';
  if (node.type === 'text') return node.content || '';
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

function walkCatalogRef(node, depth) {
  const pad = INDENT.repeat(depth);
  const tag = node.import?.name || node.name || 'Component';
  const attrs = catalogPropAttrs(node.props);
  const attrStr = attrs ? ` ${attrs}` : '';
  const text = extractText(node.fallback).replace(/\s+/g, ' ').trim();
  if (!text) return `${pad}<${tag}${attrStr} />`;
  return `${pad}<${tag}${attrStr}>${escapeJsxText(text)}</${tag}>`;
}

/** Katalog-Imports im gerenderten Baum sammeln → Map<from, Set<name>>. Spiegelt walk: ein Katalog-ref
 *  wird als Komponente gerendert (Import zählt, kein Abstieg in seinen fallback); ein scan-interner
 *  Ref rendert seinen fallback → dort weiter absteigen. */
function collectCatalogImports(node, byModule) {
  if (!node || typeof node !== 'object') return;
  if (node.type === 'component-ref') {
    if (node.catalog && node.import?.name && node.import?.from) {
      const set = byModule.get(node.import.from) || new Set();
      set.add(node.import.name);
      byModule.set(node.import.from, set);
      return;
    }
    collectCatalogImports(node.fallback, byModule);
    return;
  }
  for (const c of node.children || []) collectCatalogImports(c, byModule);
}

/** Gesammelte Katalog-Imports → sortierte `import { … } from "…";`-Zeilen (je Modul zusammengefasst). */
function buildImportLines(plan) {
  const byModule = new Map();
  collectCatalogImports(plan, byModule);
  return [...byModule.keys()].sort().map((from) => {
    const names = [...byModule.get(from)].sort().join(', ');
    return `import { ${names} } from "${from}";`;
  });
}

export function planToJsx(plan, { name, tokens } = {}) {
  const componentName = name || 'Component';
  const body = walk(plan, 3, tokens); // 3 Ebenen Einrückung: export→return→( → Wurzel-Element
  // Wurzelklassen an den className-Passthrough hängen (Spec §Wrapper): das Wurzel-<div> trägt
  // seine eigenen Klassen + ${className}. Wir hängen den Passthrough in das gerenderte Wurzel-Tag.
  const rooted = injectClassNamePassthrough(body);
  const importLines = buildImportLines(plan);
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
