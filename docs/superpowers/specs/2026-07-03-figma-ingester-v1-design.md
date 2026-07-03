# Figma-Ingester v1 — Design

**Datum:** 2026-07-03
**Status:** Design (brainstormed, freigegeben)
**Phase:** 4 (More ingesters), Feature 3 — nach URL- und Repo-Ingester
**Vorgänger-Specs:** `2026-06-25-url-ingester-v1-design.md`, `2026-07-02-repo-ingester-v1-design.md`

## Ziel

Eine öffentliche/zugängliche **Figma-Datei** als Quelle in DesignBridge importieren: Design-Tokens und ein UI-Inventar (Atomics/Components/Patterns) aus der Datei lesen und in dieselbe kanonische Shape gießen wie die bestehenden Ingester. Der Figma-Tab wird von einem Platzhalter zu einem funktionierenden Import.

## Entscheidungen (aus dem Brainstorm 2026-07-03)

1. **Mechanismus = REST-API (Weg A).** Der DesignBridge-Server ruft `api.figma.com` selbst — genau wie URL/Repo. Läuft ohne Claude, deterministisch, 0 Credits, serverseitig, stateless. Verworfen: MCP (hängt an der Claude-Session, nicht am Produkt) und Plugin-Push (Zwei-App-Tanz).
2. **Umfang = Tokens + volles Inventar (B).** Nicht nur Tokens. Begründung: Figma benennt Components explizit → das Inventar ist hier zuverlässiger als beim URL-Ingester und lässt die bestehende Phase-3-Accordion-UI sofort aufleuchten.
3. **Plan-Realität = Pro (kein Enterprise).** Damit:
   - Tokens kommen aus **Styles** (alle Pläne), nicht aus Variables.
   - **Variables** (das moderne Token-System) sind **Enterprise-only** über REST → best-effort: versuchen, bei 403 überspringen + Notiz.
4. **Radius = heuristisch aus `cornerRadius`.** Da Radius/Spacing in Figma in Variables (Enterprise) leben, wird **Radius** in v1 aus dem `cornerRadius` der Component-/Frame-Knoten abgeleitet (`confidence:'low'`). **Spacing** bleibt v1 leer (+ Warnung); Auto-Layout-`itemSpacing` ist ein späterer, analoger Weg.
5. **Auth = Env-Var-Default + Tab-Feld-Fallback.** `token = req.body.token || process.env.FIGMA_TOKEN`. Der sichere Weg (`FIGMA_TOKEN` in `.env`, wie `ANTHROPIC_API_KEY`) ist Standard; wer nichts gesetzt hat, kann im Tab ein Token eintippen (nur in-memory, **nie** localStorage). Der Tab zeigt Zustand ①/② via `GET /api/figma/status`.
6. **Keine KI-Vertiefung in v1.** Figma-Daten sind sauber genug (Styles = exakte Werte, Components explizit benannt). Kein `/ai`-Endpoint, kein AiDeepen-Banner für Figma. Später nachrüstbar.

## Architektur / Datenfluss

```
FigmaTab (web)
  → POST /api/scan/figma  { url, token? }
      figmaUrl.js         parse file-key aus figma.com/design|file/:key/…
      fetchFigmaFile.js   GET /v1/files/:key            (Header: X-Figma-Token)
                          + best-effort GET /v1/files/:key/variables/local
      ingestFigmaFile.js  reiner Kern: Figma-Doc → kanonische Result-Shape
  → res.json(result)
  → adaptScanResponse(data, 'figma')  (bereits quellen-generisch)
  → Erfolgsstatus → Library (Token-Kacheln + Accordion)
```

**Ein primärer Call:** `GET /v1/files/:key` liefert den ganzen Dokument-Baum. Grund: Auf einem Pro-Plan sind Components oft **unpublished** — der Baum-Walk erwischt sie, während die `/components`-Endpoints nur publizierte Bibliotheks-Components zurückgeben. Aus demselben Baum lösen wir auch die Style-Werte auf. Perf-Kappung (Payload-Größe/`depth`) ist ein dokumentierter Folge-Punkt, nicht v1.

## Server-Module

Klein, isoliert, testbar — analog zu `repoUrl` / `fetchRepoTarball` / `ingestRepoFiles`.

### `server/lib/figmaUrl.js` (pur)
- `parseFigmaUrl(url) → { fileKey }`.
- Akzeptiert `https://www.figma.com/design/:key/…` **und** `https://www.figma.com/file/:key/…` (alte Form). `node-id`-Query wird ignoriert (wir lesen die ganze Datei).
- Ungültige URL → wirft (Endpoint → 400).

