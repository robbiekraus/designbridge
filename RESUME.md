# Designbridge — Schnellstart-Spickzettel

Stand: **08.07.2026** — **„Visuelle Interpretation Slice 1" KOMPLETT GEBAUT & BROWSER-VERIFIZIERT** auf Branch `feat/visual-interpretation-v1` (16 Commits, **ungepusht, nicht gemergt** — wartet auf Robs OK). Server 93/93 + Web 152/152 grün. Vorgänger Phase 5.2 ist auf `origin/main`.

## ⏱️ ERSTER PUNKT NÄCHSTE SESSION: Merge/Push entscheiden
- **Feature ist fertig.** Branch `feat/visual-interpretation-v1` (16 Commits ab `c6e96b2`, Working Tree sauber). Merge auf `main` + Push **NUR mit Robs OK** (CLAUDE.md Regel 5). Danach RESUME auf „gepusht" stellen.
- **Was live ist:** Bild-Import → Bausteine ohne Template bekommen automatisch eine KI-interpretierte shadcn/Tailwind-Vorschau in der Library, gerendert im sandboxed `<iframe sandbox="allow-scripts">` (kein same-origin), gelbe Pille „von KI interpretiert", Code-Bereich zeigt das `jsx`, Retry bei Fehler. Ein Vision-Call pro Import. Alles mit `DEMO_FALLBACK=1` (Credits LEER).
- **Subagent-Muster hat sich bezahlt gemacht** — die Reviews + der Browser-Smoke fingen **3 echte Bugs** (alle plan-vererbt): Bild-Leak/Hang im scan DEMO-Fallback (`35d18de`), Prozess-Crash im interpret DEMO-Fallback (`b4ad5f1`), und — nur end-to-end sichtbar — eine **Interpret-Endlosschleife** durch instabile `onImported`-Referenz im ImportModal-useEffect (`a57f0d4`). Plus StrictMode-Doppel-POST beim Retry (`d2e6812`) und XSS-Sanitizer-Härtung (`a377219`).
- **Offene Feinschliff-Kandidaten (NICHT blockierend, bewusst nicht im Slice gefixt):** (1) Retry ist Batch-weit statt pro-Baustein (Slice-1-Absicht); (2) „generischer Stub"-Chip zeigt sich gleichzeitig mit „Wird interpretiert …"/Fehlerzeile (optisch doppelt); (3) Stale-Closure-Race bei überlappenden Importen (schmales Fenster). Alle drei als Fast-Follow dokumentiert.
- **Browser-Smoke Step 7 (Fehler+Retry) nur unit-getestet**, nicht voll im Browser durchgespielt — ohne `DEMO_FALLBACK` scheitert schon der Scan (500), sodass man gar nicht in die Library kommt; der Failed/Retry-Zustand ist über die Vitest-Tests (Task 9 + `d2e6812`) abgedeckt.

**Referenz — Umsetzungsmuster (falls weitere Slices):** `superpowers:subagent-driven-development`, Implementer + Reviewer auf **Sonnet** (mechanisch, Code steht im Plan), Koordination + Browser-Verify + finale Abnahme auf Opus/Fable. Plan/Spec: `docs/superpowers/{plans,specs}/2026-07-08-visual-interpretation-slice1*`.

## Was Slice 1 baut (in kurz)
Nach einem **Bild-Import** bekommen alle Bausteine **ohne Hand-Template** automatisch eine **KI-interpretierte shadcn/Tailwind-Vorschau in der Library** — gerendert in einem sandboxed `<iframe>`, markiert mit gelber Pille „von KI interpretiert". Ein **einziger** Claude-Vision-Call pro Import (Bild + Liste aller offenen Bausteine). Fehler fallen weich auf den heutigen Platzhalter zurück („Erneut versuchen"). Figma-Export der KI-Bausteine ist bewusst NICHT in Slice 1 (nächste Scheibe; das iframe-Rendering ist deren Fundament).

