// Slot-Auflösung: Scan-Tokens → benannte Design-Slots für die Templates.
// Die Regexe/Prädikate MÜSSEN mit pickTokenRefs.js identisch bleiben.
//
// Fix 13.07.: (1) surfaceMuted matchte den erstbesten „muted"-Namen — bei Scans mit
// foreground-muted (Textfarbe!) wurde die zur Fläche → dunkler „disabled"-Input in Figma.
// Jetzt muss die Rolle wie eine FLÄCHE aussehen UND gedämpft sein. (2) Der Font-Slot nahm
// stumpf das ERSTE Font-Token (oft display/H1, z. B. 32/700) — jetzt Body-Rolle zuerst,
// sonst das kleinste Font-Token (Buttons/Inputs brauchen Lauftext, keine Überschrift).

export const MUTED_SURFACE_ROLE = (role) =>
  /(surface|background|bg|card)/i.test(role) && /(muted|subtle|secondary)/i.test(role);

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
  return {
    primary: byRole(/primary|brand|accent/i) ?? colors[0]?.value ?? '#18181b',
    onPrimary: byRole(/on.?primary|on.?brand|button text/i) ?? '#ffffff',
    text: byRole(/text|foreground|body/i) ?? '#18181b',
    surface: byRole(/background|surface|card/i) ?? '#ffffff',
    surfaceMuted:
      colors.find((c) => MUTED_SURFACE_ROLE(String(c.source?.role ?? '')))?.value ?? '#f4f4f5',
    border: byRole(/border|outline|divider/i) ?? '#e4e4e7',
    radius: radius ?? '6px',
    fontSize: font?.fontSize ?? '14px',
    fontWeight: font?.fontWeight ?? '500',
  };
}
