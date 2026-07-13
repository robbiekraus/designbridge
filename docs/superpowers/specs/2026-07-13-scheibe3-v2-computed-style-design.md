# Scheibe ③ v2 — HTML→Figma über berechnete Stile (computed-style rebuild)

**Datum:** 2026-07-13
**Status:** Design festgelegt, Umsetzung offen
**Vorgänger:** [2026-07-13-scheibe3-figma-export-design.md](2026-07-13-scheibe3-figma-export-design.md) (v1, Klassen-Raten)
**Branch:** `feat/scheibe3-v2-computed-style`

## Problem / Wurzelursache

Der v1-Konverter (`web/src/lib/emit/htmlToPlan.js`) liest HTML über
`new DOMParser().parseFromString(html, 'text/html')` — ein **abgekoppeltes**
Dokument ohne Layout und ohne berechnete Stile. Er versteht ausschließlich ein
kleines Tailwind-Klassen-Subset. Alles, was per Inline-Style, CSS-Kaskade,
Pseudo-Element oder aufgelöstem Layout entsteht, fällt auf den Boden.

Konkrete Folgen (vom Nutzer in Figma beobachtet):
- **Bar-Chart:** Balkenhöhen stehen als `style="height:40%"` → ignoriert → alle Balken gleich hoch.
- **Tooltip-Dreieck:** CSS-Border-Trick (0×0-Box, deren Rahmen die Spitze bildet) → schwarzer Klotz.
- **Segmented Control / List Item:** Hierarchie & Feinheiten stecken in CSS, das v1 nicht kennt → flach.
- **Charts allgemein:** dünn — teils Fixture-bedingt (siehe separaten Fixture-Punkt), teils v1-bedingt.

Zweite, gleich wichtige Ursache: Der **Plan-Vertrag ist zu dünn**. `PlanBox`
(`designbridge-plugin/src/writer/parsePayload.ts`) kennt nur Layout-Richtung,
Padding, Radius, Fill, Stroke, Kinder — **keine** Größe, kein Gap, keine
Rahmenbreite, kein Alignment. Selbst perfekt gelesene Stile könnten also gar
nicht nach Figma getragen werden.

**Fazit:** v1 ist die falsche Maschine. Der Fix ist eine koordinierte Änderung
an **Web-Konverter + Plugin-Vertrag/Renderer**. Der wesentliche Wert: Dieselbe
Browser-Engine, die die Schnipsel in der Library-Vorschau bereits **korrekt**
rendert, füttert jetzt auch den Export — wir hören auf, sie wegzuwerfen.

## Update 2026-07-13: Inline-Styles als Austauschformat (Nutzer-Entscheidung)

Beim Umbau empirisch im Browser gemessen (Einhängen in `document.body` der Haupt-App):
Tailwind-Klassen lösen dort **nicht** zuverlässig auf. Standard-Klassen resolven nur,
wenn die App sie zufällig selbst benutzt; **arbitrary-Werte** (`bg-[#4263EB]` — die
Chart-Kernfarben!) resolven **nie**, weil sie nicht im Build-Bundle stehen. Die
Library-Vorschau sieht nur deshalb korrekt aus, weil sie in einem **iframe mit
Tailwind-Play-CDN** (`cdn.tailwindcss.com`) rendert (`InterpretedPreview.jsx`), das jede
Klasse just-in-time erzeugt. Inline-Styles dagegen resolven zu 100 % — offline, ohne
Laufzeit.

**Entscheidung (Rob, 2026-07-13):** Das KI-`html` liefert künftig **Inline-Styles statt
Tailwind-Klassen**. Der Konverter (v2) ist genau dafür gebaut. Betroffen zusätzlich:
- `server/lib/interpretComponents.js` — Live-Prompt: `html` mit Inline-`style`; `jsx`
  bleibt shadcn/Tailwind (Dev-Code-Export).
- `server/fixtures/demo-interpretations.json` — 14 Fixtures auf Inline-Styles + Anreicherung.
- Verworfen: „Tailwind + Mess-iframe" (schleppt Netz/Async/Timing in den Export-Pfad).

## Ziel / Nicht-Ziel

**Ziel:** KI-interpretiertes (sanitisiertes) HTML mit hoher Wiedergabetreue in
den Figma-Plan-Baum übersetzen — Größen, Abstände, Rahmen, Ausrichtung,
Schrift, Farben so, wie der Browser sie berechnet. Messlatte ist die
html.to.design-Ausgabe desselben Dashboards (vom Nutzer beigesteuert).

**Nicht-Ziel:** Pixelgenaue 1:1-Kopie jedes CSS-Features. SVG-Charts bleiben
unverändert Vektor-Passthrough (funktioniert schon). Kein neuer Server, kein
Headless-Chrome, keine neue npm-Abhängigkeit — der Export läuft ohnehin im
Browser.

## Kernidee

`htmlToPlan(html, opts)` wird von String-Parsing auf **Live-DOM + getComputedStyle**
umgestellt:

