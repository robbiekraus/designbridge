# Designbridge — Schnellstart-Spickzettel

Stand: **02.07.2026** — **„URL-Komponenten-Erkennung v1" FERTIG, gemerged & auf `origin/main` gepusht.** Branch `feat/url-component-recognition` gelöscht, Worktree entfernt. Post-Review-Cleanup erledigt (unbenutzter `css`-Param entfernt, `source_url` dedupliziert, KI-Korrekturnotiz optisch von der „von KI"-Pille getrennt). Server 29/29 · Web 96/96 · `vite build` sauber.

## Was gebaut wurde (Phase-4-Feature „Weg 1")
URL-Import erkennt Bausteine — gratis per HTML/CSS-Regeln, optional per Claude veredelt — und füllt die bestehende Library-UI.
- **Server:** `fetchSite` gibt `html` zurück · `recognizeComponents(html)` (Atomics Button/Suche/Input/Badge · Patterns Navbar/Hero/Footer/Sidebar · Components Formular/Tabelle/Liste/Card; canonical `{name,variants,confidence,source,notes}`) · `recognizeWithAi` (injizierbarer Anthropic-Client) · Endpoints `POST /api/scan/url` (Regel-Inventar) + `POST /api/scan/url/ai` (Claude-Merge). Dep: **node-html-parser**.
- **Web:** `SourcePill` (Herkunfts-Pille grau/grün/gelb) · `aiDeepen.js` · `AiDeepenBanner` („Mit KI vertiefen") · `emitComponents` reicht `source`+`notes` durch. Korrekturnotizen jetzt kursiver, gedämpfter Zinc-Text mit Stift-Glyph statt Amber-Ton — nicht mehr mit der gelben Pille verwechselbar.

## NÄCHSTES: Repo-Ingester v1 — Spec+Plan FERTIG, Bau startklar
ADR-001 (`docs/superpowers/adr/ADR-001-repo-ingester-quelle.md`): öffentliche GitHub-URL → Tarball via codeload → deterministisches Parsen (statisches Tailwind-Theme-Parsing ohne Codeausführung, `:root`-Vars via `cssIngest`, shadcn-Inventar-Heuristik) → „Mit KI vertiefen"-Knopf. Spec: `docs/superpowers/specs/2026-07-02-repo-ingester-v1-design.md` · Plan (13 TDD-Tasks): `docs/superpowers/plans/2026-07-02-repo-ingester-v1.md`.
**Worktree bereit:** `.worktrees/feat-repo-ingester-v1` (Branch `feat/repo-ingester-v1`). Vor Task 0 dort `npm install` + `cd web && npm install`, Baseline: Server 29/29, Web 96/96. Einzige neue Dependency: `tar` (Task 0). Nächster Schritt: Plan subagent-getrieben abarbeiten.

## App starten (Server + Web)
```
npm run dev
```
→ Backend http://localhost:3047, Frontend http://localhost:5173 (Inkognito). Nur EINE Instanz; vorher `lsof -ti:3047` / `:5173` prüfen.
ℹ️ Kein API-Key → „Mit KI vertiefen" liefert 502 (erwarteter, sauber abgefangener Fehlerpfad; Regel-Liste bleibt).

## Tests
```
npm run test:server        # 29/29
cd web && npx vitest run   # 96/96
```

## Wichtige Dateien
- Server: `server/lib/recognizeComponents.js` (+`.test.js`), `server/lib/recognizeWithAi.js` (+`.test.js`), `server/lib/fetchSite.js`, `server/routes/scan.js`, `demo-site/index.html`
- Web: `web/src/lib/aiDeepen.js`, `web/src/components/library/{SourcePill,AiDeepenBanner,LibraryObjectList}.jsx`, `web/src/lib/emit/emitComponents.js`, `web/src/App.jsx`
- Spec/Plan: `docs/superpowers/specs/2026-06-29-url-component-recognition-v1-design.md`, `docs/superpowers/plans/2026-06-29-url-component-recognition-v1.md`
- Arbeitsregeln: `CLAUDE.md`
