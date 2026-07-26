# Ein Maßstab pro Scan statt pro Baustein — Design

**Status:** Richtung festgelegt, Umsetzung offen. Datum 26.07.2026.
**Messbeleg:** `docs/2026-07-26-skalierungs-messung-ergebnis.md` (15 echte Bausteine, echter Browser).
**Betrifft:** `web/src/lib/emit/scalePlan.js`, `web/src/lib/emit/htmlToPlan.js` (`naturalWidth`,
`freezeRootWidth`), `web/src/lib/emit/emitFigmaComponents.js` (die zwei `scaleFactor`-Aufrufe).

## Das Problem in einem Satz

Jeder Baustein rechnet sich seinen eigenen Skalierungsfaktor aus `Zielbreite / gemessene Breite`
aus — und die gemessene Breite ist bei block-level Wurzeln nicht die Inhaltsbreite, sondern die
volle Messbehälterbreite (1024 px). Ergebnis: Bausteine mit gestreckter Wurzel schrumpfen auf
20 % (Schrift 36 → 7), Bausteine mit intrinsischer Breite bleiben korrekt. Aus einem Scan kommen
dadurch unvergleichbare Maßstäbe.

## Warum die naheliegende Lösung falsch ist

Der erste Reflex — die Wurzel beim Messen auf `width: max-content` stellen — ist **gemessen
widerlegt**. Er repariert die 4 betroffenen Bausteine und beschädigt dabei andere:

- `Top Header Bar`: Schrift 24 → **104** (max-content kollabiert eine bewusst seitenbreite Leiste
  auf ihre spärliche Inhaltsbreite von 238 px, der Faktor schießt auf 6,9)
- `Category Item Row`: 25 → **56** (war nie gestreckt, wird trotzdem angefasst)

Variante C (gestreckte Bausteine direkt in ihrer Zielbreite rendern, Faktor 1) ist risikofrei für
die 9 gesunden Bausteine, drückt aber `Top Header Bar` auf 15 und `Dashboard Page Layout` von 49 auf
22 — beide zu klein.

**Lehre, die hier festgehalten wird, damit sie nicht nochmal teuer gelernt wird:** die natürliche
Breite eines Elements, das sich nach seinem Container streckt, ist keine Eigenschaft des Elements.
Man kann daraus keinen Maßstab ableiten — egal wie man misst.

## Die Entscheidung

**Ein Screenshot hat genau einen Zoom-Faktor. Also gibt es genau einen Faktor pro Scan.**

`k = Bildbreite / Design-Referenzbreite` — einmal pro Scan bestimmt, auf jeden Baustein identisch
angewandt. Damit ist strukturell unmöglich, dass derselbe Text („Popular categories") in zwei
Bausteinen unterschiedlich groß landet. Die Konsistenz zwischen Bausteinen ist wichtiger als die
absolute Treffgenauigkeit eines einzelnen — verschachtelte Bausteine (Organismus enthält Molekül
als ◇-Instanz) sind sonst zwangsläufig widersprüchlich.

Konsequenzen:

1. `scaleFactor(bbox, imageWidth, naturalWidth)` verliert seine Rolle als **Quelle** des Faktors.
   Der Faktor kommt von außen, aus dem Scan-Kontext.
2. `bbox.w` bleibt nützlich — aber als **Plausibilitätsprüfung**, nicht als Rechengrundlage: weicht
   die skalierte Breite eines Bausteins stark von seinem gemessenen Slot ab, ist das eine Warnung
   wert (die KI hat die bbox falsch geschätzt oder die Interpretation passt nicht zum Ausschnitt).
3. `freezeRootWidth` darf die gestreckte 1024er-Breite **nicht** als Wahrheit festschreiben. Das ist
   die zweite Hälfte desselben Fehlers und muss zusammen mit der Messung geändert werden.

## Was noch NICHT entschieden ist

**Woraus `k` konkret bestimmt wird.** Zwei Kandidaten, beide ungeprüft:

- **(a) Aus dem Template.** Dessen `bbox.w` ist 1.0, es deckt das ganze Bild ab, seine
  Referenzbreite ist der Messbehälter → `k = imageWidth / 1024` (beim CRAFTUI-Scan 2,24). Einfach,
  aber setzt voraus, dass jeder Scan ein Template hat und dass 1024 die richtige Referenz ist.
- **(b) Aus den Typo-Token.** Der Scan misst Schriftgrößen am echten Bild (28/18/14/12 mit
  Beispieltexten wie „Dashboard"). Ein Vergleich „was die KI ins HTML geschrieben hat" gegen „was
  am Bild gemessen wurde" liefert `k` direkt aus der Typografie — unabhängig von jeder Geometrie.

**Ungeklärte Vorfrage zu (b):** liegen die Typo-Token in Design-Pixeln (1×) oder in Bildpixeln? Die
Werte 28/18/14/12 sehen nach 1×-Design-Größen aus, der Figma-Emit zielt aber bewusst auf echte
Bildpixel. Solange das offen ist, gibt es keinen belastbaren Zielwert, gegen den man messen kann.
**Das ist der erste zu klärende Punkt, vor jeder Code-Änderung.**

## Verifikation

Die Vitest-Suite kann diese Änderung **nicht** absichern: jsdom hat keine Layout-Engine,
`getBoundingClientRect()` liefert 0, der Riegel in `scaleFactor` macht daraus Faktor 1. Der ganze
Pfad ist dort unsichtbar — genau deshalb ist der Fehler durch 817 grüne Tests gekommen.

Absicherung deshalb zweigleisig:

1. **Unit-Tests mit gemockten Rects** für die reine Faktor-Logik (existiert schon in
   `scalePlan.test.js` / `emitFigmaComponents.scaling.test.js`) — deckt Arithmetik ab, nicht die
   Messung.
2. **Browser-Messung vorher/nachher** mit `web/verification/measure-natural-widths.mjs` gegen die
   eingefrorenen Prod-Rohdaten. Kein KI-Call. Die Tabelle in
   `docs/2026-07-26-skalierungs-messung-ergebnis.md` ist der Vorher-Stand; nach dem Umbau dieselbe
   Messung fahren und Baustein für Baustein vergleichen. **Jeder Baustein, der sich verschlechtert,
   ist ein Blocker** — nicht nur die, die sich verbessern sollen.

Erst danach ein echter Scan durch Rob, zur Bestätigung, nicht zur Fehlersuche.

## Bewusst außerhalb dieser Scheibe

- Das **Sidebar-Scoping** (die KI interpretiert „Left Sidebar Navigation" als halbe Seite,
  14.903 Zeichen HTML, und deklariert zwei Karten als deren Kinder). Eigener Fehler, eigene Scheibe,
  Prompt-Thema.
- Die **Varianten-Wahl beim Grounding** (die KI labelt ein weiß gemessenes Segment als
  `data-ds-variant="default"` = shadcns dunkle Primary → schwarzer Button, wo eine weiße Pille
  hingehört). Eigener Fehler, eigene Scheibe.
- Das **Fehlen der Rohdaten-Persistenz**. Robs Scan war nicht nachuntersuchbar, weil kein Scan
  gespeichert wird. Für die Fehlersuche wäre das der größte Hebel überhaupt — siehe RESUME.
