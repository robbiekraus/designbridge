# Scheibe 3: Figma-Emit-Skalierung 1:1 zum Original-Screenshot

**Datum:** 2026-07-19
**Kontext:** Dritte Scheibe von `2026-07-19-canonical-plan-model-architecture.md` (§Zerlegung Punkt 3). Baut auf Scheibe 1+2 (Tailwind-Emitter). Dies ist Robs ursprünglicher Größen-Fix, jetzt als Emit-Zeit-Transformation des **Figma**-Emitters.
**Scope:** `web/` (Figma-Emit-Pfad). Kein Server-, kein Plugin-Change. Kein Tailwind-Emitter-Change (`planToJsx` bleibt aufs Token-Raster).
**Status:** Design autonom getroffen (Rob: „Scheibe 3, lass mal laufen — Figma darf laufen"). Bereit für writing-plans + subagent-driven Bau. ⚠️ **Delikat → nach dem Bau per `/figma-e2e-test`-Skill an echtem Render verifizieren, nicht blind pushen.**

## Belegte Root Cause (RESUME „Größen-Root-Cause")

- `emitFigmaComponents.js` baut `canvas = { w: PREVIEW_VIRTUAL_WIDTH (=1024), h: 1024·ih/iw }` und übergibt es an `composePlan`.
- `composePlan` positioniert Kind-Instanzen absolut per `absolute = { x:(c.bbox.x−p.bbox.x)·canvas.w, y:…·canvas.h, width:c.bbox.w·canvas.w, height:c.bbox.h·canvas.h }` und setzt Eltern-Größe `p.bbox.{w,h}·canvas.{w,h}`. **bbox ist auf das Gesamtbild normiert (0..1).**
- Die Bausteine-Interpretationen (`htmlToPlan(interp.html)`) werden am **1024px**-Mess-Container gemessen (`PREVIEW_VIRTUAL_WIDTH`) → tragen ~Vollauflösungs-px.
- **Mismatch:** Ein Baustein, der im Original (z. B. 2296px breit) 480px misst (bbox.w≈0.209), bekommt im Template den Slot `0.209·1024 = 214px`. Seine natürliche Größe (am 1024-Mount) ist aber viel größer → das Plugin schrumpft die Instanz stark (0,446×/0,209×) → gestaucht/geclippt/Low-Fidelity. Faktor `image_width/1024 = 2296/1024 = 2,24×`.

## Fix (zwei Teile, beide im Figma-Emit-Pfad)

### Teil A — Canvas = echte Bildmaße
`emitFigmaComponents`: `canvas = { w: raw.meta.image_width, h: raw.meta.image_height }`. Fehlt `meta.image_width/height` (URL/Repo-Importe ohne Bild) → **Fallback auf heutiges Verhalten** (`w: PREVIEW_VIRTUAL_WIDTH`, `h: 1024·ih/iw` bzw. 1024) und **kein** Baustein-Scaling (Teil B Faktor 1). Damit rendern komponierte Templates + ihre Slots bei der **Original-Auflösung** (Robs Entscheidung „1:1, 2296px").

### Teil B — `scalePlan(plan, factor)` pro Baustein
Jede **interpretations-abgeleitete** Plan-Variante (`ai-interpreted` und `composed-spliced`), die eine bbox hat, wird auf ihre wahre Bild-Pixelgröße skaliert, damit sie ihren (jetzt 1:1-großen) Slot füllt, statt vom Plugin geschrumpft zu werden:
```
naturalWidth = am 1024-Mount gemessene Wurzel-Breite des Bausteins (neu aus htmlToPlan, s. u.)
slotWidth    = item.bbox.w · raw.meta.image_width      // wahre Pixelbreite im Original
factor       = (naturalWidth > 0 && slotWidth > 0) ? slotWidth / naturalWidth : 1
```
- **Breitengetrieben, Aspekt erhalten:** EIN Faktor für alle Achsen (uniform), aus der Breite bestimmt.
- **`composed` (composePlan-Zweig):** wird bereits bei `canvas = Bildmaße` in wahrer Größe gebaut → **Faktor 1** (kein zusätzliches Scaling; seine Kind-Instanzen zeigen auf `ai-interpreted`-Komponenten, die separat auf wahre Größe skaliert werden → Slot == natürliche Größe → kein Schrumpfen).
- **Baustein ohne bbox / ohne `meta.image_width`:** Faktor 1 (Standalone-only, unverändert).
- **Template-Hand-Templates (`planFor`) und Platzhalter:** NICHT skaliert (kein interp-Plan, keine bbox-Kopplung).

**Warum das konsistent ist (kein Doppel-Scaling):** Beide Skalierungen bilden auf DASSELBE Koordinatensystem ab — die wahre Bild-Pixelskala. Eine `composed-spliced`-Eltern-Variante wird um `factor_P = trueWidth_P/naturalWidth_P` skaliert; ihre gesplicten Kind-`absolute`-Slots (in 1024-Mount-Koordinaten der Eltern gemessen) skalieren proportional mit → wahre Bild-Slots. Die referenzierten `ai-interpreted`-Komponenten werden unabhängig per eigenem Faktor auf wahre Größe skaliert. Slot ≈ natürliche Instanzgröße → das bestehende shrink-only/Flow-Box-Verhalten des Plugins greift nur noch für minimale Reflow-Differenzen. Kein multiplikatives Schrumpfen.

## `htmlToPlan` — `naturalWidth` additiv zurückgeben
`htmlToPlan` misst die Wurzel bereits im Mount. Neu: Rückgabe `{ plan, warnings, naturalWidth }` — `naturalWidth = Math.round(rootEl.getBoundingClientRect().width)` (Einzelwurzel) bzw. `unionRect(...).width` (Mehrfachwurzel), `0` wenn kein Root / degeneriertes Rect (jsdom ohne Mock). **Rein additiv** — bestehende Destructuring-Aufrufe (`const { plan, warnings } = …`) bleiben unberührt. (Falls ein Bestandstest die GESAMTE Rückgabe per `toEqual` prüft: auf `{ plan, warnings, naturalWidth }` erweitern — additiv, kein Verhaltensbruch.)

## `scalePlan(plan, factor)` — reine, rekursive Funktion (neue Datei `web/src/lib/emit/scalePlan.js`)
`factor === 1` → gibt den Plan unverändert zurück (Identität, keine Neuallokation nötig). Sonst rekursiv skalieren (immer `Math.round` für px-Ganzzahlen):

- **box:** `width`/`height` (nur wenn `!= null`) `·f`; `padding` = 4× `·f`; `gap ·f`; `radius ·f`; `strokeWeight` → `Math.max(1, round(strokeWeight·f))` (sichtbaren Rahmen erhalten); `absolute` (wenn da) `{x,y,width,height} ·f`; `children` rekursiv. `layout`/`fill`/`stroke`/`primaryAlign`/`counterAlign`/`stretch`/`grow` unverändert.
- **text:** `fontSize ·f`; `lineHeight` (nur wenn `!= null`) `·f`; `absolute` (wenn da) `·f`. `content`/`fontWeight`/`color`/`align`/`stretch`/`grow` unverändert.
- **svg:** im **öffnenden `<svg …>`-Tag** (nur der erste Tag, bis zum ersten `>`) die numerischen `width="N"`/`height="N"`-Attribute `·f` (nicht-numerische wie `100%`/`auto` überspringen); **`viewBox` NIE** anfassen (interne Koordinaten skalieren visuell mit der gerenderten Größe). Innerer Markup/Element-Attribute bleiben unberührt. `absolute` (wenn da) `·f`.
- **component-ref:** `absolute` (wenn da) `·f`; `fallback` (Box) rekursiv skalieren; `name`/`variant` unverändert.

Numerische Robustheit: `f` immer als endliche Zahl behandeln; nicht-endlich/≤0 → Identität. Skalierte Ganzzahlen `Math.max(1, round(...))` NUR wo ein 0-Wert kaputt wäre (width/height/absolute-Maße min 1; padding/gap/radius dürfen 0 bleiben/werden → `round`, kein Floor).

## Verdrahtung `emitFigmaComponents.js`
1. `canvas` auf Bildmaße (Teil A) mit Fallback.
2. `ai-interpreted`-Zweig: `const { plan, warnings, naturalWidth } = htmlToPlan(...)`; `factor` aus `item.bbox` + `image_width` + `naturalWidth`; `plan = scalePlan(plan, factor)` vor dem Push.
3. `composed-spliced`-Zweig: analog — `naturalWidth` aus dem Eltern-`htmlToPlan`, `factor` aus `item.bbox` (Eltern-bbox) + `image_width`; `scalePlan` auf den gesplicten Eltern-Plan.
4. `composed`-Zweig (composePlan): unverändert (Faktor 1, canvas trägt schon die wahre Größe).
5. `image_width` = `raw.meta?.image_width` (einmal oben lesen).

## Bewusst NICHT in Scheibe 3 (Grenzen)
- **Tailwind-Emitter** (`planToJsx`/`emitComponents`) bleibt vollständig unberührt — Code-Export bleibt aufs Token-Raster (Scheibe 1+2). Nur der **Figma**-Pfad skaliert.
- **Kein Plugin-Change** — das Plugin wendet `absolute`/shrink-only/Flow-Box wie bisher an; die Zahlen kommen nur größer/„richtig" an.
- **Höhengetriebene Sonderfälle** (Baustein, dessen Höhe die Fidelity bestimmt) nicht separat behandelt — breitengetrieben, Aspekt erhalten (Architektur-Spec).
- **Nicht-Bild-Importe** (URL/Repo ohne `meta.image_width`): Faktor 1, altes Verhalten (dort ist „1:1 zum Screenshot" ohnehin nicht definiert).
- Löst voraussichtlich **Sidebar-#4** (Profil-Shrink-Overlap) weitgehend mit (kein Shrink mehr) — als Nebeneffekt beim Figma-Test prüfen, nicht als Ziel speccen.

## Tests (TDD)
Neue `web/src/lib/emit/scalePlan.test.js` (reine Funktion, plan direkt konstruieren):
1. `factor===1` → identischer Plan (deep equal).
2. box: width/height/padding/gap/radius/strokeWeight/absolute skaliert; null-width/height bleibt null; strokeWeight-Floor 1.
3. text: fontSize/lineHeight skaliert; lineHeight null bleibt null; content/weight/color unverändert.
4. svg: nur öffnender-Tag width/height `·f`, viewBox unverändert, `width="100%"` übersprungen.
5. component-ref: absolute + fallback rekursiv skaliert.
6. verschachtelt (box→children→text/svg) korrekt tief skaliert.
7. Aufrundung (round) + min-1 für Maße.

`htmlToPlan.test.js`: ein Test, der `naturalWidth` im Rückgabewert prüft (jsdom ohne echtes Layout → 0 oder gemockt; mit gemocktem `getBoundingClientRect` → erwarteter Wert).

`emitFigmaComponents.test.js`:
- `canvas` nutzt `meta.image_width/height` (composed-Parent-Größe = `bbox·image_width`, nicht `·1024`).
- fehlendes `meta` → Fallback (Parent-Größe wie bisher `·1024`).
- `ai-interpreted` mit bbox → Plan skaliert (Wurzel-Breite ≈ `bbox.w·image_width`); ohne bbox → unskaliert.

## Verifikation
- Web-Suite grün (Baseline 552 + neue Tests).
- Build sauber.
- **Figma-E2E per `/figma-e2e-test`-Skill** (autonom, Rob authorisierte Figma-Lauf): frischen/gecachten Payload emittieren, in leere Figma-Datei importieren, per Figma-MCP verifizieren: Template ~2296px breit, Bausteine in Original-Proportion (KEINE Stauchung), Instanzen füllen ihre Slots, Sidebar/KPI-Karten nicht mehr gequetscht. **Token-schonend:** aus gecachtem Result re-emittieren (kein frischer Gemini-Scan). Screenshot ablegen unter `Testdaten/`.
- Erst nach grünem Figma-Beweis committen+pushen (kein PR, direkt main; ⚠️ Auto-Re-Deploy).
