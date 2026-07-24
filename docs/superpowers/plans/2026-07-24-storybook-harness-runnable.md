# Plan — Lauffähiges Storybook-Harness

**Spec:** `docs/superpowers/specs/2026-07-24-storybook-harness-runnable.md`
**Branch:** `claude/designbridge-tagesübersicht-0go7d3`

Kleine, verifizierbare Schritte. Jeder endet mit etwas Sicht-/Lauffähigem.

## Schritt 1 — Harness-Grundgerüst + shadcn-Sync
- `storybook-harness/package.json` (Storybook 8 react-vite, Vite, React, Tailwind, postcss, autoprefixer, jszip).
- `.storybook/main.js` + `preview.js` (Vite-Alias `@` → `../components`; `preview.js` importiert `globals.css`).
- `tailwind.config.js` + `postcss.config.js` + `globals.css` (shadcn-`:root`-Theme, `hsl(var(--…))`-Mapping).
- `sync-shadcn.mjs` — kopiert `web/verification/shadcn-target/components/ui/*.jsx` → `storybook-harness/components/ui/`.
- `.gitignore`-Einträge.
- **Verifikation:** `npm install` läuft durch; `node sync-shadcn.mjs` legt 8 Dateien an.

## Schritt 2 — Ingest + synthetische Demo-Fixture
- `ingest.mjs` — entpackt ZIP (JSZip), leert `stories/` + `components/*` (außer `ui/`), schreibt `components/` + `stories/` aus dem ZIP.
- Fixture-Builder: baut `fixtures/sample-export.zip` aus den `generate-storybook-sample`-Daten (ruft `storybookFiles` aus `web/src/lib/emit/`).
- npm-Scripts: `storybook:ingest`, `storybook:demo`.
- **Verifikation:** `npm run storybook:demo` → Storybook startet, Login-Form-Story sichtbar & visuell gerendert. Interner Browser-Screenshot an Rob.

## Schritt 3 — Prod-Fixture
- Echten Prod-Scan fahren (Bild → `/api/scan/image` auf Prod), Ergebnis → `storybookFiles` → `fixtures/prod-export.zip` einfrieren & committen.
- npm-Script `storybook:demo:prod`.
- **Verifikation:** `npm run storybook:demo:prod` → echte gescannte Komponenten in Storybook. Screenshot an Rob.

## Schritt 4 — README (die Anleitung) + Feinschliff
- `storybook-harness/README.md` mit Liste B (exportieren → ein Befehl → läuft) + Troubleshooting.
- RESUME.md-Eintrag (knapp).
- Gebündelt committen & pushen.

## Verifikations-Notiz
Kein Auto-Deploy; rein lokales Recording-Artefakt. Prod bleibt unberührt (keine `web/`/`server/`-Änderung).
