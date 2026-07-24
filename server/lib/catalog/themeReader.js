// Theme-Leser — DS-Grounding Scheibe 2. Liest die CSS-Variablen aus dem :root-Block einer
// globals.css (shadcn-Konvention) und liefert:
//   { vars:   { <name>: '<rohwert>' },              alle --variablen roh (z. B. radius: '0.5rem')
//     colors: { <slot>: '#rrggbb' } }               Farb-Slots als Hex (HSL-Tripel umgerechnet)
//
// shadcn speichert Farben als HSL-Tripel OHNE hsl()-Wrapper (`--primary: 240 5.9% 10%`), damit
// Tailwind sie als `hsl(var(--primary))` einsetzen kann. Für den Figma-`plan` brauchen wir echte
// Hex-Werte → hier die Umrechnung. Nicht-Farb-Variablen (radius) bleiben nur in `vars`.

/** '240 5.9% 10%' → '#18181b'. Gibt null zurück, wenn kein plausibles HSL-Tripel. */
function hslTripletToHex(value) {
  const parts = String(value).trim().split(/[\s,]+/).filter(Boolean);
  if (parts.length < 3) return null;
  const h = parseFloat(parts[0]);
  const s = parseFloat(parts[1]) / 100;
  const l = parseFloat(parts[2]) / 100;
  if (![h, s, l].every(Number.isFinite)) return null;
  if (s < 0 || s > 1 || l < 0 || l > 1) return null;

  const c = (1 - Math.abs(2 * l - 1)) * s;
  const hp = ((h % 360) + 360) % 360 / 60;
  const x = c * (1 - Math.abs((hp % 2) - 1));
  let r = 0;
  let g = 0;
  let b = 0;
  if (hp < 1) [r, g, b] = [c, x, 0];
  else if (hp < 2) [r, g, b] = [x, c, 0];
  else if (hp < 3) [r, g, b] = [0, c, x];
  else if (hp < 4) [r, g, b] = [0, x, c];
  else if (hp < 5) [r, g, b] = [x, 0, c];
  else [r, g, b] = [c, 0, x];
  const m = l - c / 2;
  const hex = (v) => Math.round((v + m) * 255).toString(16).padStart(2, '0');
  return `#${hex(r)}${hex(g)}${hex(b)}`;
}

/** Liest den ersten :root { … }-Block und alle --variablen daraus. */
export function readTheme(css) {
  const vars = {};
  const colors = {};
  if (typeof css !== 'string') return { vars, colors };

  const rootIdx = css.indexOf(':root');
  const scope = rootIdx === -1 ? css : css.slice(rootIdx);
  const open = scope.indexOf('{');
  if (open === -1) return { vars, colors };
  // Bis zur passenden schließenden Klammer (einfache Tiefenzählung reicht für einen CSS-Block).
  let depth = 0;
  let end = scope.length;
  for (let i = open; i < scope.length; i += 1) {
    if (scope[i] === '{') depth += 1;
    else if (scope[i] === '}') { depth -= 1; if (depth === 0) { end = i; break; } }
  }
  const body = scope.slice(open + 1, end);

  const re = /--([\w-]+)\s*:\s*([^;]+);/g;
  let m;
  while ((m = re.exec(body)) !== null) {
    const name = m[1].trim();
    const value = m[2].trim();
    vars[name] = value;
    const hex = hslTripletToHex(value);
    if (hex) colors[name] = hex;
  }
  return { vars, colors };
}

export { hslTripletToHex };
