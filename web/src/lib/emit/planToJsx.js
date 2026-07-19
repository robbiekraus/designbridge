// Deterministischer plan→Tailwind/JSX-Emitter (Spec: docs/superpowers/specs/2026-07-19-plan-to-
// tailwind-emitter-design.md). Reine Funktion: kanonischer plan-Baum (box/text/svg/component-ref,
// Vertrag s. htmlToPlan.js) → shadcn/Tailwind-React-Komponente als Code-String. Werktreu mit
// arbitrary values (gap-[12px], bg-[#022d2c]) — Token-Snapping ist Scheibe 2. Kein DOM nötig.
//
// Bewusste Grenzen v1 (Spec §Bewusst NICHT in Scheibe 1): `absolute` wird ignoriert (Tailwind
// bleibt aufs Flow-Raster), component-ref rendert seinen fallback-Box-Baum (entsteht in der
// emitComponents-Verdrahtung ohnehin nicht — knownComponents:[]), SVG-`style`-Attribute entfallen.

const INDENT = '  ';

/** px-Zahl → arbitrary-Klasse `<prefix>-[Npx]`, nur für > 0. */
function pxClass(prefix, n) {
  return Number.isFinite(n) && n > 0 ? `${prefix}-[${Math.round(n)}px]` : null;
}

/** padding [t,r,b,l] → minimale Tailwind-Klassenliste (all-equal → p-, t=b&l=r → px-/py-, sonst einzeln). */
function paddingClasses([t, r, b, l]) {
  if (!t && !r && !b && !l) return [];
  if (t === r && r === b && b === l) return [`p-[${t}px]`];
  const out = [];
  if (t === b && l === r) {
    if (l > 0) out.push(`px-[${l}px]`);
    if (t > 0) out.push(`py-[${t}px]`);
    return out;
  }
  if (t > 0) out.push(`pt-[${t}px]`);
  if (r > 0) out.push(`pr-[${r}px]`);
  if (b > 0) out.push(`pb-[${b}px]`);
  if (l > 0) out.push(`pl-[${l}px]`);
  return out;
}

const JUSTIFY_CLASS = { CENTER: 'justify-center', MAX: 'justify-end', SPACE_BETWEEN: 'justify-between' };
const ITEMS_CLASS = { CENTER: 'items-center', MAX: 'items-end', STRETCH: 'items-stretch' };

function boxClasses(node) {
  const out = [];
  const isFlex = node.layout === 'row' || node.gap > 0 || node.primaryAlign !== 'MIN' || node.counterAlign !== 'MIN';
  // Layout
  if (isFlex) {
    out.push('flex');
    if (node.layout === 'column') out.push('flex-col');
    if (JUSTIFY_CLASS[node.primaryAlign]) out.push(JUSTIFY_CLASS[node.primaryAlign]);
    if (ITEMS_CLASS[node.counterAlign]) out.push(ITEMS_CLASS[node.counterAlign]);
  }
  if (node.stretch) out.push('self-stretch');
  if (node.grow) out.push('flex-1');
  // Sizing
  const w = pxClass('w', node.width);
  const h = pxClass('h', node.height);
  if (w) out.push(w);
  if (h) out.push(h);
  // Spacing
  const gap = pxClass('gap', node.gap);
  if (gap) out.push(gap);
  out.push(...paddingClasses(node.padding));
  // Visual
  if (node.fill?.hex) out.push(`bg-[${node.fill.hex}]`);
  if (node.stroke?.hex) {
    out.push('border', `border-[${node.stroke.hex}]`);
    if (Number.isFinite(node.strokeWeight) && node.strokeWeight !== 1) out.push(`border-[${node.strokeWeight}px]`);
  }
  const radius = pxClass('rounded', node.radius);
  if (radius) out.push(radius);
  return out;
}

/** Ein Plan-Knoten → JSX-String (mehrzeilig, mit `depth` eingerückt). */
function walk(node, depth) {
  const pad = INDENT.repeat(depth);
  if (!node || typeof node !== 'object') return '';
  if (node.type === 'text') return walkText(node, depth); // Task 2
  if (node.type === 'svg') return walkSvg(node, depth);   // Task 3
  if (node.type === 'component-ref') return walk(node.fallback, depth); // fallback-Box, defensiv

  // box
  const cls = boxClasses(node).join(' ');
  const classAttr = cls ? ` className="${cls}"` : '';
  const kids = (node.children || []).map((c) => walk(c, depth + 1)).filter(Boolean);
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

function textClasses(node) {
  const out = [`text-[${Math.round(node.fontSize)}px]`];
  out.push(FONT_WEIGHT_NAME[node.fontWeight] || `font-[${node.fontWeight}]`);
  if (node.color?.hex) out.push(`text-[${node.color.hex}]`);
  if (node.align === 'center') out.push('text-center');
  else if (node.align === 'right') out.push('text-right');
  if (node.lineHeight != null) out.push(`leading-[${Math.round(node.lineHeight)}px]`);
  if (node.stretch) out.push('self-stretch');
  if (node.grow) out.push('flex-1');
  return out;
}

function walkText(node, depth) {
  const pad = INDENT.repeat(depth);
  const cls = textClasses(node).join(' ');
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

export function planToJsx(plan, { name } = {}) {
  const componentName = name || 'Component';
  const body = walk(plan, 3); // 3 Ebenen Einrückung: export→return→( → Wurzel-Element
  // Wurzelklassen an den className-Passthrough hängen (Spec §Wrapper): das Wurzel-<div> trägt
  // seine eigenen Klassen + ${className}. Wir hängen den Passthrough in das gerenderte Wurzel-Tag.
  const rooted = injectClassNamePassthrough(body);
  return [
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
