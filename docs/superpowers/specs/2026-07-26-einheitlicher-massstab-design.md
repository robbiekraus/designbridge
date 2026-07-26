# Ein Maßstab pro Scan statt pro Baustein — Design

**Status:** **UMGESETZT** 26.07.2026 auf `experiment/einheitlicher-massstab`. Web 822/822.
Robs Sichtprüfung an einem echten Scan + Figma-Import steht noch aus.

**Zahlen-Korrektur:** die Validierungstabellen weiter unten rechnen mit `imageWidth = 2296` (aus einer
RESUME-Notiz übernommen). Die Fixture ist real **1680** breit → k = **1,641**, nicht 2,242. Die
Verhältnisse und damit die Schlussfolgerung bleiben gültig, die absoluten Werte sind zu groß. Korrekte
Zielwerte: heading-xl 46 · heading-medium 30 · body 23 · caption 20. Der tatsächliche Emit-Vorher/
Nachher mit den richtigen Zahlen steht in `docs/2026-07-26-skalierungs-messung-ergebnis.md`.

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

## Vorfrage: GEKLÄRT (26.07.)

**Liegen die Typo-Token in Design-Pixeln oder in Bildpixeln? → Design-Pixel (1×).**

Belegt aus der Quelle, nicht erschlossen — `server/lib/claude.js:46` instruiert die KI wörtlich:

> „For typography: estimate sizes based on visual proportion (**body ≈ 14px**, headings scale from
> there)"

Von der zweiten Seite bestätigt: die Schriftgrößen, die die KI in ihr Interpretations-HTML schreibt,
liegen über alle 15 Bausteine bei **12,9–32** — genau der Bereich, den diese Anweisung erzeugt.
Interpretation und Token liegen also im selben Raum, und dieser Raum ist 1×.

Damit gibt es einen belastbaren Zielwert: Token × k. Beim CRAFTUI-Scan (k = 2,242):
heading-xl 28 → 63 · heading-medium 18 → 40 · body-medium 14 → 31 · caption 12 → 27.

## Woraus `k` bestimmt wird: `imageWidth / PREVIEW_VIRTUAL_WIDTH`

Die KI schreibt ihr HTML ohne Größenvorgabe, es wird aber immer im Behälter
`PREVIEW_VIRTUAL_WIDTH = 1024` vermessen. 1024 ist damit de facto die Design-Referenzbreite des
gesamten Systems (dieselbe Konstante nutzt auch die Live-Vorschau). Also:

```
k = imageWidth / PREVIEW_VIRTUAL_WIDTH        // CRAFTUI: 2296 / 1024 = 2,242
```

**Am echten Scan validiert** (Messung 26.07., alle 15 Bausteine): mit diesem einen `k` fallen die
Schriftgrößen auf die unabhängig am Bild gemessene Token-Skala:

| Baustein | heute | mit einheitlichem k | Zielwert |
|---|---|---|---|
| Popular Categories Card | 21 | **40** | 40 |
| Conversion History Card | 26 | **41** | 40 |
| Latest Events Card | 28 | **41** | 40 |
| Category Item Row | 25 | **41** | 40 |
| Income Details Card | 47 | **63** | 63 |
| Your Sales Chart Card | 45 | 67 | 63 |
| Income Breakdown Card | 48 | 72 | 63 |
| Left Sidebar Navigation | **14** | **50** | — |
| Top Header Bar | 24 | 33 | 31–40 |
| Time Period Filter | 21 | 32 | 31 |
| Metric Legend Item | 16 | 29 | 27–31 |
| Event List Item | 11 | 37 | 31 |
| Dashboard Page Layout | 49 | 49 | 63 |

Vier Bausteine landen punktgenau auf 40–41, die Geld-Karten auf 63–72 bei Zielwert 63. Heute streuen
dieselben Werte zwischen 11 und 49.

**Sanity-Anker:** `Dashboard Page Layout` ändert sich nicht (49 → 49). Es ist der einzige Baustein,
dessen `bbox.w` das ganze Bild abdeckt — also der einzige, bei dem `slot/natural` heute schon
zufällig `imageWidth/1024` ergibt. Genau deshalb sah das Template immer richtig aus und alles andere
nicht. Das ist ein starkes Indiz, dass `imageWidth/1024` die gesuchte Größe ist und nicht ein
zufällig passender Wert.

