# Plan-Fidelity-Scheibe: Absolute Positionierung + Höhen-Kontext (Design-Spec)

Stand 17.07.2026 spätnachts. Befunde: RESUME.md §Testrunde 7.5 + §Testrunde 8 (Figma-MCP-
Verifikation `test 1707-5`). Vorgänger-Vertrag bleibt: **WYSIWYG — Figma-Vermessung = Vorschau**
(Spec 2026-07-17-testrunde8-fixes-design.md).

## Problem (bewiesen)

`htmlToPlan.js` ignoriert `position:absolute/fixed` vollständig — absolut positionierte
Elemente werden wie normale Kinder in den Auto-Layout-Fluss übernommen. Sichtbare Folgen
(Robs Figma-Importe, per MCP seziert):
- Sidebar: Texte überlappen (Logo/Nav, Storage-Karte)
- Donut: „73% Known Source" fehlt/steht neben statt in der Donut-Mitte
- Trend-Chart: Y-Achsen-Werte kleben oben mittig statt links an der Achse; Monats-Labels fehlen
- Energy-Bar: farbige Prozent-Höhen-Segmente kollabieren zu 0 (Höhen-Kontext-Problem, s. Scheibe B)

## Scheibe A — Absolute Positionierung (Kern dieser Spec)

**Figma-Primitive:** Ein Kind eines Auto-Layout-Frames kann `layoutPositioning = 'ABSOLUTE'`
tragen und wird dann per x/y relativ zum Parent platziert — exakte Entsprechung von CSS-absolute.

**Plan-Schema-Erweiterung (Vertrag zwischen Web und Plugin — PINNED, beide Seiten bauen dagegen):**
Jeder PlanNode (box/text/svg/component-ref) bekommt ein optionales Feld
```
absolute: { x: number, y: number, width: number, height: number } | null   // default null
```
- Koordinaten/Größe in px, **relativ zum DIREKTEN Parent-Element** (getBoundingClientRect-Differenz
  im Offscreen-Mount, gerundet). Bewusste Vereinfachung: CSS positioniert relativ zum nächsten
  POSITIONIERTEN Vorfahren — wir nehmen den direkten Parent. Abweichung nur, wenn dazwischen
  nicht-positionierte Ebenen liegen; akzeptiert + dokumentiert (Folge-Befund abwarten).

**Konverter (`web/src/lib/emit/htmlToPlan.js`):**
- `getComputedStyle(el).position ∈ {absolute, fixed}` → Node bekommt `absolute: {x,y,width,height}`
  aus `el.getBoundingClientRect()` minus Parent-Rect (x/y) bzw. Rect-Größe (width/height, ganzzahlig
  gerundet, min 1). Der Node wird WEITERHIN als Kind desselben Parents emittiert (Reihenfolge egal,
  Figma nimmt absolute Kinder aus dem Fluss).
- Alle übrigen Nodes: `absolute: null` (Feld darf auch fehlen — Plugin defensiv).
- jsdom-Grenze: kein echtes Layout → Mapping-Logik als reine Funktion testen (computed/rects
  injizierbar), Browser-Beweis via Smoke (siehe Verifikation).

**Plugin (`designbridge-plugin/src/writer/`):**
- `parsePayload.ts`: optionales `absolute` defensiv parsen (alle 4 Zahlen endlich, sonst null).
- `renderPlan.ts` (`renderNode`-Aufrufstellen): NACH `appendChild(node)` — wenn `absolute` gesetzt:
  `node.layoutPositioning = 'ABSOLUTE'` (nur gültig, wenn Parent Auto-Layout ist — ist bei uns
  immer so), dann `node.x = absolute.x; node.y = absolute.y`, bei box/svg `resize(width, height)`,
  bei text width fixieren (`textAutoResize = 'HEIGHT'` + resize auf width) NUR wenn width > 0.
- Parent-Frames mit absoluten Kindern und OHNE eigene Größe (HUG) würden die absoluten Kinder
  nicht einrechnen → wenn ein Parent mind. 1 absolutes Kind hat und selbst width/height null hat,
  clipsContent false lassen (ist schon Default seit Fix 6) — KEINE weitere Sonderbehandlung in v1.

## Scheibe B — Höhen-Kontext im Offscreen-Mount (klein, experimentell)

Prozent-HÖHEN (`height:30%` in Bar-Segmenten) kollabieren zu 0, weil der Mount-Container keine
Höhe hat, die Vorschau-iframe-Kette aber schon (deshalb sieht die Vorschau richtig aus → Verstoß
gegen den WYSIWYG-Vertrag auf der Mess-Seite).
- Neue Konstante `PREVIEW_VIRTUAL_HEIGHT = 768` in `previewWidth.js` (Datei ggf. sinnvoll
  umbenennen NICHT nötig — Kommentar reicht), Mount-Container bekommt `height: 768px` zusätzlich.
- Erwartung: `height:100%`-Ketten und Prozent-Segmente lösen wie im iframe auf. Rein additiv;
  wenn der Browser-Smoke Regressionen zeigt (z. B. Root-Höhen frieren unerwartet ein — readSize
  fasst nur INLINE-Höhen an, daher unwahrscheinlich), Scheibe B zurückstellen.

## Nicht-Ziele (bewusst draußen)
Tabellen-Spaltenraster (eigene Scheibe, braucht Grid-Modell) · Tailwind-Runtime im Mount ·
FILL-Sizing im Plan-Modell · Verschachtelte positionierte Vorfahren exakt abbilden.

## Verifikation
- TDD beidseitig; volle Suiten (Server 208 · Web 418+ · Plugin 54+ · Typecheck).
- Browser-Smoke (Koordinator): Demo-Import lokal, htmlToPlan-Ausgabe für einen Baustein mit
  absolutem Element inspizieren (absolute-Felder gesetzt, plausible Koordinaten).
- Echter Beweis: Robs nächster Figma-Import — Donut-Mitte, Y-Achsen-Labels, Sidebar ohne Überlappung.
