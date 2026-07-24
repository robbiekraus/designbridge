# Lauffähiges Storybook-Harness — Developer-Empfangsseite (Roadmap #2)

**Datum:** 2026-07-24 · **Status:** Spec zum Bau (Rob-Freigabe steht aus)
**Branch:** `claude/designbridge-tagesübersicht-0go7d3`
**Baut auf:** Scheibe 3 (Storybook-Emit: `emitStories`, `buildStorybookZip`, `storybookFiles`) + Verifikations-Harness (`web/verification/shadcn-target/`).

## Anlass / Ziel

Der Export liefert heute ein **ZIP** (`components/` + `stories/` + `.storybook/main.js` + README) — ein Handoff-Paket, aber **kein laufendes Storybook**. Fürs Recording fehlt der Beweis „…und beim Entwickler läuft es wirklich". Ziel: ein kleines, **lauffähiges Storybook im Repo**, das ein Export-Paket frisst und die gescannten Komponenten live im Browser zeigt — bedienbar mit **einem** Terminal-Befehl.

**Nicht** Ziel: die Export-Logik ändern. `emitStories`/`buildStorybookZip` bleiben unangetastet. Das Harness ist reiner **Empfänger**.

## Erfolgskriterium (recordbar)

1. In UIPrism scannen → „Nach Storybook exportieren" → `designbridge-storybook.zip` liegt in `~/Downloads`.
2. Im Terminal **ein** Befehl: `npm run storybook:demo` (bzw. `npm run storybook:ingest -- <zip>`).
3. Browser öffnet `localhost:6006`; die gescannten Komponenten erscheinen nach **Atoms/Molecules/Organisms/Templates** gruppiert, **visuell gerendert** (nicht nur Code) — gegroundete Bausteine rendern echte shadcn-API-Komponenten mit Tailwind-Look.

## Architektur-Entscheidung: eigenes Sub-Projekt

**`storybook-harness/`** als eigener Ordner mit **eigenem `package.json`** — NICHT in `web/` integriert.

Begründung:
- **Repo-Regel #6** (kein Fremd-`npm install` ins Produktionsprojekt): `@storybook/*`, Tailwind-Theme etc. dürfen `web/`s Build nicht anfassen. Isoliert = jederzeit löschbar, kein Risiko für die Live-App.
- Storybook 8 zieht viele Dev-Deps; die gehören nicht in die Vite-Produktions-UI.
- Das Harness ist ein **Demo-/Empfangs-Artefakt**, kein Teil der ausgelieferten App.

## Wie das Export-Paket reinkommt (Ingest)

Ein kleines Script **`storybook-harness/ingest.mjs`** entpackt ein `designbridge-storybook.zip` (JSZip, schon als Dep vorhanden) und legt seinen Inhalt ins Harness:
- `stories/*.stories.jsx` → `storybook-harness/stories/`
- `components/*.jsx` → `storybook-harness/components/`
- `.storybook/main.js` und README aus dem ZIP werden **ignoriert** (Harness bringt eigene, stabile Storybook-Konfig mit).

Vor dem Ingest wird `stories/` + `components/` **geleert** (idempotent, kein Alt-Zustand).

Zwei npm-Scripts:
- `storybook:ingest -- <pfad-zur-zip>` → Ingest + Storybook-Start.
- `storybook:demo` → nimmt eine **mitgelieferte Beispiel-ZIP** (`fixtures/sample-export.zip`, aus `generate-storybook-sample`-Daten gebaut) → Ingest + Start. Für den Fall, dass beim Recording kein frischer Scan zur Hand ist / Demo-Fallback.

## Wie gegroundete Imports auflösen (der shadcn-Teil)

Gegroundete Komponenten importieren `@/components/ui/{button,input,label,badge,card,checkbox,avatar,separator}`. Das Harness löst `@` per Vite-Alias auf **kopierte, API-kompatible Stubs** auf — Quelle: `web/verification/shadcn-target/components/ui/*.jsx` (alle 8, kein Radix).

