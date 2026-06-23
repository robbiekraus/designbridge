# Designbridge — Schnellstart-Spickzettel

Stand: **24.06.2026** — Phase 2 (Code Emitter v1) **Design fertig, Bau steht noch aus.**
Einfach jeweils kopieren und ins Terminal einfügen.

## Morgen frisch weitermachen (der wichtige Befehl)

Terminal öffnen, dann ins Projekt:

```
cd "/Volumes/4TB Shield/Vibe Coding Bootcamp/Projekte/Designbridge"
claude
```

Und als **erste Nachricht** in den Chat schreiben (das ist der Bau-Befehl):

```
Implementiere Plan docs/superpowers/plans/2026-06-24-code-emitter-v1.md mit subagent-driven-development. Branch ist feat/code-emitter.
```

→ Claude liest dann den Plan und baut Task für Task (Test zuerst, dann Code, dann Commit), mit Review zwischendrin.

## Wo wir stehen

- **Branch: `feat/code-emitter`** (von `main` abgezweigt, Phase 1 ist auf `main`).
- **Design-Session abgeschlossen.** Es wurde NOCH KEIN Code gebaut — nur Spec + Plan geschrieben und committed.
- Spec: `docs/superpowers/specs/2026-06-24-code-emitter-v1-design.md`
- Plan: `docs/superpowers/plans/2026-06-24-code-emitter-v1.md` (8 Tasks)

## Was Phase 2 baut

Ein neuer **Export-Tab** in der Library: Du wählst ein Format (CSS-Variablen / Tailwind-Config / tokens.json), siehst eine Live-Vorschau und kannst kopieren oder herunterladen. Alle Tokens kommen mit, unsichere sind markiert. Komponenten kommen erst in Phase 3.

## Aktuellen Stand prüfen

```
git status
git log --oneline -5
```

→ Branch `feat/code-emitter`, oben zwei Commits: „docs(plan)…" und „docs(spec)…".

## App starten (Server + Web)

```
npm run dev
```

→ Backend http://localhost:3047, Frontend **http://localhost:5173** im Browser öffnen.

## Tests laufen lassen

```
cd web
npm test
```

## Branch / wichtige Dateien

- Branch: **`feat/code-emitter`**
- Spec: `docs/superpowers/specs/2026-06-24-code-emitter-v1-design.md`
- Plan: `docs/superpowers/plans/2026-06-24-code-emitter-v1.md`
- Arbeitsregeln für Claude: `CLAUDE.md` (Projekt-Root)

## Danach (nach dem Bau)

1. Export-Tab im Browser smoke-testen (Bild importieren → Export → alle 3 Formate prüfen).
2. `npm run build` muss sauber durchlaufen.
3. Branch mergen oder PR (Skill `superpowers:finishing-a-development-branch`).
