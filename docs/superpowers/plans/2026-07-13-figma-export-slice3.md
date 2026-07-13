# Figma-Export Scheibe ③ Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. Checkbox (`- [ ]`) steps.

**Goal:** KI-interpretierte Bausteine kommen als echte, editierbare Figma-Komponenten an — mit SVG-Vektoren, Instanz-Referenzen auf tiefere Ebenen (Atomic Design) und Token-gebundenen Farben.

**Spec:** `docs/superpowers/specs/2026-07-13-scheibe3-figma-export-design.md` (VOR jedem Task lesen — sie ist der Vertrag).

**Architecture:** Web-seitiger deterministischer Konverter `htmlToPlan` (neu, `web/src/lib/emit/htmlToPlan.js`) übersetzt das sanitisierte KI-HTML in den erweiterten plan-Baum. Plugin (`designbridge-plugin/src/writer/`) bekommt zwei neue PlanNode-Typen (`svg`, `component-ref` mit `fallback`). `emitFigmaComponents.js` nutzt den Konverter statt `placeholder:true` und ordnet den Payload Atome→Moleküle→Organismen.

**Regeln:** TDD · ein Commit pro Task · `find . -name '._*' -delete` vor jedem Commit · NIEMALS pushen · Server-Tests `npm run test:server`, Web `cd web && npx vitest run` (Baseline 172/172), Plugin `cd designbridge-plugin && npm run typecheck && npm run build`.

---

### Task 0: Branch

```bash
git checkout main && git checkout -b feat/figma-export-slice3
```

### Task 1: Plugin — PlanSvg + PlanRef (Typen, Parser, Renderer)

**Files:** `designbridge-plugin/src/writer/parsePayload.ts`, `renderPlan.ts`, `buildComponents.ts` (nur falls nötig), zugehörige Tests im Plugin (bestehende Teststruktur ansehen und erweitern).

Kontrakt (Spec §plan-Modell):
```ts
export interface PlanSvg { type: 'svg'; markup: string }
export interface PlanRef { type: 'component-ref'; name: string; variant: string | null; fallback: PlanBox | null }
export type PlanNode = PlanBox | PlanText | PlanSvg | PlanRef;
```

- `parsePlan`: neue Typen validieren (svg: `markup` string, beginnt mit `<svg`; component-ref: `name` string, `fallback` rekursiv via bestehendem Box-Parser oder null). Ungültig → Node überspringen + warning (bestehendes Muster).
- `renderPlan`: 
  - `svg` → `figma.createNodeFromSvg(el.markup)`; wirft es → Ersatz-Frame mit TextNode „SVG nicht renderbar: <label>" + warning.
  - `component-ref` → Komponente/ComponentSet **gleichen Namens** suchen, wie `buildComponents.ts` sie anlegt (Naming dort ablesen und exakt wiederverwenden; Suche auf der DesignBridge-Seite). Variante wählen (Set: passendes Kind; kein Match → Default-Variante + warning). `createInstance()`. Nicht gefunden → `fallback` rendern (falls null: Platzhalter-Frame) + warning.
- TDD: Tests für parsePlan-Validierung (gültig/ungültig je Typ) und — soweit die Plugin-Testinfra Figma-APIs mockt — Renderer-Zweige; mindestens aber `typecheck` + `build` grün. Wenn die bestehende Testinfra keine figma-Mocks hat: parsePlan-Tests reichen, Renderer wird über Robs manuellen Figma-Test abgenommen (im Report vermerken).

Commit: `feat(plugin): svg + component-ref plan nodes with instance lookup and fallback`

### Task 2: `htmlToPlan` Kern — box/text + Tailwind-Mapping

**Files:** Create `web/src/lib/emit/htmlToPlan.js` + `htmlToPlan.test.js`.

```js
export function htmlToPlan(html, { tokens = {}, knownComponents = [] } = {}) → { plan: PlanBox|null, warnings: string[] }
```

- Parsen mit `DOMParser` (jsdom in Vitest vorhanden — prüfen; sonst `node-html-parser` aus dem Web-Bundle NICHT neu einführen, sondern Report).
- Element→Node-Regeln: Container-Element → box; reiner Textknoten/Inline-Text → text. Wirft NIE (kaputt/leer → `{ plan: null, warnings: [...] }`).
- Tailwind-Subset (Spec §Konverter Punkt 4), als Konstanten-Tabellen im Modul:
  - Spacing-Skala: Zahl×4 px (`p-4`→16, `py-1.5`→6; px/py/pt/pr/pb/pl korrekt auf das padding-Tupel [t,r,b,l]).
  - `rounded`: none 0 · sm 2 · (leer) 4 · md 6 · lg 8 · xl 12 · 2xl 16 · 3xl 24 · full 9999.
  - fontSize: xs 12 · sm 14 · base 16 · lg 18 · xl 20 · 2xl 24 · 3xl 30. fontWeight: medium 500 · semibold 600 · bold 700 · sonst 400.
  - Farben: arbitrary Hex (`bg-[#4263EB]`, `text-[#111827]`) immer; benannt nur `white`/`black`; Rest → Warnung „Klasse ignoriert: …" (gesammelt, dedupliziert).
  - `flex`+`flex-col`→layout column, sonst row; `gap-*`→`itemSpacing` (neues optionales PlanBox-Feld — Task 1 hat das Plugin-Feld; falls nicht: hier weglassen und Warnung, im Report vermerken).
