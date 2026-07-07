# Figma-Emitter v1 — Design (Phase 5, Schreib-Richtung)

**Datum:** 2026-07-06
**Status:** Design (Entscheidungen im Autopilot getroffen — Rob hatte pauschal delegiert, „mach so viel autonom wie möglich")
**Phase:** 5 (Figma-Emitter) — die von Rob priorisierte Umkehr-Richtung: **Code/URL/Bild/Repo → nach Figma schreiben**
**Vorgänger:** Figma-Ingester-Spec `2026-07-03-figma-ingester-v1-design.md` (LESEN — bleibt gültig, ist aber NICHT diese Scheibe)

## Ziel

Die erste **Schreib**-Scheibe der Brücke: extrahierte **Tokens (Farben + Typografie)** aus einem beliebigen DesignBridge-Import **als echte Figma-Styles anlegen**. Beweist die Umkehr-Richtung end-to-end mit dem kleinstmöglichen, ehrlichen Umfang.

## Warum genau diese Scheibe

- Rob will als Designer die Schreib-Richtung (bisher hatte die RAUS-Seite nur Code-Emitter, keinen Figma-Emitter).
- Kleinste Scheibe, die den Wert beweist: **Tokens → Figma Paint-/Text-Styles**. Components/Patterns → Figma-Nodes ist Phase 5.2, Sync ist Phase 6.
- Das `designbridge-plugin/` war bisher ein **reiner Read-Extraktor** (kein einziger Figma-Write-Call). Diese Scheibe fügt die erste Write-Fähigkeit hinzu.

## Entscheidungen

1. **Transport = Copy-Paste JSON** (kein Netzwerk). DesignBridge-Web erzeugt einen Figma-Import-JSON; Designer kopiert ihn, öffnet das Plugin in Figma, fügt ihn ein, klickt „In Figma schreiben".
   - **Verworfen:** Plugin holt per HTTP von `localhost:3047` (bräuchte `networkAccess.allowedDomains` im Manifest + Server-State „letzter Import"); REST-Push vom Server (Figma REST kann Styles NICHT schreiben — nur lesen). Paste ist robust, infrastrukturfrei, voll testbar und passt zum bestehenden manuellen Plugin-Stil (File-Key-Feld).
2. **Umfang v1 = Farben + Typografie.** Farben → `PaintStyle` (SOLID). Typo → `TextStyle` (Inter + Gewicht→Style-Name). **Out:** Radius/Spacing/Shadows (später als Variables), Components/Patterns → Nodes (Phase 5.2).
3. **Styles gruppiert** unter `DesignBridge/Color/<name>` bzw. `DesignBridge/Text/<name>` — die Slashes erzeugen in Figma automatisch Ordner, der Designer findet alles gebündelt.
4. **Idempotent:** existiert ein Style gleichen Namens → aktualisieren statt duplizieren (create-or-update by name).
5. **Font:** Familie `Inter` (Figma-Default). Gewicht wird auf den nächstliegenden Inter-Style gemappt (400→Regular, 600→Semi Bold …), `loadFontAsync` vor dem Setzen; Fallback Regular; wenn Font ganz fehlt → Skip + Notiz.

## Payload-Shape (Web schreibt, Plugin liest)

```json
{
  "designbridge": "figma-import",
  "version": 1,
  "colors": [{ "name": "primary-button", "hex": "#022d2c" }],
  "text":   [{ "name": "headline", "fontSize": 32, "fontWeight": 700 }]
}
```
Namen = die bereits deduplizierten/slugifizierten Namen aus `normalizeTokens`.

## Architektur

**Web (voll test- & browserverifizierbar):**
- `web/src/lib/emit/emitFigma.js` — pur: `emitFigma(tokens)` (normalisierte Tokens) → JSON-String. `group:'color'`→colors, `group:'font'`→text (fontSize/-weight numerisch).
- `web/src/lib/emit/index.js` — neues Format `figma` in `EXPORT_FORMATS`, `buildExports().figma`.
- `web/src/pages/Export.jsx` — beim Format „Nach Figma (Plugin)" eine kurze Anleitungszeile (Kopieren → Plugin → einfügen → schreiben).

**Plugin (build- & typecheck-verifizierbar; Figma-Laufzeit braucht Rob):**
- `designbridge-plugin/src/writer/parsePayload.ts` — pur: `parseImportPayload(json)` + `hexToRgb(hex)` (0..1). Validiert `designbridge:'figma-import'`, deutsche Fehlermeldungen.
- `designbridge-plugin/src/writer/applyImport.ts` — Figma-Laufzeit: `applyImport(payload)` → `figma.createPaintStyle()` / `createTextStyle()` (create-or-update), `ImportSummary`.
- `src/types/manifest.ts` — `ImportMessage`, `ImportSummary`, `ImportDoneMessage`; Unions erweitert.
- `src/main.ts` — `msg.type === 'IMPORT'`-Zweig → parse → apply → `IMPORT_DONE` / `ERROR`.
- `src/ui.ts` + `src/ui.html` — Karte „Code → Figma": Textarea + „In Figma schreiben"-Button + Statuszeile; `IMPORT_DONE` rendern.

## Tests

- **Web (Vitest):** `emitFigma.test.js` (Mapping colors/text, leere Gruppen, valides JSON); `index.test.js` (Registry enthält jetzt `figma`, `buildExports().figma`); `Export.test.jsx` bleibt grün (4. Button additiv).
- **Plugin:** kein Test-Runner vorhanden → Verifikation = `npm run build` sauber + `npx tsc --noEmit` sauber. Reine Helfer (`hexToRgb`, `parseImportPayload`) sind bewusst pur gehalten; Test-Runner nachrüsten ist Folge-Punkt.
- **Browser-Smoke (Web):** localStorage seeden → Export-Tab → „Nach Figma" → JSON rendert, Kopieren.
- **Figma-Smoke (MANUELL, braucht Rob):** siehe RESUME.md „Manueller Figma-Test".

## Out of Scope (v1)

Radius/Spacing/Shadows → Figma-Variables; Components/Patterns → Figma-Nodes (Phase 5.2); Sync/Round-Trip (Phase 6); nicht-Inter-Fonts; localhost-Auto-Fetch statt Paste; Variables statt Styles.

## Addendum 06.07.2026 (nachmittags) — Auto-Fetch statt nur Paste

Rob erwartete, dass die App „eigenständig" nach Figma schreibt (ohne Plugin). **Klargestellt: technisch unmöglich** — Figmas REST-API kann Dateien nur *lesen*; Styles/Components/Nodes lassen sich ausschließlich über die **Plugin-API** (läuft in Figma) erzeugen. (Variables-REST-*Write* existiert, aber nur Enterprise + nur Variables — Rob ist auf Pro.) Das Plugin bleibt also zwingend. Rob wählte: **Reibung minimieren via Auto-Fetch** (statt Copy-Paste). GEBAUT & verifiziert:

- **Server (neu):** In-Memory-Übergabepuffer `server/lib/figmaExportStore.js` (+ Test) + Router `server/routes/figmaExport.js`, gemountet in `index.js`:
  - `POST /api/figma-export` (Web legt Payload ab; validiert `designbridge:'figma-import'`, sonst 400).
  - `GET /api/figma-export/latest` (Plugin holt; 404 wenn leer). **Eigener `cors({origin:'*'})`**, weil der Plugin-Fetch aus Figmas Sandbox mit Origin `null` kommt (das globale CORS ist auf :5173 beschränkt).
- **Web:** `Export.jsx` Button „An Figma senden" (POST des `emitFigma`-Payloads) + Statuszeile beim Figma-Format. Paste bleibt als Fallback im `<details>`.
- **Plugin:** `manifest.json` → `networkAccess.allowedDomains` (localhost:3047); `ui.html`/`ui.ts` Button „Aus DesignBridge übernehmen" (fetch `…/figma-export/latest` → sendet dieselbe `IMPORT`-Message wie Paste). Wiederverwendet `parseImportPayload`/`applyImport` unverändert.
- **Verifiziert:** Server 77/77, Web 106/106, Plugin-Build+Typecheck sauber; End-to-End-Datenpfad per curl **und** Browser (Web-POST → Server hält Payload → GET liefert es zurück, CORS `*`). Einzig der finale `createPaintStyle`-Aufruf in Figma bleibt Robs manueller Test.

Damit ist der User-Flow: DesignBridge „An Figma senden" → im Plugin ein Klick „Aus DesignBridge übernehmen". Kein JSON-Hantieren mehr.

## Offene Risiken / Folge-Punkte

- Plugin ohne Test-Infra → nur Build/Typecheck als Netz. Test-Runner (vitest/node) nachrüsten.
- Font-Verfügbarkeit: nur Inter garantiert; andere Familien in v1 nicht abgebildet (Gewicht→Inter-Style).
- Kein Undo-Bundle: viele Styles auf einmal → Nutzer kann in Figma nur einzeln zurücknehmen (Folge-Punkt: alles in einer Figma-Transaktion / Namespacing zum Löschen).
