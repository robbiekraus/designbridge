# Export-Storybook-Flow: Code-Review-Findings

Quelle: Code-Review der Commits `1f125c5` und `c7b3676`. Fokus `web/src/pages/Export.jsx` und `Export.test.jsx`. Stand: 946 Tests grün, der neue Fehlerpfad ist ungetestet. GitHub-Issue: #3.

## Aufgaben

- [ ] **Doppelte Fehlermeldung bei HTTP 500** (`Export.jsx` ~Z. 256): Präfix „Storybook konnte nicht gebaut werden“ steht doppelt, wenn der Builder dieselbe Meldung in `body.error` liefert (`BUILD_FAILED_MESSAGE` in `storybook-harness/server.js:10`). Fix: Präfix nur setzen, wenn keine Builder-Meldung kommt. Aufwand klein.
- [ ] **Stale State nach Import-Wechsel** (`Export.jsx` ~Z. 60): `storybookUrl` und `storybookError` bleiben stehen, wenn sich `result` ändert. Fix: `key` an `<Export>` koppeln oder Reset per `useEffect([result])`. Aufwand klein.
- [ ] **Vorschau-Ablauf** (`Export.jsx` ~Z. 172): Builder liefert `expiresAt` (TTL 30 min, `storybook-harness/lib/buildPreview.js:17`), der Code verwirft es. Link führt nach Ablauf zu 404. Fix: `expiresAt` speichern, Link danach ausblenden. Aufwand klein.
- [ ] **Fehlertexte deutsch und robust** (`Export.jsx` ~Z. 179): `TypeError` zeigt „Failed to fetch“ bzw. „NetworkError…“. Fix: eigener deutscher Text; `body.error` nur als String übernehmen. Aufwand klein.
- [ ] **Tests ergänzen** (`Export.test.jsx`): (a) Link erscheint nach Build, (b) HTTP 500 mit `body.error`, (c) Fehler bleibt stehen, (d) Netzwerkfehler mit deutschem Text, (e) Link nach Import-Wechsel zurückgesetzt. Aufwand mittel.
- [ ] **[Optional] State zusammenführen**: die drei `useState` (`storybookPreview`, `storybookUrl`, `storybookError`) durch ein Objekt `{status, url, error}` ersetzen. Eigener Eingriff, nur nach Freigabe.
- [ ] **[Optional] Doppelberechnung und Kommentare**: `storybookFiles(result)` läuft im `useMemo` (~Z. 47) und beim Klick (~Z. 136) erneut. Veraltete Kommentare kürzen (4-s-Timeout, Vorfall-Datum in Z. 181 und 236–243). Begründung gehört in die Commit-Message.

## Reihenfolge

Aufgaben 1–5 zusammen in einem Lauf, danach `npm test` in `web/`.