- TDD: je Mapping-Eigenschaft ein Fixture-Test (HTML-Schnipsel → erwarteter plan-Ausschnitt), Padding-Tupel-Logik, never-throw, Warnungs-Sammlung.

Commit: `feat(emit): htmlToPlan core — tailwind subset to plan boxes and text`

### Task 3: `htmlToPlan` Hierarchie — svg, component-ref, Token-Bindung

**Files:** Modify `web/src/lib/emit/htmlToPlan.js` + Tests erweitern.

- **SVG:** `<svg>`-Subtree → `{ type:'svg', markup }`; `<foreignObject>` vorher entfernen; Markup > 20000 Zeichen → kappen + Warnung.
- **component-ref (Spec §Konverter Punkt 2 — VOR box/text-Abstieg):** `knownComponents` = `[{ name, kind }]` (kommt vom Emitter, Task 4). Subtree-Matcher (Port der Server-Heuristik): `button`-Tag/role→`Button` (+ Variante aus `VARIANT_WORDS`-Klassen) · `input/textarea/select`→`Input` (type=search→`Suche`) · Klasse `badge|chip|tag`→`Badge`. Treffer NUR wenn der Name in `knownComponents` ist → `{ type:'component-ref', name, variant, fallback: <box/text-Nachbau des Subtrees> }`, kein weiterer Abstieg. Hierarchie: der Matcher läuft bei jedem Baustein-Level gleich — Organismen treffen so Moleküle/Atome, Moleküle Atome.
- **Token-Bindung:** Farb-Hex case-insensitiv gegen `tokens.colors` (Shape aus `normalizeTokens.js`/bestehenden Emittern ablesen!) → `fill: { hex, token: <name> }` bzw. ohne Treffer `{ hex, token: null }` — exakt die `ColorRef`-Shape, die `renderPlan.applyFill` erwartet.
- TDD: svg-Extraktion+Kappung+foreignObject · Button-im-Card→component-ref mit fallback und OHNE Abstieg · nicht-bekannter Baustein→normaler Nachbau · Token-Treffer/Nicht-Treffer.

Commit: `feat(emit): htmlToPlan hierarchy — svg nodes, component refs with fallback, token binding`

### Task 4: Emitter-Integration + Reihenfolge

**Files:** Modify `web/src/lib/emit/emitFigmaComponents.js` + Test.

- Baustein MIT Template → unverändert (`planFor`). SONST mit `result.interpretations[name]` → `htmlToPlan(html, { tokens, knownComponents })`, Eintrag `{ placeholder:false, source:'ai-interpreted', variants:[{ name:'default', plan }] }`; Konverter-Warnungen in den bestehenden warnings-Kanal. `plan === null` → Platzhalter wie bisher. Ohne beides → Platzhalter (wie heute).
- `knownComponents` = alle Bausteine des Exports mit Ebene (atomics/components/patterns), damit component-refs nur auf real Exportiertes zeigen.
- **Payload-Reihenfolge:** atomics → components → patterns (prüfen ob schon so; Test darauf).
- Payload-`version`: bleibt 2, WENN `parsePayload` (nach Task 1) die neuen Nodes versteht und alte Plugins nicht crashen würden — sonst 2.1 setzen und im Report begründen.
- TDD: KI-Baustein bekommt plan statt placeholder · Template-Baustein unverändert · Reihenfolge · Warnungs-Durchreichung.

Commit: `feat(emit): ai-interpreted components export real plans, hierarchy-ordered payload`

### Task 5: Full-Verify + Browser-Smoke + RESUME

1. Alle Suiten: Server (Baseline 119) · Web (Baseline 172 + neue) · Plugin typecheck+build.
2. Browser-Smoke (DEMO, 0 Credits): `npm run dev:demo` → Bild-Import (Demo-Fixture) → Export → Format „Nach Figma (Plugin)" → Payload-Vorschau: KI-Bausteine (Stat Card, Line Chart Card) haben `plan` mit `svg`-Node (Chart!) statt `placeholder:true`; Button-in-Card als `component-ref`, wenn die Fixture das hergibt. Keine Konsolenfehler.
3. Live-Vorbehalt dokumentieren: echter Figma-Rundlauf = Robs manueller Plugin-Test (wie Phase 5.2).
4. RESUME.md aktualisieren (Muster der bisherigen Einträge). Commit: `docs(resume): slice 3 built — awaiting Rob's figma round-trip`.

**KEIN PUSH, KEIN MERGE ohne Robs OK.**

---

## Self-Review-Notizen
- Spec-Abdeckung: plan-Modell→T1 · Konverter Kern→T2 · Erkennung/SVG/Token→T3 · Emitter/Reihenfolge→T4 · Fehlerpfade in T1–T3 (never-throw, Fallbacks) · Smoke→T5.
- Bewusst schlanker als Slice-2-Plan: Kontrakte exakt, Implementierungsdetails beim Implementer (der die Nachbardateien liest). Risiko fangen die Task-Reports + finaler Gesamt-Review.
- Abhängigkeiten: T2 vor T3 (gleiche Datei), T1 vor T4 (Payload-Version-Frage), T4 braucht T2+T3.
