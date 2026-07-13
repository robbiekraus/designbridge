// Wie pickTokens, aber Farb-Slots als { value, token } für die Figma-Style-Verknüpfung.
// Die Slot-Regexe/Prädikate MÜSSEN mit pickTokens.js identisch bleiben (Fix 13.07. dort erklärt:
// surfaceMuted nur echte Flächen-Rollen; Font-Slot Body-Rolle vor kleinstem statt erstes Token).
import { MUTED_SURFACE_ROLE, pickBodyFont } from './pickTokens.js';

export function pickTokenRefs(tokens = []) {
  const colors = tokens.filter((t) => t.group === 'color');
  const byRole = (re) => colors.find((c) => re.test(String(c.source?.role ?? '')));
  const ref = (tk, fallback) => (tk ? { value: tk.value, token: tk.name } : { value: fallback, token: null });
  const radius = tokens.find((t) => t.group === 'radius')?.value;
  const font = pickBodyFont(tokens);
  return {
    primary: ref(byRole(/primary|brand|accent/i) ?? colors[0], '#18181b'),
    onPrimary: ref(byRole(/on.?primary|on.?brand|button text/i), '#ffffff'),
    text: ref(byRole(/text|foreground|body/i), '#18181b'),
    surface: ref(byRole(/background|surface|card/i), '#ffffff'),
    surfaceMuted: ref(
      colors.find((c) => MUTED_SURFACE_ROLE(String(c.source?.role ?? ''))),
      '#f4f4f5'
    ),
    border: ref(byRole(/border|outline|divider/i), '#e4e4e7'),
    radius: radius ?? '6px',
    fontSize: font?.fontSize ?? '14px',
    fontWeight: font?.fontWeight ?? '500',
  };
}
