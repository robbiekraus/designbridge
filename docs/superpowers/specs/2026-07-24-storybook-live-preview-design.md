# Storybook Live-Preview — echtes, serverseitig gebautes Storybook ohne Terminal

**Datum:** 2026-07-24
**Status:** Design abgenommen (Rob), Implementierung folgt als eigener Plan.

## Problem

Der bestehende Storybook-Export (`web/src/lib/emit/buildStorybookZip.js` → „Nach Storybook exportieren") liefert ein ZIP, das nicht selbst lauffähig ist (fehlende `package.json`, Tailwind-Config, shadcn-Stubs, `@`-Alias). Selbst wenn das ZIP vollständig wäre, bräuchte man zum Anschauen ein Terminal (`npm install`, `npm run storybook`).

Rob will das seinen (Design-)Kunden in einem **unmoderierten Usability-Test** zeigen — die Testperson ist Designer:in, kein Terminal zumutbar. Storybook ist hier kein Feature, das bedient werden muss, sondern der Vertrauens-Beweis „aus deinem Screenshot wird echter Code, mit dem ein Entwickler arbeiten kann".

Storybook ist kein Cloud-Dienst (kein Upload-Ziel wie Figma) — es ist ein Werkzeug, das in ein Code-Projekt eingebaut wird und dort laufen muss. Es gibt keinen Weg, es „einfach hochzuladen". Also muss etwas den Build für die Testperson übernehmen.

## Entscheidungen (aus dem Brainstorming)

- **Test-Setting:** unmoderiert — muss vollständig ohne Rob funktionieren.
- **Zielgruppe:** Designer:innen, keine Entwickler:innen. Kein Terminal, keine Installation, kein Account.
- **Es soll ein echtes Storybook mit den eigenen (gerade interpretierten) Bausteinen der Testperson sein** — kein Beispiel-Fixture, kein Nachbau einer Storybook-ähnlichen Ansicht in der App.
- **StackBlitz/WebContainers (Build im Browser) verworfen** — Kaltstart-Zeit (~1-2 Min) unpassend, nicht geprüft, daher nicht vertretbar zu versprechen.
- **Serverseitiger On-Demand-Build.** Spike (siehe unten) zeigt: ein Build dauert ~5s, kostet keine zusätzlichen KI-Aufrufe.
- **Eigener, kleiner Railway-Service** (Root `storybook-harness/`), NICHT in die bestehende Live-App eingebaut — die Harness-Abhängigkeiten sind ~1,2 GB; das darf das Deployment der Präsentations-App (Abgabe 28./29.07.) nicht gefährden.
- **Haltbarkeit der gebauten Vorschau: ~30 Minuten**, dann Selbst-Aufräumen — gleiches Muster wie die bestehenden In-Memory-Stores der App (`repoStore.js`, `imageStore.js`, `pageStore.js`, TTL 15 Min, hier bewusst etwas großzügiger, da ein Build mehr wiegt als ein reiner Datenhalter).
- **Kein zusätzlicher Kostenfaktor bei der KI:** Die teure KI-Interpretation ist zu diesem Zeitpunkt bereits gelaufen; der Storybook-Build nutzt nur die fertigen Daten.

## Spike-Ergebnisse (bereits durchgeführt, siehe Konversation)

1. **Build-Kosten:** `npm run build-storybook` im Harness-Ordner: **~5s Laufzeit**, ~730 MB Spitzenspeicher, Output 25 MB / 155 Dateien. Unkritisch für einen On-Demand-Build pro Anfrage.
2. **`node_modules` per Symlink statt Kopie:** Ein isoliertes Arbeitsverzeichnis mit `node_modules` als Symlink auf das gemeinsame, einmal installierte Verzeichnis baut genauso zuverlässig (~4,7s) — kein 1,2-GB-Kopiervorgang pro Anfrage nötig.
3. **Subpath-Serving funktioniert:** Ein Storybook-Build, unter einem Unterordner (`/storybook-preview/<id>/`) statt an der Domain-Wurzel ausgeliefert, lädt alle Assets korrekt relativ (`./assets/...`), `index.json` lädt relativ zum aktuellen Pfad. Im echten Browser verifiziert: keine Konsolenfehler, keine 404s, Sidebar/Navigation funktioniert.

## Architektur

```
Testperson                    UIPrism-App (bestehend)         Storybook-Builder (neu)
   │                                │                                │
   │  1. Screenshot importieren    │                                │
   │ ─────────────────────────────>│  (unverändert, wie heute)      │
   │                                │                                │
   │  2. Klick "In Storybook       │                                │
   │     öffnen" (Export-Seite)    │                                │
   │ ─────────────────────────────>│  3. POST /build                │
   │                                │     { components, stories }   │
   │                                │ ──────────────────────────────>│
   │                                │                                │  4. Arbeitsverz. anlegen,
   │                                │                                │     Scaffold dazulegen,
   │                                │                                │     storybook build (~5s)
   │                                │  5. { url }                    │
   │                                │<────────────────────────────── │
   │  6. neuer Tab öffnet url      │                                │
   │<───────────────────────────── │                                │
   │                                │                                │
   │  7. sieht eigenes Storybook   │                                │
   │     (GET /preview/<id>/*)     │                                │
   │ ──────────────────────────────────────────────────────────────>│
                                                                      │  8. nach 30 Min: Verzeichnis
                                                                      │     selbst löschen
```

Zwei unabhängige Railway-Services:
- **Bestehend:** `web/` + `server/` (Express, Port aus `PORT`) — **unverändert**, außer einem neuen Button auf der Export-Seite und einer Env-Var mit der URL des neuen Dienstes.
- **Neu:** `storybook-harness/` als eigener Service — eigenes `server.js`, eigener Port, eigene `node_modules`.

## Komponenten

### `storybook-harness/server.js` (neu)

Kleiner Express-Server (das Harness hat `express` noch nicht als Abhängigkeit — wird ergänzt):

- `POST /build`
  Body: `{ components: { "Name.jsx": "<code>", ... }, stories: { "Name.stories.jsx": "<code>", ... } }` — exakt die Shape, die `storybookFiles(result)` in `web/src/lib/emit/buildStorybookZip.js:39-50` heute schon für `components/*` und `stories/*` erzeugt (nur diese zwei Ordner werden gebraucht, nicht `.storybook/main.js` oder `README-storybook.md` aus dem ZIP — die Harness-eigene Konfiguration gewinnt, wie `ingest.mjs` es heute schon macht).
  Antwort bei Erfolg: `{ id, url, expiresAt }` (HTTP 200).
  Antwort bei Fehler: `{ error: "<ehrliche deutsche Meldung>" }` (HTTP 500).

- `GET /preview/:id/*`
  Liefert das gebaute Verzeichnis aus (`express.static`, gemountet unter `/preview/:id`). 404 mit freundlicher Meldung, falls `id` unbekannt oder abgelaufen.

- `GET /health`
  Wie `server/lib/healthInfo.js` im Hauptprojekt — einfacher Uptime-Check, den Railway für den Service nutzen kann.

### `storybook-harness/lib/buildPreview.js` (neu)

Die Bau-Logik, isoliert testbar:

1. `id = crypto.randomBytes(8).toString('hex')` (gleiches Muster wie `repoStore.js:9`)
2. Arbeitsverzeichnis `os.tmpdir()/storybook-preview/<id>/` anlegen
3. Schreiben: `components/*.jsx`, `stories/*.jsx` aus dem Request-Body
4. Scaffold dazulegen (kopieren, nicht symlinken — diese sind klein): `package.json`, `globals.css`, `tailwind.config.js`, `postcss.config.js`, `.storybook/`, `components/ui/*` (die 8 shadcn-Stubs — Quelle ist das bereits im Repo versionierte `storybook-harness/components/ui/`, kein erneutes `sync-shadcn` pro Anfrage nötig)
5. Symlink `node_modules` → das einmal installierte `storybook-harness/node_modules` (Spike-bewiesen, spart 1,2 GB pro Anfrage)
6. `child_process.execFile('npx', ['storybook', 'build'], { cwd: workdir, timeout: 60_000 })`
7. Bei Erfolg: `id` + Ablaufzeitpunkt in einer In-Memory-Map vermerken (gleiches TTL-Muster wie `repoStore.js:6-16`, `ttlMs = 30 * 60 * 1000`), `setTimeout` löscht Verzeichnis (`fs.rm(recursive:true)`) nach Ablauf.
8. Bei Fehlschlag (Timeout oder Build-Fehler): Arbeitsverzeichnis sofort löschen, Fehler nach oben werfen.

Wichtig: **kein Kopieren der 17 Beispiel-Komponenten aus dem Fixture** — die Testperson bekommt ausschließlich ihre eigenen, gerade interpretierten Bausteine.

### `web/src/pages/Export.jsx` (Änderung)

- Neuer Button **„In Storybook öffnen"**, sichtbar neben dem bestehenden „Nach Storybook exportieren"-Download.
- Klick: `fetch(\`${STORYBOOK_BUILDER_URL}/build\`, { method: 'POST', body: JSON.stringify(storybookFiles(result)) })` — der Aufruf zur bestehenden `storybookFiles`-Funktion bleibt unverändert, nur das Ziel ist jetzt ein HTTP-Request statt eines ZIP-Downloads.
- Ladezustand während des Requests (die paar Sekunden Bauzeit dürfen nicht wie ein Hänger wirken): Spinner + Text „Storybook wird gebaut …".
- Erfolg: `window.open(url, '_blank')`.
- Fehler: Inline-Meldung „Storybook konnte nicht gebaut werden — bitte nochmal versuchen." (kein Stacktrace, Muster aus bestehenden Fehlermeldungen der App übernehmen).
- Neue Env-Var `VITE_STORYBOOK_BUILDER_URL` (Build-Zeit, wie andere `VITE_*`-Envs im Projekt).

## Fehlerbehandlung

| Fall | Verhalten |
|---|---|
| KI-Interpretation erzeugt fehlerhaften Code (bekanntes, seltenes Modell-Flackern) → Build schlägt fehl | `buildPreview` fängt den `execFile`-Fehler, räumt auf, gibt Fehler zurück; Export-Seite zeigt ehrliche deutsche Meldung, kein Absturz |
| Build dauert zu lange | `timeout: 60_000` bei `execFile` — sollte bei ~5s Normalfall nie greifen, ist ein Schutz gegen hängende Prozesse |
| Zwei Anfragen gleichzeitig | Jede bekommt eigene `id` / eigenes Arbeitsverzeichnis — keine Kollision |
| Anfrage auf abgelaufene/unbekannte `id` | `GET /preview/:id/*` antwortet 404 mit Klartext-Meldung |
| Storybook-Builder-Service down/unreachable | `fetch` schlägt fehl → Export-Seite zeigt Fehler, Rest der App bleibt unberührt (kein harter Fehler in `web/`/`server/`) |

## Sicherheit / CORS

- Der neue Dienst braucht CORS-Freigabe für die Origin der Haupt-App (`https://designbridge-production.up.railway.app` + lokale Dev-Origins), analog zu `server/index.js` (nutzt bereits `cors`).
- Kein Auth nötig — die `id` ist zufällig (8 Byte) und läuft nach 30 Min ab; das Risiko ist vergleichbar mit den bestehenden In-Memory-Stores der Haupt-App.

## Testing

- **Unit:** `buildPreview.js` mit einer kleinen, festen Fixture (2-3 Komponenten) — prüft: Verzeichnis entsteht, Build läuft durch, `url` zeigt auf existierende Datei, Cleanup nach TTL entfernt das Verzeichnis (TTL in Tests künstlich verkürzen, wie es bestehende Store-Tests im Projekt schon tun, falls vorhanden — sonst neu anlegen nach demselben Muster wie `repoStore.js`-Tests).
- **Integration (manuell, vor Live-Gang):** lokal beide Dienste starten, echten Request mit den Daten des Prod-Fixture-Scans schicken, Ergebnis-URL im Browser öffnen, auf Fehler in Konsole/Netzwerk prüfen (wie im Spike bereits vorgeführt).
- **Fehlerfall bewusst testen:** Request mit absichtlich kaputtem JSX schicken, prüfen dass die Fehlermeldung ankommt statt eines Serverabsturzes.

## Deployment

1. **Railway-Dashboard (Rob, manueller Schritt):** neuen Service anlegen, Root-Verzeichnis `storybook-harness/`, Start-Command `node server.js`, Port über `process.env.PORT`.
2. Env-Var `VITE_STORYBOOK_BUILDER_URL` im bestehenden Web-Service auf die neue Service-URL setzen.
3. Bestehendes Deployment (`web/`+`server/`) bleibt in Build-Command/Abhängigkeiten unverändert — kein zusätzliches Risiko für die Präsentations-App.

## Out of Scope (bewusst nicht Teil dieser Umsetzung)

- Die Reparatur des herunterladbaren ZIPs (fehlende `package.json`, Stubs, `@`-Alias) für den Entwickler-Anwendungsfall — bleibt ein separates, kleineres Ticket, falls später gebraucht.
- Dauerhaftes Hosting einzelner Vorschauen über 30 Min hinaus (z. B. zum Teilen mit einem Entwickler „morgen") — würde persistenten Speicher brauchen, aktuell nicht gefordert.
- Eine In-App-Nachbildung einer Storybook-artigen Ansicht — bewusst verworfen (siehe Entscheidungen oben).
