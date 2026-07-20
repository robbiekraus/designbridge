# Plan: Content-Seiten „Preview-First" (Atoms/Molecules/Organisms)

Spec: `docs/superpowers/specs/2026-07-20-content-pages-preview-first.md`

## Ziel
`LibraryObjectList.jsx` bekommt zwei Render-Pfade:
- `kind === 'template'` (oder kein `kind` übergeben, Rückwärtskompatibilität) → exakt die
  heutige Akkordeon-Zeile (`TemplateRow`, unverändert im Verhalten).
- `kind` in `atom | molecule | organism` → neue `PreviewFirstCard`: Vorschau immer offen,
  nur Code hinter Toggle. Layout-Grid abhängig von `kind`.

## Schritte
1. `LibraryLevel.jsx`: `kind`-Prop an `LibraryObjectList` durchreichen.
2. `LibraryObjectList.jsx`:
   - Bestehende Row-Logik (Akkordeon) unverändert als `TemplateRow` beibehalten.
   - Neue `PreviewFirstCard`-Komponente: Header (Name, Confidence-Pille, Source-Pillen,
     Stub-Chip, Aktivitäts-Pille, Dateiname) immer sichtbar; Varianten-Umschalter immer
     sichtbar; Vorschau-Box immer sichtbar (inkl. aller Interpretations-/Retry-/Quota-
     Zustände 1:1 aus der alten Row übernommen); „Code anzeigen"-Toggle mit Code-Block +
     Kopieren/Herunterladen darunter.
   - Höhen-Deckel nur für `kind === 'organism'`: Vorschau-Box mit `ref` +
     `useLayoutEffect`/`ResizeObserver` messen (`useMeasuredHeight`-Hook). Ist die gemessene
     Höhe > `ORGANISM_PREVIEW_MAX_HEIGHT` (Konstante, Start 200), wird die Vorschau-Box gar
     nicht mehr gerendert (kein Clipping/Scroll) — nur Kopfzeile + Code-Toggle bleiben.
   - Top-Level `LibraryObjectList`: routet nach `kind` auf Grid-Layout (atom = Kachel-Grid
     mehrspaltig, molecule = 2-spaltig, organism = volle Breite je Zeile) oder die alte Liste
     für Templates/fehlendes `kind`.
3. Tests:
   - Bestehende `LibraryObjectList.test.jsx`-Fälle mit `kind` versehen, wo nötig
     (Template-Verhalten weiter über `kind="template"` oder ganz ohne `kind` geprüft).
   - Neue Tests: Vorschau ohne Klick sichtbar für atom/molecule/organism; Code hinter Toggle
     inkl. Copy/Download; Grid-Klassen je `kind`; Höhen-Deckel-Fall (offsetHeight gemockt >
     200 → keine Vorschau, nur Kopfzeile + Toggle).
4. `npx vitest run` in `web/` bis grün.

## Nicht anfassen
- Templates-Seite/-Verhalten (identisch zu heute).
- `emitComponents`, Datenmodell, Server/Plugin.