1. Sanitisiertes HTML in einen **unsichtbar eingehängten** Container im echten
   `document` schreiben (offscreen: `position:absolute; left:-99999px; top:0;
   visibility:hidden` reicht nicht für Layout → stattdessen sichtbar außerhalb
   des Viewports mit fester Breite, damit Flex/`%` auflösen; Details in der
   Umsetzung). Kein `<script>` läuft (innerHTML führt keine Skripte aus);
   externe Refs sind bereits vor dem Einhängen zu strippen (bestehende
   `stripExternalRefs`-Logik wiederverwenden).
2. Baum rekursiv durchlaufen; pro Element `getComputedStyle(el)` (und für den
   Dreieck-Sonderfall `getComputedStyle(el, '::before'/'::after')`).
3. Aufgelöste Werte auf die **erweiterten** Plan-Knoten abbilden.
4. Container nach dem Durchlauf **immer** entfernen (auch im Fehlerfall — der
   Konverter wirft weiterhin nie, `try/finally`).

## Vertrags-Erweiterung (EINGEFROREN — Web und Plugin bauen hiergegen)

Neue, **optionale** Felder. Optional = Abwärtskompatibilität: bestehende
Payloads/Templates ohne diese Felder rendern unverändert.

### `PlanBox` (neu)
| Feld | Typ | Bedeutung / Figma-Renderer |
|------|-----|----------------------------|
| `width` | `number \| null` | fixe Breite in px → `layoutSizingHorizontal='FIXED'` + resize; `null` = HUG (Auto-Layout, wie bisher) |
| `height` | `number \| null` | fixe Höhe in px → `layoutSizingVertical='FIXED'` + resize; `null` = HUG |
| `gap` | `number` (default 0) | `frame.itemSpacing` (löst den bisher nur gewarnten `gap-*`-Fall) |
| `strokeWeight` | `number` (default 1) | Rahmenbreite; nur wirksam wenn `stroke !== null` |
| `primaryAlign` | `'MIN'\|'CENTER'\|'MAX'\|'SPACE_BETWEEN'` (default 'MIN') | `primaryAxisAlignItems` (aus `justify-content`) |
| `counterAlign` | `'MIN'\|'CENTER'\|'MAX'` (default 'CENTER') | `counterAxisAlignItems` (aus `align-items`) |

### `PlanText` (neu)
| Feld | Typ | Bedeutung |
|------|-----|-----------|
| `align` | `'left'\|'center'\|'right'` (default 'left') | `textAlignHorizontal` (aus `text-align`) |
| `lineHeight` | `number \| null` | px-Zeilenhöhe; `null` = AUTO |

Alle Felder werden in `parsePayload.ts` **validiert** (Enum-Whitelist,
Zahl-Guards, Defaults bei Fehlen/Ungültigkeit) — der Parser bleibt tolerant und
wirft nie.

## Mapping: computed CSS → Plan

| CSS (computed) | Plan-Feld | Notizen |
|----------------|-----------|---------|
| `display: flex/grid` + `flex-direction` | `layout` | `column` bei `column`, sonst `row` |
| `padding-*` (px) | `padding[4]` | direkt in px, kein `*4`-Rechnen mehr |
| `gap`/`column-gap` (px) | `gap` | |
| `border-radius` (px) | `radius` | erster Wert; `9999`-Kappung wie bisher für „full" |
| `background-color` (rgb) | `fill` | rgb→hex, dann Token-Rückbindung (s. u.); `rgba(…,0)`/transparent → `null` |
| `color` (rgb) | `PlanText.color` | rgb→hex + Token-Rückbindung |
| `border-*-width` + `border-*-color` | `stroke` + `strokeWeight` | sichtbarer Rahmen (width>0, nicht transparent) |
| `width`/`height` (px) | `width`/`height` | **nur** wenn das Element eine vom Content abweichende, gesetzte Größe hat (Heuristik: expliziter Style oder Flex-Basis) — sonst `null` (HUG), um nicht alles zu fixieren |
| `justify-content` | `primaryAlign` | `flex-start→MIN`, `center→CENTER`, `flex-end→MAX`, `space-between→SPACE_BETWEEN` |
| `align-items` | `counterAlign` | analog |
| `font-size` (px) | `PlanText.fontSize` | gelesen, nicht geraten (behebt den 32px-Bug im AI-Pfad) |
| `font-weight` | `PlanText.fontWeight` | |
| `text-align` | `PlanText.align` | |
| `line-height` (px) | `PlanText.lineHeight` | `normal` → `null` |

## Sonderfall Tooltip-Dreieck (zuletzt, separat)

Ein CSS-Border-Dreieck (0×0-Box mit `border-width` auf 3 Seiten, davon eine
farbig, Rest `transparent`) mappt auf **kein** sauberes Figma-Konstrukt. Plan:
Muster erkennen (Element ~0×0, gesetzte Border-Widths, genau eine farbige
Kante) und als **kleines SVG-Polygon** (`PlanSvg`) emittieren, das die
Dreiecksspitze zeichnet. Wird als **letzter** Schritt gebaut; wenn es nicht
sauber gelingt, bleibt es ein dokumentierter Rest — nicht blockierend für den
Rest der Scheibe.