**Verbleibende Unschärfe, bewusst nicht wegdefiniert:** die drei Karten mit großen Geldbeträgen
landen bei 63/67/72 statt exakt 63, und `Dashboard Page Layout` bleibt mit 49 unter dem Zielwert 63.
Das ist Streuung in den von der KI geschriebenen Größen, nicht im Faktor — sie ist mit einem
uniformen `k` strukturell nicht behebbar und auch nicht das Ziel dieser Scheibe. Ziel ist
**Konsistenz zwischen Bausteinen**; absolute Treffgenauigkeit pro Baustein hängt an der
Interpretationsqualität.

**Woher `imageWidth` kommt** muss beim Umbau geprüft werden — `emitFigmaComponents.js` hat es heute
als `iw` zur Hand, aber ob es bei jedem Quelltyp (Bild/URL/Repo) gesetzt ist, ist offen. Fehlt es,
muss der Faktor sauber auf 1 zurückfallen (heutiges Verhalten), nicht raten.

## Umsetzungs-Design: zwei Größen, zwei Quellen

Beim Durchdenken der Umsetzung fällt ein Punkt auf, den die erste Fassung dieser Spec übersehen hat
und der sie präzisiert:

`freezeRootWidth` (`htmlToPlan.js:1271`) schreibt für Wurzeln mit stretch/grow im Unterbaum die
**gemessene** Breite als `width` in den Plan. Bei gestreckten Wurzeln ist das die Behälterbreite 1024.
Heute wird das mit dem winzigen Faktor multipliziert und ergibt zufällig ~die Slot-Breite
(1024 × 0,196 = 200). Mit einem einheitlichen `k` würde daraus **1024 × 2,242 = 2296** — die Sidebar
bekäme die volle Bildbreite als Rahmen. **Der Faktor allein reicht also nicht; beides muss zusammen
geändert werden.**

Die saubere Trennung, die daraus folgt:

| Größe | Quelle | Begründung |
|---|---|---|
| Typografie, Padding, Gaps, Radien, Icon-Maße, Strichstärken | **einheitliches `k`** | Eigenschaften des Designs, im ganzen Bild derselbe Zoom |
| Außenbreite eines **gestreckten** Bausteins | **`bbox.w × imageWidth`** (der Slot) | Bei gestreckten Wurzeln ist die gemessene Breite keine Eigenschaft des Bausteins — der Slot ist die einzige verlässliche Information |
| Außenbreite eines Bausteins mit **intrinsischer** Breite | gemessene Breite × `k` | Die Messung ist hier echte Information |

Konkreter Weg: `freezeRootWidth` bekommt die Slot-Breite in **Design-Pixeln** (`slotWidth / k`)
hereingereicht und pinnt bei gestreckter Wurzel diesen Wert statt der Behälterbreite. Die anschließende
uniforme Skalierung um `k` ergibt dann exakt `slotWidth`. Damit bleibt `scalePlan` eine reine,
faktor-getriebene Transformation — die Slot-Information wird vorher eingespeist, nicht nachträglich
korrigiert.

`bbox` behält damit eine echte Rolle (Außenmaß gestreckter Bausteine), verliert aber die falsche
(Quelle des Maßstabs).

## Verifikation

**Nachtrag nach der Umsetzung — die Prüflast ist kleiner geworden, nicht größer.** Der Faktor kommt
jetzt aus `imageWidth`, nicht aus einer Messung. Er ist damit **layout-unabhängig** und erstmals in
jsdom sichtbar: `figma-payload-from-raw.mjs` zeigt „Maßstäbe der Instanzen: 1.64" statt „1.00". Der
Miniatur-Fehler ist strukturell unmöglich geworden, weil `scanScaleFactor` keinen
`naturalWidth`-Parameter mehr hat — es gibt nichts mehr, was sich verrechnen könnte. Layout-abhängig
bleibt allein `freezeRootWidth`; dessen Logik ist per Unit-Test mit gemockter Messung abgedeckt
(gestreckt → Slot, nicht gestreckt → Messung, ohne bbox → altes Verhalten).

Ursprüngliche Einschätzung (galt für den alten, messungsabhängigen Faktor): Die Vitest-Suite kann
diese Änderung **nicht** absichern: jsdom hat keine Layout-Engine, `getBoundingClientRect()` liefert 0,
der Riegel in `scaleFactor` macht daraus Faktor 1. Der ganze Pfad ist dort unsichtbar — genau deshalb
ist der Fehler durch 817 grüne Tests gekommen.

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
