# SVG `currentColor`-Auflösung im HTML→Plan-Konverter

**Datum:** 2026-07-19
**Scope:** `web/` (nur Konverter), kein Plugin-, kein Server-Change.
**Root Cause (belegt am Figma-E2E-Test 19.07., Datei `UZHMxRz9KdAvOa8evtLYj6`):**
`convertSvgElement` ([web/src/lib/emit/htmlToPlan.js](../../../web/src/lib/emit/htmlToPlan.js))
übernimmt SVG-Markup **verbatim** (`clone.outerHTML`) und lässt `currentColor` stehen.
In Figma gibt es beim SVG-Import keinen CSS-`color`-Kontext → `currentColor` fällt auf
den SVG-Default **Schwarz** zurück. Folge: alle Icons, die per `fill="currentColor"`/
`stroke="currentColor"` die geerbte Textfarbe übernehmen (Sidebar-Nav-Icons erben
`rgba(255,255,255,0.7)` bzw. `#ffffff`, Profil-Zahnrad `#ffffff`), rendern schwarz.
Nur das aktive Nav-Icon ist zufällig weiß, weil es einen **eigenen** Fill trägt.

## Ziel

Beim Konvertieren `currentColor` durch die **real berechnete Textfarbe** des SVG-Elements
ersetzen, sodass Icons in Figma in ihrer gedachten Farbe (und mit ihrer Aktiv/Inaktiv-
Abstufung) erscheinen.

## Verhalten

In `convertSvgElement`, **vor** `clone.outerHTML`:

1. Berechne `resolved = getComputedStyle(el).color` des LIVE-Wurzel-`<svg>` (`el` ist
   gemountet; `.color` ist geerbt/berechnet, z. B. `"rgb(255, 255, 255)"` oder
   `"rgba(255, 255, 255, 0.7)"`). Fehlt/degeneriert (`""`, jsdom ohne Mock) → **kein**
   Ersetzen, Markup bleibt verbatim (heutiges Verhalten, keine Regression).
2. Ersetze im **Klon** jedes Vorkommen des Schlüsselworts `currentColor`
   (case-insensitive) durch die aufgelöste Farbe — sowohl in Präsentationsattributen
   (`fill`, `stroke`, `stop-color`, `flood-color`, `lighting-color`, `color`) als auch
   in Inline-`style`-Deklarationen (`fill:currentColor` etc.). Umsetzung über einen Walk
   des Klon-Subtrees (`clone` + `clone.querySelectorAll('*')`), Attribut- und
   Style-Wertersetzung — **nicht** per naивem String-Replace auf dem Markup (würde auch
   Textinhalte/IDs treffen).
3. **Alpha erhalten (wichtig — genau das trennt aktiv/inaktiv):** Ist `resolved` ein
   `rgba(...)` mit Alpha < 1:
   - Attribut-Form `fill="currentColor"` → `fill="rgb(r, g, b)"` **plus** `fill-opacity="a"`
     (nur setzen, wenn nicht bereits vorhanden). Analog `stroke`/`stroke-opacity`.
   - Für andere Properties (`stop-color` etc.) und Style-Form: `rgb(r, g, b)` setzen; ein
     evtl. vorhandenes passendes `*-opacity` NICHT überschreiben. (Feinheit dokumentiert,
     keine weitere Opacity-Synthese — die realen Gemini-Icons nutzen Attribut-Form.)
   - Voll deckend (Alpha 1 / `rgb(...)`): schlicht die Farbe einsetzen, keine Opacity.

## Grenzen (bewusst, dokumentiert)

- **Eine Farbe pro `<svg>`:** Alle `currentColor`-Vorkommen eines SVG werden gegen die
  Farbe der SVG-WURZEL aufgelöst. Ein Nachfahre, der sein eigenes `color` setzt und darin
  `currentColor` nutzt, bekäme also die Wurzelfarbe. In der Praxis (ein Icon = ein `<svg>`,
  eine Farbe) irrelevant; echte Mehrfarb-currentColor-SVGs sind nicht Ziel dieser Scheibe.
- Kein Plugin-Change: das Plugin importiert das SVG-Markup unverändert; sobald `currentColor`
  aufgelöst ist, greift es die konkreten Farben.

## Tests (TDD, `web/src/lib/emit/htmlToPlan.test.js`)

Mit gemountetem Element (bestehendes Muster: ins echte `document` hängen, damit
`getComputedStyle`/`getBoundingClientRect` greifen). Neue Fälle:

1. `<div style="color:rgb(255,255,255)"><svg><path fill="currentColor"/></svg></div>`
   → Plan-`svg.markup` enthält `fill="rgb(255, 255, 255)"`, **kein** `currentColor` mehr.
2. `stroke="currentColor"` bei geerbtem `color` → `stroke="rgb(...)"`.
3. **Alpha:** geerbtes `color:rgba(255,255,255,0.7)`, `fill="currentColor"` →
   `fill="rgb(255, 255, 255)"` **und** `fill-opacity="0.7"`.
4. Inline-Style-Form `style="fill:currentColor"` → aufgelöst.
5. SVG **ohne** `currentColor` bleibt byte-identisch zu heute (keine Kollateral-Änderung).
6. Degenerierter/leerer Farbwert (jsdom ohne Mock) → Markup verbatim, kein Wurf.
7. Interner Ref-Fill (`fill="url(#grad)"`) bleibt unangetastet (nur `currentColor` wird ersetzt).

Bestehende SVG-Tests (viewBox-Injektion, externe-Ref-Strip, Kappung) müssen grün bleiben.

## Verifikation

- Web-Suite komplett grün (Stand 514 + neue Tests).
- Figma-E2E (`.claude/skills/figma-e2e-test`): frischer Payload → Prod → Import → per MCP-
  Screenshot der Sidebar Navigation prüfen: Nav-Icons weiß (inaktiv leicht transparent),
  Profil-Zahnrad weiß — **nicht** schwarz.
