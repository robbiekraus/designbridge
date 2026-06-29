# Designbridge — Schnellstart-Spickzettel

Stand: **29.06.2026** — **Planung „Komponenten aus URL erkennen" FERTIG.** Spec + Plan geschrieben, committet (`385b576` auf `main`, NICHT gepusht). Worktree + Branch stehen. **Bau hat noch NICHT begonnen** — startet in neuer Session, subagent-getrieben.

## Was als Nächstes dran ist — BAU starten (subagent-driven)

Brainstorming + Plan sind durch. Alle Design-Fragen entschieden:
- **Umfang:** alle drei Ebenen (Atomics/Components/Patterns), gestaffelt nach Sicherheit.
- **Wann Claude:** auf Knopfdruck (Button „Mit KI vertiefen"), nicht automatisch.
- **Zusammenführen:** Claude als Redakteur → eine saubere Liste mit Herkunfts-Etiketten.
- **UI:** Banner oben in der Library + Herkunfts-Pille (grün „Regeln + KI" / gelb „von KI" / grau „nur Regeln") an jedem Baustein.
- **Roadmap:** danach Repo → Figma lesen → Figma schreiben → Sync (A→B).

**Spec:** `docs/superpowers/specs/2026-06-29-url-component-recognition-v1-design.md`
**Plan:** `docs/superpowers/plans/2026-06-29-url-component-recognition-v1.md` (13 Tasks, 0–12, TDD, vollständiger Code je Schritt)

**Worktree (isoliert, schon angelegt):**
`.worktrees/feat-url-component-recognition` · Branch `feat/url-component-recognition`

## Frisch weitermachen (NEUE Session — diese ist am Kontext-Limit)

```
cd "/Volumes/4TB Shield/Vibe Coding Bootcamp/Projekte/Designbridge/.worktrees/feat-url-component-recognition"
claude
```

Erster Satz an Claude:

```
Lies RESUME.md und das Memory (project_designbridge_roadmap). Plan & Spec für „URL-Komponenten-Erkennung v1" sind fertig und committet. Wir sind im Worktree feat/url-component-recognition und wollen den Plan docs/superpowers/plans/2026-06-29-url-component-recognition-v1.md jetzt SUBAGENT-GETRIEBEN bauen (Skill superpowers:subagent-driven-development): pro Task ein frischer Implementer-Subagent, danach Spec-Review + Code-Quality-Review, dann nächster Task. Erst aber: in DIESEM Worktree `npm install` (postcss + node-html-parser müssen rein — Task 0 installiert node-html-parser) und Baseline prüfen (`npm run test:server`, `cd web && npx vitest run` = 86 grün erwartet). Ich bin Designer, kein Coder — Zwischenstände laienverständlich, visuell wo es hilft. Nur EINE Server-Instanz, vorher Ports 3047/5173 prüfen.
```

**WICHTIG vor dem ersten Lauf im Worktree:**
1. `npm install` im Worktree-Root (Abhängigkeiten sind nicht automatisch da; Task 0 ergänzt `node-html-parser`).
2. Baseline: `npm run test:server` + `cd web && npx vitest run` (Erwartung: Web 86 grün). Erst dann Task 1 starten.
3. Bei Task 12 echter Claude-Lauf braucht API-Credits; ohne Credits gilt der Fehlerpfad (gratis Regel-Liste bleibt) als bestanden.

## Plan-Tasks im Überblick (Reihenfolge strikt 0→12)
- **0** `node-html-parser` installieren (Root-Dep, CLAUDE.md-Regel 6 — von Rob freigegeben)
- **1** `fetchSite` gibt zusätzlich `html` zurück
- **2–4** `server/lib/recognizeComponents.js` (Atomics → Patterns → Components, je TDD)
- **5** `/api/scan/url` füllt Inventory + Demo-Seite anreichern (`<nav>/<header>/<footer>` + Cards/Form/Suche)
- **6** `server/lib/recognizeWithAi.js` (Claude-Merge, injizierbarer Fake-Client, keine Credits in Tests)
- **7** neuer Endpoint `POST /api/scan/url/ai`
- **8** `emitComponents` reicht `source`+`notes` durch
- **9** `SourcePill` + Anzeige in `LibraryObjectList`
- **10** `web/src/lib/aiDeepen.js` (`deepenWithAi`)
- **11** `AiDeepenBanner` + Verdrahtung in `App.jsx`
- **12** Voll-Verifikation + Browser-Smoke (preview_*-Workflow)

## Nach dem Bau
- `superpowers:finishing-a-development-branch` (Merge/PR/Cleanup).
- **Push:** vorher Rob fragen (Regel 5). Branch `feat/url-component-recognition` → ggf. PR auf `robbiekraus/designbridge` (wie zuletzt PR #2).

## App starten (Server + Web)
```
npm run dev
```
→ Backend http://localhost:3047, Frontend http://localhost:5173 (Inkognito). ⚠️ Nur EINE Instanz; vorher `lsof -ti:3047` / `:5173` prüfen.
ℹ️ UI-Smoke ohne echten Scan: Import-Datensatz nach `localStorage["designbridge.lastImport"]` + `designbridge.hasImported="1"` seeden (Shape: `web/src/lib/libraryStore.js`).

## Wichtige Dateien
- Neu zu bauen lt. Plan: `server/lib/recognizeComponents.js`(+`.test.js`), `server/lib/recognizeWithAi.js`(+`.test.js`), `web/src/lib/aiDeepen.js`(+test), `web/src/components/library/{SourcePill,AiDeepenBanner}.jsx`(+tests)
- Zu ändern: `server/lib/fetchSite.js`, `server/routes/scan.js`, `demo-site/index.html`, `web/src/lib/emit/emitComponents.js`, `web/src/components/library/LibraryObjectList.jsx`, `web/src/App.jsx`
- Tests: Server `npm run test:server` (`node --test 'server/lib/*.test.js'`) · Web `cd web && npx vitest run`
- Arbeitsregeln: `CLAUDE.md`
