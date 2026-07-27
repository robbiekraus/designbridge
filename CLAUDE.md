# Designbridge — Agent Instructions

Read this file before touching anything in this repo. It is the source of truth for project context and how to work in here.

## What this project is

Designbridge extracts design tokens, atomic components, and patterns from screenshots, URLs, and code — keeps Figma and codebases in sync. Open-source CLI + local web app.

- **`web/`** — Vite + React + Tailwind app. **This is the production UI.** Backed by the Express server in `server/`.
- **`server/`** — Express on `:3047`. Wraps Anthropic Claude Vision. Current real endpoint: `POST /api/scan/image`.
- **`designbridge-plugin/`** — Figma plugin. Separate codebase, separate concern. Touch only when the task says so.
- **`designbridge-dev/`** — Next.js sandbox for design-system preview. Not production. Do not migrate things into it unless explicitly asked.

## Local paths (Rob's Mac)

- **Bootcamp working directory:** `/Volumes/4TB Shield/Vibe Coding Bootcamp` — Rob's standard directory for all Vibe Coding Bootcamp work. This repo lives locally at `/Volumes/4TB Shield/Vibe Coding Bootcamp/Projekte/Designbridge`. These paths only exist on Rob's Mac, not in remote/cloud sessions.

## Hard rules

1. **Never start design work without a briefing or references.** If the user says "design X", ask for direction or references first. This is a standing user preference.
2. **All new UI work goes into `web/`** unless the user names a different target. Do not silently scaffold in `designbridge-dev/`.
3. **Follow the existing visual style** in `web/src/App.jsx` — zinc/white Tailwind look, small text, tight spacing. No new design system.
4. **Existing endpoints and component patterns first.** Read `server/routes/scan.js` and `web/src/pages/SourceScanner.jsx` before proposing new shapes.
5. **No destructive git actions** (force push, hard reset, branch delete) without explicit OK. Same for deleting files outside the current task scope.
6. **Do not run `npm install` of unfamiliar packages** without saying what and why. Prefer what is already in `package.json`.
7. **AppleDouble files (`._*`) on this volume confuse tooling.** When writing files into directories that get served (e.g. brainstorm screen dirs), clean them with `find . -name '._*' -delete` after every write.

## Working style the user expects

- **Analyze every task and pick the model deliberately.** Before starting a task (or dispatching subagents), assess its complexity and choose the model tier accordingly — and **always tell Rob which model you'll use and why** (one short line, e.g. "Implementer läuft auf Sonnet — mechanischer Task mit fertigem Spec-Code"). Rule of thumb: mechanical/well-specified implementation & reviews → Sonnet; architecture, design decisions, tricky debugging, final reviews → Opus/Fable; trivial lookups → Haiku.
- **One question at a time** during exploration. Multiple choice when possible.
- **Visual mockups in the brainstorm browser companion** for any UI question. Text-only design descriptions do not work for this user.
- **Plan first, implement second.** Spec under `docs/superpowers/specs/`, plan under `docs/superpowers/plans/`, then code.
- **Small, verifiable steps.** Each implementation step ends with something the user can see or run.
- German UI copy stays German if the existing UI is German; otherwise English. Default code identifiers are English.

## Active specs

- [docs/superpowers/specs/2026-06-11-import-modal-design.md](docs/superpowers/specs/2026-06-11-import-modal-design.md) — Initial Import Modal (Image / URL / Repo / Figma)
- [docs/superpowers/specs/2026-07-23-design-system-grounded-interpretation-architecture.md](docs/superpowers/specs/2026-07-23-design-system-grounded-interpretation-architecture.md) — Interpretation gegen ein Design System groundnen (Katalog als Vokabular; Figma↔Repo-Verbindung). Richtungsdokument.
- [docs/superpowers/specs/2026-07-23-slice1-ds-grounding-default-catalog-design.md](docs/superpowers/specs/2026-07-23-slice1-ds-grounding-default-catalog-design.md) — Scheibe 1 (Grounding gegen shadcn/Tailwind-Default-Katalog). **KOMPLETT** 23.07.
- [docs/superpowers/specs/2026-07-25-komposition-gegroundeter-bausteine-design.md](docs/superpowers/specs/2026-07-25-komposition-gegroundeter-bausteine-design.md) — Komposition INNERHALB gegroundeter Bausteine (Hülle aus dem Katalog, Layout/Inhalt aus der Messung). **KOMPLETT** 25.07.
- [docs/superpowers/specs/2026-07-25-katalog-als-figma-library-design.md](docs/superpowers/specs/2026-07-25-katalog-als-figma-library-design.md) — Katalog als echte Figma-Komponenten-Bibliothek (`DS/…`-Komponenten + ◇-Instanzen). **GEBAUT** 25.07. nachts, Robs Plugin-Reload + Sichtprüfung offen.
- [docs/superpowers/specs/2026-07-25-sub-komponenten-slots-design.md](docs/superpowers/specs/2026-07-25-sub-komponenten-slots-design.md) — Sub-Komponenten-Slots, Scheibe A (Code-Emit: `Card` → `CardHeader`/`CardContent`). **GEBAUT** 25.07. nachts. Figma-Instanz-Slots + `CardTitle`/`CardDescription` bewusst zurückgestellt.
- [docs/superpowers/specs/2026-07-26-einheitlicher-massstab-design.md](docs/superpowers/specs/2026-07-26-einheitlicher-massstab-design.md) — Ein Maßstab pro Scan statt pro Baustein (Ursache der Miniatur-Bausteine in Figma). **RICHTUNG FESTGELEGT** 26.07., Umsetzung offen; eine Vorfrage muss vorher geklärt werden. Messbeleg: [docs/2026-07-26-skalierungs-messung-ergebnis.md](docs/2026-07-26-skalierungs-messung-ergebnis.md). Branch `experiment/einheitlicher-massstab`.

