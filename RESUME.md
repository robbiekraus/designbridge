# Designbridge — Schnellstart-Spickzettel

Stand: **01.07.2026** — **„URL-Komponenten-Erkennung v1" FERTIG gebaut, reviewt & verifiziert.** Branch `feat/url-component-recognition` (Worktree `.worktrees/feat-url-component-recognition`), HEAD `bb5eaed`, ~19 Commits vor `origin/main`, **LOKAL / NICHT GEPUSHT**. Server 29/29 · Web 95/95 · `vite build` sauber · Browser-Smoke bestanden.

## Was gebaut wurde (Phase-4-Feature „Weg 1")
URL-Import erkennt jetzt Bausteine — gratis per HTML/CSS-Regeln, optional per Claude veredelt — und füllt die bestehende Library-UI.
- **Server:** `fetchSite` gibt `html` zurück · `recognizeComponents(html,css)` (Atomics Button/Suche/Input/Badge · Patterns Navbar/Hero/Footer/Sidebar · Components Formular/Tabelle/Liste/Card; canonical `{name,variants,confidence,source,notes}`) · `recognizeWithAi` (injizierbarer Anthropic-Client) · Endpoints `POST /api/scan/url` (Regel-Inventar) + neu `POST /api/scan/url/ai` (Claude-Merge). Dep: **node-html-parser**.
- **Web:** `SourcePill` (Herkunfts-Pille grau/grün/gelb) · `aiDeepen.js` · `AiDeepenBanner` („Mit KI vertiefen") · `emitComponents` reicht `source`+`notes` durch. Verdrahtet in `LibraryObjectList`/`App.jsx`.
- **Härtungen** (`4b57403`,`0efac59`,`bb5eaed`): `trimHtml` strippt ungeschlossene Tags; Prompt-Größenlimits (Regel-Liste entry-weise → valides JSON); `recognizeComponents` wirft nicht mehr; klarere `/url/ai`-Fehlermeldung.

## NÄCHSTES (neue Session)
🟢 **Branch abschließen** — Wahl treffen: (a) lokal nach `main` mergen, (b) pushen + **PR** gegen `origin/main` (wie zuletzt PR #2), (c) erst noch offene Punkte. **Push braucht Robs OK (CLAUDE.md Regel 5).**
🟠 **Design-Frage für Rob:** gelbe „von KI"-Pille vs. gelbe Korrektur-Notiz optisch trennen? (nicht ohne seine Richtung ändern.)
⚪ Kosmetische Non-blocker: unbenutzter `css`-Param in `recognizeComponents`; `source_url` doppelt in `/url`.

Möglicher erster Satz an Claude:
```
Lies RESUME.md + Memory (project_designbridge_roadmap). Die Branch feat/url-component-recognition ist fertig & verifiziert (bb5eaed, lokal). Lass uns [pushen + PR öffnen | lokal nach main mergen]. Danach ggf. die Design-Frage (KI-Pille vs. Notiz) klären.
```

## App starten (Achtung Worktree!)
`preview_start` startet Vite aus dem HAUPT-Repo (nicht dem Worktree) und injiziert `PORT` an `npm run dev` → bricht das Backend. Für einen Browser-Test aus dem Worktree:
```
# Backend (Worktree) auf 3047:
cd "<worktree>" && PORT=3047 node server/index.js &
# Frontend (Worktree) auf 5173:
cd "<worktree>/web" && npm run dev
```
Vite proxyt `/api` → `:3047`. Danach Preview-Browser auf http://localhost:5173.
ℹ️ Kein API-Key → „Mit KI vertiefen" liefert 502 (erwarteter, sauber abgefangener Fehlerpfad; Regel-Liste bleibt).

## Tests
```
npm run test:server        # 29/29
cd web && npx vitest run    # 95/95
```

## Wichtige neue Dateien
- Server: `server/lib/recognizeComponents.js` (+`.test.js`), `server/lib/recognizeWithAi.js` (+`.test.js`), `server/lib/fetchSite.js`, `server/routes/scan.js`, `demo-site/index.html`
- Web: `web/src/lib/aiDeepen.js`, `web/src/components/library/{SourcePill,AiDeepenBanner}.jsx`, `web/src/lib/emit/emitComponents.js`, `web/src/components/library/LibraryObjectList.jsx`, `web/src/App.jsx`
- Spec/Plan: `docs/superpowers/specs/2026-06-29-url-component-recognition-v1-design.md`, `docs/superpowers/plans/2026-06-29-url-component-recognition-v1.md`
- Arbeitsregeln: `CLAUDE.md`
