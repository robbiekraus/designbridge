# Scheibe ③: KI-Bausteine → Figma — deterministischer Konverter mit Designsystem-Hierarchie

**Datum:** 2026-07-13 · **Status:** Design mit Rob freigegeben (Brainstorm 13.07., Visual-Companion) · **Baut auf:** Phase 5.2 (Components→Figma), Scheibe ①/② (KI-Interpretation Bild+URL)

## Entscheidung (aus dem Brainstorm)

**Option A + SVG:** deterministischer **html→plan-Konverter** (0 Credits, testbar), erweitert um SVG- und Komponenten-Referenz-Nodes. Verworfen: (B) Bild-Fill (tote Pixel, Headless-Browser-Dependency) und (C) KI-generierter plan als v1 (nicht-deterministisch, Web/Figma können divergieren, nur mit Credits verifizierbar — bleibt als spätere optionale Veredelung denkbar).

**Robs Leitplanke:** Designsystem-Strukturen von Anfang an mitdenken — **Atomic Design volle Hierarchie**:

| Ebene | In Designbridge | In Figma |
|---|---|---|
| Tokens (Farben, Größen, Abstände) | `tokens` aus Import | verknüpfte Styles (existiert: Phase 5, `DesignBridge/Color/…`) |
| Atome | `atomics` | Komponenten (existiert: Phase 5.2 Component-Sets) |
| Moleküle | `components` | Komponenten, die **Instanzen** von Atomen enthalten (NEU) |
| Organismen | `patterns` | Komponenten, die Instanzen von Molekülen/Atomen enthalten (NEU) |

Kernprinzip: **Wiederverwendung statt Nachbau.** Erkennt der Konverter im KI-HTML einen bekannten Baustein einer tieferen Ebene, entsteht in Figma eine echte Instanz — ändert sich das Atom, ändern sich alle Verwender.

## plan-Modell: zwei neue Node-Typen

Bisher (`designbridge-plugin/src/writer/parsePayload.ts`): `PlanBox { layout, padding, radius, fill, stroke, children }` · `PlanText { content, fontSize, fontWeight, color }`. Neu:

```ts
interface PlanSvg  { type: 'svg'; markup: string }                    // Inline-SVG aus der KI-Interpretation
interface PlanRef  { type: 'component-ref'; name: string;            // Verweis auf existierende Figma-Komponente
                     variant: string | null }                        // z. B. { name: 'Button', variant: 'primary' }
type PlanNode = PlanBox | PlanText | PlanSvg | PlanRef;
```

- `svg` → Plugin ruft `figma.createNodeFromSvg(markup)` → **editierbare Vektor-Pfade** (Robs Kernanforderung: keine Chart-Degradation, keine toten Pixel). Markup wird vor dem Senden sanitisiert (bestehende `sanitizeHtml`-Pipeline reicht SVG durch; zusätzlich: nur `<svg>`-Subtrees, keine `<foreignObject>`).
- `component-ref` → Plugin sucht das Component-Set/`ComponentNode` gleichen Namens auf der „🌉 DesignBridge"-Seite (aus Phase 5.2 bzw. früheren Exporten dieser Scheibe), wählt die Variante, `createInstance()`. **Nicht gefunden → weicher Fallback:** der Konverter liefert für jeden `component-ref` zusätzlich einen `fallback: PlanBox`-Nachbau mit; Plugin rendert dann den und meldet eine Warnung (bestehender warnings-Kanal).

## Konverter: `htmlToPlan` (web-seitig, `web/src/lib/emit/`)

Eingabe: sanitisiertes `html` der KI-Interpretation + Token-Set des Imports + Liste der exportierbaren Bausteine (Name→Ebene). Ausgabe: `PlanBox`-Baum. Deterministisch, kein Netz, kein Claude.