### `server/lib/fetchFigmaFile.js` (Netzwerk, injizierbares `fetch`)
- `fetchFigmaFile({ fileKey, token, fetchImpl }) → { document, styles, variables|null }`.
- `GET https://api.figma.com/v1/files/:key` mit Header `X-Figma-Token: <token>`.
- Danach best-effort `GET /v1/files/:key/variables/local`: bei `200` → `variables`; bei `403`/Fehler → `variables:null` (kein Wurf).
- HTTP-Fehler → deutsche `Error.message`:
  - `403` → „Figma-Token ungültig oder kein Zugriff auf diese Datei."
  - `404` → „Figma-Datei nicht gefunden."
  - `429` → „Figma-Rate-Limit erreicht — später erneut versuchen."
  - sonst → „Figma-Datei konnte nicht geladen werden: <status>".
- `fetchImpl` als Parameter, damit Tests ohne Netz laufen.

### `server/lib/ingestFigmaFile.js` (reiner Kern)
`ingestFigmaFile({ document, styles, variables }, { sourceUrl }) → canonical result`.

Drei Teilfunktionen (im selben Modul oder als kleine Helfer):

**a) `tokensFromStyles(document, styles)`** — Baum einmal walken, dabei:
- Für jeden Knoten mit `node.styles.fill` → Style-Wert auflösen: `styles[id].name` = `role`, `node.fills[0]` (SOLID) → hex. Erster Treffer je Style-ID gewinnt. → `colors: [{hex, role, confidence:'high', source:'Figma-Style: <name>'}]`.
- `node.styles.text` → `styles[id].name`, `node.style` (Typo) → `{size:node.style.fontSize, weight:node.style.fontWeight, role, sample:'Aa', confidence:'high', source}`.
- `node.styles.effect` → `styles[id].name`, `node.effects` (DROP_SHADOW/INNER_SHADOW) → CSS-String (`offsetX offsetY blur spread rgba`) → `shadows:[{description:name, css, confidence:'high', source}]`.
- GRADIENT/IMAGE-Fills: überspringen (+ optional Warnung).

**b) `radiusFromTree(document)`** — beim selben Walk `cornerRadius` von Component-/Frame-Knoten (und deren Kindern mit `cornerRadius`) sammeln, dedupliziert nach Wert → `border_radius:[{value:'<n>px', usage:'aus Figma-Knoten', confidence:'low', source:'cornerRadius von <NodeName>'}]`. Nur uniformes `cornerRadius`; per-Ecke (`rectangleCornerRadii`) ist Folge-Punkt.

**c) `inventoryFromTree(document)`** — beim selben Walk:
- `COMPONENT_SET` → ein Eintrag, `variants` = Namen der Kind-Components. Standalone `COMPONENT` (nicht in einem Set) → eigener Eintrag.
- Atomic-vs-Component per Namens-Heuristik (button/input/badge/icon/avatar/chip/tag/toggle/checkbox/radio → Atomic; Rest → Component) — Wortliste analog zur bestehenden `recognizeComponents`.
- Top-Level-`FRAME`s (direkte Kinder eines CANVAS/Page) mit Pattern-Namen (navbar/hero/footer/sidebar/header) → Patterns.
- Alle Einträge: `{name, variants, confidence, source:'figma', notes}`. Dedupe nach `name`.

**Spacing:** v1 leer.

**Variables (falls vorhanden):** COLOR-Variables → zusätzliche Farben; FLOAT-Variables mit „radius"/„spacing" im Namen → Radius/Spacing (high confidence, `source:'Figma-Variable: <name>'`). Nur wenn `variables != null`.

**Rückgabe (kanonische Shape, exakt wie `ingestCss`/`ingestRepoFiles`):**
```js
{
  summary: { source_description: 'Tokens & Inventar aus Figma',
             app_type: 'Figma-Datei', color_mode: 'unknown',
             design_style: 'aus Figma-Styles abgeleitet' },
  tokens: { colors[], typography[], spacing[], border_radius[], shadows[] },
  atomics[], components[], patterns[],   // {name, variants, confidence, source, notes}
  warnings[],
  meta: { model: 'figma-ingest', source_url, ai_deepened: false, elapsed_ms }
}
```
Warnungen mindestens: „Spacing wird aus Figma-Styles nicht gelesen (steckt in Variables/Enterprise)." und — wenn Variables 403 waren — „Figma-Variables benötigen Enterprise — übersprungen."

### `server/routes/scan.js` — Endpoints
- `POST /api/scan/figma`:
  1. `parseFigmaUrl(req.body.url)` → 400 bei Fehler.
  2. `token = req.body.token || process.env.FIGMA_TOKEN`; leer → 400 „Kein Figma-Token — in .env als FIGMA_TOKEN setzen oder im Feld eingeben."
  3. `fetchFigmaFile` → `ingestFigmaFile` → `res.json(result)`.
  4. Fehler → `statusForFigmaError(err)` (403→403, 404→404, 429→429, sonst 502), deutsche Meldung — Message-Matching wie `statusForRepoError`.
- `GET /api/figma/status` → `{ tokenConfigured: !!process.env.FIGMA_TOKEN }`. Klein, damit der Tab Zustand ①/② rendern kann.

## Client (web)

