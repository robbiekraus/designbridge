# Designbridge — Schnellstart-Spickzettel

Stand: **08.07.2026** — **Phase 5.2 (Figma-Emitter v2: Components/Patterns → echte Figma-Komponenten) IN ARBEIT auf Branch `feat/figma-emitter-v2`. Tasks 1–9 fertig, Task 10 ist der Wiedereinstieg.**

## ⏱️ ERSTER PUNKT NÄCHSTE SESSION: Task 10 bauen (subagent-getrieben weiter)
- Branch **`feat/figma-emitter-v2` auschecken** (nicht main). 16 Commits vor origin, alles LOKAL/ungepusht.
- Ausführungs-Skill: **`superpowers:subagent-driven-development`** (so lief die ganze Umsetzung: pro Task 1 Implementer-Subagent → Spec-Review → Quality-Review; Reviews haben real Bugs gefangen, beibehalten).
- **Plan mit vollem Task-Text (Tasks 10–12 wörtlich drin):** `docs/superpowers/plans/2026-07-07-figma-emitter-v2-components.md`. Task 10 = `designbridge-plugin/src/writer/upsertPage.ts` (Seite „🌉 DesignBridge" mit 3 Auto-Layout-Sektionen `DB/Atomics|Components|Patterns`, `upsertPage()` + `layoutSections()`, Re-Import per Name). Der komplette Code steht im Plan.
- **Modell-Hinweis:** Implementer/Reviewer liefen auf **Sonnet** (`model: 'sonnet'` im Agent-Call) — schnell & ausreichend. Als Opus kurz down war, schlug der Agent-Dispatch fehl (Klassifizierer) — dann einfach erneut versuchen.

## Was passierte (Task 10) — kein Schaden
Der Agent-Dispatch für Task 10 schlug fehl, WEIL `claude-opus-4-8` temporär nicht erreichbar war (Safety-Klassifizierer konnte nicht prüfen). Es wurde **nichts geschrieben**, `upsertPage.ts` existiert nicht, Working Tree sauber. Einfach Task 10 neu starten.

## Fertig & committet auf `feat/figma-emitter-v2` (Tasks 1–9)
**Web (Suite 127/127 grün):** `pickTokenRefs.js` (Token-Slots mit Namen für Style-Verknüpfung) · `planHelpers.js` + `planFor` in allen 4 Templates (button/card/badge/input — Figma-Bauplan neben `styleFor`) · `emitFigmaComponents.js` (Inventar → `components[]`) · `emitFigma.js` v2 (`version:2` + `components` im Umschlag) + `buildExports`-Verdrahtung + Test-Schutz · Export.jsx Hinweistext.
**Plugin (typecheck 0 Fehler + esbuild sauber; via `npm run typecheck` im Plugin-Ordner):** `parsePayload.ts` v2 (Bauplan-Typen `ColorRef/PlanBox/PlanText/PlanNode/ImportVariant/ImportComponent`, lenientes Parsen, v1-tolerant) · `renderPlan.ts` (generischer `PlanBox`→FrameNode-Zeichner, Style-Verknüpfung `DesignBridge/Color/<token>` mit Hex-Fallback, Frame-Self-Cleanup bei Fehler) · `buildComponents.ts` (`combineAsVariants`→Component Sets, Platzhalter-Komponenten mit gelbem Badge, Upsert per Name, alle Waisen-Löcher geschlossen) · `ImportSummary` +componentsCreated/Updated/placeholders.
**Letzter Commit:** `40f7d30`.

## Architektur (entschieden im Brainstorm 08.07., Spec + Plan committet)
- Spec: `docs/superpowers/specs/2026-07-07-figma-emitter-v2-components-design.md`
- **Ansatz „dummes Plugin":** App berechnet aus den `planFor`-Rezepten einen neutralen Bauplan (nur `box`+`text`, Farben als `{token,hex}`), Plugin zeichnet nur noch → Template-Wissen lebt EINMAL (in der App). Das ist Robs Kernanforderung „eine Wahrheit, zwei Repos" zu Ende gedacht: HTML-Vorschau, shadcn-Code und Figma-Nodes aus derselben Quelle.
- Entscheidungen: echte Component Sets mit Varianten · eigene Seite „🌉 DesignBridge" als Sticker-Sheet · Bausteine ohne Template = beschriftete Platzhalter · Farben verknüpft mit Phase-5-Styles · Auto-Fetch-Transport wie Phase 5 · Re-Import per Name (keine Duplikate).
- Scope-Grenze v2: keine neuen Templates, keine Radius/Spacing/Shadow-Variables, kein Zurücklesen aus Figma.

## Nach Task 12: Robs manueller Figma-Test (wie Phase 5)
Backend `PORT=3047 node server/index.js` (bei leeren API-Credits `DEMO_FALLBACK=1` davor — Credits sind LEER) + `cd web && npm run dev`. Bild importieren → Library → **Export** (Sidebar unten) → Format „Nach Figma (Plugin)" → **„An Figma senden"**. Figma: Plugin **DesignBridge** (Plugins → Development; bei „Fehlendes Manifest" → `designbridge-plugin/manifest.json` neu wählen) → Karte „Code → Figma" → **„Aus DesignBridge übernehmen"**. Erwartung v2: Seite „🌉 DesignBridge" mit Button-Component-Set (Varianten-Dropdown), Card/Badge/Input, Platzhalter-Karten; Farben zeigen Style-Verknüpfung.

## Phase 5 (Vorgänger) — FERTIG, E2E-verifiziert 07.07., GEPUSHT
Tokens (Farben+Typo) → Figma Paint/Text-Styles via Plugin + Auto-Fetch. Robs Test war grün (16 Farben, 5 Textstile). Plus Plugin-Typecheck-Fix (`npm run typecheck` existiert jetzt, `.bin/tsc` ist kaputt → Script nutzt node direkt) + Manifest-Fix (Figma verbietet `127.0.0.1` in `allowedDomains`, nur `localhost`). `origin/main` ist auf diesem Stand.

## App starten / Tests
- `npm run dev` → Backend :3047 + Web :5173 (ODER zuverlässiger: Backend separat `PORT=3047 node server/index.js`, Vite parallel — `npm run dev` injiziert PORT unsauber).
- `npm run test:server` (77/77) · `cd web && npx vitest run` (127/127) · `cd designbridge-plugin && npm run typecheck && npm run build`.

## Wichtige Dateien
- Web-Emitter v2: `web/src/lib/emit/{emitFigma,emitFigmaComponents,pickTokenRefs}.js` + `web/src/lib/components/templates/{planHelpers.js, *.js planFor}`
- Plugin-Writer: `designbridge-plugin/src/writer/{parsePayload,renderPlan,buildComponents,applyImport}.ts` (+ `upsertPage.ts` = Task 10, fehlt noch), Verdrahtung folgt in `src/main.ts`/`src/ui.ts` (Task 11)
- Spec/Plan: `docs/superpowers/specs/2026-07-07-figma-emitter-v2-components-design.md` · `docs/superpowers/plans/2026-07-07-figma-emitter-v2-components.md`
- Arbeitsregeln: `CLAUDE.md`
