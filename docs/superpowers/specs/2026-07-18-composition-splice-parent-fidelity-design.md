# Composition-Splice — Eltern-Fidelity (Scheibe 1b)

**Datum:** 2026-07-18 (nachts)
**Status:** Spec — zur Review
**Baut auf:** `2026-07-18-composition-nesting-figma-design.md` (Scheibe 1). Korrigiert deren
größte bewusste Grenze („Eltern-Chrome geht verloren"), die sich in Robs `test10` als
zerschossene Templates/Organismen zeigte.

---

## Problem (per Figma-MCP bewiesen, `test10`)

Nach dem Card-Fix haben Leaf-Bausteine echte Größen und rendern **perfekt** (z. B.
„Emissions Trend Chart Card" einzeln = sauberer Chart). Aber **komponierte Eltern**
(Template „Dashboard Layout" + komponierte Organismen wie „Sidebar Navigation") sind
zerschossen:

- **Sidebar** (komponiert): nur 3 verstreute Fragmente (Logo-Rest, „Storage", Zahnrad)
  in einem hohen leeren Rahmen — Nav-Liste, Logo, Profil **fehlen**.
- **Template**: KPI-Cards überlappen + Text abgeschnitten, Legenden über Titeln,
  Header-Atome verstreut.

**Root Cause (systematic-debugging Phase 1):** `composePlan` (Scheibe 1) baut Eltern
**ausschließlich** aus `component-ref`-Instanzen ihrer erkannten Kinder an deren
bbox-Rechtecken und **verwirft die eigene Interpretation des Elternteils**. Zwei
Fehlerquellen:
1. **Verlorener Inhalt:** Alles im Elternteil, das nicht als eigener Kind-Baustein
   erkannt wurde (Sidebar-Nav-Liste, Logos, Hintergründe, Karten-Padding), verschwindet.
2. **Fehlpassende Instanzen:** Kind-Instanzen werden auf bbox-Maße resized; ihre echte
   interpretierte Größe passt nicht → Überlappung/Abschnitt/Lücken.

Der Elternteil hat aber eine **eigene, gute Interpretation** (die App-Vorschau des ganzen
Dashboards sieht korrekt aus — dieselbe Interpretation). Wir werfen sie nur weg.

---

## Kernidee: Splice statt Ersatz

Der komponierte Elternteil rendert aus **seiner eigenen Interpretation** (volles,
korrektes Layout) — und **nur die Bereiche, die einem erkannten Kind entsprechen, werden
an Ort und Stelle durch eine echte `component-ref`-Instanz ersetzt** (Fallback = das
Original-Subtree). Ergebnis: **gutes Layout + echte Verschachtelung** zugleich.

Die Zuordnung „welches Element der Eltern-Interpretation IST welches Kind" läuft
**räumlich** über die schon vorhandene Live-Vermessung in `htmlToPlan` (jedes Element wird
offscreen gemountet, `getBoundingClientRect` ist verfügbar — genutzt in `readAbsolute`/
`freezeRootWidth`). Für jedes Kind wird das Eltern-Element mit der besten
Rechteck-Überlappung (IoU) zu seiner (auf den Elternteil normierten) bbox gesucht.

Das ersetzt die bisherige heuristische Klassen-Erkennung (`matchKnownComponent`, nur
Button/Suche/Input/Badge) durch **identitäts- + positionsbasiertes** Splicing für die
konkreten erkannten Kinder — genau die Lücke aus Scheibe 1.

---

## PINNED CONTRACT

### 1. `htmlToPlan` bekommt `spliceTargets`

```js
htmlToPlan(html, { tokens, knownComponents, spliceTargets })
// spliceTargets?: Array<{ name: string, bbox: {x,y,w,h} }>  // bbox NORMIERT AUF DEN ELTERNTEIL (0..1)
```

- Ist `spliceTargets` leer/undefiniert → heutiges Verhalten, kein Splice.
- Beim Mount wird der **Referenzrahmen** = Rect des (einzigen) Wurzel-Elements
  `roots[0]` bestimmt (`ctx.spliceRoot`, `ctx.spliceTargets`, `ctx.splicedNames:Set`).
  Bei mehreren Roots: Referenz = umschließendes Rect aller Roots.
- In `convertElement(el, …)`, **vor** dem normalen box/text-Nachbau und **nach** dem
  bestehenden `matchKnownComponent`-Zweig: normiertes Rect von `el` relativ zum
  Referenzrahmen berechnen (`(el.rect − root.rect)/root.size`) und gegen alle noch nicht
  verbrauchten `spliceTargets` prüfen. Bester Treffer mit **IoU ≥ `SPLICE_MIN_IOU` (0.35)**:
  → `component-ref` zurückgeben:
  ```js
  { type:'component-ref', name: target.name, variant: null,
    fallback: ensureBox(buildNormalNode(el, ctxOhneSplice, parent)) }
  ```
  kein Abstieg in den Hauptbaum (wie beim bestehenden component-ref-Zweig; absolute/
  stretch/grow des Elements werden wie dort an den ref-Knoten gehängt).
  `target.name` in `ctx.splicedNames` merken (jedes Ziel höchstens **einmal**; jedes
  Element höchstens einem Ziel — bestes IoU gewinnt bei Konkurrenz).
- **IoU** = Schnittfläche / Vereinigungsfläche der beiden normierten Rechtecke.
- Der `fallback`-Baum wird mit einem Kontext **ohne** `spliceTargets` gebaut (kein
  rekursives Selbst-Splicing im Fallback).
- Nicht zugeordnete Ziele: bleiben unspliced → der Elternteil zeichnet sie über seine
  eigene Interpretation (Inhalt bleibt erhalten, nur nicht als Instanz). Namen der
  unspliced Ziele als Warnung sammeln.

### 2. `emitFigmaComponents` — Splice für Eltern mit Interpretation

Für jeden Baustein mit `composition.children[name]?.length > 0`:

- **Eltern-Interpretation vorhanden** (`result.interpretations[name]?.html`):
  `spliceTargets` = direkte Kinder, deren bbox **auf den Elternteil normiert** ist:
  ```js
  childRel = {
    x: (child.bbox.x - parent.bbox.x) / parent.bbox.w,
    y: (child.bbox.y - parent.bbox.y) / parent.bbox.h,
    w:  child.bbox.w / parent.bbox.w,
    h:  child.bbox.h / parent.bbox.h,
  }
  ```
  (Für das Template mit bbox `{0,0,1,1}` ist childRel = child.bbox.)
  Dann `htmlToPlan(parentInterp.html, { tokens, knownComponents, spliceTargets })` →
  `source:'composed-spliced'`, `placeholder:false`.
  Nur Kinder **mit** bbox kommen als spliceTarget in Frage.
- **Keine Eltern-Interpretation ODER keine Kind-bbox** (Repo/URL-Pfad, oder Interpretation
  fehlgeschlagen): **Fallback = bisheriges `composePlan`** (Scheibe 1: räumlich/Fluss).
  Damit bleibt der Repo-Nesting-Weg (Scheibe 2) unverändert funktionsfähig.
- Leaf-Bausteine (keine Kinder): unverändert.

### 3. Keine Plugin-Änderung

`component-ref` + `fallback` + absolute werden vom Plugin schon verarbeitet (Scheibe 1
bewiesen). Rein web-seitig.

---

## Warum das die test10-Befunde löst

- **Sidebar**: rendert aus ihrer eigenen Interpretation (Logo + volle Nav-Liste + Storage
  + Profil, korrekt gestapelt); die erkannten Kinder (Storage Progress Bar, User Profile
  Widget, Sidebar Logo) werden an ihrer Position durch Instanzen ersetzt. Kein
  Inhaltsverlust, keine Streuung.
- **Template**: rendert das ganze Dashboard aus seiner Interpretation (korrektes Grid);
  KPI-Cards / Charts / Tabelle werden durch die (einzeln perfekten) Organismus-Instanzen
  ersetzt. Kein Überlappen, kein Abschnitt — die Instanz bringt ihre eigene richtige Größe
  mit (kein bbox-Resize-Zwang mehr; der Elternteil-Flow platziert sie).

---

## Bewusste Grenzen

- **Räumliches Matching ist heuristisch:** bei ungenauen KI-bboxes kann ein Kind mal nicht
  zugeordnet werden (IoU < Schwelle) → es bleibt Teil der Eltern-Interpretation (sichtbar,
  aber nicht als Instanz). Graceful, kein Bruch. Schwelle `SPLICE_MIN_IOU` per Test kalibriert.
- **Repo/URL-Pfad**: kein bbox → kein räumlicher Splice; bleibt beim Scheibe-1/2-Verhalten
  (Repo: Fluss-Komposition aus dem Graph). Ein späterer DOM-basierter Splice wäre eigene Scheibe.
- **Eltern ohne eigene Interpretation** (Fehlschlag): Fallback auf reine Instanz-Komposition
  (Scheibe 1) — schlechter, aber selten und nie schlechter als heute.
- Die alte reine `composePlan`-Komposition bleibt als Fallback erhalten (nicht gelöscht).

---

## Tests (TDD)

**`web/src/lib/emit/htmlToPlan.js` — Splice (Unit, jsdom-fähig machen):**
> ⚠️ jsdom liefert für `getBoundingClientRect` standardmäßig 0-Rects. Die bestehenden
> htmlToPlan-Tests umgehen das (sie prüfen Struktur, nicht Layout). Für die Splice-Tests
> die Element-Rects **stubben**: `getBoundingClientRect` je Test-Element per
> `Object.defineProperty`/Spy mit festen Werten belegen (Muster: ein Root 0..1024×0..768,
> ein Kind-`<div data-tid>` mit bekanntem Rect). So wird die IoU-Zuordnung deterministisch
> getestet, ohne echte Layout-Engine.
- Kind-Rect ≈ Ziel-bbox (IoU ≥ 0.35) → das Element wird `component-ref{name}` mit
  `fallback` (Original-Subtree), kein Abstieg.
- Zwei Ziele, zwei Elemente → beide korrekt zugeordnet, je einmal.
- Ziel ohne passendes Element (IoU < 0.35 überall) → kein component-ref, Warnung enthält
  den Zielnamen; das restliche Plan-Rendering unverändert.
- Konkurrenz (zwei Elemente überlappen ein Ziel) → das mit höherem IoU gewinnt, das andere
  wird normal gebaut.
- `spliceTargets` leer → Plan identisch zum Nicht-Splice-Pfad (Regression).

**`web/src/lib/emit/emitFigmaComponents.js` (Integration):**
- Eltern mit Kindern + `interpretations[parent]` + Kind-bbox → `source:'composed-spliced'`,
  Plan enthält component-ref an Kind-Position, Rest = Eltern-Interpretation.
- Eltern mit Kindern, **ohne** `interpretations[parent]` → Fallback `composePlan`
  (`source:'composed'`), wie Scheibe 1.
- Repo-Fall (Kinder ohne bbox) → weiter Fluss-`composePlan` (`source:'composed'`).
- Leaf unverändert.
- Normierung Kind→Eltern-bbox: gepinnte Beispielrechnung (Organism-Parent nicht bei 0,0).

**Voller Lauf:** Web + Server + Plugin (Plugin unberührt) grün.

---

## Verifikation (autonom)

1. Suiten grün.
2. **Live-API-Beweis (Prod, EcoMetrics-Bild):** vollständiger Flow (scan → interpret →
   emit-Payload). Im `/api/figma-export/latest`: Template-Eintrag = `composed-spliced`,
   Plan enthält (a) volle Eltern-Struktur UND (b) component-ref-Knoten an den
   Organismus-Positionen. Gegencheck: Anzahl gesplicte Kinder vs. erkannte Kinder.
3. Echter visueller Beweis = Robs nächster Figma-Import (Template + Sidebar vollständig,
   mit echten Instanzen an den Karten/Charts).
