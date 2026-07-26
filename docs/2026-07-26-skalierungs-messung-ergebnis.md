# Skalierungs-Messung 26.07.2026 — Ergebnis

Messwerkzeug: `web/verification/measure-natural-widths.mjs` (kein KI-Call).
Datenquelle: `storybook-harness/fixtures/prod-scan-raw.json` (eingefrorener echter CRAFTUI-Prod-Scan,
15 Interpretationen). Gemessen in echtem Chromium, weil jsdom keine Layout-Engine hat.

## Anlass

Robs Figma-Datei (Sunstone-Scan, `8DEydksPP28V2WrfN9TrRI`) zeigte **Miniatur-Bausteine**:

| Baustein in Robs Figma | Schriftgröße |
|---|---|
| Brand Logo („Sunstone") | **5** |
| Nav Item („Overview") | **7** |
| Search Input | 28 |
| Product Table Row | normal (1203 × 101 px) |

Dazu: `Sidebar Navigation` (Knoten `1:260`) ist 442 × 2366 px, enthält aber nur **zwei** Instanzen
— rund 2200 px Leerraum. Aus demselben Scan kommen also völlig unterschiedliche Maßstäbe.

## Ursache (im Code belegt, nicht vermutet)

`scalePlan.js`:

```js
const slotWidth = bbox.w * imageWidth;
return slotWidth / naturalWidth;   // skaliert ALLES, inkl. fontSize
```

`naturalWidth` ist `roots[0].getBoundingClientRect().width`, gemessen in einem Behälter von
`PREVIEW_VIRTUAL_WIDTH = 1024` px. **Ist die Wurzel des KI-HTML block-level (`display:flex`, plain
`<div>`), streckt sie sich auf die volle Behälterbreite** — die Messung liefert 1024 statt der
Inhaltsbreite, der Faktor wird winzig, der Baustein schrumpft.

Im Browser nachgestellt und bestätigt:

| Wurzel-Element | gemessene Breite | Faktor | aus Schrift 36 wird |
|---|---|---|---|
| `display: flex` | **1024** | 0,196 | **7** |
| `display: inline-flex` | 215 | 0,932 | 34 |

Das deckt sich exakt mit Robs Datei: Nav Item = 7, Search Input = 28.

## Warum die Testsuite das nie gesehen hat

jsdom hat keine Layout-Engine → `getBoundingClientRect()` liefert 0 → der Riegel
`if (!(naturalWidth > 0)) return 1` macht daraus Faktor 1. **Der komplette Skalierungspfad ist in
der Vitest-Suite unsichtbar.** `verification/figma-payload-from-raw.mjs` zeigt es sogar an
(„Maßstäbe der Instanzen: 1.00"), was bisher als unauffällig gelesen wurde.

## Gemessene Varianten, alle 15 Bausteine

Betroffen sind **4 von 15** — nur die, deren Wurzel sich streckt: `Event List Item`,
`Top Header Bar`, `Left Sidebar Navigation`, `Dashboard Page Layout`.

| Baustein | Ziel-Slot | Schrift heute | Variante B (`max-content`) | Variante C (im Slot rendern) |
|---|---|---|---|---|
| Category Item Row | 436 | 25 | 56 ❌ | 25 |
| Time Period Filter | 367 | 21 | 21 | 21 |
| Event List Item ⚠ | 712 | 11 | 31 | 16 |
| Metric Legend Item | 321 | 16 | 23 | 16 |
| Top Header Bar ⚠ | 1653 | 24 | **104** ❌ | 15 |
| Popular Categories Card | 482 | 21 | 28 | 21 |
| Conversion History Card | 482 | 26 | 36 | 26 |
| Your Sales Chart Card | 781 | 45 | 45 | 45 |
| Latest Events Card | 804 | 28 | 39 | 28 |
| Income Details Card | 804 | 47 | 47 | 47 |
| Left Sidebar Navigation ⚠ | 643 | 14 | 38 | 22 |
| Income Breakdown Card | 781 | 48 | 51 | 48 |
| Dashboard Page Layout ⚠ | 2296 | 49 | 42 | 22 |

⚠ = Wurzel streckt sich auf 1024.

## ⚠️ Korrektur zu den Zahlen unten

Die Tabellen dieses Dokuments wurden mit **`IMAGE_WIDTH = 2296`** gerechnet — der Wert stammt aus
einer RESUME-Notiz und ist für diese Fixture **falsch**. `raw.meta.image_width` der eingefrorenen
Rohdaten ist **1680** (× 1020). Damit ist k = 1680 / 1024 = **1,641**, nicht 2,242.

Die **Ziel-Slots und Faktoren in den Tabellen unten sind entsprechend zu groß.** Die *Verhältnisse*
zwischen den Varianten — und damit die Schlussfolgerung — bleiben unberührt, weil alle drei Varianten
denselben falschen Multiplikator hatten. Die korrekten Zielwerte lauten:

| Token | Rolle | Zielwert (Token × 1,641) |
|---|---|---|
| 28 | heading-xl | **46** |
| 18 | heading-medium | **30** |
| 14 | body-medium | **23** |
| 12 | caption | **20** |

Das Messwerkzeug liest die Bildbreite inzwischen aus `raw.meta.image_width` statt sie hartzukodieren.

## Ergebnis nach dem Umbau (echter Emit, nicht nur Messung)

Vorher/Nachher am tatsächlich emittierten Figma-Payload, beide aus denselben eingefrorenen Rohdaten
(`verification/figma-payload-from-raw.mjs`), größte Schriftgröße je Baustein:

| Baustein | vorher | nachher | Zielwert |
|---|---|---|---|
| Category Item Row | 18 | **30** | 30 ✅ |
| Popular Categories Card | 18 | **30** | 30 ✅ |
| Latest Events Card | 18 | **30** | 30 ✅ |
| Conversion History Card | 18 | **30** | 30 ✅ |
| Income Details Card | 28 | **46** | 46 ✅ |
| Time Period Filter | 14 | **23** | 23 ✅ |
| Metric Legend Item | 13 | **21** | 20 ✅ |
| Top Header Bar | 15 | 25 | 23–30 |
| Event List Item | 16 | 26 | 23 |
| Your Sales Chart Card | 30 | 49 | 46 |
| Income Breakdown Card | 32 | 53 | 46 |
| Left Sidebar Navigation | 22 | 36 | — |
| Dashboard Page Layout | 22 | 36 | — |

**Kein einziger Baustein wurde kleiner** (das war das Blocker-Kriterium). Sieben landen auf dem
Zielwert, der Rest liegt darüber — diese Streuung steckt in den von der KI geschriebenen Größen, nicht
im Faktor.

**Wichtige Einordnung, damit diese Tabelle nicht überinterpretiert wird:** der „vorher"-Stand ist
hier der **jsdom**-Stand, also Faktor 1,00 (unskaliert) — nicht der kaputte Browser-Stand mit Faktor
0,196. In jsdom gab es den Miniatur-Fehler nie. Was diese Tabelle belegt: der einheitliche Faktor
greift jetzt auch ohne Layout-Engine und trifft die Token-Skala. Was sie **nicht** belegt: das
Verschwinden des Miniatur-Fehlers im echten Browser — das folgt aus dem Code (der Faktor hat keinen
`naturalWidth`-Parameter mehr) und aus den Tests zu `freezeRootWidth`.

**Nebeneffekt, der die Testlage dauerhaft verbessert:** weil der Faktor jetzt aus der Bildbreite statt
aus einer Messung kommt, ist er **layout-unabhängig** und damit erstmals in jsdom sichtbar.
`figma-payload-from-raw.mjs` zeigt „Maßstäbe der Instanzen: **1.64**" statt vorher „1.00".

## Der unabhängige Maßstab

Der Scan hat die Schriftgrößen **am Bild selbst gemessen** und Beispieltexte mitgeliefert:

| gemessen | Rolle | Beispiel |
|---|---|---|
| 28 | heading-xl | „$142.000" |
| **18** | heading-medium | **„Dashboard"** |
| 14 | body-medium | „Popular categories" |
| 12 | caption | „Explore most popular product categories" |

„Dashboard" ist der Titel im `Top Header Bar`. Damit sind die Varianten prüfbar — und **keine
gewinnt durchgehend**: beim Header liegt der heutige Weg am nächsten (24 vs. 104 vs. 15), bei der
Sidebar Variante B, beim Page Layout wäre C deutlich zu klein.

**Offene Frage zum Maßstab:** ob die Token in Design-Pixeln (1×) oder in Bildpixeln vorliegen, ist
nicht geklärt. Die Werte 28/18/14/12 sind typische 1×-Design-Größen; der Figma-Emit skaliert
dagegen bewusst auf echte Bildpixel (2296px-Screenshot ≈ 2,24×). Wenn die Token 1× sind, wäre der
Zielwert für „Dashboard" ≈ 18 × 2,24 ≈ 40. **Das muss geklärt werden, bevor ein Zielwert als
„richtig" gilt.**

## Schlussfolgerung

Alle drei Varianten kurieren Symptome. Der strukturelle Fehler liegt tiefer: **jeder Baustein
rechnet sich seinen eigenen Maßstab aus.** Ein Screenshot hat aber genau einen Zoom-Faktor —
derselbe Text landet momentan je nach Baustein bei unterschiedlichen Größen, deshalb passt nichts
zusammen. Richtung: ein Faktor pro Scan, nicht pro Baustein.

→ Spec: `docs/superpowers/specs/2026-07-26-einheitlicher-massstab-design.md`

## Messung wiederholen

```
cd web
node verification/measure-natural-widths.mjs ../storybook-harness/fixtures/prod-scan-raw.json
cd verification && python3 -m http.server 8791
# → http://localhost:8791/natural-widths.html · Rohdaten liegen auch in window.__ROWS
```

`IMAGE_WIDTH` in der erzeugten Seite ist auf 2296 (CRAFTUI-Scan) hartkodiert — bei einem anderen
Scan anpassen, sonst sind die Ziel-Slots falsch.
