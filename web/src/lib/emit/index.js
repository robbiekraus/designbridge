import { normalizeTokens } from './normalizeTokens.js';
import { emitCss } from './emitCss.js';
import { emitTailwind } from './emitTailwind.js';
import { emitTokensJson } from './emitTokensJson.js';
import { emitFigma } from './emitFigma.js';
import { emitFigmaComponents, emitFigmaLibrary } from './emitFigmaComponents.js';

export { emitComponents } from './emitComponents.js';
export { emitStories } from './emitStories.js';
export { buildLibraryZip } from './buildLibraryZip.js';
export { buildStorybookZip, storybookFiles } from './buildStorybookZip.js';

export const EXPORT_FORMATS = [
  { id: 'css', label: 'CSS-Variablen', filename: 'tokens.css', mime: 'text/css' },
  { id: 'tailwind', label: 'Tailwind-Config', filename: 'tailwind.config.tokens.js', mime: 'text/javascript' },
  { id: 'json', label: 'tokens.json', filename: 'tokens.json', mime: 'application/json' },
  { id: 'figma', label: 'Nach Figma (Plugin)', filename: 'designbridge-figma.json', mime: 'application/json' },
];

export function buildExports(result) {
  const rawTokens = result?.raw?.tokens;
  if (!rawTokens) return null;
  const tokens = normalizeTokens(rawTokens);
  if (tokens.length === 0) return null;
  return {
    css: emitCss(tokens),
    tailwind: emitTailwind(tokens),
    json: emitTokensJson(tokens),
    // Reihenfolge: Bausteine zuerst (schreiben Konverter-Warnungen), dann die DS-Library — beide
    // lesen denselben Katalog, damit die `DS/…`-Refs der Bausteine in der Library landen.
    figma: emitFigma(tokens, emitFigmaComponents(result), emitFigmaLibrary(result)),
  };
}