## jsdom-Testgrenze & Verifikation

**Wichtig:** jsdom (vitest-Umgebung) hat **keine Layout-Engine** —
`getComputedStyle` löst dort `%`→px und Flex **nicht** auf. Konsequenzen:
- Unit-Tests decken die **Mechanik** ab: liest Inline-/kaskadierte Stile,
  rgb→hex, Token-Rückbindung, Enum-Mapping, Knoten-Erzeugung, Container-Cleanup,
  Nie-Werfen. Tests dürfen **nicht** auf px-aufgelöste `%`/Flex-Werte prüfen.
- Die **echte Wiedergabetreue** (Balkenhöhen, Alignment) wird **im echten
  Browser** verifiziert: Export in der laufenden Web-App auslösen, Payload gegen
  Erwartung prüfen, plus visueller Abgleich in Figma gegen das html.to.design-Zielbild.

Plugin-Seite (`renderPlan.ts`, `buildComponents.ts`) hat **keine** figma-API-Mocks
(Stand v1) — die neuen Renderer-Zweige werden über `parsePayload`-Unit-Tests
(Feld-Validierung) abgesichert; die tatsächliche Node-Erzeugung wird manuell im
Figma-Rundlauf verifiziert.

## Token-Rückbindung

Berechnete Farben kommen als `rgb(...)` → in Hex normalisieren → gegen
`tokens.colors` matchen (bestehende `matchColorToken`-Logik, case-insensitiv,
disambiguierte Namen respektieren). Treffer → `{hex, token}`; kein Treffer →
`{hex, token:null}` (Hex-Fallback). Verhalten identisch zu v1, nur Eingabe ist
jetzt rgb statt Klassen-Hex.

## Betroffene Dateien

**Web (`web/`):**
- `src/lib/emit/htmlToPlan.js` — Kern-Umbau (DOMParser → Live-DOM + getComputedStyle).
- `src/lib/emit/htmlToPlan.test.js` — Tests an neue Mechanik anpassen (jsdom-Grenze beachten).
- ggf. `src/lib/emit/pickTokenRefs.js` / `pickTokens.js` — **separater** Font-Token-Bug
  (Template-Pfad wählt erstes statt Body-Font-Token; 32px-Bug bei Button/Input/Badge).
  Nicht Teil des Konverter-Umbaus — eigener kleiner Schritt.

**Plugin (`designbridge-plugin/`):**
- `src/writer/parsePayload.ts` — neue Felder in `PlanBox`/`PlanText` + Validierung.
- `src/writer/renderPlan.ts` — neue Felder anwenden (Sizing, itemSpacing, align, strokeWeight, text-align/line-height).
- `tests/parsePlan.test.ts` — Validierungs-Tests für die neuen Felder.

**Fixtures (`server/`):** separater Punkt — Demo-Interpretationen realistisch
anreichern (Achsen/Werte/Legenden), damit die Export-Strecke ohne Credits
ehrlich prüfbar ist. Kein Vortäuschen von Interpret-Qualität, sondern das, was
der gehärtete Live-Prompt liefern würde.

## Umsetzungsschritte (TDD) + Modellzuordnung

1. **Plugin-Vertrag** (parsePayload Felder+Validierung, Tests) — *Sonnet*, gegen eingefrorenen Vertrag.
2. **Plugin-Renderer** (renderPlan wendet Felder an) — *Sonnet* bauen, *Opus* Review (Figma-API-Feinheiten: layoutSizing/resize-Reihenfolge).
3. **Web-Konverter** (htmlToPlan Live-DOM + getComputedStyle, Tests) — *Sonnet* bauen, *Opus* Review.
4. **Browser-Verifikation** — *Opus* (ich): Export in der App auslösen, Payload prüfen, Figma-Abgleich.
5. **Font-Token-Bug** (pickTokenRefs) — *Sonnet*, klein, test-first.
6. **Fixture-Anreicherung** — *Sonnet*, danach.
7. **Tooltip-Dreieck-Sonderfall** — *Opus*/Fable, zuletzt.

Schritte 1+3 sind parallelisierbar (disjunkte Verzeichnisse), sobald der
Vertrag steht — dieser ist mit obiger Tabelle eingefroren.

## Risiken / offene Punkte

- **Offscreen-Layout:** Container braucht eine definierte Breite, damit `%`/Flex
  auflösen. Zu klein → Charts kollabieren; zu breit → unrealistisch. Startwert
  an der in der Vorschau genutzten Kartenbreite orientieren; im Browser justieren.
- **Über-Fixierung von Größen:** Wenn zu viele Boxen `width/height` bekommen,
  wird das Figma-Layout starr. Heuristik konservativ halten (nur explizit
  gesetzte/flex-basierte Größen), im Zweifel HUG.
- **Dreieck:** kann als dokumentierter Rest verbleiben.
