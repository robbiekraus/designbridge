# Designbridge — Schnellstart-Spickzettel

Stand: **07.07.2026** — **Phase 5 (Figma-Emitter v1 = Schreib-Richtung) KOMPLETT VERIFIZIERT inkl. manuellem Figma-Test.** Rob hat live bestätigt: Auto-Fetch-Weg (Web → Server → Plugin) schreibt Styles nach Figma — „Fertig — 16 Farben aktualisiert, 5 Textstile aktualisiert" (Create-or-Update-Pfad damit gleich mitbewiesen).

## ⏱️ ERSTER PUNKT NÄCHSTE SESSION: `git push` (Robs OK einholen, falls nicht schon am 07.07. passiert)
`main` ist **5 Commits vor `origin`** (alle lokal, kein Push ohne Robs OK):
- `3b130a6` Phase 5 Figma-Emitter v1 (Web + Plugin + Auto-Fetch)
- `3667d59` RESUME-Update
- `3cce4c2` **Plugin-Typecheck-Fix** (tsconfig typeRoots/lib + 3 vorbestehende Typfehler + `npm run typecheck`-Script) — der „vorbestehende Config-Fund" aus der letzten RESUME ist damit ERLEDIGT
- `b1d897f` Manifest-Fix: `127.0.0.1` aus `allowedDomains` (Figma lehnt IP-URLs ab; nur `http://localhost:3047` bleibt)
- (+ dieses RESUME-Update)

## Danach zur Wahl (Design-geformt → Briefing-Regel beachten!)
- **Phase 5.2:** Components/Patterns → Figma-Nodes
- **oder:** Radius/Spacing/Shadows → Figma-Variables
- **oder:** Figma-Ingester v1 (Lese-Richtung) — Spec liegt (`2026-07-03-figma-ingester-v1-design.md`), **Plan fehlt noch**

## Erkenntnisse aus dem manuellen Test (07.07.)
- **API-Credits leer** (gleiche Lage wie Demo 24.06.) → Bild-Import lief über `DEMO_FALLBACK=1` (env beim Serverstart, `.env` steht weiter auf 0). Für echte Vision-Scans: console.anthropic.com → Plans & Billing aufladen.
- **Figma verliert Dev-Plugin-Pfade auf externen Volumes** → Lösung: „Fehlendes Manifest suchen" → `designbridge-plugin/manifest.json` neu wählen.
- **Figma lehnt `http://127.0.0.1:…` in `allowedDomains` ab** (nur `localhost` ist als http-Ausnahme gültig) → gefixt in `b1d897f`.

## ✅ Schreibrichtung-Architektur ENTSCHIEDEN (06.07. abends)
Verifiziert + live bewiesen (Figma-Datei `fE1iyfh3nACMao43RnUJY6`, plugin-frei via Figma-MCP). ABER: App-als-MCP-Client (`mcp:connect`) ist Dritt-Apps verwehrt — der Live-Beweis lief nur, weil Claude Code ein freigegebener Client ist. **Rob-Entscheidung = Weg A festschreiben + Plugin als Fallback behalten.**
- **Weg A (plugin-frei, empfohlen):** Nutzer schreibt via freigegebenem MCP-Client (Claude/Cursor/Figma-Agent) mit `emitFigma`-Export als Input.
- **Weg B (Plugin, gebaut & jetzt E2E-verifiziert):** universeller app-naher Fallback.
- Anleitung: [docs/figma-schreiben-anleitung.md](docs/figma-schreiben-anleitung.md) · Architektur: `docs/superpowers/specs/2026-07-06-figma-write-architecture-decision.md`
- Beobachten: öffnet Figma `mcp:connect` für Dritte → In-App-MCP-Weg (Option D) bauen, Plugin ablösen.

## Wo wir im Gesamtbild stehen (die Brücke)
- **REIN/lesen (Ingester):** Bild ✅ · URL ✅ (+Komponenten-Erkennung) · Repo ✅ · **Figma lesen ⏳ (nur gespec't)**
- **RAUS/schreiben (Emitter):** Code CSS/Tailwind ✅ · shadcn-Components ✅ · **nach Figma: Tokens (Farben+Typo) ✅ E2E-VERIFIZIERT 07.07. · Components/Patterns → Nodes ❌ (Phase 5.2) · Variables/Radius/Spacing/Shadows ❌**
- **Sync/Round-Trip (Phase 6):** ❌

## App starten (Server + Web)
```
npm run dev
```
→ Backend http://localhost:3047, Frontend http://localhost:5173. Nur EINE Instanz.

**⚠️ Zuverlässiger** (PORT-Injection-Falle bei `npm run dev`): Backend separat `PORT=3047 node server/index.js`, Vite parallel (`cd web && npm run dev`), Proxy `/api → :3047` greift.

## Tests & Checks
```
npm run test:server                          # 77/77
cd web && npx vitest run                     # 106/106
cd designbridge-plugin && npm run build      # esbuild, „Build complete."
cd designbridge-plugin && npm run typecheck  # NEU: tsc --noEmit, 0 Fehler
```
(`npx tsc` direkt geht nicht — `.bin/tsc`-Wrapper ist kaputt, deshalb das npm-Script via node.)

## Figma-Test-Ablauf (funktionierend, als Referenz)
1. Backend + Web starten (s. o.; bei leeren Credits `DEMO_FALLBACK=1` vor `node server/index.js`).
2. Web :5173 → Bild importieren → Library → **Export** (Sidebar unten) → Format „Nach Figma (Plugin)" → **„An Figma senden"**.
3. Figma: Plugins → Development → **DesignBridge** → Karte „Code → Figma" → **„Aus DesignBridge übernehmen"**.
4. Ergebnis: Local Styles `DesignBridge/Color/*` + `DesignBridge/Text/*`, Statuszeile „Fertig — …".
   - Fallback ohne Server: JSON manuell einfügen → „In Figma schreiben".

## Wichtige Dateien
- Figma-Emitter: `web/src/lib/emit/emitFigma.js`; `designbridge-plugin/src/writer/{parsePayload,applyImport}.ts`
- Auto-Fetch: `server/lib/figmaExportStore.js`, `server/routes/figmaExport.js`; Plugin `src/ui.ts` (`DESIGNBRIDGE_URL`)
- Plugin-Hebel: `designbridge-plugin/` (`src/main.ts` message-routing, `src/ui.html`/`ui.ts` Panel)
- Figma-Lese-Spec (später für Sync): `docs/superpowers/specs/2026-07-03-figma-ingester-v1-design.md`
- Arbeitsregeln: `CLAUDE.md`
