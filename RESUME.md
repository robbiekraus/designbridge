# Designbridge — Schnellstart-Spickzettel

Stand: **08.07.2026** — **Phase 5.2 (Figma-Emitter v2) CODE FERTIG auf Branch `feat/figma-emitter-v2` (Tasks 1–11 implementiert+reviewt). Task 12 Steps 1–2 (Full-Verify + Browser-Smoke) grün. OFFEN: Step 3 = Robs Figma-Laufzeittest, Step 4 = Merge+Push (nur mit Robs OK).**

## ⏱️ ERSTER PUNKT NÄCHSTE SESSION: Task 12 Step 3 — Robs Figma-Laufzeittest
- Branch **`feat/figma-emitter-v2`** (nicht main). **19 Commits** vor origin, alles LOKAL/ungepusht.
- **Server ggf. starten** (falls nicht mehr laufend): Backend `DEMO_FALLBACK=1 PORT=3047 node server/index.js` (Credits LEER) + `cd web && npm run dev` (bzw. Preview :5173).
- **Step 3 (nur Rob):** Bild importieren → Export → „Nach Figma (Plugin)" → „An Figma senden" → Figma-Plugin **DesignBridge** → „Aus DesignBridge übernehmen". Erwartung: Seite „🌉 DesignBridge" mit Sektionen; Button als Component Set (3 Varianten im Dropdown); Card/Badge/Input ebenso; Platzhalter-Karten (gelbes Badge); Farb-Test: Paint-Style `DesignBridge/Color/brand-primary` ändern ⇒ Button-Füllung folgt; Re-Import ⇒ „aktualisiert" statt Duplikate.
- **Step 4 (nur mit Robs OK):** `git checkout main && git merge --ff-only feat/figma-emitter-v2 && git push`.
- Ausführungs-Skill war: **`superpowers:subagent-driven-development`** (pro Task 1 Implementer-Subagent → Spec-Review → Quality-Review, alles Sonnet; Reviews haben real Bugs gefangen).

## Task 12 Steps 1–2 — VERIFIZIERT (08.07.)
- **Step 1 Full-Suite grün:** Server 77/77 · Web 127/127 · Plugin typecheck 0 + „Build complete." · AppleDouble bereinigt.
- **Step 2 Browser-Smoke grün** (Backend+Web, DEMO_FALLBACK-Fixture, Dummy-PNG per Drop injiziert): Export „Nach Figma (Plugin)" liefert Payload `version:2`, `components`-Array (17), **Bauplan auf Varianten-Ebene** (`variants[i].plan`, Button 3 Varianten Typ `box`, Fill token-verknüpft `brand-primary`), `placeholder:true`-Einträge vorhanden. Keine Konsolenfehler. `buildComponents` verzweigt korrekt auf `comp.placeholder` (ignoriert dann den Plan → beschrifteter Platzhalter).

## Fertig & reviewt auf `feat/figma-emitter-v2`

### Tasks 10–11 (diese Session, 08.07.)
- **Task 10** `designbridge-plugin/src/writer/upsertPage.ts` (Commit `055974d`): Seite „🌉 DesignBridge" + 3 Auto-Layout-Sektionen `DB/Atomics|Components|Patterns`, `upsertPage()`/`layoutSections()`, Re-Import per Name. Quality-Review-Fix: `createSection` try/catch+`frame.remove()` und `sectionHeading` Bold→Regular-Fallback (analog `renderPlan`/`renderText`, schließt dieselbe Waisen-Node-Klasse). Plan-Addendum ergänzt.
- **Task 11** `main.ts` + `ui.ts` verdrahtet (Commit `24a9557`): IMPORT-Zweig baut bei `payload.components.length>0` Komponenten (upsertPage → `setCurrentPageAsync` → `buildComponents` → `layoutSections` → Summary). Statuszeile um Komponenten/Platzhalter erweitert. Quality-Review: approved, keine Befunde.

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