- [docs/superpowers/specs/2026-07-26-geometrie-im-echten-slot-design.md](docs/superpowers/specs/2026-07-26-geometrie-im-echten-slot-design.md) — Scheibe C: jeden Baustein im Messbehälter seiner ECHTEN Breite vermessen (Ursache der zu breiten Bausteine nach dem Maßstab-Umbau). **GEBAUT & IM BROWSER VERIFIZIERT** 26.07. abends: von 11 zu breiten Bausteinen sind 4 übrig (Event List Item 3,33× → 1,10×, Sidebar 3,57× → 1,00×, alle 6 Karten auf 1,00–1,11×), Schrift unberührt (kein Baustein <12px), Splice verbessert (Sidebar 3 statt 2 Instanzen). Die 4 Restfälle sind KI-Zeichenfehler (Inhalt passt nicht in den echten Slot), wo Fix A korrekt gegen Clipping schützt — Prompt-Thema, nicht Skalierung. Offen: **C2** (Vorschau auf dieselbe Messbreite ziehen, sonst divergiert WYSIWYG — sichtbare UI-Änderung, braucht Robs OK).

**Katalog = Vokabular, und es hängt an DREI Stellen zusammen** (Stand 26.07., 17 Einträge): `web/src/lib/catalog/shadcn-default.js` (Plan + Import), `server/lib/catalog/shadcnVocabulary.js` (was die KI erkennen darf) und die `DECOMPOSE`-Anweisung in `server/lib/claude.js` (was der Scan überhaupt zerlegt — speist sich jetzt aus dem Vokabular). Erweitern heißt: alle drei, **plus** einen API-kompatiblen Stub in `web/verification/shadcn-target/components/ui/` und `npm run sync-shadcn` in der Harness — fehlt der Stub, bricht der Storybook-Build erst beim User. Tests halten alle diese Verträge fest. Komponenten, deren Radix-Wurzel ohne Pflicht-Unterkomponenten nichts rendert (Select, Table, DropdownMenu, Tooltip), erst nach Sub-Komponenten-Slots aufnehmen.

**Instanz-Resize (`applyAbsolute`, renderPlan.ts):** Verkleinern ist NUR auf einer Achse mit fester Größe erlaubt. Hugged eine Achse ihren Inhalt (Auto-Layout AUTO), IST „natürlich" die Inhaltsgröße — `resize()` macht daraus FIXED und schneidet ab (Befund 27.07.: Sidebar 392×325 bei Inhalt bis y+1325). Der Slot einer gesplicten Instanz kommt aus der Interpretation des ELTERNTEILS, ist also eine unabhängige Messung und kann weit danebenliegen. Dazu gehört `growToFitLoneAbsoluteChild`: der Flow-Box-Slot wächst mit, statt zu clippen — die eine Hälfte ist ohne die andere wirkungslos. Messwerkzeug: `web/verification/splice-slots-in-browser.html`.

**Der Scan-Prompt-Vertrag liegt an EINER Stelle: `server/lib/prompts/atomicContract.js`** (Einteilungsdefinitionen + `DECOMPOSE`-Anweisung, gespeist aus `SHADCN_VOCABULARY`). `claude.js` (Bild-Pfad) und `recognizeWithAi.js` (URL-Pfad) importieren beide von dort — vorher lag der Definitionsblock als wörtliche zweite Kopie im URL-Modul, und die Zerlegungs-Anweisung fehlte dort ganz. Das ist die **vierte** Stelle der Katalog-Verkettung (s. o.), jetzt per Test statt per Kommentar gesichert. Wer den Vertrag ändert, ändert BEIDE Pfade — beim Umzug wurde der Bild-Prompt bewusst byte-gleich gehalten.

**Ein Scan ist ab jetzt nachstellbar (`server/lib/scanRunStore.js`).** Die letzten 5 Läufe liegen im Speicher, je Lauf in exakt dem Format von `storybook-harness/fixtures/prod-scan-raw.json`. Abholen: `GET /api/scan/runs[/latest|/:id]` oder `cd web && node verification/fetch-scan-run.mjs`. Vor jeder Diagnose an einem Fehlerbild aus Robs Scan ZUERST den Lauf holen, statt an der eingefrorenen Fixture zu raten — die zeigt viele seiner Befunde nicht. Der Puffer überlebt keinen Railway-Neustart.