1. **Parsen** mit dem im Web-Build verfügbaren DOM (`DOMParser`) — kein neues Package.
2. **Komponenten-Erkennung zuerst (Hierarchie!):** Subtrees gegen bekannte Bausteine tieferer Ebenen prüfen — Reihenfolge Moleküle vor Atomen bei Organismen, Atome bei Molekülen. Erkennungsheuristik = dieselben Muster wie `matchTemplate`/`recognizeComponents` (Tag/Rolle/Klassen: `button`→Button, `input`→Input, `badge|chip|tag`-Klasse→Badge, …) + Varianten-Erkennung über die bestehenden `VARIANT_WORDS`. Treffer → `component-ref` (+ `fallback`-Nachbau), Subtree wird NICHT weiter abgestiegen.
3. **SVG-Subtrees** → `svg`-Node (Markup verbatim, gekappt bei 20 kB mit Warnung).
4. **Rest → box/text** über ein **Tailwind-Subset-Mapping**: `flex|grid`+`flex-col`→layout · `p-*, px-*, py-*, pt/pr/pb/pl-*`→padding (Tailwind-Skala ×4 px) · `rounded-*`→radius · `bg-*`→fill · `text-*`/Hex-Arbitrary (`bg-[#4263EB]`)→Farben · `text-xs…text-3xl`→fontSize · `font-medium|semibold|bold`→fontWeight · `gap-*`→itemSpacing (Plugin-Feld existiert, bisher fix 8). Unbekannte Klassen werden ignoriert (Warnung gesammelt, nicht fatal).
5. **Token-Bindung (Robs Punkt):** jede aufgelöste Farbe wird gegen die Import-Tokens gematcht (exakter Hex-Vergleich, case-insensitiv) → Treffer liefert `ColorRef { hex, token }` → Plugin verknüpft den existierenden Figma-Style statt Roh-Hex (Mechanik existiert in `renderPlan.applyFill`). Gleiches Muster für Abstände/Radii, sofern der Import Spacing-/Radius-Tokens hat: numerischer Match → im plan als Wert + `token`-Notiz (Figma hat keine Spacing-Styles; Notiz landet in der Node-Description — ehrlich dokumentiert statt vorgetäuscht).

## Emitter-Integration

`web/src/lib/emit/emitFigmaComponents.js`: Bausteine MIT Hand-Template unverändert (`planFor`). Bausteine mit **KI-Interpretation** (`result.interpretations[name]`) → statt `placeholder: true` jetzt `plan: htmlToPlan(html, tokens, knownComponents)`, `source: 'ai-interpreted'`. Ohne beides → Platzhalter wie bisher. Payload-`version` bleibt 2 (additive Felder; Plugin toleriert Unbekanntes — verifizieren, sonst 2.1).

**Export-Reihenfolge sichert die Hierarchie:** Atome zuerst, dann Moleküle, dann Organismen — so existieren die Komponenten, wenn ihre Verwender instanziert werden (Ein-Durchlauf, kein Zwei-Phasen-Sync nötig).

## Fehlerbehandlung

- Konverter wirft nie: nicht Abbildbares → Warnung + bestmöglicher box/text-Nachbau; leeres/kaputtes HTML → Platzhalter wie heute.
- Plugin: fehlende Referenz-Komponente → `fallback`-Plan + Warnung; `createNodeFromSvg`-Fehler → Box mit SVG-Hinweistext + Warnung. Warnings laufen über den bestehenden Sammel-Kanal in die Plugin-UI.

## Tests (TDD, alle 0 Credits)

- `htmlToPlan`: Tailwind-Mapping je Eigenschaft (Fixture-HTML → erwarteter plan) · SVG-Extraktion + Kappung · Komponenten-Erkennung erzeugt `component-ref` mit Variante + fallback · Hierarchie-Reihenfolge (Molekül referenziert Atom, steigt nicht hinein) · Token-Bindung (Hex→token, kein Treffer→Roh-Hex) · nie werfen (kaputtes HTML).
- Emitter: KI-Baustein → plan statt placeholder; Template-Baustein unverändert; Reihenfolge Atome→Moleküle→Organismen im Payload.
- Plugin (`npm run typecheck && npm run build` + bestehende Writer-Tests erweitern): `svg`- und `component-ref`-Zweige in `renderPlan`/`buildComponents`, Fallback-Pfad.
- **Browser-Smoke (DEMO):** Import → Export „Nach Figma (Plugin)" → Payload zeigt `plan` mit `svg`/`component-ref`-Nodes für die Fixture-Bausteine. Echter Figma-Rundlauf = Robs manueller Plugin-Test (wie Phase 5.2).

## Nicht in dieser Scheibe

Varianten-Generierung für KI-Bausteine (Struktur liegt an: `variants[]` bleibt im Payload, KI liefert heute eine Variante) · Option C (KI-plan als Veredelung) · Repo-Decompose (letzte Scheibe) · Spacing-Styles in Figma (gibt es API-seitig nicht; Token-Notiz als ehrlicher Ersatz).
