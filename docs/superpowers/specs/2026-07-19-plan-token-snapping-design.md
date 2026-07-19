# Scheibe 2: `plan` token-komplett — Token-Snapping im Tailwind-Emitter

**Datum:** 2026-07-19
**Kontext:** Zweite Scheibe von `2026-07-19-canonical-plan-model-architecture.md` (§Zerlegung Punkt 2). Baut auf Scheibe 1 (`2026-07-19-plan-to-tailwind-emitter-design.md`, `planToJsx.js`).
**Scope:** `web/` only. Kein Server-, kein Plugin-, kein Plan-Shape-Change.
**Status:** Design autonom getroffen (Rob: „mach autonom weiter", Modellwahl/Entscheidungen delegiert). Bereit für writing-plans + subagent-driven Bau.

## Ziel

Der Tailwind-Emitter (`planToJsx`) gibt **design-system-treue** Klassen aus, die auf die Tokens des Designs zeigen (`bg-primary`, `p-card-padding`, `rounded-card`, `text-heading-md`) statt roher arbitrary values (`bg-[#022d2c]`, `p-[24px]`). Damit ist der Code-Export konsistent mit dem exportierten Tailwind-Config (`emitTailwind.js`, der genau diese Token-Namen als `theme.extend`-Keys anlegt) — der emittierte Baustein ist ein echter Baustein DES Design-Systems, nicht nur pixel-treuer Nachbau.

## Belegte Grundlage (warum Token-Namen, nicht Tailwind-Default-Skala)

`emitTailwind.js` erzeugt den Config aus den Scan-Tokens mit den **eigenen Namen des Designs**:
```
colors: { 'primary': var(--color-primary), … }
spacing: { 'card-padding': var(--spacing-card-padding), 'stack-gap': …, 'inline-gap': …, … }
borderRadius: { 'card': …, 'button-control': …, 'icon-tile': …, … }
fontSize:   { 'display-xl': …, 'heading-md': …, 'body-default': …, … }
fontWeight: { 'display-xl': …, 'heading-md': …, … }
```
Namen entstehen in `normalizeTokens.js` per `slugify(usage/role)` und werden bei Kollision disambiguiert (`stack-gap`, `stack-gap-2`, …). Token-Wert-Shapes (an `server/fixtures/demo-dashboard.json` belegt): spacing `value:24`→`'24px'`, radius `value:'16px'` bzw. `'50%'`, typography `{size:32, weight:'700', role:'display-xl'}`→`value:{fontSize:'32px', fontWeight:'700'}`, color `hex`.

→ DS-treuer Output referenziert **diese** Namen. `p-card-padding` ist idiomatischer im Sinne DIESES Design-Systems als Tailwinds generisches `p-6`.

## Entscheidung: Snapping ist eine Emit-Zeit-Transformation von `planToJsx` (Plan-Shape bleibt px)

**Der `plan` bleibt geometrische Wahrheit in px.** Die Token-Zuordnung von Spacing/Radius/Font passiert **beim Emittieren** in `planToJsx`, NICHT im `plan`.

Begründung (und Auflösung der Architektur-Doku-Formulierung „plan token-komplett machen"):
- **Asymmetrie zu Farben ist inhaltlich korrekt.** Farben tragen im plan bereits `{hex, token}` — WEIL das Figma-Plugin Fills an **benannte Figma-Farb-Styles** bindet (`applyFill` braucht den Namen zur Plugin-Zeit). Spacing/Radius bindet das Plugin NICHT an benannte Styles — Figma-Auto-Layout nutzt rohe px. Es gibt also keinen Grund, Spacing/Radius-Token-Refs in den plan zu schreiben; nur der Tailwind-Emitter braucht sie.
- **Kein Contract-/Plugin-Bruch.** Den Plan-Shape zu ändern (px → `{px, token}`) würde den gepinnten Web↔Plugin-Vertrag (`parsePayload.ts`) und den 243/98-Testkorpus berühren. Emit-Zeit-Snapping ist web-only und risikoarm.
- **Konsistent mit Scheibe 3.** Skalieren (Figma 1:1) ist ebenfalls eine Emit-Zeit-Transformation, keine Modell-Eigenschaft. Token-Snapping folgt demselben Prinzip: EIN px-genaues Modell, jeder Emitter interpretiert idiomatisch (Figma → px/Scale, Tailwind → Token-Klassen).
- **„Token-komplett" wird trotzdem erreicht** — nicht als Plan-Feld, sondern als garantiert token-treuer Tailwind-Output. Das Produktziel (Baustein DES Design-Systems) ist erfüllt.

**Verworfene Alternative:** Snapping in `htmlToPlan` (Plan trägt Spacing/Radius/Font-Token-Refs). Verworfen wegen Plugin-Contract-Bruch + kein Nutzen für den Figma-Weg. Falls je ein Feature „Spacing an benannte Figma-Variablen binden" kommt, ist DAS die eigene Scheibe, die den Plan-Shape erweitert.

## Verhalten `planToJsx` v2

Neue Signatur: `planToJsx(plan, { name, tokens })` — `tokens` (optional) sind die **Snapping-Skalen** aus den Scan-Tokens:
```
tokens = {
  spacing: [{ px: number, name: string }],   // group 'spacing'
  radius:  [{ px: number, name: string }],   // group 'radius', nur px-Werte (‚50%‘ ausgeschlossen)
  fonts:   [{ px: number, weight: number, name: string }],  // group 'font'
}
```
Fehlt `tokens` (oder leer) → Verhalten wie Scheibe 1 (arbitrary values), AUSSER Farben (s. u.). Rückwärtskompatibel.

### Farben — `token` aus dem plan nutzen (kein Snapping, ist schon gebunden)
`fill`/`stroke`/`color` tragen im plan bereits `{ hex, token }` (in `htmlToPlan.matchColorToken` per **exaktem** Hex gebunden). `planToJsx` nutzt den Namen direkt:
- `fill.token` gesetzt → `bg-{token}`, sonst `bg-[#hex]`
- `stroke.token` gesetzt → `border border-{token}`, sonst `border border-[#hex]` (+ `border-[Npx]` bei Weight ≠ 1, unverändert)
- `color.token` gesetzt → `text-{token}`, sonst `text-[#hex]`

Das gilt **unabhängig** vom `tokens`-Argument (die Bindung liegt im plan). → **Ändert Scheibe-1-Verhalten**: Fills/Colors MIT `token` geben jetzt die Token-Klasse statt Hex. Die betroffenen Scheibe-1-`planToJsx`-Tests (die `bg-[#hex]` bei gesetztem `token` erwarteten) werden entsprechend umgestellt (Scheibe 1 hatte das explizit als „semantische Token-Klasse = Scheibe 2" vermerkt).

### Spacing (gap + padding) — auf Spacing-Token snappen
`snap(px, tokens.spacing)` = Token mit der kleinsten absoluten Differenz zu `px`, **nur** wenn `|diff| ≤ SNAP_TOLERANCE_PX` (= **2**). Gleichstand → erstes Token in Listen-Reihenfolge (deterministisch). Kein Treffer / keine Skala → `null` (Fallback arbitrary).
- `gap` (>0): snap → `gap-{name}`, sonst `gap-[Npx]`.
- `padding [t,r,b,l]`: der Minimal-Kollaps (all-equal → `p-`, `t=b&l=r` → `px-`/`py-`, sonst einzeln) läuft **pro entstehender Klasse** über das gesnappte Symbol:
  - Für jeden ausgegebenen Wert: gesnapptes Token → `p-{name}` / `px-{name}` / `py-{name}` / `pt-{name}` …; sonst arbitrary `p-[Npx]` / `px-[Npx]` / …
  - Der Kollaps entscheidet sich weiter rein über die **px-Gleichheit** der Seiten (t===r===… bzw. t===b&&l===r), NICHT über Token-Gleichheit — so bleibt das Kollaps-Verhalten identisch zu Scheibe 1, nur das Symbol pro Klasse ist token- oder arbitrary-basiert. (Ein 24px-Wert mit Token `card-padding` und ein 24px-Wert ohne Token snappen beide auf 24 → gleiche px → derselbe Kollaps; das Symbol ist `card-padding` bzw. `[24px]`.)

`SNAP_TOLERANCE_PX = 2` ist bewusst konservativ: echte `interp.html`-Werte tragen meist die exakten Token-px (Gemini nutzt die Design-Abstände), ±2 fängt Rundung; weit entfernte Werte bleiben ehrlich arbitrary statt visuell verzerrt zu werden.

### Radius — auf Radius-Token snappen, `rounded-full` für Vollrundung
- `radius >= 9999` (HUG-Kappung/„full" aus `readRadius`) → `rounded-full` (Tailwind-Default, idiomatisch; ‚50%‘-Tokens sind nicht px-snappbar und werden hier abgedeckt).
- sonst `snap(radius, tokens.radius)` → `rounded-{name}`, sonst `rounded-[Npx]` (>0; 0 → keine Klasse, unverändert).

### Font — auf Typografie-Token snappen (Size UND Weight müssen passen)
Ein Font-Token matcht nur, wenn `|token.px − node.fontSize| ≤ SNAP_TOLERANCE_PX` **UND** `token.weight === node.fontWeight` (exakt). Das verhindert, dass ein 14px/400-Fließtext fälschlich an `label-strong` (14px/600) bindet.
- Match → `text-{name}` (Size) **und** `font-{name}` (Weight) — beide referenzieren das Token, konsistent mit `emitTailwind` (fontSize + fontWeight tragen dieselben Namen).
- Kein Match → arbitrary `text-[Npx]` + Scheibe-1-Weight-Name (`font-normal`/`medium`/`semibold`/`bold`/`font-[N]`).
- `align`/`leading`/`stretch`/`grow` unverändert (Scheibe 1).

## Verdrahtung: `emitComponents.js`

`codeFromInterp` baut die Snapping-Skalen aus `normalizeTokens(raw.tokens)` (einmal pro `emitComponents`-Aufruf, nicht pro Baustein) und reicht sie an `planToJsx` durch:
```
const tokenScales = {
  spacing: normalized.filter(t => t.group === 'spacing').map(t => ({ px: parsePx(t.value), name: t.name })).filter(t => t.px != null),
  radius:  normalized.filter(t => t.group === 'radius').map(t => ({ px: parsePx(t.value), name: t.name })).filter(t => t.px != null),
  fonts:   normalized.filter(t => t.group === 'font').map(t => ({ px: parsePx(t.value.fontSize), weight: parseInt(t.value.fontWeight, 10), name: t.name })).filter(t => t.px != null),
};
```
`parsePx('24px') → 24`, `parsePx('50%') → null` (ausgeschlossen), `parsePx(24) → 24`. `htmlToPlan`-Aufruf + Farb-`namedColors` bleiben wie in Scheibe 1.

## Bewusst NICHT in Scheibe 2 (Grenzen)
- **Plan-Shape** bleibt px (kein Spacing/Radius/Font-Token-Feld im plan). Figma-Weg unverändert.
- **Shadows** werden nicht gesnappt (Scheibe-1-Emitter emittiert ohnehin keine Box-Shadows aus dem plan — plan trägt keine).
- **Tailwind-Default-Skala** (`p-6`) wird NICHT als Zwischenschritt genutzt — entweder Design-Token oder arbitrary. (Design-Token ist die DS-Wahrheit; Default-Skala wäre ein drittes, fremdes Raster.)
- **`font-{name}` vs. Weight-Utility-Ambiguität**: akzeptiert — der exportierte Config definiert `fontWeight.{name}`, die Klasse ist gültig; Kollision mit fontFamily-`font-*` besteht im Scan-Kontext nicht (keine fontFamily-Tokens).
- **Figma-1:1-Skalierung** = Scheibe 3.

## Tests (TDD)
Ergänzungen in `web/src/lib/emit/planToJsx.test.js`:
1. gap/padding snappen auf Spacing-Token (`gap-[{px}]`→`gap-{name}`; `p-`/`px-`/`py-` Kollaps mit Token-Symbol; ±2 Toleranz: 17px→16px-Token; 20px→kein Token→arbitrary).
2. radius snappt (`rounded-{name}`); `radius:9999`→`rounded-full`; kein Token→`rounded-[Npx]`.
3. font snappt nur bei Size+Weight-Match (`text-{name} font-{name}`); Size-Match aber Weight-Mismatch → arbitrary + Weight-Name.
4. Farben aus `token` (`bg-{token}`/`text-{token}`/`border-{token}`); `token:null`→Hex-Fallback.
5. ohne `tokens`-Argument: Spacing/Radius/Font arbitrary (Scheibe-1-Verhalten), Farben trotzdem token-aware.
6. Snapping-Helfer `snapToken(px, scale, tol)` als reine Funktion (Gleichstand→erstes, außerhalb Toleranz→null, leere Skala→null).

Angepasst (Scheibe-1-Tests, Farb-Assertions): die zwei `planToJsx`-Tests mit `fill.token:'primary'`, die `bg-[#022d2c]` erwarteten → `bg-primary`.

Ergänzung `emitComponents.test.js`: ein Baustein mit `interp.html` (Padding = Token-px, Farbe = Token-Hex) → `code` enthält die Token-Klasse (`p-{name}`/`bg-{token}`), nicht die arbitrary/Hex-Form.

## Verifikation
- Web-Suite grün (Baseline 540 + neue Tests, angepasste Farb-Assertions).
- Build sauber.
- Browser-Smoke: Library → interpretierter Baustein → Code-Ansicht zeigt Token-Klassen (`bg-primary`, `p-…`, `rounded-…`, `text-…`) statt arbitrary/Hex; Figma-Export unverändert.
