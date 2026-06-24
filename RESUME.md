# Designbridge — Schnellstart-Spickzettel

Stand: **24.06.2026** — Phase 2 (Code Emitter v1) **FERTIG & verifiziert auf `main`** (57/57 Tests grün, Build sauber).
Einfach jeweils kopieren und ins Terminal einfügen.

## Frisch weitermachen

Terminal öffnen, dann ins Projekt:

```
cd "/Volumes/4TB Shield/Vibe Coding Bootcamp/Projekte/Designbridge"
claude
```

Zwei sinnvolle nächste Schritte (je nachdem, worauf du Lust hast):

**A) Stand sichern — nach GitHub pushen** (Claude fragt vorher nochmal nach):
```
Push den aktuellen main-Stand nach origin.
```

**B) Phase 3 starten — neue Design-Session** (Komponenten als echten Code rekonstruieren):
```
Lass uns Phase 3 (Code Emitter v2) als Design-Session starten.
```

## Wo wir stehen

- **Branch: `main`** — Phase 1 (Library) UND Phase 2 (Code Emitter v1) sind drauf.
- Phase 2 ist gebaut, getestet (57/57) und baubar. **Noch nicht gepusht** (`main` ~27 Commits vor `origin`) und noch kein Browser-Smoke-Test.
- Spec: `docs/superpowers/specs/2026-06-24-code-emitter-v1-design.md`
- Plan: `docs/superpowers/plans/2026-06-24-code-emitter-v1.md`

## Was Phase 2 gebaut hat

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

- Branch: **`main`** (Phase 1 + Phase 2)
- Spec: `docs/superpowers/specs/2026-06-24-code-emitter-v1-design.md`
- Plan: `docs/superpowers/plans/2026-06-24-code-emitter-v1.md`
- Arbeitsregeln für Claude: `CLAUDE.md` (Projekt-Root)

## Offene Punkte

1. ✅ **Push** nach `origin/main` erledigt (24.06.2026, in Sync).
2. Optionaler **Browser-Smoke-Test** des Export-Tabs (Bild importieren → Export → alle 3 Formate prüfen).
3. Danach: **Phase 3** (Code Emitter v2) als neue Design-Session.
