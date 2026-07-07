// Wie pickTokens, aber Farb-Slots als { value, token } für die Figma-Style-Verknüpfung.
// Die Slot-Regexe MÜSSEN mit pickTokens.js identisch bleiben.
export function pickTokenRefs(tokens = []) {
  const colors = tokens.filter((t) => t.group === 'color');
  const byRole = (re) => colors.find((c) => re.test(String(c.source?.role ?? '')));
  const ref = (tk, fallback) => (tk ? { value: tk.value, token: tk.name } : { value: fallback, token: null });
  const radius = tokens.find((t) => t.group === 'radius')?.value;
  const font = tokens.find((t) => t.group === 'font')?.value;
  return {
    primary: ref(byRole(/primary|brand|accent/i) ?? colors[0], '#18181b'),
    onPrimary: ref(byRole(/on.?primary|on.?brand|button text/i), '#ffffff'),
    text: ref(byRole(/text|foreground|body/i), '#18181b'),
    surface: ref(byRole(/background|surface|card/i), '#ffffff'),
    surfaceMuted: ref(byRole(/muted|subtle|secondary background|secondary-bg/i), '#f4f4f5'),
    border: ref(byRole(/border|outline|divider/i), '#e4e4e7'),
    radius: radius ?? '6px',
    fontSize: font?.fontSize ?? '14px',
    fontWeight: font?.fontWeight ?? '500',
  };
}
