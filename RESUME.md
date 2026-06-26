# Designbridge — Schnellstart-Spickzettel

Stand: **26.06.2026** — **Phase 4 (URL-Ingester v1) GEPLANT, Bau steht an.** Spec (`d5be504`) + Plan (`86e43b4`) lokal auf `main`, NICHT gepusht. Baseline 81/81 grün. Davor: Phase 3 v1 fertig/gepusht (`f252cd3`).

## Phase 4 — was als Nächstes zu tun ist
- **Plan ausführen:** `docs/superpowers/plans/2026-06-25-url-ingester-v1.md` (12 TDD-Tasks), subagent-driven empfohlen.
- Echter URL-Ingester statt Mock: URL einfügen → Server parst CSS deterministisch (postcss) → gleiche Datenform wie Image-Scan → Dashboard/Tokens/Emitter greifen unverändert.
- Kern: `server/lib/cssIngest.js` (rein, testbar) + `server/lib/fetchSite.js` (Netzwerk) + `POST /api/scan/url` + Demo-Seite unter `GET /demo`. Token-**Herkunft** (`source`) wird in den Kacheln gezeigt. Inventory bleibt leer (nur Tokens).
- Server-Tests laufen über `node --test server/` (neu), Web weiter `cd web && npx vitest run`.

## Frisch weitermachen

```
cd "/Volumes/4TB Shield/Vibe Coding Bootcamp/Projekte/Designbridge"
claude
```

Dann als ersten Satz an Claude (Wiedereinstieg):

```
Lies RESUME.md und das Memory (project_designbridge_roadmap). Phase 3 v1 ist fertig auf main. Lass uns den nächsten Schritt brainstormen — entweder Phase 3 v2 (mehr Templates, TSX/HTML-Output, Mehrfach-Export, Pattern-Vorschau) oder Phase 4 (echte Ingester statt Mocks). Frag mich zuerst, wohin.
```

## App starten (Server + Web)

```
npm run dev
```
→ Backend http://localhost:3047, Frontend **http://localhost:5173** (am besten Inkognito-Fenster).
⚠️ Nur EINE Instanz starten. Vorher prüfen, dass nichts auf :3047/:5173 läuft (`lsof -ti:3047`).
ℹ️ Für UI-Smoke-Tests ohne echten Scan: einen Image-Import-Datensatz nach `localStorage["designbridge.lastImport"]` + `designbridge.hasImported="1"` seeden (Shape siehe `web/src/lib/libraryStore.js`).

## Was zuletzt passiert ist (25.06.2026)

1. **Repo aufgeräumt:** `.gitignore` erweitert (designbridge-dev/ 5,4 GB, Testdaten/, Artefakte/, .claude/, exports/, stale Root-Manifeste), `README.md` + `.env.example` getrackt, `DEMO_FALLBACK` zurück auf `0`.
2. **Phase 3 v1 gebaut** (subagent-driven, Spec + 10-Task-TDD-Plan):
   erkannte Komponenten → **Accordion** auf Atomics/Components/Patterns mit token-gefärbter **Vorschau** (4 Templates: Button/Card/Badge/Input) bzw. **generischem Stub**, **Varianten-Umschalter**, generiertem **shadcn-Code**, **Einzel-Export** (Kopieren/Herunterladen) — und **„Ganze Library exportieren"** im Export-Tab → `designbridge-library.zip` via jszip.
3. Reviewt (Gruppe + final), Fixes drin, gemergt, gepusht, Branch gelöscht.

## Nächste Schritte (priorisiert)

- 🟢 **Phase 3 v2 ODER Phase 4** — als nächsten brainstorm→spec→plan→build-Zyklus. Erst Richtung mit Rob klären.
- 🟠 **Folge-Punkte aus dem Final-Review (nicht blockierend):** (1) doppelte Token-Normalisierung in den 3 Pages → `emitComponents` könnte `picks` mitgeben/annehmen; (2) Import-Pfad-Inkonsistenz (Pages umgehen die `emit/index.js`-Barrel).
- 🟠 **Tokens-Anzeige gegen doppeltes „px" härten** (alter Task, betrifft echten Scan-Pfad in `server/lib/claude.js`, nicht das Fixture).
- ⚪ **API-Credits** aufladen für echten Vision-Scan (extern) · Roadmap Phase 5/6 (Figma-Emitter, Round-Trip).

## Tests laufen lassen

```
cd web && npx vitest run
```
→ aktuell **81/81 grün**.

## Wichtige Dateien (Phase 3)

- Templates: `web/src/lib/components/templates/{registry,button,card,badge,input,constants}.js` + `Previews.jsx`
- Emit: `web/src/lib/emit/{pickTokens,emitComponents,buildLibraryZip,index}.js` · Download: `web/src/lib/download.js`
- UI: `web/src/components/library/LibraryObjectList.jsx`, `web/src/pages/{Atomics,Components,Patterns,Export}.jsx`
- Spec/Plan: `docs/superpowers/specs/2026-06-25-component-emitter-v1-design.md`, `docs/superpowers/plans/2026-06-25-component-emitter-v1.md`
- Arbeitsregeln: `CLAUDE.md`
