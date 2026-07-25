// Reine Bausteine für storybook-harness/tailwind.config.js — ausgelagert, damit sie ohne
// Tailwind/PostCSS-Kontext testbar sind. Siehe tailwind.config.js für die ausführliche
// Begründung der Function-Eval-Entscheidung (statt import()/createRequire).
import fs from 'node:fs';

/**
 * Liest eine `export default {...}`-ES-Modul-Datei (z. B. tailwind.tokens.js aus einem
 * DesignBridge-Storybook-Export) als Text und wertet nur das Objekt-Literal aus — ohne sie
 * über Node's Modul-Loader (import/require) zu laden. Kein Nutzer-Input: die Datei kommt
 * immer aus einem eigenen Generator (web/src/lib/emit/buildTokenSourceFiles.js).
 * Liefert {} wenn die Datei fehlt oder sich nicht auswerten lässt.
 */
export function loadScanTokens(tokensFile) {
  if (!fs.existsSync(tokensFile)) return {};
  try {
    const src = fs.readFileSync(tokensFile, 'utf8');
    // `^` (mit /m) statt eines freien Suchmusters: emitTailwind.js' Header-Kommentar enthält
    // selbst den Text "export default { theme: { extend: tokens } }" als Erklärung — ein
    // ungeankertes Muster fängt sich in diesem Kommentar statt im echten Statement darunter.
    const match = src.match(/^export\s+default\s+([\s\S]*)/m);
    if (!match) return {};
    let expr = match[1].trim();
    if (expr.endsWith(';')) expr = expr.slice(0, -1);
    // eslint-disable-next-line no-new-func -- generierter Code, kein Nutzer-Input, s.o.
    return new Function(`"use strict"; return (${expr});`)();
  } catch {
    return {};
  }
}

/**
 * Flaches Deep-Merge über die theme.extend-Keys (colors/spacing/borderRadius/fontSize/…):
 * `extra` (Scan-Tokens) gewinnt bei Namensgleichheit, alles aus `base` (shadcn-Default-Theme)
 * bleibt erhalten, was nicht überschrieben wird.
 */
export function mergeExtend(base, extra) {
  const out = { ...base };
  for (const [key, value] of Object.entries(extra || {})) {
    const baseValue = base[key];
    if (value && typeof value === 'object' && !Array.isArray(value) && baseValue && typeof baseValue === 'object') {
      out[key] = { ...baseValue, ...value };
    } else {
      out[key] = value;
    }
  }
  return out;
}
