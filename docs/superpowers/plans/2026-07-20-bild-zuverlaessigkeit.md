# Bild-Import-Zuverlässigkeit — Befund 2 + 3 aus dem Breiten-Test

Quelle: `docs/2026-07-20-breiten-test-eingabetypen-ergebnis.md`
Scope: nur `server/` — `web/` und `designbridge-plugin/` unangetastet, nichts gepusht.

## Befund 2 — große Screenshots brechen den Scan (2880px → abgeschnitten/500)

Neue reine Funktion `server/lib/imageResize.js` → `downscaleForVision(buffer, mime, { maxEdge = 1500 })`:
- Liest den Buffer mit Jimp (schon Dependency, wie `imageDims.js`).
- Langkante ≤ `maxEdge` → Original unverändert durchreichen (`resized:false`, kein Re-Encode).
- Langkante > `maxEdge` → proportional auf `maxEdge` skalieren, als PNG (oder JPEG bei `image/jpeg`-Input) neu encodieren.
- Kann Jimp den Buffer nicht lesen (WebP — Jimp 0.22 kann kein WebP; oder generell kaputter Buffer) → try/catch, Original unverändert zurück. Der Scan darf daran nie scheitern.

`analyzeScreenshot` (`server/lib/claude.js`) schickt den Buffer nach `fs.readFileSync` durch `downscaleForVision`, bevor die base64-Kodierung für die Vision-API gebaut wird. Rein in-memory — die Datei auf Platte wird nicht angefasst, `scan.js` liest `image_width`/`image_height` weiterhin separat aus der Originaldatei für die Komposition (bboxes sind Brüche 0..1, bleiben korrekt). `maxEdge` ist über die Options an `analyzeScreenshot` injizierbar (Default 1500).

## Befund 3 — Bild-Scan nicht-deterministisch (~50% JSON-Parse-Fehler bei komplexen Dashboards)

`analyzeScreenshot` fasst den Block `c.messages.create(...)` → `extractJson(text)` in eine Retry-Schleife:
- Bis zu `maxRetries` Versuche (Default 3).
- Schlägt die Extraktion fehl (inkl. `stop_reason === 'max_tokens'`) → Backoff (`400ms * 2^attempt`, injizierbare `sleep`-Funktion) und erneuter Call.
- Nach erschöpften Versuchen werden die bestehenden ehrlichen deutschen Fehlermeldungen geworfen (max_tokens-Sonderfall bleibt eigenständig; sonst "…kein gültiges JSON…").
- Provider-Fehler aus `c.messages.create` selbst (API/Netz/Quota, insb. `err.isDailyQuota`) werden NICHT gefangen und laufen sofort ungebremst durch — kein Retry, der Fast-Fail bei Tages-Quota (429) in `scan.js` bleibt unverändert.

Signatur backward-compatible erweitert:
`analyzeScreenshot(imagePath, mimeType, extractTargets, { client, maxRetries, sleep, maxEdge } = {})`.

## Geänderte/neue Dateien

- `server/lib/imageResize.js` — neu, `downscaleForVision`.
- `server/lib/imageResize.test.js` — neu, 5 Tests (groß/klein/Default-maxEdge/unlesbarer Buffer/Hochkant).
- `server/lib/claude.js` — Import von `downscaleForVision`, Retry-Schleife + Backoff, Downscale-Aufruf vor dem Vision-Call.
- `server/lib/claude.test.js` — 5 neue Tests: Retry-Erfolg beim 2. Versuch, Retry-Erschöpfung wirft bestehende Meldung, `isDailyQuota` wird sofort durchgereicht (kein Retry), großes Bild wird downgescaled gesendet, kleines Bild bleibt unangetastet.

## Tests

- Vorher: 279 (server-seitig, `npm run test:server`), alle grün.
- Nachher: 289, alle grün (10 neue: 5 `imageResize.test.js` + 5 `claude.test.js`).
- Bestehende `claude.test.js`-Tests bleiben grün — die beiden Tests für "abgeschnitten (max_tokens)" und "ungültiges JSON" laufen jetzt real 3× durch die Retry-Schleife (kein `sleep` injiziert), macht die Suite ca. 2.4s langsamer, ändert aber nichts an den Assertions/Ergebnissen.

## Abweichungen von der Vorgabe

Keine wesentlichen. Kleinere Entscheidungen, die die Vorgabe offenließ:
- Backoff-Formel `400ms * 2^attempt` (400, 800, 1600, …) statt fixer Liste — erfüllt "z.B. 400ms, 800ms" für die ersten beiden Wartezeiten.
- `console.error`-Diagnose loggt bei jedem fehlgeschlagenen Versuch (nicht nur beim letzten) — hilft beim Debuggen tatsächlicher Retries, ändert aber keine Fehlermeldungen an den Aufrufer.
- Output-Mime-Wahl beim Re-Encode: `image/jpeg` bleibt JPEG, alles andere (inkl. WebP-Input, das aber ohnehin nie erfolgreich decodiert wird) wird als PNG re-encodiert.

Nicht angefasst: `web/`, `designbridge-plugin/`. Kein `git push`, keine Commits erstellt (nicht angefragt).
