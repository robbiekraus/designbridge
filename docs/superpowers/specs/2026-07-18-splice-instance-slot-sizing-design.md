# Splice-Instanz-Slot-Dimensionierung (test12 Rest-Issue 1)

Stand: 18.07.2026 nachts. Schmale Fidelity-Scheibe. Kein Plugin-Change.

## Problem (Root Cause bewiesen an beiden Codebasen)

Im Composition-Splice bekommt eine gesplicte Instanz nur dann ein `absolute`-Rect,
wenn ihr Quell-Element CSS-positioniert ist (`readAbsolute` guardet auf
`position:absolute|fixed`, `htmlToPlan.js:506`). Ein **Flow-Element** — der Normalfall
für Karten in einem Template-Grid — bekommt kein `absolute`, nur `attachStretchGrow`
(`htmlToPlan.js:823-831`).

Im Plugin wird eine `component-ref`-Instanz **ausschließlich über `applyAbsolute`**
auf eine feste Größe resized (`renderPlan.ts:317-318`). Ohne `absolute` läuft nur
`createInstance()` + `applyStretchGrow` — die Instanz behält die **Eigengröße der
referenzierten Komponente** (z. B. eine 520px-Card). Im Flow-Row des Templates
summieren sich diese Eigenbreiten → die rechte Spalte (Energy/Category) ragt über den
gefrorenen Template-Rand („brennende" Instanzen in test12).

## Fix (Option A — RESUME/Skill-Richtung)

Der Splice-Branch dimensioniert gesplicte Instanzen **immer** auf ihr gemessenes
Slot-Rect (relativ zum direkten Eltern-Element), das die Eltern-Interpretation für
diesen Slot gezeichnet hat. `applyAbsolute` positioniert + resized die Instanz dann
exakt in diesen Slot — genau die Größe, die im gerenderten Eltern-HTML gemessen wurde,
also per Konstruktion ohne Overflow.

### Vertrag

Neuer reiner Helfer neben `readAbsolute` (letzterer bleibt unangetastet — der 418-Test-
Korpus prüft Plan-Literale ohne `absolute`-Schlüssel):

```js
// Wie readAbsolute, aber OHNE position-Guard: gemessenes Rect relativ zum direkten
// Eltern-Element. null bei fehlendem Parent oder degeneriertem Rect (jsdom 0×0).
function measureRectRelParent(el) { … }  // {x,y,width,height} | null
```

Splice-Branch (`convertElement`, ~823-831) neu:

```js
const spliceName = ctx.spliceAssignment?.get(el);
if (spliceName) {
  const computed = getComputedStyle(el);
  const ctxNoSplice = { ...ctx, spliceAssignment: null };
  const refNode = { type: 'component-ref', name: spliceName, variant: null,
                    fallback: ensureBox(buildNormalNode(el, ctxNoSplice, parent)) };
  // Gesplicte Instanz IMMER auf ihr gemessenes Slot-Rect (readAbsolute für echte
  // CSS-Positionierung, sonst gemessenes Flow-Rect) — sonst huggt sie ihre Eigengröße.
  const absolute = readAbsolute(el, computed) || measureRectRelParent(el);
  if (absolute) return { ...refNode, absolute };
  return attachStretchGrow(refNode, readStretchGrow(el, computed, parent));
}
```

### Folge-Effekt (gewollt, existierende Maschinerie)

Ein `absolute`-Kind lässt seinen direkten Box-Parent seine fehlenden Maße aus dem
eigenen Rect einfrieren (`buildBoxNode:428`, test6-Nachfix). Damit behält die Splice-
Elternkette ihre Größe, die absoluten Instanzen haben eine Leinwand. Gleiches Muster
wie composePlan (das ALLE Kinder absolut positioniert), nur unter Erhalt des Eltern-
Chrome.

## Bewusste Grenzen

- Rein visuelle Verbesserung; jsdom liefert keine echten Rects → Unit-Tests mocken
  `getBoundingClientRect` (wie die bestehenden Splice-Tests). Echter Beweis = Figma-E2E.
- SVG-Skalierung im Template (Rest-Issue 2) bleibt separat.
- Degeneriertes Rect (0×0) → Fallback auf stretch/grow, kein Overflow-Schutz (aber auch
  kein Schaden — heutiges Verhalten).

## Tests (web, jsdom, gemockte Rects)

1. Gesplictes FLOW-Element (nicht CSS-positioniert) → ref-Node trägt `absolute` mit
   gemessenem Rect relativ zum Parent.
2. Gesplictes CSS-`absolute`-Element → trägt weiterhin `absolute` (readAbsolute-Pfad).
3. Degeneriertes Rect (0×0) → kein `absolute`, Fallback stretch/grow.
4. Direkter Box-Parent eines gesplicten absoluten Kindes friert seine Maße ein.
5. Regression: bestehende Splice-Tests unverändert grün.