- Beim Setup einmalig nach `storybook-harness/components/ui/` kopiert (Single Source bleibt `verification/`; ein `sync-shadcn.mjs` kopiert, damit nichts driftet).
- Diese Stubs tragen Tailwind-Klassen mit shadcn-CSS-Variablen (`bg-primary` etc.). Damit sie **visuell** rendern, bringt das Harness ein **Tailwind-Setup + shadcn-Theme** mit (`globals.css` mit `:root`-Variablen, `tailwind.config` mit `hsl(var(--…))`-Mapping). Das ist der einzige „echte" Setup-Aufwand.

## PINNED CONTRACT

1. `storybook-harness/` ist ein **eigenständiges npm-Projekt**; `web/`s `package.json` wird **nicht** angefasst.
2. Ingest ist **idempotent**: `stories/` + `components/` (außer `components/ui/`) werden vor jedem Ingest geleert.
3. `components/ui/*` (shadcn-Stubs) sind **fix** und kommen per `sync-shadcn.mjs` 1:1 aus `web/verification/shadcn-target/` — keine Handkopie, kein Drift.
4. `@` → `storybook-harness/components` (Vite-Alias, damit `@/components/ui/button` auflöst).
5. Storybook-Konfig des Harness ist **stabil im Repo** und wird vom ZIP-Inhalt nie überschrieben.
6. Kein Radix, keine cva — API-kompatible Stubs wie im Verifikations-Harness (bewusst, klein).
7. Der Emit-Pfad (`web/src/lib/emit/*`) wird **nicht** verändert.

## Änderungen (Blast Radius)

Alles neu, alles unter `storybook-harness/` — **keine** Änderung an `web/` oder `server/`:
- `storybook-harness/package.json` — Storybook 8 (`@storybook/react-vite`, `@storybook/addon-essentials`), Vite, React, Tailwind, jszip.
- `storybook-harness/.storybook/{main.js,preview.js}` — stabile Konfig; `preview.js` importiert `globals.css`.
- `storybook-harness/globals.css` + `tailwind.config.js` + `postcss.config.js` — shadcn-Theme, damit Stubs visuell rendern.
- `storybook-harness/components/ui/*.jsx` — synchronisierte shadcn-Stubs (via `sync-shadcn.mjs`).
- `storybook-harness/ingest.mjs` + `sync-shadcn.mjs` — Ingest & Sync.
- `storybook-harness/fixtures/sample-export.zip` — Demo-Paket (oder zur Laufzeit aus den `generate-storybook-sample`-Daten gebaut).
- `storybook-harness/README.md` — die **Kurz-Anleitung** (Liste B aus dem Chat: exportieren → ein Befehl → läuft).
- `.gitignore` — `storybook-harness/node_modules`, `storybook-harness/stories/*`, `storybook-harness/components/*` (außer `ui/`), `storybook-storybook-static`.

## Non-Goals (v1)

- Kein Storybook im `web/`-Produktions-Build.
- Kein volles shadcn/Radix, kein cva-Parsing (bleibt Scheibe-2-Thema).
- Keine verschachtelte Komposition (Scheibe-1-Grenze bleibt: genestete Katalog-Komponenten → Text-Blatt).
- Kein Auto-Deploy des Harness (lokales Demo-/Recording-Artefakt; ein statischer Build via `storybook build` ist optionaler Folge-Schritt).

## Entscheidungen (Rob, 24.07.)

- **Demo-Fixture = beides:**
  - `storybook:demo` → **synthetische** Fixture (aus `generate-storybook-sample`-Daten, Login-Form mit gegroundetem Button/Input/Label). Deterministisch, kein Prod-Call — der stabile Default/Fallback.
  - `storybook:demo:prod` → **eingefrorener echter Prod-Scan** als zweites Paket (`fixtures/prod-export.zip`), näher an „so sieht ein echter Export wirklich aus". Wird einmalig aus einem realen Scan erzeugt und committet.
  - Bau-Reihenfolge: erst synthetisch (voll deterministisch, verifizierbar), dann Prod-Fixture obendrauf.
