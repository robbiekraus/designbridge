// Slot-Auflösung: Scan-Tokens → benannte Design-Slots für die Templates.
// Die Regexe/Prädikate MÜSSEN mit pickTokenRefs.js identisch bleiben.
//
// Fix 13.07.: (1) surfaceMuted matchte den erstbesten „muted"-Namen — bei Scans mit
// foreground-muted (Textfarbe!) wurde die zur Fläche → dunkler „disabled"-Input in Figma.
// Jetzt muss die Rolle wie eine FLÄCHE aussehen UND gedämpft sein. (2) Der Font-Slot nahm
// stumpf das ERSTE Font-Token (oft display/H1, z. B. 32/700) — jetzt Body-Rolle zuerst,
// sonst das kleinste Font-Token (Buttons/Inputs brauchen Lauftext, keine Überschrift).
//
// Fix Testrunde 2: Eine einzelne Rolle konnte sowohl die Hintergrund- als auch die
// Text-Regel treffen (z. B. "accent button text" matcht /primary|brand|accent/i UND
// /on.?primary|on.?brand|button text/i) → Button-Template bekam dieselbe Farbe für
// Hintergrund UND Text (#79c0ff auf #79c0ff, unlesbar). ensureReadableText() verhindert
// das: Text-Kandidat darf nie identisch mit der gewählten Hintergrundfarbe sein, sonst
// nächstbeste Token-Farbe mit ausreichend Kontrast, sonst Schwarz/Weiß je nach bg-Luminanz.

export const MUTED_SURFACE_ROLE = (role) =>
  /(surface|background|bg|card)/i.test(role) && /(muted|subtle|secondary)/i.test(role);

function hexToRgb(hex) {
  if (typeof hex !== 'string') return null;
  let h = hex.trim().replace(/^#/, '');
  if (h.length === 3) h = h.split('').map((c) => c + c).join('');
  if (!/^[0-9a-f]{6}$/i.test(h)) return null;
  const num = parseInt(h, 16);
  return [(num >> 16) & 255, (num >> 8) & 255, num & 255];
}

function srgbToLinear(c) {
  const v = c / 255;
  return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
}

function relativeLuminance(hex) {
  const rgb = hexToRgb(hex);
  if (!rgb) return 0;
  const [r, g, b] = rgb;
  return 0.2126 * srgbToLinear(r) + 0.7152 * srgbToLinear(g) + 0.0722 * srgbToLinear(b);
}

function contrastRatio(hexA, hexB) {
  const l1 = relativeLuminance(hexA);
  const l2 = relativeLuminance(hexB);
  const lighter = Math.max(l1, l2);
  const darker = Math.min(l1, l2);
  return (lighter + 0.05) / (darker + 0.05);
}

function sameColor(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') return a === b;
  return a.trim().toLowerCase() === b.trim().toLowerCase();
}

// Liefert eine lesbare Text-Farbe für den Hintergrund `bgHex`. `candidateHex` wird
// übernommen, sofern sie nicht mit dem Hintergrund identisch ist und ausreichend
// Kontrast hat. Sonst wird unter `allColors` (z. B. alle Farb-Tokens des Scans) die
// Kandidatin mit dem besten Kontrast gesucht. Bleibt das erfolglos, entscheidet die
// Luminanz des Hintergrunds über Schwarz oder Weiß als letzten Fallback.
export function ensureReadableText(candidateHex, bgHex, allColors = [], minRatio = 2) {
  if (
    candidateHex &&
    bgHex &&
    !sameColor(candidateHex, bgHex) &&
    contrastRatio(candidateHex, bgHex) >= minRatio
  ) {
    return candidateHex;
  }
  let best = null;
  let bestRatio = 0;
  for (const c of allColors) {
    if (!c || sameColor(c, bgHex)) continue;
    const ratio = contrastRatio(c, bgHex);
    if (ratio > bestRatio) {
      bestRatio = ratio;
      best = c;
    }
  }
  if (best && bestRatio >= minRatio) return best;
  return relativeLuminance(bgHex) > 0.5 ? '#18181b' : '#ffffff';
}

const BODY_FONT_ROLE = /body|paragraph|base|default|text/i;

export function pickBodyFont(tokens = []) {
  const fonts = tokens.filter((t) => t.group === 'font');
  const body = fonts.find((f) => BODY_FONT_ROLE.test(String(f.source?.role ?? '')));
  if (body) return body.value;
  const smallest = fonts
    .slice()
    .sort((a, b) => (parseFloat(a.value?.fontSize) || 99) - (parseFloat(b.value?.fontSize) || 99))[0];
  return smallest?.value;
}

export function pickTokens(tokens = []) {
  const colors = tokens.filter((t) => t.group === 'color');
  const byRole = (re) =>
    colors.find((c) => re.test(String(c.source?.role ?? '')))?.value;
  const radius = tokens.find((t) => t.group === 'radius')?.value;
  const font = pickBodyFont(tokens);
  const colorValues = colors.map((c) => c.value);

  const primary = byRole(/primary|brand|accent/i) ?? colors[0]?.value ?? '#18181b';
  const onPrimary = ensureReadableText(
    byRole(/on.?primary|on.?brand|button text/i) ?? '#ffffff',
    primary,
    colorValues
  );
  const surface = byRole(/background|surface|card/i) ?? '#ffffff';
  const text = ensureReadableText(
    byRole(/text|foreground|body/i) ?? '#18181b',
    surface,
    colorValues
  );

  return {
    primary,
    onPrimary,
    text,
    surface,
    surfaceMuted:
      colors.find((c) => MUTED_SURFACE_ROLE(String(c.source?.role ?? '')))?.value ?? '#f4f4f5',
    border: byRole(/border|outline|divider/i) ?? '#e4e4e7',
    radius: radius ?? '6px',
    fontSize: font?.fontSize ?? '14px',
    fontWeight: font?.fontWeight ?? '500',
  };
}
