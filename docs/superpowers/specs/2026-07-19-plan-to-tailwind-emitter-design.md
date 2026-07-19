# Scheibe 1: `plan → Tailwind`-Emitter

**Datum:** 2026-07-19
**Kontext:** Erste Scheibe von `2026-07-19-canonical-plan-model-architecture.md` (dort zuerst lesen).
**Scope:** `web/` only. Kein Server-, kein Plugin-Change.
**Status:** Design mit Rob abgestimmt & freigegeben. Bereit für writing-plans + subagent-driven Bau.

## Ziel

Eine reine Funktion, die den kanonischen `plan`-Baum in eine shadcn/Tailwind-React-Komponente
(Code-String) gießt — damit der Code-Export aus DEMSELBEN Modell kommt wie der Figma-Export
(statt aus Geminis separatem `interp.jsx`). Beweist „ein Modell → beide Ausgänge".

## Neue Datei: `web/src/lib/emit/planToJsx.js`

`export function planToJsx(plan, { name }) => string` — liefert eine vollständige React-Funktionskomponente:

```jsx
export function <Name>({ className = "", ...props }) {
  return (
    <div className={`<root-classes> ${className}`} {...props}>
      …
    </div>
  );
}
```

(Signatur bewusst wie der bestehende `genericStub` — `className`-Passthrough + `...props`.)

### Rekursiver Walk über die plan-Knoten

**`box`** → `<div className="…">{children}</div>`, Klassen (werktreu, arbitrary values):
- Layout: `row` → `flex`; `column` → `flex flex-col`. (kein Flex-Trigger → schlichtes `<div>` ohne flex)
- `gap` (>0) → `gap-[Npx]`
- `padding [t,r,b,l]` minimal: alle gleich → `p-[Npx]`; t=b & l=r → `px-[Npx] py-[Npx]`; sonst `pt-/pr-/pb-/pl-[Npx]` einzeln; 0 weglassen
- `radius` (>0) → `rounded-[Npx]`
- `fill` (Token-Ref {hex,token}) → `bg-[#hex]` (werktreu Hex; semantische Token-Klasse = Scheibe 2)
- `stroke` + `strokeWeight` → `border border-[#hex]` (+ `border-[Npx]` wenn Weight ≠ 1)
- `width`/`height` gesetzt → `w-[Npx]`/`h-[Npx]`; `null` (HUG) → weglassen
- `primaryAlign`/`counterAlign` → je nach Flex-Richtung `justify-*`/`items-*`:
  MIN→start, CENTER→center, MAX→end, SPACE_BETWEEN→between (nur primary); counter STRETCH→`items-stretch`
- `stretch` → `self-stretch`; `grow` → `flex-1`

**`text`** → Inhalt gerendert (JSX-escaped) mit: `text-[Npx]` (fontSize), `font-…` (Weight→nächster Name: 400→`font-normal`,500→`font-medium`,600→`font-semibold`,700→`font-bold`; sonst `font-[N]`), `text-[#hex]` (color), `text-left/center/right` (align), `leading-[…]` (lineHeight nur wenn px-Wert). Wrapping-Element: `<span>` (inline) — Struktur des plan bestimmt Verschachtelung.

**`svg`** → Markup inline eingebettet, **JSX-sicher**: kebab-case-Attribute deterministisch nach camelCase
(`stroke-width`→`strokeWidth`, `stroke-linecap`→`strokeLinecap`, `stroke-linejoin`, `fill-rule`, `clip-rule`,
`stop-color`, `stop-opacity`, `fill-opacity`, `stroke-opacity`, `stroke-dasharray`, `stroke-dashoffset`,
`text-anchor`, `xlink:href`→ entfernen/`href`). Endliche Attribut-Map, reine String-Transformation.
`class`→`className`. `style="a:b"`→ JSX-Style-Objekt ODER (pragmatisch v1) weglassen mit Warnung.

### Klassen-Zusammenbau
- Deterministische, stabile Reihenfolge (Layout → Sizing → Spacing → Visual → Text), damit Tests exakt matchen.
- Leere/Default-Werte erzeugen KEINE Klasse (kein `gap-[0px]`, kein `p-[0px]`).

## Verdrahtung: `web/src/lib/emit/emitComponents.js`

Der `interp.jsx`-Zweig (Zeile 65) wird ersetzt. Neue Präzedenz **unverändert**: `lifted` > Template > **plan-Emitter** > Stub. Konkret der bisherige Ausdruck
`(interp?.jsx?.trim() ? interp.jsx : genericStub(pascal, item))` wird zu:
- hat der Baustein `interp.html` → `planToJsx(htmlToPlan(interp.html, {tokens…}).plan, { name: pascal })`
- sonst → `genericStub(pascal, item)`

`emitComponents` baut dafür den plan selbst aus `interp.html` (via `htmlToPlan`, wie `emitFigmaComponents`
es tut). Läuft im Browser (Library-Code-Ansicht) → DOM/`getComputedStyle` vorhanden; Tests via jsdom
(vitest-Web-Env, wie `htmlToPlan.test.js`). `interp.jsx` wird web-seitig **nicht mehr gelesen**.

## Bewusst NICHT in Scheibe 1 (eigene Scheiben / dokumentierte Grenzen)
- **Token-Snapping** (Spacing/Radius→`px-6`, Farben→`bg-primary`) = Scheibe 2.
- **Volle shadcn-Idiomatik** (cva-Varianten, forwardRef, `cn()`): ein plan = eine Variante → schlichte Tailwind-Komponente.
- **Geminis `jsx`-Erzeugung** (Server-Prompt) abschalten = späterer Mini-Schritt (spart Gemini-Tokens); Scheibe 1 hört web-seitig nur auf, es zu NUTZEN.
- **Hand-Templates** (Button/Card/Badge/Input) bleiben als Override (Präzedenz Template > plan-Emitter).
- **Vorschau-Rendering** unverändert (`hasPreview` weiter template-only; plan-basierte Preview = später).
- **`style`-Attribute in SVG** ggf. weggelassen (v1), falls Aufwand — als Warnung, nicht fatal.

## Tests (TDD)

Neue `web/src/lib/emit/planToJsx.test.js` (reine Funktion, kein DOM nötig — plan direkt konstruieren):
1. box flex + gap + padding (minimal-Kollaps: `p-`, `px-/py-`, einzeln)
2. box fill/stroke/radius/width/height
3. Align-Mapping (justify/items, SPACE_BETWEEN, stretch/grow)
4. text-Knoten (fontSize/weight-Name/color/align/leading) + JSX-Escaping des Inhalts
5. svg: kebab→camelCase korrekt, class→className
6. verschachtelte Kinder korrekt eingerückt/eingebettet
7. voller Wrapper (export function Name, className-Passthrough)
8. realistischer Mini-Baustein (z. B. „Premium Badge") → erwarteter Code-String
9. Default-Werte erzeugen keine Klasse

Ergänzung `emitComponents.test.js`: Baustein mit `interp.html` → `code` kommt aus `planToJsx` (enthält
`bg-[#…]`/`gap-[…px]`), NICHT aus `interp.jsx`; Baustein ohne html → weiter `genericStub`; Template-
Treffer → weiter Template (Präzedenz unangetastet).

## Verifikation
- Web-Suite komplett grün (Baseline aktuell 521 + neue Tests).
- Browser-Smoke: Library → ein interpretierter Baustein → Code-Ansicht zeigt plan-abgeleiteten Tailwind-Code (arbitrary values), Figma-Export unverändert funktionsfähig.