**Der Splice existiert in jsdom NICHT** (er ist geometrisch, `getBoundingClientRect()` = 0). Jede Frage nach scan-internen `component-ref`s — „splict Baustein A den Baustein B?“, „kommt die Fehlerbedingung im Testdatensatz überhaupt vor?“ — muss im echten Browser beantwortet werden. Ein Node-Skript über dieselbe Fixture meldet 0 Refs und damit fälschlich „alles gut“. Werkzeug: **`web/verification/build-order-in-browser.html`** (lädt die ECHTE Sortierfunktion des Plugins, `cd designbridge-plugin && npm run bundle-build-order`).

**Höhenmeldung aus einem iframe = Rückkopplung, sobald der Inhalt Viewport-Einheiten benutzt.** `InterpretedPreview` setzt die iframe-Höhe aus der gemeldeten `body.scrollHeight`. Trägt der Inhalt `100vh`/`min-h-screen`, ist genau diese iframe-Höhe die Bezugsgröße — der Kreis schließt sich und die Vorschau wächst unbegrenzt (gemessen 27.07.: +24 px pro Runde, das Body-Padding). Deshalb rechnet das Thumbnail vh-Höhen VOR der Messung auf eine feste virtuelle Viewport-Höhe um (CSS für die Tailwind-Klassen, Skript für Inline-Styles — eine Stilregel kommt gegen ein Inline-Style nicht an). Das Vollbild-Modal ist ausgenommen: dort ist der Viewport echt.

**Größe ist ein Vertrag zwischen Prompt, Messung und Figma — an DREI Stellen.** Der Emit vermisst jeden Baustein in einem Container seiner echten Breite (`measureContainerWidth`, Scheibe C), der Scan-Prompt nennt der KI dieselbe Zielgröße (`renderSizeFor`/`componentHeading` in `interpretComponents.js`, Fix B 27.07.), und das Plugin lässt einen Rahmen mitwachsen, wenn der Inhalt doch nicht passt (`growToFitFlowChildren`, Fix A). Fehlt die Prompt-Seite, zeichnet die KI in beliebiger Größe und Figma schneidet ab (Robs Scan: 23 Stellen, alle waagerecht). `PROMPT_VIRTUAL_WIDTH` ist an `web/src/lib/previewWidth.js` gepinnt — der Test liest die Zahl aus der Quelldatei, nicht aus einer Kopie.

**Beim E2E-Testlauf: „importiert sauber" ≠ Fix bewiesen.** Am 27.07. war der Bug-2-Fix an der Fixture ein No-Op, weil die Fehlerbedingung (Slot kleiner als natürlich) dort gar nicht vorkommt — fast als Erfolg verbucht. Immer prüfen, ob der Testdatensatz den Fehler überhaupt auslöst; sonst die Bedingung im Payload synthetisch herstellen und ein A/B mit und ohne Fix im `dist` fahren. Der Prod-Payload-Store ist flüchtig (nach Railway-Neustart 404), vor jedem Lauf prüfen.

**Skalierungspfad ist testblind:** jsdom hat keine Layout-Engine → `getBoundingClientRect()` = 0 → `scaleFactor` fällt auf 1 zurück. Änderungen an `scalePlan.js` / `naturalWidth` / `freezeRootWidth` / der Messbehälter-Breite **müssen** in einem echten Browser vorher/nachher gemessen werden. Grüne Vitest-Läufe beweisen dort nichts. Werkzeug: **`web/verification/emit-in-browser.html`** (fährt den ECHTEN Emit mit Layout-Engine, rekonstruiert im selben Browser den Vorher-Stand; `cp storybook-harness/fixtures/prod-scan-raw.json web/verification/` davor, Ergebnis in `window.__RESULT`) — `measure-natural-widths.mjs` misst nur rohe HTML-Breiten, nicht den Emit.

## Current goal

Build the Initial Import Modal per the spec above:
- Replaces `web/src/pages/SourceScanner.jsx`.
- Removes the `Source Scanner` nav entry from `web/src/App.jsx`.
- Image tab is functional via the existing `/api/scan/image` endpoint.
- URL / Repo tabs render real form UI but submit to local mocks (clearly badged `PREVIEW`).
- Figma tab is disabled with a "via plugin flow" hint.
- Modal auto-opens on first load (empty state), otherwise via a `New Import` button in the topbar.
- Success state shows extracted categories with counts and confidence — Colors, Typography, Spacing, Border radius, Shadows, UI inventory.

## Out of scope right now

Library / Dashboard page, real URL/Repo/Figma backends, Figma diff/push, token-to-Tailwind mapping, multi-import history. These are follow-ups.

## File layout reference

```
Designbridge/
├── CLAUDE.md                        # this file
├── README.md                        # user-facing
├── docs/
│   └── superpowers/
│       ├── specs/                   # design specs (per topic, dated)
│       └── plans/                   # implementation plans (per topic, dated)
├── server/                          # Express backend (port 3047)
├── web/                             # Vite + React frontend (port 5173) — production UI
├── designbridge-plugin/             # Figma plugin (separate concern)
├── designbridge-dev/                # Next.js sandbox (not production)
└── .superpowers/                    # brainstorm sessions, mockups — gitignored
```
