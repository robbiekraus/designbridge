// Wie pickTokens, aber Farb-Slots als { value, token } für die Figma-Style-Verknüpfung.
// Die Slot-Regexe/Prädikate MÜSSEN mit pickTokens.js identisch bleiben (Fix 13.07. dort erklärt:
// surfaceMuted nur echte Flächen-Rollen; Font-Slot Body-Rolle vor kleinstem statt erstes Token).
//
// Fix Testrunde 2: onPrimary/text dürfen nie mit dem zugehörigen Hintergrund (primary/surface)
// identisch sein — siehe ensureReadableText() in pickTokens.js. resolveTextRef() spiegelt das
// hier und ordnet der ggf. ausgewichenen Farbe wieder den richtigen Token-Namen zu.
import { MUTED_SURFACE_ROLE, pickBodyFont, ensureReadableText } from './pickTokens.js';

function resolveTextRef(candidateTok, fallbackValue, bgValue, colors) {
  const candidateValue = candidateTok ? candidateTok.value : fallbackValue;
  const readable = ensureReadableText(candidateValue, bgValue, colors.map((c) => c.value));
  if (readable === candidateValue) {
    return candidateTok
      ? { value: candidateTok.value, token: candidateTok.name }
      : { value: fallbackValue, token: null };
  }
  const match = colors.find((c) => c.value === readable);
  return match ? { value: match.value, token: match.name } : { value: readable, token: null };
}

export function pickTokenRefs(tokens = []) {
  const colors = tokens.filter((t) => t.group === 'color');
  const byRole = (re) => colors.find((c) => re.test(String(c.source?.role ?? '')));
  const ref = (tk, fallback) => (tk ? { value: tk.value, token: tk.name } : { value: fallback, token: null });
  const radius = tokens.find((t) => t.group === 'radius')?.value;
  const font = pickBodyFont(tokens);

  const primary = ref(byRole(/primary|brand|accent/i) ?? colors[0], '#18181b');
  const onPrimary = resolveTextRef(
    byRole(/on.?primary|on.?brand|button text/i),
    '#ffffff',
    primary.value,
    colors
  );
  const surface = ref(byRole(/background|surface|card/i), '#ffffff');
  const text = resolveTextRef(
    byRole(/text|foreground|body/i),
    '#18181b',
    surface.value,
    colors
  );

  return {
    primary,
    onPrimary,
    text,
    surface,
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
