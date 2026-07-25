import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadScanTokens, mergeExtend } from './lib/tailwindTokens.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TOKENS_FILE = path.join(__dirname, 'tailwind.tokens.js');

// Scan-Tokens aus DesignBridge (falls vorhanden — s. buildPreview.js, das die Datei nur
// schreibt, wenn ein Import wirklich Rohdaten mitbringt): eine ES-Modul-Datei mit
// `export default {...}` (s. web/src/lib/emit/buildTokenSourceFiles.js), dieselbe Datei
// wie im Storybook-/Library-ZIP-Export.
//
// Diese Config hier ist selbst ein ES-Modul (package.json: "type": "module") und Tailwind
// lädt sie synchron beim Build-Start — ein `await import(...)` bräuchte Top-Level-Await
// (fragil je nach Tailwind-Config-Loader) und `createRequire(...)('./tailwind.tokens.js')`
// scheitert an ERR_REQUIRE_ESM, weil Node den Modultyp einer .js-Datei am package.json-
// "type"-Feld festmacht, nicht am tatsächlichen Inhalt — selbst wenn die Datei reines
// CommonJS wäre. Pragmatischer, versionsunabhängiger Ausweg (Details + Tests in
// lib/tailwindTokens.js): die Datei ist reiner generierter Code (kein Nutzer-Input), wir
// lesen sie als Text und werten das Objekt-Literal hinter `export default` synchron per
// `new Function` aus, statt sie als Modul zu laden. Fehlt die Datei oder lässt sie sich
// nicht auswerten, bleibt alles beim heutigen Verhalten (leeres Objekt → nur das
// shadcn-Default-Theme unten bleibt aktiv).
const scanTokens = loadScanTokens(TOKENS_FILE);

// Shadcn-Default-Theme — MUSS erhalten bleiben, die Stubs in components/ui brauchen
// weiterhin card/secondary/border/… auch ohne Scan-Tokens (heutiges Verhalten).
const shadcnDefaultExtend = {
  colors: {
    border: 'hsl(var(--border))',
    input: 'hsl(var(--input))',
    ring: 'hsl(var(--ring))',
    background: 'hsl(var(--background))',
    foreground: 'hsl(var(--foreground))',
    primary: {
      DEFAULT: 'hsl(var(--primary))',
      foreground: 'hsl(var(--primary-foreground))',
    },
    secondary: {
      DEFAULT: 'hsl(var(--secondary))',
      foreground: 'hsl(var(--secondary-foreground))',
    },
    destructive: {
      DEFAULT: 'hsl(var(--destructive))',
      foreground: 'hsl(var(--destructive-foreground))',
    },
    muted: {
      DEFAULT: 'hsl(var(--muted))',
      foreground: 'hsl(var(--muted-foreground))',
    },
    accent: {
      DEFAULT: 'hsl(var(--accent))',
      foreground: 'hsl(var(--accent-foreground))',
    },
    card: {
      DEFAULT: 'hsl(var(--card))',
      foreground: 'hsl(var(--card-foreground))',
    },
  },
  borderRadius: {
    lg: 'var(--radius)',
    md: 'calc(var(--radius) - 2px)',
    sm: 'calc(var(--radius) - 4px)',
  },
};

/** @type {import('tailwindcss').Config} */
export default {
  // Stubs (components/ui) + emittierte Komponenten + Stories.
  content: ['./components/**/*.{js,jsx}', './stories/**/*.{js,jsx}'],
  theme: {
    // Scan-Tokens gewinnen bei Namensgleichheit, shadcn-Default bleibt Basis.
    extend: mergeExtend(shadcnDefaultExtend, scanTokens),
  },
  plugins: [],
};
