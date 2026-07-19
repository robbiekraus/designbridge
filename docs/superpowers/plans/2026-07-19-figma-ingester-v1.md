# Plan: Figma-Ingester v1 (Reverse-Import Figma → DesignBridge)

Stand: 2026-07-19. Spec: `docs/superpowers/specs/2026-07-03-figma-ingester-v1-design.md` (freigegeben).

## ⚠️ Vertrags-Korrektur ggü. Spec (WICHTIG)
Die Spec ist vom 03.07., **vor** der Atomic-Design-Taxonomie-Umstellung (18.07.).
Sie nennt die Inventar-Buckets noch `atomics[]/components[]/patterns[]`. Die
**aktuelle** kanonische Shape (verifiziert an `ingestRepoFiles.js:95-108`) ist:

```js
{
  summary: { source_description, app_type, color_mode, design_style },
  tokens: { colors[], typography[], spacing[], border_radius[], shadows[] },
  atoms: [], molecules: [], organisms: [], templates: [],   // NICHT atomics/components/patterns
  warnings: [],
  meta: { model, source_url, ai_deepened, elapsed_ms }
}
```
Item-Shape je Inventar-Eintrag (wie `repoInventory.js`): `{ name, variants, confidence, source, notes }` (kein `kind`-Feld — der Bucket IST die Taxonomie). Token-Objekt-Key heißt `border_radius` (nicht `radius`).

## Ablauf (2 Scheiben, sequenziell)
Scheibe A = Server (definiert Endpoint + Fixture + realen Vertrag). Scheibe B = Web (baut gegen den fertigen Vertrag). Beide TDD, Sonnet-Subagent.

---

## Scheibe A — Server

### A1. `server/lib/figmaUrl.js` (pur) + `figmaUrl.test.js`
`parseFigmaUrl(url) → { fileKey }`. Akzeptiert `figma.com/design/:key/…` UND `figma.com/file/:key/…`. `node-id`-Query ignorieren. Ungültig → `throw`.
Tests: beide Formen, mit/ohne node-id, ungültige URL wirft.

### A2. `server/lib/fetchFigmaFile.js` (Netz, injizierbares `fetch`) + Test
`fetchFigmaFile({ fileKey, token, fetchImpl = fetch }) → { document, styles, variables|null }`.
- `GET https://api.figma.com/v1/files/:key`, Header `X-Figma-Token: <token>`.
- best-effort `GET /v1/files/:key/variables/local`: 200 → `variables`; 403/Fehler → `variables:null` (kein Wurf).
- HTTP-Fehler → deutsche `Error.message`: 403 „Figma-Token ungültig oder kein Zugriff auf diese Datei." · 404 „Figma-Datei nicht gefunden." · 429 „Figma-Rate-Limit erreicht — später erneut versuchen." · sonst „Figma-Datei konnte nicht geladen werden: <status>".
Tests (injiziertes fetch): 200-Happy, 403/404/429 → Meldungen, Variables-403 → `variables:null` ohne Wurf.

### A3. `server/lib/ingestFigmaFile.js` (reiner Kern) + Test + Fixture
`ingestFigmaFile({ document, styles, variables }, { sourceUrl }) → canonical result` (Shape oben).

