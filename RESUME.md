# Designbridge — Schnellstart-Spickzettel

Alle Befehle, die du brauchst, um hier weiterzumachen. Einfach jeweils kopieren und ins Terminal einfügen.

## Claude wieder reinholen

Terminal öffnen (Spotlight → „Terminal"). Dann:

```
claude --resume
```

→ Eine Liste deiner Sessions erscheint. Mit Pfeiltasten die letzte Designbridge-Session auswählen, Enter. Voller Kontext ist zurück.

**Oder** einfach neu starten und in den Chat schreiben: *"Weiter mit dem Designbridge Import Modal."* Claude liest dann automatisch deine Memory und weiß Bescheid.

## Ins Projekt wechseln

```
cd "/Volumes/4TB Shield/Vibe Coding Bootcamp/Projekte/Designbridge"
```

## Aktuellen Stand prüfen

```
git status
git log --oneline -12
```

→ Du solltest auf Branch `feat/import-modal` sein, mit 12 Commits.

## App starten (Server + Web)

```
npm run dev
```

→ Backend auf http://localhost:3047, Frontend auf **http://localhost:5173** — letzteren im Browser öffnen.

## Tests laufen lassen

```
cd web
npm test
```

→ Sollte 14 Tests, alle grün, durchlaufen.

## Modal-Empty-State zurücksetzen

In Safari mit aktiviertem Entwickler-Menü:

1. `⌥ + ⌘ + C` → Konsole öffnen
2. Eingeben: `localStorage.removeItem('designbridge.hasImported')`
3. Enter, dann Seite neu laden (`⌘ + R`)

## Branch / wichtige Dateien

- Branch: **`feat/import-modal`** (lokal, ungemergt)
- Spec: `docs/superpowers/specs/2026-06-11-import-modal-design.md`
- Plan: `docs/superpowers/plans/2026-06-11-import-modal-plan.md`
- Arbeitsregeln für Claude: `CLAUDE.md` (im Projekt-Root)

## Nächste Schritte (wenn du Lust hast)

1. URL-Tab smoke-testen (`https://acme.com` eingeben → Import → Mock-Success)
2. Die ~30 fremden uncommitted Changes außerhalb von `web/` einordnen (was sind die? mergen oder verwerfen?)
3. Branch mergen oder PR machen (Claude kennt das Skill `superpowers:finishing-a-development-branch`)
