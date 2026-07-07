# Designbridge — Schnellstart-Spickzettel

Stand: **06.07.2026** — **Phase 5 (Figma-Emitter v1 = Schreib-Richtung) gebaut & verifiziert, LOKAL, nicht gepusht.** Erste Scheibe der Umkehr-Richtung: **Tokens (Farben + Typografie) → echte Figma Paint-/Text-Styles** über das Plugin, Transport per **Copy-Paste JSON**.

## ⏱️ ERSTER PUNKT NÄCHSTE SESSION: der manuelle Figma-Test (nur DU kannst das)
Alles außer dem finalen `createPaintStyle`-Aufruf *in* Figma ist automatisch verifiziert (inkl. Auto-Fetch-Datenpfad Web→Server→Plugin-URL). **Warum überhaupt ein Plugin?** Figmas REST-API kann nur *lesen* — Styles/Components/Nodes gehen ausschließlich über die Plugin-API (läuft in Figma). Kein Weg drumherum. Wir haben aber die Reibung per **Auto-Fetch** minimiert.

**Bequemer Weg (Auto-Fetch):**
1. `npm run dev` (Root) → Backend :3047 + Web :5173. Importiere ein **Bild** (nur Bild-Import liefert echte Token-Details) oder seede.
2. Library → **Export** → Format **„Nach Figma (Plugin)"** → **„An Figma senden"** (Status wird „bereit …").
3. Figma-Plugin einmalig laden: `cd designbridge-plugin && npm run build` → Figma → Plugins → Development → *Import plugin from manifest…* → `designbridge-plugin/manifest.json`.
4. Plugin starten → Karte **„Code → Figma"** → **„Aus DesignBridge übernehmen"** (holt den Export automatisch vom Server).
5. Erwartung: Local Styles unter **`DesignBridge/Color/*`** (Paint) + **`DesignBridge/Text/*`** (Text). Statuszeile „Fertig — N Farben neu, M Textstile neu."
   - Fallback ohne Server: Im Plugin unter „Oder JSON manuell einfügen" das kopierte JSON einfügen → „In Figma schreiben".

**Wenn der Test grün ist:** commit + push mit deinem OK (alles liegt lokal). Dann Phase 5.2 (Components/Patterns → Figma-Nodes) ODER Radius/Spacing/Shadows → Figma-Variables.

**⚠️ Preview-/Dev-Falle beim Verifizieren:** `preview_start`/`npm run dev` bringt das Backend auf :3047 nicht immer sauber hoch (PORT-Injection). Beim Testen half: Backend separat `PORT=3047 node server/index.js` starten, Vite läuft parallel, Proxy `/api → :3047` greift dann.

## Was diese Session (06.07.) gebaut wurde
Spec `docs/superpowers/specs/2026-07-06-figma-emitter-v1-design.md`, Plan `…/plans/2026-07-06-figma-emitter-v1.md`.

**Web (voll verifiziert):**
- `web/src/lib/emit/emitFigma.js` (+ `.test.js`) — pur: normalisierte Tokens → `{designbridge:'figma-import',version:1,colors[],text[]}`.
- `web/src/lib/emit/index.js` — 4. Export-Format `figma` (`designbridge-figma.json`) + `buildExports().figma`.
- `web/src/pages/Export.jsx` — Anleitungszeile beim Figma-Format.
- **Web-Tests: 106/106 grün** (`cd web && npx vitest run`, vorher 100). Browser-Smoke bestanden: Format rendert valides Payload, keine Konsolenfehler.

**Plugin (Build + Typecheck der neuen Dateien sauber; Figma-Laufzeit = dein Test):**
- `designbridge-plugin/src/writer/parsePayload.ts` — pur: `parseImportPayload` + `hexToRgb` (deutsche Fehler).
- `designbridge-plugin/src/writer/applyImport.ts` — Figma-Laufzeit: create-or-update Paint-/Text-Styles, Gewicht→Inter-Style-Map, `ImportSummary`.
- `src/types/manifest.ts` — `ImportMessage`/`ImportSummary`/`ImportDoneMessage`.
- `src/main.ts` — `IMPORT`-Zweig. `src/ui.ts` + `src/ui.html` — Karte „Code → Figma" (Textarea + Button + Status).
- **Verifikation:** `npm run build` (esbuild) sauber. `writer/*.ts` + `main.ts` typechecken fehlerfrei.

## ⚠️ Vorbestehender Config-Fund (Folge-Punkt, NICHT von dieser Session verursacht)
`designbridge-plugin/tsconfig.json` → `typeRoots` zeigt auf `./node_modules/@figma/plugin-typings` (eine Ebene zu tief). Korrekt wäre `./node_modules/@figma`. Deshalb schlägt `tsc --noEmit` projektweit fehl (findet den `figma`-Global nicht) — das Projekt verifiziert bisher nur über esbuild (kein Typecheck). Zusätzlich fehlt `"dom"` in `lib` → `ui.ts` wirft DOM-Fehler. **Fix wäre 2 Zeilen** (typeRoots korrigieren + `"lib":["ES2017","DOM"]`), dann hätte das Plugin endlich echten Typecheck. Bewusst NICHT angefasst (außerhalb des Auftrags, könnte Nebenwirkungen haben). Beim Typecheck dieser Session temporär via `tsconfig.check.json` überbrückt (wieder gelöscht).

## ✅ Schreibrichtung-Architektur ENTSCHIEDEN (06.07. abends)
Frühere „Plugin zwingend"-Aussage war falsch. Verifiziert + **live bewiesen** (Figma-Datei `fE1iyfh3nACMao43RnUJY6`, plugin-frei via Figma-MCP). ABER: App-als-MCP-Client (`mcp:connect`) ist Dritt-Apps von Figma verwehrt — der Live-Beweis lief nur, weil Claude Code ein freigegebener Client ist. **Rob-Entscheidung = Weg A festschreiben + Plugin als Fallback behalten.**
- **Weg A (plugin-frei, empfohlen):** Nutzer schreibt via freigegebenem MCP-Client (Claude/Cursor/Figma-Agent) mit DesignBridges `emitFigma`-Export als Input. Funktioniert heute, null Zusatz-Code.
- **Weg B (Plugin, gebaut):** universeller app-naher Fallback.
- Anleitung: [docs/figma-schreiben-anleitung.md](docs/figma-schreiben-anleitung.md) · Architektur-Detail: `docs/superpowers/specs/2026-07-06-figma-write-architecture-decision.md`.
- Beobachten: öffnet Figma `mcp:connect` für Dritte → In-App-MCP-Weg (Option D) bauen, Plugin ablösen.

## Wo wir im Gesamtbild stehen (die Brücke)
- **REIN/lesen (Ingester):** Bild ✅ · URL ✅ (+Komponenten-Erkennung) · Repo ✅ · **Figma lesen ⏳ (nur gespec't: `2026-07-03-figma-ingester-v1-design.md`)**
- **RAUS/schreiben (Emitter):** Code CSS/Tailwind ✅ · shadcn-Components ✅ · **nach Figma: Tokens (Farben+Typo) ✅ NEU (v1, lokal) · Components/Patterns → Nodes ❌ (Phase 5.2) · Variables/Radius/Spacing/Shadows ❌**
- **Sync/Round-Trip (Phase 6):** ❌

## Git
Alles auf `main`, **LOKAL, NICHT gepusht** (stehende Regel: kein Push ohne dein OK). Vor dieser Session war `main` bereits 2 Commits vor `origin` (Figma-Lese-Spec + Resume). Diese Session hat noch NICHT committet — die neuen Dateien liegen als Änderungen im Working Tree. **Nächste Session: committen + auf deinen OK pushen.**

## App starten (Server + Web)
```
npm run dev
```
→ Backend http://localhost:3047, Frontend http://localhost:5173. Nur EINE Instanz.

## Tests
```
npm run test:server        # 77/77
cd web && npx vitest run   # 106/106
cd designbridge-plugin && npm run build   # esbuild, „Build complete."
```

## Auto-Fetch-Dateien (Session 06.07. nachmittags)
- Server: `server/lib/figmaExportStore.js` (+test), `server/routes/figmaExport.js`, gemountet in `server/index.js`. Endpoints `POST /api/figma-export` + `GET /api/figma-export/latest` (eigener CORS `*` für Figma-Sandbox).
- Web: `Export.jsx` Button „An Figma senden".
- Plugin: `manifest.json` `networkAccess`, `ui.html`/`ui.ts` Button „Aus DesignBridge übernehmen".

## Wichtige Dateien
- Figma-Emitter (neu): `web/src/lib/emit/emitFigma.js`; `designbridge-plugin/src/writer/{parsePayload,applyImport}.ts`
- Plugin-Hebel: `designbridge-plugin/` (`src/main.ts` message-routing, `src/ui.html`/`ui.ts` Panel)
- Figma-Lese-Spec (später für Sync): `docs/superpowers/specs/2026-07-03-figma-ingester-v1-design.md`
- Arbeitsregeln: `CLAUDE.md`
</content>