Ein Baum-Walk, dabei sammeln:
- **tokensFromStyles**: `node.styles.fill`→`styles[id].name`=role, `node.fills[0]` SOLID→hex → `colors:[{hex, role, confidence:'high', source:'Figma-Style: <name>'}]` (erster Treffer je Style-ID gewinnt). `node.styles.text`→`node.style` → `typography:[{size, weight, role, sample:'Aa', confidence:'high', source}]`. `node.styles.effect`→`node.effects` DROP/INNER_SHADOW → CSS-String → `shadows:[{description:name, css, confidence:'high', source}]`. GRADIENT/IMAGE-Fills überspringen.
- **radiusFromTree**: uniformes `cornerRadius` von Component-/Frame-Knoten (+Kinder), dedupe nach Wert → `border_radius:[{value:'<n>px', usage:'aus Figma-Knoten', confidence:'low', source:'cornerRadius von <NodeName>'}]`. Per-Ecke (`rectangleCornerRadii`) = out of scope.
- **spacing: []** (v1 leer) + Warnung „Spacing wird aus Figma-Styles nicht gelesen (steckt in Variables/Enterprise)."
- **inventoryFromTree** (→ Atomic-Taxonomie, KORRIGIERT ggü. Spec):
  - `COMPONENT_SET` → ein Eintrag, `variants` = Namen der Kind-COMPONENTs. Standalone `COMPONENT` (nicht in einem Set) → eigener Eintrag.
  - Klassifikation per Namens-Heuristik (case-insensitive, Wort-Match):
    - **atoms**: `button|btn|input|badge|icon|avatar|chip|tag|toggle|checkbox|radio|switch|label|tooltip|dot`
    - **molecules**: `search|segmented|dropdown|select|field|form-group|menu-item|list-item|breadcrumb|pagination|combobox`
    - **organisms**: alles andere aus COMPONENT/COMPONENT_SET (Default — „unbekannte größere Bausteine sind eher organisms"; Card/Chart/Table/Nav/Sidebar/Header/Footer/Hero/Modal landen hier).
  - **templates**: Top-Level-`FRAME`s (direkte Kinder eines CANVAS/Page), deren Name auf einen ganzen Screen deutet (`screen|page|dashboard|layout|template|shell`) ODER die (heuristisch) sehr groß sind. Pattern-Shell-Namen (navbar/hero/footer/sidebar/header) als Top-Frame → **organisms** (nicht templates).
  - Alle Einträge: `{ name, variants, confidence, source:'figma', notes }`. Dedupe nach `name` je Bucket.
- **Variables** (nur wenn `variables != null`): COLOR-Variables → zusätzliche Farben; FLOAT-Variables mit `radius`/`spacing` im Namen → border_radius/spacing (`confidence:'high'`, `source:'Figma-Variable: <name>'`). Bei `variables===null` (403) → Warnung „Figma-Variables benötigen Enterprise — übersprungen."
- `summary`: `{ source_description:'Tokens & Inventar aus Figma', app_type:'Figma-Datei', color_mode:'unknown', design_style:'aus Figma-Styles abgeleitet' }`.
- `meta`: `{ model:'figma-ingest', source_url:sourceUrl, ai_deepened:false, elapsed_ms:0 }`.

**Fixture** `server/lib/__fixtures__/figma-file.json`: enthält Paint-/Text-/Effect-Styles (`styles`-Map + Knoten mit `styles.fill/text/effect`), ein COMPONENT_SET mit 2 Varianten-Kindern, ein standalone COMPONENT namens „Button" (→ atom), eine benannte Top-FRAME „Dashboard Screen" (→ template), einen Knoten mit `cornerRadius`, eine COMPONENT namens „Search Bar" (→ molecule), eine „Metric Card" (→ organism). Optional zweite Fixture mit `variables` für den Variables-Zweig — oder Variables inline im Test mitgeben.
Tests: Farben/Typo/Schatten aus Styles (high, korrekte source), Radius low aus cornerRadius, Inventar-Split atoms/molecules/organisms/templates korrekt, spacing==[] + Warnung, Variables-Zweig (mit + ohne).

### A4. `server/routes/scan.js` — Endpoints
- `POST /api/scan/figma`:
  1. `parseFigmaUrl(req.body.url)` → 400 „Bitte eine gültige Figma-Datei-URL angeben (figma.com/design/…)." bei Fehler.
  2. `token = req.body.token || process.env.FIGMA_TOKEN`; leer → 400 „Kein Figma-Token — in .env als FIGMA_TOKEN setzen oder im Feld eingeben."
  3. `fetchFigmaFile` → `ingestFigmaFile` → `res.json(result)`.
  4. Fehler → `statusForFigmaError(err)` (403→403, 404→404, 429→429, sonst 502), deutsche Meldung (Message-Matching wie `statusForRepoError`).
- `GET /api/figma/status` → `{ tokenConfigured: !!process.env.FIGMA_TOKEN }`.
- Imports oben in scan.js ergänzen (parseFigmaUrl, fetchFigmaFile, ingestFigmaFile).
- **Endpoint-Tests** (analog bestehender scan-Tests, mit gemocktem fetch/DI oder Modul-Mock): 400 (bad url / kein token), Happy 200 (gegen Fixture), 403/404/429-Mapping, `/api/figma/status`.

### A5. Verifikation Scheibe A
`npm run test:server` grün, Netto ≥ vorher (247). KEIN Push durch den Subagenten.

---

## Scheibe B — Web (nach grüner Scheibe A)

### B1. `web/src/lib/useImportSession.js`
`submitFigma({ url, token }) → POST JSON /api/scan/figma → adaptScanResponse(data, 'figma')`. Im `submit`-Switch `else if (source === 'figma') next = await submitFigma(payload);`.

### B2. `web/src/components/ImportModal/tabs/FigmaTab.jsx` (ersetzt Platzhalter)
zinc/white-Stil wie `RepoTab.jsx`:
- Mount: `GET /api/figma/status`.
- Immer Feld „Figma-Datei-URL" (`type="url"`, valide = `/figma\.com\/(design|file)\/[^/]+/`).
- `tokenConfigured` → grüne Zeile „Figma-Token gesetzt ✓", kein Token-Feld. Sonst Token-Feld (`type="password"`) + Link „Token hier erstellen →" (`https://www.figma.com/developers/api#access-tokens`) + Hinweis „Wird nur für diesen Import genutzt, nicht gespeichert." (**nie** localStorage).
- Helfer-Zeile: „Liest Styles → Tokens und Components/Frames → Inventar. Variables nur bei Enterprise."
- Button disabled bis URL valide (und im Fallback Token nicht leer). `onSubmit({ source:'figma', payload:{ url, token } })`.

### B3. `web/src/components/ImportModal/ImportModal.jsx`
TABS: `{ id:'figma', label:'Figma' }` (kein `disabled:true` mehr). `activeTab === 'figma'` → `<FigmaTab onSubmit={submit} disabled={…} />`.

### B4. Tests (Vitest)
- `useImportSession`: figma-Routing (mock fetch → `adaptScanResponse(...,'figma')`), Fehlerpfad.
- `FigmaTab`: beide Zustände (Token gesetzt / nicht, `/api/figma/status` mocken), Button-Disabled-Logik, `onSubmit`-Payload.

### B5. Verifikation Scheibe B
`cd web && npm test` grün, Netto ≥ vorher (566). Browser-Smoke, wenn möglich (Tab rendert, Status-Fetch, Disabled-Logik) — echter Import braucht `FIGMA_TOKEN` (Robs finaler Smoke).

---

## Out of Scope (v1, wie Spec)
Volle Variables/Enterprise; Spacing aus Auto-Layout; per-Ecke-Radius; Branches/Multi-Page/node-id-Teilimport; KI-Vertiefung (`/figma/ai`); Bild-Crops; Zurückschreiben nach Figma; Payload-/Perf-Kappung großer Dateien.

## Verifikations-Grenze (ehrlich)
Der Real-Figma-Smoke (echter `FIGMA_TOKEN` gegen echte Datei) ist NICHT autonom fahrbar — Figma-REST braucht auch für öffentliche Files ein Token. Alles andere (Unit + Component + Endpoint, fixture-basiert) ist voll autonom grün zu bekommen. Real-Smoke = Robs Check.
