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
Lies RESUME.md und das Memory (project_designbridge_roadmap). Spec + Plan für den URL-Ingester v1 (Phase 4) sind fertig und committet auf main. Führe den Plan docs/superpowers/plans/2026-06-25-url-ingester-v1.md subagent-getrieben aus (Skill: superpowers:subagent-driven-development) — frischer Subagent pro Task, Zwei-Stufen-Review zwischen den Tasks. Bau nur lokal, nicht pushen ohne mich zu fragen.
```

**Übergabe-Kontext (Stand 26.06.2026):** Wir haben Phase 4 durchgebrainstormt und entschieden: erster Ingester = **URL/Live-Website**; Extraktion = **deterministisches CSS-Parsen** (kein Claude/keine Credits/kein Headless-Browser); Inventory bleibt **leer** (nur Tokens, Option A); **Token-Herkunft** (`source`-Feld + „↳ aus --…"-Zeile) IST in v1 drin (Robs Schwerpunkt: „Designer muss sehen, was er bekommt"). Ausführungsmodus gewählt = **Option 1 subagent-getrieben**. Noch NICHTS implementiert — Baseline 81/81 Vitest grün, keine Server-Tests bisher (neuer Runner `node --test`). Rob ist Designer, kein Coder → bei Rückfragen laienverständlich erklären.

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

- 🟢 **JETZT: URL-Ingester v1 bauen** — Plan `docs/superpowers/plans/2026-06-25-url-ingester-v1.md` subagent-getrieben ausführen (12 TDD-Tasks: postcss-Setup → cssIngest → fetchSite → Endpoint → Demo-Seite → Adapter → useImportSession → UrlTab → tokenViews-Herkunft → Verify+Smoke).
- 🟠 **Nach dem Bau:** mit Rob über Push nach `origin/main` sprechen (3 Doku-Commits + Code).
- ⚪ **Später Phase 4:** Repo-Ingester, dann Figma-Ingester (Figma-MCP ist installiert). Komponenten-/Pattern-Erkennung für URL (Inventory ist bewusst leer in v1).
- ⚪ **Alte Folge-Punkte (Phase 3, nicht blockierend):** doppelte Token-Normalisierung in den 3 Pages; Import-Pfad über `emit/index.js`-Barrel; Tokens-Anzeige gegen doppeltes „px" härten (`server/lib/claude.js`). · API-Credits für echten Vision-Scan (extern) · Roadmap Phase 5/6 (Figma-Emitter, Round-Trip).

## Tests laufen lassen

```
node --test server/        # Server (cssIngest, fetchSite) — NEU ab Phase 4
cd web && npx vitest run   # Web — aktuell 81/81 grün (Baseline vor Phase-4-Bau)
```

## Wichtige Dateien

**Phase 4 (URL-Ingester, NEU zu bauen lt. Plan):**
- Server: `server/lib/cssIngest.js` (+`.test.js`), `server/lib/fetchSite.js` (+`.test.js`), `server/routes/scan.js` (Endpoint `/url`), `server/index.js` (`/demo` static)
- Demo: `demo-site/{index.html,styles.css}`
- Web: `web/src/lib/{scanResultAdapter,useImportSession}.js`, `web/src/components/ImportModal/tabs/UrlTab.jsx`, `web/src/components/library/tokenViews.jsx`
- Spec/Plan: `docs/superpowers/specs/2026-06-25-url-ingester-v1-design.md`, `docs/superpowers/plans/2026-06-25-url-ingester-v1.md`

**Phase 3 (Bestand):**
- Templates: `web/src/lib/components/templates/*` · Emit: `web/src/lib/emit/*` · UI: `web/src/components/library/LibraryObjectList.jsx`, `web/src/pages/{Atomics,Components,Patterns,Export}.jsx`
- Arbeitsregeln: `CLAUDE.md`
