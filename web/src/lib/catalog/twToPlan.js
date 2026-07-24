// twToPlan — DS-Grounding Scheibe 2, der Kern des "abgeleiteten Renderings".
// Übersetzt einen Tailwind-Klassen-String (aus dem cva-Parser: base + variant + size) in einen
// kanonischen plan-Knoten — dasselbe Format wie der Default-Katalog / die Templates:
//   box  = { type:'box', layout, padding:[t,r,b,l], radius, fill, stroke, children }
//   text = { type:'text', content, fontSize, fontWeight, color:{token,hex} }
//
// BEWUSST bounded auf das shadcn-Utility-Set (Spec-Non-Goal: kein voller Tailwind-Compiler).
// Unbekannte Klassen werden ignoriert → degradiert sauber. State-/Responsive-Varianten
// (hover:, focus-visible:, md: …) werden verworfen (beschreiben nicht den Grundzustand).

const LITERAL_COLORS = { white: '#ffffff', black: '#000000', transparent: null };

const TEXT_SIZE = { 'text-xs': 12, 'text-sm': 14, 'text-base': 16, 'text-lg': 18, 'text-xl': 20, 'text-2xl': 24, 'text-3xl': 30 };
const FONT_WEIGHT = { 'font-thin': 100, 'font-light': 300, 'font-normal': 400, 'font-medium': 500, 'font-semibold': 600, 'font-bold': 700, 'font-extrabold': 800 };

/** Tailwind-Spacing-Token → px. '4'→16, '2.5'→10, '0.5'→2, 'px'→1, '0'→0. */
function spaceToPx(token) {
  if (token === 'px') return 1;
  const n = parseFloat(token);
  return Number.isFinite(n) ? n * 4 : null;
}

/** '0.5rem'→8, '8px'→8, '10'→10. Fallback null. */
function lenToPx(value) {
  if (typeof value !== 'string') return null;
  const n = parseFloat(value);
  if (!Number.isFinite(n)) return null;
  if (value.includes('rem')) return n * 16;
  return n;
}

function colorRef(slot, theme) {
  const hex = theme?.colors?.[slot] ?? (slot in LITERAL_COLORS ? LITERAL_COLORS[slot] : null);
  return { token: slot, hex };
}

/** radius-Auflösung nach shadcn-Konvention gegen --radius; Fallback = Tailwind-Standard. */
function radiusResolver(theme) {
  const r = lenToPx(theme?.vars?.radius) ?? 8; // shadcn-Default 0.5rem
  return (cls) => {
    switch (cls) {
      case 'rounded-none': return 0;
      case 'rounded-sm': return Math.max(0, r - 4);
      case 'rounded': return 4; // Tailwind-fix 0.25rem, nicht themengebunden
      case 'rounded-md': return Math.max(0, r - 2);
      case 'rounded-lg': return r;
      case 'rounded-xl': return r + 4;
      case 'rounded-2xl': return r + 8;
      case 'rounded-3xl': return r + 16;
      case 'rounded-full': return 9999;
      default: return null;
    }
  };
}

/**
 * @param {string} classString  Tailwind-Klassen (Leerzeichen-getrennt).
 * @param {object} opts
 * @param {{colors?:object,vars?:object}} [opts.theme]  aus themeReader.
 * @param {string|null} [opts.label]  wenn gesetzt, wird ein Text-Kind mit diesem Inhalt erzeugt.
 * @param {'atom'|'container'} [opts.kind]  nur informativ.
 * @returns {object} plan-box-Knoten
 */
export function twToPlan(classString, { theme = { colors: {}, vars: {} }, label = null } = {}) {
  const toRadius = radiusResolver(theme);
  const padding = [0, 0, 0, 0]; // t, r, b, l
  let layout = 'row';
  let radius = 0;
  let fill = null;
  let stroke = null;
  let bordered = false;
  let borderSlot = 'border';
  let textSize = null;
  let textWeight = null;
  let textColorSlot = null;

  const classes = String(classString || '')
    .split(/\s+/)
    .filter(Boolean)
    .filter((c) => !c.includes(':')); // hover:/focus:/md: … verwerfen

  for (const cls of classes) {
    // Layout
    if (cls === 'flex-col') { layout = 'column'; continue; }
    if (cls === 'flex-row') { layout = 'row'; continue; }

    // Padding
    let m = cls.match(/^p([xytrbl]?)-(.+)$/);
    if (m) {
      const px = spaceToPx(m[2]);
      if (px != null) {
        const side = m[1];
        if (side === '' ) { padding[0] = padding[1] = padding[2] = padding[3] = px; }
        else if (side === 'x') { padding[1] = padding[3] = px; }
        else if (side === 'y') { padding[0] = padding[2] = px; }
        else if (side === 't') padding[0] = px;
        else if (side === 'r') padding[1] = px;
        else if (side === 'b') padding[2] = px;
        else if (side === 'l') padding[3] = px;
      }
      continue;
    }

    // Radius (letzte gewinnt)
    if (cls.startsWith('rounded')) {
      const rr = toRadius(cls);
      if (rr != null) radius = rr;
      continue;
    }

    // Hintergrund
    if (cls.startsWith('bg-')) {
      const slot = cls.slice(3).split('/')[0];
      fill = colorRef(slot, theme);
      continue;
    }

    // Border (Breite vs. Farbe)
    if (cls === 'border' || /^border-\d+$/.test(cls)) { bordered = true; continue; }
    m = cls.match(/^border-([a-z][a-z-]*)$/);
    if (m) { bordered = true; borderSlot = m[1]; continue; }

    // Text: Größe vs. Gewicht vs. Farbe
    if (cls in TEXT_SIZE) { textSize = TEXT_SIZE[cls]; continue; }
    if (cls in FONT_WEIGHT) { textWeight = FONT_WEIGHT[cls]; continue; }
    if (cls.startsWith('text-')) {
      const slot = cls.slice(5).split('/')[0];
      if ((theme?.colors && slot in theme.colors) || slot in LITERAL_COLORS) textColorSlot = slot;
      continue;
    }
    // alles andere (h-*, w-*, inline-flex, items-*, transition-*, …) bewusst ignoriert
  }

  if (bordered) stroke = colorRef(borderSlot, theme);

  const boxNode = { type: 'box', layout, padding, radius, fill, stroke, children: [] };
  if (label != null) {
    boxNode.children.push({
      type: 'text',
      content: label,
      fontSize: textSize ?? 14,
      fontWeight: textWeight ?? 400,
      color: colorRef(textColorSlot ?? 'foreground', theme),
    });
  }
  return boxNode;
}
