# Designbridge — Schnellstart-Spickzettel

Stand: **24.06.2026 (abends)** — Phase 2 (Code Emitter v1) auf `main`; danach UI-Überarbeitung + Demo-Sicherheitsnetz. Letzter Commit **`9cc8bde` (lokal, NICHT gepusht)**.

## Frisch weitermachen

```
cd "/Volumes/4TB Shield/Vibe Coding Bootcamp/Projekte/Designbridge"
claude
```

Dann als ersten Satz an Claude (Wiedereinstieg):

```
Lies RESUME.md und das Memory (project_designbridge_demo_2026-06-24, project_designbridge_roadmap). Wir machen weiter mit P0: dem shadcn-Komponenten-Stub. Frag mich zuerst, WO der Code erscheinen soll (Code-Block je Komponente / eigener Code-Tab / im Export-Tab), dann bau es.
```

## App starten (Server + Web)

```
npm run dev
```
→ Backend http://localhost:3047, Frontend **http://localhost:5173** (am besten Inkognito-Fenster).
⚠️ **Wichtig:** Nur EINE Instanz starten. Vorher prüfen, dass nichts auf :3047/:5173 läuft (`lsof -ti:3047`), sonst hängt der Import (genau das ist am 24.06. passiert).

## Was in dieser Session passiert ist (24.06.2026)

1. **Browser-Smoke-Test Phase 2** (Export-Tab) — bestanden.
2. **Demo-Vorbereitung 13:30:** API-Credits des `.env`-Keys sind **leer** → echter Scan schlägt fehl. Deshalb **env-gesteuertes Sicherheitsnetz** gebaut: `DEMO_FALLBACK=1` in `.env` → `server/routes/scan.js` liefert bei Scan-Fehler das Fixture `server/fixtures/demo-dashboard.json` (passend zum Demo-Bild `Testdaten/Reports/02.png`), inkl. 2,5-s-Kunstverzögerung. Spickzettel: `docs/DEMO-2026-06-24.md`.
3. **Voller Probelauf** → Bug gefunden & gefixt (doppeltes „px" in Tokens-Anzeige; Fixture auf numerische Werte umgestellt). Folgepunkt für echten Scan-Pfad als Task hinterlegt.
4. **UI-Überarbeitung (auf Robs Feedback):**
   - Doppelte Top-Navigation entfernt → Navigation nur noch in der Sidebar (Dashboard oben + LIBRARY-Gruppe), Header nur Aktionen.
   - Dashboard: eigene Sektionen **Tokens / UI Inventory / Export**; Inventar-Aufschlüsselung (Atomics/Components/Patterns); Export-Status (Verfügbar/Nicht verfügbar).
   - Sidebar: **Mengenangaben** pro Kategorie (Tokens 33, Atomics 5, Components 9, Patterns 3).
   - Header-Import-Button erst nach erstem Import (Entdopplung mit Empty-State-CTA), umbenannt zu „Neuer Import".
5. **Committet** (`9cc8bde`, 9 Dateien) — `server/` erstmals getrackt. 57/57 Tests grün.

## Nächste Schritte (priorisiert)

- 🔴 **P0 — shadcn-Komponenten-Stub** (Phase 3 v1): erkannte Komponenten → shadcn/Tailwind-Code im UI. Robs Wahl: Template-Stub für **Button/Card/Badge/Input** + generisches Gerüst sonst, Tokens eingewebt. **OFFENE Entscheidung: WO erscheint der Code?** (Code-Block je Komponente auf Components-Seite / eigener „Code"-Tab wie Export / als Format im Export-Tab) — Claude soll das zuerst fragen.
- 🟠 **Push** `9cc8bde` nach `origin/main` (wenn gewünscht).
- 🟠 **`DEMO_FALLBACK`-Entscheidung:** Demo ist vorbei. Bei leeren Credits an lassen (sonst geht Import nicht); bei Credits → auf `0` + echten Scan testen.
- 🟠 **Tokens-Anzeige gegen doppeltes „px" härten** (Task hinterlegt) — betrifft echten Scan, nicht Fixture.
- 🟡 **Tests** für neue Features (Dashboard-Sektionen, Sidebar-Zähler, Export-Status, bedingter Header-Button) + Sprach-Inkonsistenz (Header EN vs. UI DE).
- ⚪ **API-Credits** aufladen (extern, Konsolen-Zugang nötig) · Roadmap Phase 4/5/6.

## Tests laufen lassen

```
cd web && npm test
```
→ aktuell **57/57 grün**.

## Wichtige Dateien

- UI: `web/src/App.jsx`, `web/src/pages/Dashboard.jsx`, `web/src/pages/Export.jsx`
- Emitter: `web/src/lib/emit/` · Token-Anzeige: `web/src/components/library/tokenViews.jsx`
- Server: `server/routes/scan.js` (inkl. Fallback), `server/lib/claude.js`, `server/fixtures/demo-dashboard.json`
- Demo: `docs/DEMO-2026-06-24.md` · Arbeitsregeln: `CLAUDE.md`
