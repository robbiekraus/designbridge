export function pickTokens(tokens = []) {
  const colors = tokens.filter((t) => t.group === 'color');
  const byRole = (re) =>
    colors.find((c) => re.test(String(c.source?.role ?? '')))?.value;
  const radius = tokens.find((t) => t.group === 'radius')?.value;
  const font = tokens.find((t) => t.group === 'font')?.value;
  return {
    primary: byRole(/primary|brand|accent/i) ?? colors[0]?.value ?? '#18181b',
    onPrimary: byRole(/on.?primary|on.?brand|button text/i) ?? '#ffffff',
    text: byRole(/text|foreground|body/i) ?? '#18181b',
    surface: byRole(/background|surface|card/i) ?? '#ffffff',
    surfaceMuted: byRole(/muted|subtle|secondary background|secondary-bg/i) ?? '#f4f4f5',
    border: byRole(/border|outline|divider/i) ?? '#e4e4e7',
    radius: radius ?? '6px',
    fontSize: font?.fontSize ?? '14px',
    fontWeight: font?.fontWeight ?? '500',
  };
}
