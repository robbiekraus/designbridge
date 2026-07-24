# Storybook-Harness — die Developer-Empfangsseite

Ein kleines, **lauffähiges Storybook**, das ein UIPrism-Export-Paket frisst und die
gescannten Komponenten live im Browser zeigt. Beweist im Recording: „…und beim
Entwickler läuft es wirklich."

Eigenständiges Sub-Projekt (eigenes `package.json`) — **absichtlich getrennt von `web/`**,
damit Storybooks Dev-Deps den Produktions-Build der Live-App nicht anfassen.

## Einmalig einrichten

```bash
cd storybook-harness
npm install          # Storybook 8 + Tailwind + Vite
npm run sync-shadcn  # holt die shadcn/ui-Stubs (löst @/components/ui/* auf)
```

`sync-shadcn` kopiert die API-kompatiblen shadcn-Stubs aus
`web/verification/shadcn-target/` nach `components/ui/`. Nur nötig, wenn diese sich
ändern (sonst liegen sie schon da).

## Anleitung — drei Wege

### 1. Mit einem echten Export (der Recording-Weg)
1. In UIPrism scannen → **Export → „Nach Storybook exportieren"** → `designbridge-storybook.zip` landet in `~/Downloads`.
2. Ein Befehl:
   ```bash
   npm run storybook:ingest -- ~/Downloads/designbridge-storybook.zip
   npm run storybook
   ```
   (oder in einem Rutsch die Demo-Skripte unten)
3. Browser öffnet `http://localhost:6006` — deine Komponenten, nach **Atoms/Molecules/Organisms/Templates** gruppiert, **visuell gerendert**.

### 2. Synthetische Demo (stabiler Fallback, kein Scan nötig)
```bash
npm run storybook:demo
```
Nutzt `fixtures/sample-export.zip` (gegroundeter „Primary Action"-Button + „Login Form").
Deterministisch — immer verfügbar, auch offline.

### 3. Eingefrorener echter Prod-Scan
```bash
npm run storybook:demo:prod
```
Nutzt `fixtures/prod-export.zip` — ein realer Scan, näher an „so sieht ein echter Export wirklich aus".

## Wie es funktioniert

- **`ingest.mjs`** entpackt das ZIP und übernimmt NUR `components/` + `stories/` daraus.
  Die eigene, stabile Storybook-Konfig (`.storybook/`, `globals.css`, `components/ui/`)
  bleibt — das ZIP kann sie nicht überschreiben. Vor jedem Ingest werden `stories/` +
  `components/*` (außer `ui/`) geleert → idempotent.
- **`@`-Alias** zeigt auf die Harness-Wurzel (wie `@` = `src/` in shadcn-Projekten), damit
  gegroundete Imports `@/components/ui/button` → `components/ui/button.jsx` auflösen.
- **Automatischer JSX-Runtime** (esbuild `jsx: 'automatic'` in `.storybook/main.js`): der
  emittierte Code importiert React bewusst nicht — automatic injiziert `react/jsx-runtime`.
- **Tailwind + shadcn-Theme** (`globals.css`, `tailwind.config.js`) sorgen dafür, dass die
  Stubs nicht nur kompilieren, sondern auch **aussehen** (Farben/Spacing des zinc-Defaults).

## Grenzen (bewusst)

- Kein volles shadcn/Radix — API-kompatible Stubs (wie der Verifikations-Harness), kein cva.
- Template-Atome (Button/Input/Badge als *Name*) rendern ohne Children eine leere Hülle —
  Grounding (via `data-ds`-Marker in der Interpretation) liefert dagegen sichtbaren Inhalt.
  Darum ist die synthetische Fixture grounding-forward gebaut.
- Verschachtelte gegroundete Komponenten (Button *in* Card) noch nicht komponiert (Scheibe-1-Grenze).
- Lokales Recording-/Demo-Artefakt — kein Auto-Deploy. `npm run build-storybook` erzeugt bei
  Bedarf einen statischen Build.
