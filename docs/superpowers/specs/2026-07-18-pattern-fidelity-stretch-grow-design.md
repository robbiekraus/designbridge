# Pattern-Fidelity-Scheibe „Stretch & Grow" (verschachtelte Layouts) — Design

**Datum:** 2026-07-18 · **Status:** In Umsetzung (Robs Go „Pattern-Fidelity-Scheibe" 18.07.)
**Anlass:** Re-Test `test6` (18.07. ~00:10): Komponenten-Ebene ✅, aber im Pattern „Dashboard Layout":
(1) Sidebar schwebt vertikal versetzt, (2) Monats-Labels „DecJanFeb…" mittig zusammengestaucht,
(3) Top-Emissions-Wert überlappt/klebt am Titel. Befund (4) Tabellen-Spaltenraster = **eigene Scheibe, hier out of scope**.

## Bewiesene Root Causes (Live-Browser-Messung 18.07., Fixture-HTML „Line Chart Card" + „Sidebar + Content Shell")

1. **`readAlignment` (htmlToPlan.js): counterAlign-Fehl-Mapping.** Nicht-Flex-Container → `CENTER`;
   `ALIGN_ITEMS_MAP` mappt `stretch`/`normal` (= CSS-**Default** von Flex!) → `CENTER`. Der Browser
   richtet Block-/Flex-Kinder aber am Start aus bzw. STRECKT sie über die Gegenachse.
2. **Der Plan-Vertrag kennt kein „Kind füllt die Gegenachse" (STRETCH).** Kinder ohne explizite
   Größe werden in Figma HUG → `justify-content:space-between`-Zeilen kollabieren auf
   Inhaltsbreite (Labels/Titel+Wert kleben aneinander), der Klumpen wird wegen (1) auch noch zentriert.
3. **Der Plan-Vertrag kennt kein `flex-grow` (GROW).** `flex:1`-Spalten (Content neben Sidebar)
   kollabieren auf HUG statt den Restplatz zu füllen.

Gemessener Beweis: Label-Zeile `{width:null, primaryAlign:SPACE_BETWEEN}` + Karten-Root
`{counterAlign:CENTER}`; Shell-Content (`flex:1`) `{width:null}`; Sidebar `{height:null}` +
Root-Row `{counterAlign:CENTER}` → exakt Robs 3 Befunde. Der Browser misst alles richtig —
der Konverter wirft die Information weg.

## Vertrag (PINNED zwischen Web `htmlToPlan.js` und Plugin `parsePayload.ts` — nicht abweichen)

Alle vier PlanNode-Typen (box/text/svg/component-ref) erhalten zwei **optionale** Felder:

- `stretch?: true` — Kind füllt die **Gegenachse** seines Eltern-Layouts (CSS `align-items:stretch`
  bzw. Block-Flow-Breite). Figma: `layoutAlign = 'STRETCH'`.
- `grow?: true` — Kind füllt die **Primärachse** (CSS `flex-grow > 0`). Figma: `layoutGrow = 1`.

Regeln:
- Felder werden **WEGGELASSEN statt `false`/`null`** (gleiche Begründung wie beim `absolute`-Feld:
  der bestehende `toEqual`-Testkorpus prüft Literale ohne diese Schlüssel).
- `absolute` **gewinnt** über stretch/grow: ein absolut positionierter Node bekommt NIE stretch/grow.
- **svg-Nodes bekommen NIE stretch/grow** (STRETCH würde den Frame resizen, die Vektor-Kinder
  skalieren nicht mit → Verzerrung/Leerraum; SVG behält seine gemessene Größe).
- counterAlign-Mapping ändert sich: `stretch`/`normal` → `'MIN'` (bisher CENTER);
  Nicht-Flex-Container → `{primaryAlign:'MIN', counterAlign:'MIN'}` (bisher CENTER).
  `baseline` bleibt CENTER. (Das ändert bewusst auch Bestands-Pläne: Browser-Wahrheit statt
  Zufalls-Zentrierung; bestehende Tests werden angepasst.)

## Erkennung (Web, `htmlToPlan.js`)

Die Konvertierung reicht ab sofort **Eltern-Kontext** durch (`convertElement(el, ctx, parent)`,
parent = `{ computed, layout }` oder `null` für Wurzeln = direkte Kinder des Mess-Containers).

Für jedes Element-Kind (in dieser Reihenfolge geprüft):
1. **Absolut positioniert** (`readAbsolute` liefert Rect) → kein stretch/grow (absolute gewinnt).
2. **Wurzel-Elemente** (parent = null) → kein stretch/grow (es gibt keinen Figma-Parent zu füllen;
   Verhalten der Wurzeln bleibt unverändert — bewusste Scope-Grenze, s. Grenzen).
3. **grow:** Eltern flex-like UND `parseFloat(computed.flexGrow) > 0` → `grow: true`.
   ⚠️ jsdom-Falle: die `flex:1`-Shorthand löst jsdom evtl. nicht zu `flexGrow` auf — Implementierung
   fällt auf `el.style.flexGrow` zurück (`parseFloat(computed.flexGrow || el.style.flexGrow || '') > 0`),
   Tests dürfen zusätzlich explizites `flex-grow:1` verwenden.
4. **stretch:**
   - Eltern **flex-like**: effektives Align = `alignSelf !== 'auto'` ? alignSelf : Eltern-`alignItems`;
     wenn effektiv `stretch`/`normal` UND das Kind auf der Gegenachse **keine explizite Inline-Größe**
     hat (row-Eltern → kein Inline-`height`; column-Eltern → kein Inline-`width`) → `stretch: true`.
   - Eltern **nicht flex-like** (Block-Flow, layout `column`): Kind ist block-level
     (computed display ∈ {block, flex, grid, table, list-item, flow-root}) UND kein Inline-`width`
     → `stretch: true`. Inline-Displays (inline, inline-block, inline-flex, inline-grid) → nein.
   - Lose Textknoten (nodeType 3, ohne eigenes Element) → nie stretch/grow.
5. **Inline-`100%`-Sonderfall** (Fix-Richtung aus Testrunde 8 „Prozent → FILL statt px einfrieren"):
   Inline `width:100%`/`height:100%` wird auf der betroffenen Achse **nicht mehr als px eingefroren**
   (readSize lässt die Achse null), sondern → `stretch: true` (Achse = Gegenachse des Eltern-Layouts)
   bzw. `grow: true` (Achse = Primärachse). Andere Prozentwerte (z. B. `width:50%`) bleiben wie bisher
   px-Freeze. Gilt nicht für Wurzeln (Punkt 2) — deren `100%` friert weiterhin px ein (Mount-Breite 1024,
   Testrunde-8-Vertrag WYSIWYG).

**Wechselwirkung mit dem Absolute-Kinder-Freeze** (`buildBoxNode`, Nachfix 18.07.): Der Freeze füllt
nur noch Achsen auf, die weder explizit gesetzt noch durch stretch (Gegenachse) / grow (Primärachse)
des Nodes selbst abgedeckt sind. Ein Chart-Body mit absoluten Kindern, der selbst stretcht, bekommt
also nur die Höhe eingefroren, die Breite kommt zur Laufzeit vom Parent.

## Plugin (`parsePayload.ts` + `renderPlan.ts`)

- **parsePayload:** Interfaces um `stretch?: true; grow?: true` erweitern (alle 4 Node-Typen).
  Parsen defensiv: nur bei `=== true` übernehmen, sonst Feld weglassen (konditionaler Spread —
  bestehende `toEqual`-Literale ohne die Schlüssel bleiben gültig). Der counterAlign-Parser-Default
  (`CENTER` bei kaputtem Wert) bleibt unangetastet (betrifft nur missgeformte Payloads).
- **renderPlan:** bekommt die **Achsen-Bestimmtheit** des eigenen Frames durchgereicht
  (`{ widthDeterminate, heightDeterminate }`; Wurzel-Aufruf: aus `plan.width/height !== null`).
  Je Kind nach `appendChild`:
  - `child.absolute` → `applyAbsolute` (unverändert), stretch/grow werden übersprungen.
  - sonst `child.stretch` UND Gegenachse des Parents bestimmt → `layoutAlign = 'STRETCH'`.
    **Guard ist Pflicht:** STRETCH-Kind in HUG-Parent ist in Figma nicht definiert/wird ignoriert —
    ohne bestimmte Gegenachse KEIN Stretch (Fallback = heutiges Verhalten).
  - sonst `child.grow` UND Primärachse des Parents bestimmt → `layoutGrow = 1`.
  - **Text-Sonderregeln:** Text-Stretch nur in column-Parents anwenden (füllt Breite) und dabei
    `textAutoResize = 'HEIGHT'` setzen (Breite fix, Höhe wächst). Text-Grow in row-Parents ebenso
    `textAutoResize = 'HEIGHT'`. Text-Stretch in row-Parents (= Höhe füllen) wird NICHT angewendet.
  - **Bestimmtheit für die Rekursion** (Box-Kinder): Achse bestimmt, wenn `child.width/height !== null`
    ODER `child.absolute` (wird resized) ODER die Achse via angewendetem stretch/grow vom (bestimmten)
    Parent kommt. Diese Flags werden an den rekursiven `renderPlan`-Aufruf durchgereicht
    (`renderNode` reicht sie an Box-Kinder weiter).
  - `clipsContent` bleibt an explizite `plan.width/height` gebunden (unverändert) — gestretchte
    Boxen clippen nicht.

## Wirkung auf Robs Befunde

| Befund | Fix-Mechanik |
|---|---|
| Sidebar schwebt ~1/4 unter Oberkante | Root-Row `align-items` Default → Sidebar `stretch:true` (füllt Höhe) bzw. bei expliziter Höhe counterAlign `MIN` (oben statt zentriert) |
| „DecJanFeb…" mittig gestaucht | Label-Zeile `stretch:true` → füllt Kartenbreite → SPACE_BETWEEN verteilt wieder; counterAlign MIN statt CENTER |
| Wert überlappt Titel | Header-/Listen-Zeilen `stretch:true` → Titel links, Wert rechts |
| Tabellen-Spaltenraster | **Nicht Teil dieser Scheibe** (eigenes Spalten-Layout-Konzept) |

## Tests

- **Web (Vitest/jsdom):** Regressionstests nach Fixture-Vorbild: (a) Label-Zeile in 320px-Karte →
  `stretch:true`, kein width-Freeze, Root counterAlign MIN; (b) Shell: Sidebar (`width:96px`,
  Root-Row Default-Align) → `stretch:true` (Höhe), Content (`flex:1`/`flex-grow:1`) → `grow:true`;
  (c) Block-Kind ohne Inline-width → stretch, mit Inline-width → kein stretch; (d) `align-self:center`
  übersteuert Eltern-stretch → kein stretch; (e) absolut positioniertes Kind → kein stretch/grow;
  (f) svg → nie stretch/grow; (g) Wurzel → nie stretch/grow; (h) Inline `width:100%` (nicht Wurzel)
  → stretch statt px-Freeze, `width:50%` → weiterhin px-Freeze; (i) counterAlign-Mapping-Änderungen;
  (j) Absolute-Freeze füllt keine stretch-/grow-Achse mehr. Bestehende Literal-Tests auf MIN anpassen.
- **Plugin (Vitest, figma-Mock):** parsePayload nimmt `stretch`/`grow` nur bei `=== true`;
  renderPlan setzt `layoutAlign`/`layoutGrow` nur bei bestimmter Achse (Guard-Test: HUG-Parent →
  kein STRETCH); Text-Regeln; absolute-Vorrang; Bestimmtheits-Propagation über 2 Ebenen.
- Volle Suiten (Server unberührt: 208 · Web · Plugin) + Plugin-Typecheck + Build (dist neu → Rob
  muss das Dev-Plugin neu laden).

## Nachtrag 18.07. nachmittags — Wurzel-Breiten-Freeze (Befund aus Robs Figma-Test `test 7`)

Die Annahme „Pattern-Wurzeln tragen praktisch immer Inline-Breite" war **falsch**: Im echten
Payload hatten „Dashboard Layout" (Pattern) und „Reports Table" `width:null` an der Wurzel →
der Plugin-Guard schaltete die gesamte Stretch-Kette ab (Monats-Labels gestaucht, Titel/Wert
verklebt — Sidebar war nur wegen counterAlign MIN gefixt). **Fix:** `freezeRootWidth` in
htmlToPlan — eine Box-Wurzel ohne width, deren Unterbaum mind. ein stretch/grow trägt, bekommt
die im Mount gemessene Breite eingefroren (nur bei Rect > 0; jsdom liefert 0 → Bestandstests
unberührt). **Bewusst NUR die Breite:** ein Höhen-Freeze würde via clipsContent jede Wurzel auf
die Browser-Inhaltshöhe festnageln und bei Figmas abweichenden Font-Metriken Inhalte abschneiden.
Atomics ohne Stretch-Bedarf (z. B. zentrierter Avatar) bleiben HUG (Bedingung b).

## Bewusste Grenzen (dokumentiert, nicht gefixt)

- ~~Wurzeln ohne Breite bleiben HUG~~ → **gefixt per Wurzel-Breiten-Freeze (Nachtrag oben)**;
  HUG bleibt nur, wenn der Unterbaum kein stretch/grow trägt (dann ist er auch nicht nötig).
- **svg skaliert nicht mit** (bewusst ausgenommen) — zu schmale/breite Charts in stark abweichenden
  Kontexten bleiben möglich.
- Tabellen-Spaltenraster, Direkter-Parent-Vereinfachung bei `absolute`, Prozentwerte ≠ 100 % —
  alles unverändert (eigene Scheiben).
