# Testrunde 6 — Fixes: Retry-Feedback, Vorschau, Interpretations-Schwund, Zählung, Figma-Layout

Stand: 2026-07-17. Quelle: Robs Bild-Test (EcoMetrics-Dashboard, Screenshots
`Testdaten/interpretation 1707_1`) + Figma-Live-Inspektion per MCP
(Datei `ys40ZWYrbHsyhM6gykrhOg`, Seite „🌉 DesignBridge").

Kernbefund der Testrunde: **KI-Qualität ist gut** (Metric Cards fast pixelgenau,
Trend-Chart-Interpretation exzellent). Alle sechs Probleme liegen in unserem
Code — Feedback, Merging, Anzeige, Konvertierung.

---

## Fix 1 — Quota-/Fehlermeldung am Einzel-Retry

**Befund:** Tages-Quota leer → Einzel-Retry an der Baustein-Zeile scheitert
**still**. Die Zeile zeigt nur das statische „Interpretation fehlgeschlagen."
(`LibraryObjectList.jsx:105`). Die ehrliche Quota-Meldung (`interpretError`,
`interpretQuotaExhausted`) rendert nur die `InterpretAllBar` — die sieht man
aber nicht, wenn man an einer Zeile arbeitet. `retryInterpretation()` setzt
beide Felder bereits korrekt (`web/src/lib/interpret.js:191-202`).

**Soll:**
- Die Zeile zeigt nach fehlgeschlagenem Retry die echte Fehlermeldung
  (`interpretError`), nicht nur den generischen Satz. Bei
  `interpretQuotaExhausted:true` exakt die Server-Meldung (deutsch, mit
  Reset-Hinweis ~09:00).
- Bei `interpretQuotaExhausted:true` sind ALLE „Erneut versuchen"- und
  „Mit KI interpretieren"-Knöpfe disabled (nicht nur der Batch-Knopf).
- Props-Weg: `App.jsx` → pages (Atomics/Components/Patterns) → 
  `LibraryObjectList`. Die pages reichen `result.interpretError` /
  `result.interpretQuotaExhausted` bereits implizit via `result` — Adapter in
  den pages prüfen (sie mappen `result` → `items`; Fehlerfelder zusätzlich
  durchreichen).

**Akzeptanz:** Test: Row-Retry mit `dailyQuota`-Fehler → Zeile zeigt
Server-Meldung, alle Retry-Buttons disabled, Batch-Bar-Verhalten unverändert.

## Fix 2 — Sichtbare Retry-Aktivität

**Befund:** Während des Einzel-Retrys gibt es nur den grauen Text „Wird erneut
interpretiert …" (`LibraryObjectList.jsx:102`). Kein Spinner, Button wirkt tot;
bei zugeklappter Zeile sieht man GAR nichts. Rob hat die Aktivität nicht
wahrgenommen → mehrfache Klicks, Quota-Verbrauch.

**Soll:**
- Laufender Retry: animierter Spinner (CSS, zinc-Stil, kein neues Package)
  neben dem Status-Text; Retry-Button zeigt „Läuft …" und ist disabled.
- Auch im ZUGEKLAPPTEN Zeilen-Header sichtbar: kleine Pulse-/Spinner-Pille
  („interpretiert …") solange `retrying` oder (`batchPending` und Baustein
  noch offen).
- Vorschau-Bereich zeigt während Retry `PreviewPlaceholder` mit Spinner statt
  „keine Vorschau".

**Akzeptanz:** Tests: retrying=true → Spinner im Header UND im Detail;
batchPending → Pille an offenen Bausteinen.

## Fix 3 — Vorschau: skaliertes Thumbnail + Vollbild-Popup

**Befund:** `InterpretedPreview.jsx` rendert das KI-HTML in ein iframe mit
fixer Höhe 240px und Container-Breite (~700px). Interpretationen mit fixen
Breiten (`w-[960px]`, Charts) laufen über, ohne sichtbare Scrollbalken —
Inhalt muss „hin- und hergeschoben" werden (Robs Befund).

**Soll (Robs Wunsch):**
- Vorschau in der Zeile = **skaliertes Thumbnail**: iframe rendert mit fester
  virtueller Breite (1024px), wird per CSS `transform: scale()` auf die
  Container-Breite runterskaliert (pointer-events: none). Ganz sichtbar,
  nichts abgeschnitten.
- Klick auf das Thumbnail (oder „Vollbild"-Button) öffnet ein **Modal/Popup**
  (Overlay wie ImportModal-Stil): iframe in groß (~90vw × 85vh), scrollbar,
  ESC/Klick-außerhalb schließt.
- Sandbox-Eigenschaften bleiben exakt wie sie sind (`allow-scripts`, KEIN
  `allow-same-origin`); `buildSrcdoc` unverändert.

**Akzeptanz:** Tests: Thumbnail-Wrapper mit scale-Transform vorhanden; Klick
öffnet Modal mit zweitem iframe; ESC schließt. Browser-Smoke mit echtem
Trend-Chart-HTML (breites SVG) — komplett sichtbar im Thumbnail.

## Fix 4 — Interpretations-Schwund (2 Ursachen)

**Befund A — Race paralleler Einzel-Retries (Bild-Flow, Robs 12:10→12:13):**
`handleRetryInterpret(name)` (`App.jsx:97-116`) guardet nur GLEICHE Namen.
Zwei parallele Retries verschiedener Bausteine: beide starten von der
Render-Closure `lastImport`; der später auflösende überschreibt per
`setLastImport(applyIfSameImport(cur, next))` das komplette Result — inklusive
der vom ersten Retry frisch gemergten Interpretation. `next` basiert auf dem
VERALTETEN `lastImport`, `applyIfSameImport` prüft nur die import_id.

**Soll A:** Retry-Ergebnis als **Delta** in den AKTUELLEN State mergen statt
Result-Ersetzung: `retryInterpretation` (lib) bekommt eine Form, die im
`setLastImport`-Updater auf `cur` angewendet wird (z. B. Rückgabe
`{ data | error, name }` + neue Pure-Function `applyRetryOutcome(cur, name,
outcome)` die attachInterpretations/Fehlerfelder auf `cur` anwendet).
Bestehende Semantik (interpretFailed nur für `name` ändern, Quota-Felder)
bleibt — Tests aus interpret.test.js entsprechend umziehen.

**Befund B — URL-/Repo-Verfeinern wirft Interpretationen weg (Robs
Morgen-Test):** `deepenWithAi()` (`web/src/lib/aiDeepen.js`) baut per
`adaptScanResponse` ein FRISCHES Result; `handleDeepened` (`App.jsx:90-93`)
ersetzt den State komplett. `interpretations`, `interpretFailed` etc. sind weg
— die Pillen verschwinden.

**Soll B:** Verfeinern-Ergebnis trägt die vorhandenen Interpretationen weiter:
`interpretations` des alten Results werden übernommen (Map by name — Bausteine,
die es nach dem Verfeinern noch gibt, behalten ihre Interpretation; verwaiste
Keys stören nicht, `componentsNeedingInterpretation` prüft ohnehin per Name).
`interpretFailed` wird auf noch existierende Baustein-Namen gefiltert.
Umsetzungsort: pure Merge-Function (z. B. `carryInterpretations(prev, next)`)
in `aiDeepen.js` oder `interpret.js`, von `handleDeepened` benutzt.

**Akzeptanz:** Tests: (A) zwei überlappende Retries verschiedener Namen —
beide Interpretationen landen im finalen State. (B) deepen nach erfolgreicher
Interpretation — Pille/Interpretation bleibt.

## Fix 5 — Zähl-Wording Plugin vs. App

**Befund:** App-Sidebar zeigt Kategorien getrennt (3 Atomics / 9 Components /
1 Pattern), Plugin meldet „13 Komponenten neu" (`designbridge-plugin/src/ui.ts:199`)
— wirkt wie Daten-Diskrepanz (Robs Befund), ist aber nur Summenbildung.

**Soll:** Plugin-Meldung schlüsselt auf: „13 Bausteine neu (3 Atomics,
9 Components, 1 Pattern)" — Zählung nach `kind` aus dem Payload
(`parsePayload` kennt kind je Komponente; Zähler in `applyImport.ts` um
per-kind-Zählung erweitern). „X aktualisiert" analog. Wort „Komponenten" als
Sammelbegriff im Plugin durch „Bausteine" ersetzen, um Kollision mit der
Kategorie „Components" zu vermeiden.

**Akzeptanz:** Plugin-Tests (vitest im Plugin-Ordner, 39 bestehende) —
Zähler-Test mit gemischtem Payload → Meldung enthält Aufschlüsselung.

## Fix 6 — Figma-Layout: Block-Container werden Zeilen

**Befund (per Figma-MCP bewiesen):** Emissions Trend Chart kommt VOLLSTÄNDIG
in Figma an (Linien-Vektoren, Punkte, Labels), ist aber unsichtbar: Container
`2:175` hat `layoutMode:HORIZONTAL` + FIXED 459px + clipsContent — Titelzeile
(539px) und Chart-Body (1286px, landet bei x=571) liegen NEBENEINANDER statt
untereinander; alles rechts von 459px ist weggeclippt. Test-Umstellung auf
VERTICAL zeigte den Chart sofort.

**Ursache in `web/src/lib/emit/htmlToPlan.js`:**
1. `readLayout()` (Z. 150-155): alles, was nicht computed-flex/grid-column
   ist, wird `'row'`. Ein normaler Block-Container (`display:block`) stapelt
   seine Kinder im Browser aber VERTIKAL. Der Plan sagt also für jeden
   Block-Wrapper fälschlich „row".
2. Verstärker: Der Offscreen-Mount (Z. 456-472) hat KEINE Tailwind-Runtime.
   KI-HTML mit Tailwind-Klassen (Bild-Flow-JSX/HTML) löst nur die Klassen
   auf, die zufällig im App-Bundle stecken; `flex-col` auf einem Element, das
   das App-CSS nicht kennt, computet als `display:block` → Fall 1.

**Soll (minimal-invasiv, kein Tailwind-Runtime-Umbau in dieser Runde):**
- `readLayout()`: computed flex/grid → wie bisher (`flexDirection` entscheidet).
  NICHT-flex Container **mit Element-Kindern** → `'column'` (Block-Flow).
  Elemente ohne Element-Kinder / reine Inline-Kontexte bleiben unkritisch
  (Blätter werden ohnehin text/leaf-Box).
- Regressionstest mit dem ECHTEN Muster: Wrapper-div (block) mit Header-div +
  Body-div → plan.layout === 'column'. Flex-row-Fall bleibt 'row'
  (bestehende Tests dürfen nicht kippen — wo sie das falsche 'row'-Verhalten
  festschreiben, Tests anpassen und im Plan begründen).
- Prüfen (Test + ggf. Mini-Fix im selben Zug): woher kommt die FIXE Breite
  459px + Clipping im Plugin-Render (`designbridge-plugin/src/writer/renderPlan.ts`)?
  Wenn `plan.width==null` → HUG erwartet. Falls der Plugin-Renderer bei
  fehlender Breite clippt/fixiert, dort korrigieren (clipsContent nur bei
  explizit gesetzter Größe).

**Akzeptanz:** htmlToPlan-Tests (neu: block→column, flex-row bleibt row,
flex-col bleibt column). Plugin renderPlan-Test: Box ohne width → HUG, kein
Clipping. End-Beweis nach Deploy: erneuter Figma-Import zeigt den Trend-Chart
sichtbar (mache ich per Figma-MCP, ohne Robs Zutun).

---

## Explizit NICHT in dieser Runde

- Tailwind-Runtime im Offscreen-Mount / iframe-basierte Style-Extraktion
  (größere Scheibe, nur falls Fix 6 nicht reicht).
- Figma-Seiten-Namespacing pro Import.
- Interpretation→Figma für die 97px-Platzhalter (nicht interpretierte
  Bausteine bleiben Platzhalter — by design bis Interpretation da ist).

## Rahmenbedingungen

- Kein einziger KI-Call nötig (bauen + testen offline; Quota ist eh leer).
- Volle Suiten müssen grün bleiben: Server 208, Web 355, Plugin 39 (+ neue).
- Push auf main = Auto-Deploy Railway.
- Deutsch bleibt UI-Sprache; zinc/white-Stil; keine neuen Packages.
