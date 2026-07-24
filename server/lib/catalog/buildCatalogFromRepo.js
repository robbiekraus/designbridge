// buildCatalogFromRepo — DS-Grounding Scheibe 2, Live-Verkabelung (Server).
// Aus den Dateien eines importierten Repos (repoStore: [{ path, content }]) baut es:
//   - vocabulary: [{ name, variants }]  → fürs Interpret-Prompt (interpretComponents({catalog}))
//   - entries:    [{ path, cva, source }] + theme → Rohdaten, aus denen web/ den Emit-Katalog
//                 (mit plan-Funktionen) baut (repoCatalogOption). Der Server erzeugt bewusst
//                 KEINE plan-Funktionen (Emit-Belang liegt in web/).
//
// Nur components/ui/*.{tsx,jsx} werden als Katalog-Bausteine gewertet (shadcn-Konvention).
// Kein components/ui / kein cva / kein Theme → leere, saubere Ergebnisse (Aufrufer nutzt Default).

import { parseCva, variantAxes, extractBase } from './cvaParser.js';
import { readTheme } from './themeReader.js';

const UI_FILE = /(^|\/)components\/ui\/[^/]+\.(tsx|jsx)$/;

function pascalFromPath(p) {
  const file = String(p).split('/').pop() || '';
  const slug = file.replace(/\.(tsx|jsx|ts|js)$/i, '');
  return slug
    .split(/[-_]/)
    .filter(Boolean)
    .map((s) => s.charAt(0).toUpperCase() + s.slice(1))
    .join('');
}

export function buildCatalogFromRepo(files) {
  const arr = Array.isArray(files) ? files : [];

  const uiFiles = arr.filter((f) => f && typeof f.path === 'string' && UI_FILE.test(f.path));

  // Theme: erste CSS-Datei mit einem :root-Block (globals.css o. ä.).
  const cssFile = arr.find((f) => f && /\.css$/i.test(f.path || '') && /:root/.test(f.content || ''));
  const theme = readTheme(cssFile?.content || '');

  const entries = uiFiles.map((f) => {
    const source = f.content || '';
    const cva = parseCva(source);
    // Nicht-cva-Primitive (Input/Label ohne Varianten): feste Klassen aus cn("…") als base
    // nachziehen, damit auch sie einen echten plan bekommen statt eines leeren.
    if (!cva.base && Object.keys(cva.variants).length === 0) cva.base = extractBase(source);
    return { path: f.path, cva, source };
  });

  const vocabulary = entries.map((e) => ({
    name: pascalFromPath(e.path),
    variants: variantAxes(e.cva),
  }));

  return { entries, theme, vocabulary };
}
