# Composition-Fidelity v3: Flow-Box-Wrapping der gesplicten Instanz

Stand: 19.07.2026. Ersetzt den Bare-Absolute-Ansatz von `de2d4fc` im Splice-Branch.
Web-only Change. Nutzt die v2-Plugin-Maschinerie (`applyAbsolute` shrink-only) unverändert.

## Problem (Root Cause per get_design_context belegt)

`de2d4fc` macht gesplicte Instanzen `absolute` (relativ zum direkten Parent). Das tiled Grid-
Karten sauber, ABER: war das ersetzte Element ein **Flow-Kind**, das per Fluss seine Geschwister
positioniert (klassisch: Sidebar in Flex-Row `[Sidebar | Hauptinhalt]`), nimmt `absolute` es aus
dem Fluss → die Geschwister rutschen in seinen Platz. Beobachtet: Sidebar-Instanz `absolute left-0`,
Hauptinhalt (Topbar/KPI-Grid) rutscht auf `left-0` und **überlagert die Sidebar**.

Kern: `absolute` kann nicht gleichzeitig „im Fluss Platz belegen" (für die Geschwister-Position)
UND „aus dem Fluss genau dimensioniert" sein.

## Fix: Flow-Box wrappt absolute Instanz

Der Splice-Branch (`convertElement` in `htmlToPlan.js`) ersetzt das gematchte Element NICHT mehr
durch eine bare `component-ref` mit `absolute`, sondern durch eine **Flow-Box in Slot-Größe**, die
die Instanz als **absolut positioniertes Kind** enthält:

```js
const spliceName = ctx.spliceAssignment?.get(el);
if (spliceName) {
  const computed = getComputedStyle(el);
  const ctxNoSplice = { ...ctx, spliceAssignment: null };
  const refNode = { type: 'component-ref', name: spliceName, variant: null,
                    fallback: ensureBox(buildNormalNode(el, ctxNoSplice, parent)) };
  const rect = readAbsolute(el, computed) || measureRectRelParent(el);
  if (rect) {
    // War das Element im Fluss (nicht CSS-absolut)? Dann Flow-Box-Wrapper, damit die Instanz
    // ihren Flow-Platz behält und Geschwister korrekt positioniert (Overlap-Fix). Die Instanz
    // sitzt absolut IN der Box (0,0), das Plugin resized sie shrink-only (v2) → kein Stretch.
    const cssAbsolute = readAbsolute(el, computed);
    if (cssAbsolute) {
      // Element war schon CSS-absolut → bare absolute Instanz wie bisher (kein Flow-Platz nötig).
      return { ...refNode, absolute: cssAbsolute };
    }
    const instance = { ...refNode, absolute: { x: 0, y: 0, width: rect.width, height: rect.height } };
    return {
      type: 'box', layout: 'column', padding: [0,0,0,0], radius: 0, fill: null, stroke: null,
      strokeWeight: 1, gap: 0, width: rect.width, height: rect.height,
      primaryAlign: 'MIN', counterAlign: 'MIN', children: [instance],
    };
  }
  return attachStretchGrow(refNode, readStretchGrow(el, computed, parent));
}
```

(Feldnamen exakt aus `emptyBoxNode()`/PlanBox-Vertrag — mit composePlan.js `boxDefaults` abgleichen.)

### Warum das beide Bugs löst
- **Overlap weg:** Die Flow-Box belegt `rect.width × rect.height` im Fluss → Geschwister
  (Hauptinhalt) werden korrekt daneben/darunter positioniert, genau wie das Originalelement.
- **Overflow weg:** Die Box hat feste Slot-Größe → die Flow-Row tiled die Boxen, kein Hug-Overflow.
- **Kein Stretch:** Die Instanz ist absolut in der Box (0,0), `applyAbsolute` (v2) resized sie auf
  `min(natürlich, slot)` → z. B. Sidebar 260×940 in einer 260×1553-Box (Bodenspalt statt Streckung).
- **CSS-absolute Elemente:** unverändert bare absolute (die brauchen keinen Flow-Platz).

### Kein Plugin-Change
Die Box ist ein normaler Auto-Layout-Frame mit expliziter Größe (kollabiert nicht, `buildBoxNode`-
Freeze-Fall greift gar nicht, da Größe gesetzt). Das absolute Kind nutzt `applyAbsolute` unverändert.
`renderPlan` hängt die absolute Instanz an den Box-Frame → `layoutPositioning='ABSOLUTE'` gültig.

## Bewusste Grenzen
- Bodenspalt, wenn Slot höher als natürlich (Sidebar) — akzeptiert (< Streckung < Overlap).
- SVG-Skalierung (Trend-Linie) bleibt separate harte Grenze.
- Echter Beweis = Figma-Re-Import (Payload ändert sich → EINE Figma-Runde nötig).

## Tests (web, jsdom, gemockte Rects)
1. Gesplictes FLOW-Element → Ergebnis ist eine `box` mit `width/height = rect`, deren einziges Kind
   eine `component-ref` mit `absolute {0,0,rect.w,rect.h}` ist.
2. Gesplictes CSS-`absolute`-Element → weiterhin bare `component-ref` mit `absolute` (KEIN Box-Wrap).
3. Degeneriertes Rect (0×0) → Fallback stretch/grow (kein Wrap, kein absolute).
4. Die Wrap-Box trägt keine visuellen Props (fill/stroke null) — nur Geometrie.
5. Bestehende Splice-Tests: an die neue Struktur angepasst (Flow-Fälle erwarten jetzt den Wrapper).
