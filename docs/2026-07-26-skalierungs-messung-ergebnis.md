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
