# Plan: Import-Modal abschließen + Repo aufräumen (22.06.2026)

Ziel: Die drei offenen Tasks sauber erledigen. Für jeden Schritt steht dabei,
WAS wir tun, WARUM, und worauf du achten musst.

---

## Vorab: Woher kommen die „500 Änderungen"? (Entwarnung)

Ich habe nachgesehen. Die 500 sind **fast kein echter Code**. Sie zerfallen in drei Gruppen:

| Gruppe | Anzahl | Was es ist | Gefährlich? |
|---|---|---|---|
| Nur Datei-**Rechte** geändert (mode 644 → 755) | 231 | Artefakt der externen 4TB-Platte | Nein |
| `._*`-Dateien (AppleDouble) | 278 | macOS-Metamüll auf der Platte | Nein |
| Echte Inhalts-Änderungen | 6 | generierte Daten in `designbridge-web/` + `exports/` | Harmlos |

**Wichtig:** In `web/` (deiner Produktions-App) und `server/` liegt **keine einzige**
ungewollte Änderung. Dein eigentliches Feature ist sauber.

### Warum passiert das?
- Die externe Platte speichert Unix-Dateirechte nicht richtig. Git denkt deshalb,
  jede Datei sei „ausführbar geworden" → 231 Phantom-Änderungen ohne Inhalt.
- macOS legt auf so einer Platte zu jeder Datei eine versteckte `._datei` an.
  Das sind die 278 `??`-Einträge.
- Die 6 echten Diffs sind generierte Ausgabe-Dateien (`tokens.json`,
  `components.manifest.json` …) vom Figma-Plugin/Sync — nicht von Hand bearbeitet.

→ Nichts davon ist „kaputt". Es ist nur Rauschen, das die Sicht versperrt.

---

## Git-Mini-Crashkurs (nur was du hier brauchst)

- **Working Tree** = der aktuelle Stand der Dateien auf der Platte (das, was du siehst).
- **Commit** = ein gespeicherter Schnappschuss. Erst committete Dinge sind sicher.
- **`git status`** = zeigt, was sich seit dem letzten Commit verändert hat.
  - ` M datei` = geändert (modified), noch nicht gespeichert.
  - `?? datei` = brandneu, Git kennt sie noch gar nicht (untracked).
- **Branch** = eine Arbeitslinie. Du bist auf `feat/import-modal`. `main` ist die Hauptlinie.
- **Merge** = die Arbeitslinie zurück in `main` zusammenführen.

Worauf du als Einsteiger achten musst:
1. **Nichts löschen, was du nicht erzeugt hast** — im Zweifel fragen.
2. **Keine `--force`-, `reset --hard`- oder `branch -D`-Befehle** ohne dass wir
   vorher drüber reden (steht auch in der CLAUDE.md als harte Regel).
3. Vor jedem „großen" Schritt: `git status` ansehen → wir wissen immer, wo wir stehen.
4. Ich führe jeden Befehl vor, erkläre ihn, du sagst Ja/Nein. Du tippst nichts blind.

---

## Task 1 — URL/Repo-Tab im Browser smoke-testen

**Ziel:** Mit eigenen Augen sehen, dass die Mock-Tabs (URL & Repo) funktionieren.

Schritte:
1. App starten: `npm run dev` (Backend :3047, Frontend :5173).
2. Browser auf http://localhost:5173.
3. Falls direkt das Import-Modal kommt: gut. Sonst „New Import" klicken.
4. **URL-Tab:** `https://acme.com` eintippen → Import → es muss ein Success-State
   mit `PREVIEW`-Badge und Kategorie-Zählungen kommen.
5. **Repo-Tab:** dasselbe mit einem Beispiel-Repo.
6. Wenn etwas hakt: Konsole offen (`⌥⌘C`), Fehler notieren — wir fixen es dann.

**Worauf achten:** Image-Tab schlug früher an „Anthropic credit balance too low" fehl —
das ist ein Konto-/Guthaben-Thema, kein Bug. URL/Repo sind Mocks, brauchen kein Guthaben.

---

## Task 2 — Repo-Rauschen aufräumen (der Teil, der dir Sorgen macht)

**Ziel:** `git status` soll wieder übersichtlich werden, OHNE etwas Echtes kaputtzumachen.
Wir gehen vom Harmlosesten zum „Vorsicht".

**Schritt 2a — Git die Datei-Rechte ignorieren lassen (löst 231 Phantom-Diffs auf einmal):**
```
git config core.fileMode false
```
Das sagt Git nur: „Achte auf dieser Platte nicht auf Dateirechte." Ändert keine Datei,
ist sofort umkehrbar. Danach verschwinden die 231 Mode-Änderungen aus `git status`.

**Schritt 2b — AppleDouble-Müll löschen (die 278 `._*`):**
```
find . -name '._*' -delete
```
Löscht nur die versteckten macOS-Metadateien. Die kommen leider von selbst wieder,
solange die Platte extern ist — aber für den Moment ist Ruhe.

**Schritt 2c — Den Rest gemeinsam einordnen:**
Was dann noch übrig bleibt (die 6 generierten Daten-Dateien + ein paar untracked
Ordner wie `designbridge-dev/`, `server/`), schauen wir uns zusammen an und
entscheiden pro Fall: behalten/committen, ignorieren (`.gitignore`), oder weglassen.
**Hier nichts allein löschen.**

**Worauf achten:** Schritt 2a + 2b sind sicher. 2c ist Kopfsache — da entscheidest du,
ich schlage nur vor.

---

## Task 3 — Branch abschließen (mergen oder PR)

**Ziel:** Das fertige Feature aus `feat/import-modal` in `main` bringen.

Erst NACH Task 1 + 2. Optionen, die wir dann durchgehen:
- **Lokal mergen** in `main` (einfachster Weg, alles bleibt auf deinem Rechner).
- **Auf GitHub pushen + Pull Request** (sauberer, wenn das Repo geteilt ist —
  `origin` existiert bereits).

Ich nutze dafür das Skill `superpowers:finishing-a-development-branch`, das uns die
Optionen strukturiert vorlegt. Vorher: Tests nochmal grün (sind aktuell 14/14 ✅).

**Worauf achten:** Mergen ist der Punkt, an dem das Feature „echt" wird. Davor
prüfen wir nochmal: Tests grün? Smoke-Test ok? `web/` sauber? Erst dann Knopf drücken.

---

## Reihenfolge

1. Task 1 (smoke-test) — sehen, dass es läuft
2. Task 2a + 2b (sicheres Aufräumen) — Sicht freiräumen
3. Task 2c (Rest einordnen) — gemeinsam entscheiden
4. Task 3 (mergen/PR) — abschließen

Wir machen immer nur einen Schritt, dann kurzer Check, dann weiter.
