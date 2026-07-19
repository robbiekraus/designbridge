# SVG-Größen-Injektion: fehlendes viewBox/width/height aus gemessenem Rect

Stand: 19.07.2026. Behebt die kollabierende Trend-Linie (Rest-Issue 2) — KEINE harte Figma-Grenze,
sondern Konvertierungs-Bug. Web-only (`convertSvgElement`), kein Plugin-Change.

## Problem (Mechanismus belegt)

Gemini zeichnet Chart-Linien in eine SVG mit `style="width:100%;height:100%"` — OHNE `viewBox`,
OHNE `width`/`height`-Attribute. Die Pfade nutzen Pixel-Koordinaten der vollen Plot-Fläche
(`d="M 0,140 … 700,40"`, `… 730,150` → x bis ~700-730). `convertSvgElement` reicht das Markup
verbatim durch. Beim Figma-SVG-Import ist `width:100%` (CSS) nicht auflösbar (kein Eltern-Kontext)
→ Figma rendert die SVG auf CSS-Default (~300×150) → Pfade jenseits davon werden abgeschnitten →
Linien nur im linken Bereich (Figma-bewiesen: Standalone-Chart, Trend spannt nur ~15%). Die
12×12-Icon-SVGs haben `viewBox="0 0 24 24"` + `width/height` → rendern korrekt (nicht betroffen).

## Fix

In `convertSvgElement(el, ctx)`, auf dem geklonten Wurzel-`<svg>`, VOR `outerHTML`: fehlende
Größen-Angaben aus dem gemessenen Rect (`el.getBoundingClientRect()`) injizieren — nur wenn das Rect
echt ist (> 0):

- kein `viewBox`-Attribut → `viewBox="0 0 {W} {H}"` setzen
- kein `width`-Attribut → `width="{W}"` setzen
- kein `height`-Attribut → `height="{H}"` setzen

mit `W = max(1, round(rect.width))`, `H = max(1, round(rect.height))`. **Vorhandene Attribute NIE
überschreiben** (Icons mit viewBox/width/height bleiben unverändert). Bei degeneriertem Rect (0×0,
jsdom ohne Mock) nichts injizieren (Markup bleibt verbatim wie bisher).

### Warum das korrekt ist
Die Pfade sind in Pixel-Koordinaten der gerenderten Fläche gezeichnet; `viewBox="0 0 W H"` mit
`W×H = gemessene Größe` macht genau diesen Koordinatenraum zum SVG-Koordinatenraum (1:1). Figma
rendert die SVG dann in Originalgröße mit korrekt platzierten Pfaden. Wird die Chart-Instanz später
verkleinert (Template-Slot), skaliert Figma die Instanz-Inhalte proportional → SVG skaliert korrekt
mit (der Resize-Fall wird also mit-behoben).

## Bewusste Grenzen
- Pfade, die minimal über die gemessene Breite hinausragen (hier ~730 vs ~700), werden am Rand
  minimal geclippt (~4 %) — vernachlässigbar.
- Reine Größen-Injektion; die SVG-Semantik (Farben, Pfade) bleibt unverändert.

## Tests (web, jsdom, gemocktes getBoundingClientRect)
1. SVG OHNE viewBox/width/height, Rect 700×180 → Markup enthält `viewBox="0 0 700 180"` width="700" height="180".
2. SVG MIT `viewBox="0 0 24 24"` width="12" height="12" (Icon), Rect 12×12 → Markup UNVERÄNDERT (nichts überschrieben).
3. SVG mit viewBox, aber ohne width/height, Rect 22×22 → width/height injiziert, viewBox unberührt.
4. Degeneriertes Rect 0×0 → keine Injektion (Markup verbatim).
5. Bestehende convertSvgElement/htmlToPlan-svg-Tests: an injizierte Attribute angepasst, wo sie Rects mocken.
