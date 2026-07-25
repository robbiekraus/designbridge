import { normalizeTokens } from './normalizeTokens.js';
import { emitCss } from './emitCss.js';
import { emitTailwind } from './emitTailwind.js';

// Gemeinsame Quelle für die zwei Token-Dateien, die Storybook- und Library-Pakete
// mitbringen, damit die im Komponenten-Code erzeugten Tailwind-Klassen (z. B.
// `p-card-layout-padding-and-grid-gaps`, `text-foreground-primary`, `bg-background-card`)
// im Empfangsprojekt tatsächlich definiert sind — nicht nur in Robs eigenem Repo mit der
// exportierten Tailwind-Config. Reine Wiederverwendung der bestehenden Token-Format-
// Generatoren (dieselben, die Export.jsx für die Tabs „CSS-Variablen" und „Tailwind-Config"
// aufruft) — hier keine eigene Token-Iteration.
export function buildTokenSourceFiles(result) {
  const rawTokens = result?.raw?.tokens;
  if (!rawTokens) return null;
  const tokens = normalizeTokens(rawTokens);
  if (tokens.length === 0) return null;

  const tokensCss = emitCss(tokens);
  // emitTailwind() liefert ein CommonJS-Modul (`module.exports = {...}`) — für ein
  // eigenständiges tailwind.tokens.js, das ein modernes (ESM-)Projekt per `import`
  // einbinden soll, reicht ein rein mechanischer Wrapper-Tausch; die Token-Blöcke selbst
  // kommen unverändert aus dem bestehenden Generator.
  const tailwindTokensJs = emitTailwind(tokens).replace(/^module\.exports = /m, 'export default ');

  return { tokensCss, tailwindTokensJs };
}