Task-Bögen: **1–5 Server** (`imageStore` → Scan gibt `meta.import_id` → `interpretComponents` (der Vision-Call) → Demo-Fixture `demo-interpretations.json` → Route `POST /api/interpret/components`). **6–10 Web** (`interpret.js` Orchestrierung → `InterpretedPreview` iframe + `SourcePill`-Variante → `emitComponents` merged html/jsx → `LibraryObjectList` Vorschau/Laden/Retry → `App.jsx`+3 Seiten verdrahten). **11** Full-Verify + Browser-Smoke (Erwartung: Server 90/90, Web >140).

## Grundprinzipien (Robs Vision — im Brainstorm 08.07. bestätigt, in Spec §„Grundprinzipien")
- **Invarianter Weg:** Quelle → **technisches Repository (Library)** → Figma. Nie direkt Quelle→Figma. Library = echte, editierbare technische Artefakte, keine toten Pixel.
- **„Visuelle Referenz" = technisches Abbild sichtbar gemacht**, KEIN Screenshot-Crop.
- **Auslöser für Interpretation = KEIN erkennbares Design-System/Komponenten-Bibliothek in der Quelle** (nicht die Medienart). Erkennbar → echte Komponenten heben (spätere Scheibe). Nicht erkennbar → interpretieren, so nah wie möglich am Original, in echte technische Form.
- **Ziel-System gephast:** jetzt fix **shadcn+Tailwind** → später wählbar pro Import → Fernziel erkannt/gematcht.
- **Motor: Hybrid** (Hand-Templates + KI-für-Rest); ausdrücklich die Auffahrt zu „KI für alles" (Regler hochdrehbar, gute KI-Ergebnisse können als Templates „einrasten").

## Git-Stand
- Auf `main`, Working Tree sauber. **Phase 5.2 gepusht** (`origin/main` = `d688c69`).
- **3 lokale Doku-Commits auf `main`, UNGEPUSHT:** `b88e892` (Spec), `2da0d31` (CLAUDE-Regel Modellwahl), `69fdc48` (Plan). Push mit Robs OK (oder mit dem fertigen Feature zusammen).
- Neuer Feature-Branch entsteht in Task 0.

## App starten / Tests
- Backend: `DEMO_FALLBACK=1 PORT=3047 node server/index.js` (Credits LEER → Fallback zwingend) · Web: `cd web && npm run dev` (:5173). (`npm run dev` injiziert PORT unsauber → Backend lieber separat.)
- `npm run test:server` (aktuell 77/77) · `cd web && npx vitest run` (aktuell 127/127) · Plugin: `cd designbridge-plugin && npm run typecheck && npm run build`.
- Repo-Regel 7: nach Datei-Writes `find . -name '._*' -delete` (AppleDouble).

## Phase 5.2 (Vorgänger) — FERTIG, GEMERGT, GEPUSHT 08.07.
Components/Patterns → echte Figma-Komponenten (Component Sets, Platzhalter, Seite „🌉 DesignBridge"). Tasks 1–12, subagent-getrieben. Rob-Figma-Test: Tokens/Farben/Typo perfekt; Bausteine ohne Template = „Vorlage fehlt"-Platzhalter (= vereinbarter v2-Scope, GENAU das behebt Slice 1). Plugin = für Rob nur Übergangslösung. `origin/main` = `d688c69`.

## Wichtige Dateien
- Plan/Spec Slice 1: `docs/superpowers/plans/2026-07-08-visual-interpretation-slice1.md` · `docs/superpowers/specs/2026-07-08-visual-interpretation-slice1-design.md`
- Integrationspunkte (im Plan referenziert): `server/routes/scan.js`, `server/lib/{figmaExportStore,recognizeWithAi,claude}.js`, `server/index.js`, `web/src/lib/{useImportSession,libraryStore}.js`, `web/src/lib/emit/emitComponents.js`, `web/src/lib/components/templates/registry.js`, `web/src/components/library/{LibraryObjectList,SourcePill}.jsx`, `web/src/App.jsx`, `web/src/pages/{Atomics,Components,Patterns}.jsx`
- Arbeitsregeln: `CLAUDE.md` (NEU: Modellwahl je Aufgabe analysieren + Rob transparent nennen)
