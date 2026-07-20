# Spec: Content-Seiten „Preview-First" (Atoms/Molecules/Organisms)

Stand: 2026-07-20 · Status: freigegeben (Rob, mündlich)

## Problem

Die Library-Ebenen-Seiten (`Atoms/Molecules/Organisms/Templates`) rendern über
`LibraryObjectList.jsx` eine **aufklappbare Akkordeon-Liste**. Man muss jede Zeile
ausklappen, um überhaupt etwas Visuelles (die Vorschau) zu sehen. Robs Kernkritik:
das ist umständlich — die Vorschau soll **immer sichtbar** sein, nur der Code darf
weg. Außerdem passt „eine Kachelgröße für alle" nicht: ein Organism wie eine
Sidebar ist vertikal riesig und funktioniert nicht als Kachel.

## Grundprinzip

**Visuell zuerst.** Vorschau ist immer offen. Nur der **Code** klappt weg — inkl.
der Interaktionen „Kopieren" und „Herunterladen" (die beziehen sich nur auf Code).

Immer sichtbar pro Baustein:
- Name (z. B. „Button")
- Varianten-/Status-Liste (Primary · Secondary · Ghost) — als Umschalter, immer sichtbar
- die Vorschau selbst (spiegelt die gewählte Variante)
- dezente Meta: Confidence-Pille, Quelle/Source-Pillen (wie heute)
- „Code anzeigen"-Toggle → darunter Code-Block + Kopieren/Herunterladen

## Größenadaptiv pro Ebene

`kind` muss von `LibraryLevel.jsx` an die Liste durchgereicht werden (passiert
aktuell nicht) und steuert das Layout:

- **atom** → Kachel-Raster (mehrere nebeneinander, responsive), Vorschau immer offen
- **molecule** → breitere Kacheln (z. B. 2-spaltig), Vorschau immer offen
- **organism** → volle-Breite-Zeilen (eine pro Zeile), Vorschau immer offen **aber höhenbegrenzt**
- **template** → **UNVERÄNDERT**. Bleibt exakt die heutige `LibraryObjectList`-Akkordeon-Zeile. Kein Umbau.

## Edge case: Organism-Vorschau zu hoch

Höhen-Deckel **~200 px** (Startwert; falls beim echten Rendering schon etwas
abgeschnitten wird, auf 300 px anheben — am Rendering entscheiden, nicht raten).

Ablauf:
1. Vorschau gerendert messen (Ref + `useLayoutEffect`/ResizeObserver → gemessene Höhe).
2. Höhe ≤ Deckel → Vorschau normal zeigen.
3. Höhe > Deckel → **keine Vorschau**. Degradiert auf die **heutige Kopfzeile**
   (Name + Confidence-Pille High/Low + Source-Pillen „nur Regeln"/interpreted etc.)
   + „Code anzeigen"-Toggle. **Nicht** clippen, **nicht** scrollen — einfach weglassen.

Gilt nur für **organism**. Atoms/Molecules haben keinen Deckel (die sind klein).

## Nicht im Scope

- Templates-Seite (bleibt wie sie ist).
- Änderungen am Datenmodell / an `emitComponents`/Interpretations-Pipeline.
- Neue Design-Tokens.
- Server/Plugin-Änderungen.
- Retry-/Quota-/Interpretations-Logik inhaltlich ändern — die bestehenden Zustände
  (interpretPending, interpretFailed, quotaExhausted, batchPending, retryingNames)
  müssen weiter genau wie heute funktionieren, nur visuell umsortiert.

## Bestehende Bausteine, die wiederverwendet werden

- `PREVIEWS[templateKey]` (Regel-Previews) + `InterpretedPreview` (KI-HTML) + `PreviewPlaceholder`.
- `ConfidencePill`, `SourcePill`, `Spinner` (in LibraryObjectList).
- Varianten-Umschalter-Logik (heute nur im offenen Akkordeon) → hochziehen, immer sichtbar.
- `downloadFile`, Clipboard-Copy.

## Akzeptanz

- Atoms/Molecules: Vorschau ohne Klick sichtbar; Varianten umschaltbar; Code hinter Toggle inkl. Copy/Download.
- Organisms: kleine Previews offen; zu hohe (Sidebar) zeigen nur Kopfzeile + Code-Toggle, keine Vorschau.
- Templates: pixelgleich zu vorher.
- Alle Interpretations-/Retry-/Quota-Zustände unverändert funktionsfähig.
- Web-Testsuite grün (bestehende LibraryObjectList-Tests ggf. anpassen/erweitern).
