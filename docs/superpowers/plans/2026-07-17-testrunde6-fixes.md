# Plan: Testrunde 6 — Fixes (Spec: specs/2026-07-17-testrunde6-fixes-design.md)

TDD je Task: erst Tests (rot), dann Implementierung (grün), volle betroffene
Suite am Ende des Tasks. Subagent-getrieben (Sonnet-Implementer), Fable
koordiniert + reviewt. Reihenfolge wegen Datei-Überschneidungen:

**Welle 1 (parallel, disjunkte Dateien):**
- **Task A — Fix 4 (Schwund):** `web/src/lib/interpret.js` (+`aiDeepen.js`),
  `web/src/App.jsx`, Tests `interpret.test.js`/`aiDeepen.test.js`.
  Neue pure Functions `applyRetryOutcome(cur, name, outcome)` und
  `carryInterpretations(prev, next)`; `handleRetryInterpret` merged Delta in
  `cur`; `handleDeepened` nutzt carry. Bestehende retryInterpretation-Tests
  auf die neue Form umziehen.
- **Task C — Fix 3 (Vorschau):** nur `web/src/components/library/InterpretedPreview.jsx`
  + Test. Thumbnail (scale-Transform, virtuelle Breite 1024, pointer-events
  none, Klick öffnet) + Vollbild-Modal (Overlay, ESC/Backdrop schließt,
  zweites iframe ~90vw/85vh). Sandbox/buildSrcdoc unverändert.
- **Task D — Fix 6 (Layout):** `web/src/lib/emit/htmlToPlan.js` (readLayout:
  Block-Container mit Element-Kindern → column) + Tests; danach
  `designbridge-plugin/src/writer/renderPlan.ts` prüfen: Box ohne width →
  HUG ohne Clipping (Test, ggf. Fix).
- **Task E — Fix 5 (Zählung):** Plugin `src/writer/applyImport.ts`
  (per-kind-Zähler) + `src/ui.ts` (Meldung „N Bausteine neu (a Atomics,
  b Components, c Patterns)"); Plugin-Tests.

**Welle 2 (nach Task A, baut auf dessen App.jsx-Stand):**
- **Task B — Fix 1+2 (Row-Feedback):** `web/src/components/library/LibraryObjectList.jsx`,
  pages `Atomics/Components/Patterns.jsx` (Fehlerfelder durchreichen),
  ggf. `App.jsx`-Props. Echte Fehlermeldung + Quota-Disable an der Zeile,
  Spinner (CSS-only) im Detail UND im zugeklappten Header, Placeholder
  „Wird interpretiert …" mit Spinner. Tests LibraryObjectList.test.jsx.

**Abschluss (Fable):**
1. Review-Pass über alle Diffs gegen die Spec.
2. Volle Suiten: `cd server && npx vitest run` · `cd web && npx vitest run`
   · Plugin-Tests. `vite build` grün.
3. Browser-Smoke lokal (PORT=3047 dev:demo, Falle beachten): Thumbnail/Modal
   mit breitem Chart-HTML, Retry-Spinner, Quota-Meldung an Row (Mock).
4. AppleDouble-Cleanup, Commits je Task auf main, push (= Deploy).
5. Figma-End-Beweis per MCP: neuer Import → Trend-Chart sichtbar.
6. RESUME.md + Memory aktualisieren.