- **`web/src/lib/useImportSession.js`** — `submitFigma({ url, token })` (POST JSON an `/api/scan/figma`) + `source === 'figma'`-Zweig in `submit`. `adaptScanResponse(data, 'figma')`.
- **`web/src/components/ImportModal/tabs/FigmaTab.jsx`** — komplett neu, im zinc/white-Stil (wie `RepoTab`):
  - Beim Mount `GET /api/figma/status`.
  - Immer: Feld „Figma-Datei-URL".
  - Wenn `tokenConfigured` → grüne Zeile „Figma-Token gesetzt ✓", kein Token-Feld.
  - Wenn nicht → Token-Feld (`type="password"`) + Link „Token hier erstellen →" (`https://www.figma.com/developers/api#access-tokens`) + Hinweis „Wird nur für diesen Import genutzt, nicht gespeichert."
  - Helfer-Zeile: „Liest Styles → Tokens und Components/Frames → Inventar. Variables nur bei Enterprise."
  - Import-Button disabled bis URL valide (und, im Fallback, Token nicht leer). `onSubmit({ source:'figma', payload:{ url, token } })`.
- **`web/src/components/ImportModal/ImportModal.jsx`** — Figma-Tab aktivieren (disabled/Plugin-Hinweis entfernen), `onSubmit`/`disabled` durchreichen wie bei RepoTab.
- **Kein** AiDeepen-Banner für Figma-Importe (`meta.ai_deepened` bleibt `false`, keine `/figma/ai`-Route).

## Tests

**Server (`node --test`, via `npm run test:server`):**
- `figmaUrl.test.js` — `/design/` + `/file/`-Formen, mit/ohne `node-id`, ungültige URLs werfen.
- `ingestFigmaFile.test.js` — gegen eine **Fixture-Figma-Doc-JSON** (`server/lib/__fixtures__/figma-file.json` mit Paint/Text/Effect-Styles, einem COMPONENT_SET + COMPONENT, einer benannten FRAME, Knoten mit `cornerRadius`): prüft Farben/Typo/Schatten aus Styles, Radius aus cornerRadius (low), Inventar-Split Atomic/Component/Pattern, Spacing leer + Warnung, Variables-Zweig.
- `fetchFigmaFile.test.js` — injiziertes `fetch`: 200-Happy-Path, 403/404/429 → deutsche Meldungen, Variables-403 → `variables:null` ohne Wurf.

**Web (Vitest):**
- `useImportSession` — Figma-Routing (mock fetch → `adaptScanResponse(...,'figma')`), Fehlerpfad.
- `FigmaTab` — beide Zustände (Token gesetzt / nicht), Button-Disabled-Logik, `onSubmit`-Payload.

**Browser-Smoke (manuell):** `FIGMA_TOKEN` in `.env` setzen, auf eine eigene Figma-Datei zeigen → Import → Token-Kacheln (Farben/Typo/Schatten), Radius-Kacheln low-confidence, Inventar-Accordion mit benannten Components, Spacing-Warnung sichtbar, keine Konsolenfehler. (Figma-REST braucht auch für öffentliche Files einen Token.)

## Out of Scope (v1)

- Volle **Variables**-Unterstützung / Enterprise-Token-System (nur best-effort).
- **Spacing** aus Auto-Layout (`itemSpacing`, Paddings) — späterer, analoger Weg.
- Per-Ecke-Radius (`rectangleCornerRadii`).
- Figma-**Branches**, Multi-Page-Auswahl, `node-id`-fokussierter Teil-Import.
- **KI-Vertiefung** (`/figma/ai`, AiDeepen-Banner).
- Bounding-Box-Crops / echte Bild-Vorschau (Weg 1, deprioritisiert).
- **Zurückschreiben** nach Figma (Phase 5 — Figma-Emitter).
- Payload-/Perf-Kappung großer Dateien (dokumentierter Folge-Punkt).

## Wiederverwendung

- `adaptScanResponse(raw, source)` — bereits quellen-generisch, keine Änderung nötig.
- Kanonische Result-Shape + `warnings`/`confidence`/`source`-Konventionen aus `ingestCss`/`ingestRepoFiles`.
- Namens-Heuristik-Wortlisten aus `recognizeComponents`.
- UI: bestehende Erfolgsstatus- + Library-/Accordion-Komponenten, `SourcePill` (source `figma`).
- Test-Muster: injiziertes `fetch` (wie `fetchSite`/`fetchRepoTarball`), Fixture-JSON (wie Repo).

## Offene Risiken / Notizen

- **Style-Werte ohne Verwendung:** Styles, die definiert aber nirgends im Baum angewandt sind, lassen sich per Walk nicht auflösen (selten) — dokumentieren, ggf. später über `/styles`+`/nodes` nachladen.
- **Große Dateien:** `GET /v1/files/:key` kann groß werden → Perf/Payload-Kappung als Folge-Punkt.
- **SSRF:** entfällt weitgehend (fester Host `api.figma.com`), im Gegensatz zum URL-Ingester.
