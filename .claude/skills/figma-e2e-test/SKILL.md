---
name: figma-e2e-test
description: Autonomer Figma-E2E-Testlauf für DesignBridge — Payload auf Prod legen, Figma Desktop per AppleScript fernsteuern (neue Datei, Dev-Plugin starten, Import klicken), Ergebnis per Figma-MCP verifizieren. Rob muss NICHTS klicken. Erstmals erfolgreich: test12, 18.07.2026.
---

# Autonomer Figma-E2E-Test (DesignBridge)

Kompletter Import-Beweis-Test ohne Robs Zutun. Erstmals erfolgreich gefahren als **test12**
(Session 18.07.2026 nachts, Datei `iSMO0AzME4GIEkntYut1kf`).

## Voraussetzungen (einmalig, bereits erledigt 18.07.2026)

1. **Bedienungshilfen-Freigabe** für „Claude" (macOS Systemeinstellungen → Datenschutz &
   Sicherheit → Bedienungshilfen). Ohne sie: osascript-Fehler `-1719`.
2. **Figma Desktop läuft** (Prozessname `Figma`, deutsche Menüs!).
3. Dev-Plugin „DesignBridge" ist in Figma geladen (Plugins → Entwicklung).
4. ⚠️ `screencapture` hat KEINE Freigabe (Bildschirmaufnahme) — nicht verwenden;
   alles läuft über den Accessibility-Baum.

## Ablauf

### Schritt 1 — Payload mit aktuellem Code erzeugen (nur wenn Code geändert wurde)

Der Emit läuft im Browser. Frisches Result durch die lokale App jagen:

1. `preview_start` mit Config `designbridge` (startet Server :3047 + Vite :5173;
   Root-launch.json des Workspace, NICHT die Projekt-launch.json).
2. Fertiges Result-JSON (raw + interpretations, Shape: `designbridge.lastImport`)
   nach `web/public/inject-result.json` kopieren (Ordner ggf. anlegen; DANACH wieder
   löschen — nie committen!). Vorlage/Bauweise: Prod-Scan + Interpret per curl
   (`/api/scan/image`, `/api/interpret/components`), dann
   `{source:'image', mocked:false, warnings:[], categories:[], raw, interpretations}`.
   Ein fertiges Exemplar liegt ggf. noch im Session-Scratchpad (`inject-result.json`).
3. Im Browser-Tab: `fetch('/inject-result.json')` → in `localStorage['designbridge.lastImport']`
   + `designbridge.hasImported='1'` → `location.reload()`.
4. Export-Tab öffnen (Sidebar-Eintrag „Export"; refs über `read_page filter:all` holen,
   Koordinaten-Klicks sind bei kleinem Viewport unzuverlässig) → **„An Figma senden"**.
5. Payload holen: `curl -s localhost:3047/api/figma-export/latest > payload.json`,
   prüfen (composed-spliced-Eltern, Instanz-Zahl), dann **auf Prod legen**:
   `curl -X POST https://designbridge-production.up.railway.app/api/figma-export
    -H 'Content-Type: application/json' --data-binary @payload.json` → `{"ok":true,…}`.
   (Das Plugin holt IMMER zuerst von der Railway-URL.)
6. Preview stoppen, `web/public/inject-result.json` löschen.

### Schritt 2 — Figma Desktop fernsteuern

Alles per `osascript` (Bash). Menünamen sind DEUTSCH.

```applescript
-- 2a. Neue leere Datei (aktiver Tab wird "Ohne Namen")
tell application "System Events" to tell process "Figma"
  set frontmost to true
  keystroke "n" using {command down}
end tell
```

```applescript
-- 2b. Dev-Plugin starten
tell application "System Events" to tell process "Figma"
  set frontmost to true
  click menu bar item "Plugins" of menu bar 1
  delay 0.4
  click menu item "Entwicklung" of menu 1 of menu bar item "Plugins" of menu bar 1
  delay 0.4
  click menu item "DesignBridge" of menu 1 of menu item "Entwicklung" of menu 1 of menu bar item "Plugins" of menu bar 1
end tell
```

```applescript
-- 2c. WICHTIG: Electron-Web-Inhalt für Accessibility freischalten (sonst nur Fenster-Chrome sichtbar)
tell application "System Events" to tell process "Figma"
  set value of attribute "AXManualAccessibility" to true
end tell
```

```applescript
-- 2d. Import-Knopf klicken: Breitensuche über den UI-Baum nach AXButton mit
--     title "Aus DesignBridge übernehmen", dann `click cur`.
--     (Queue-Muster: set queue to {front window}; repeat … every UI element of cur)
```

```applescript
-- 2e. Erfolg lesen: AXStaticText suchen, value contains "Fertig" →
--     z. B. "Fertig — 9 Farben neu, 4 Textstile neu, 20 Bausteine neu (…)"
--     ~12 s nach dem Klick warten (Netz + Aufbau).
```

### Schritt 3 — Datei-Link holen + per MCP verifizieren

```applescript
tell application "System Events" to tell process "Figma"
  set frontmost to true
  keystroke "l" using {command down}  -- Link kopieren
end tell
```
→ `pbpaste` liefert `https://www.figma.com/design/<KEY>/…`.

Dann Figma-MCP: `get_metadata` (Struktur: DB/Atoms…DB/Templates, Größen plausibel?)
+ `get_screenshot` der kritischen Knoten (Template, Sidebar, Charts) und visuell prüfen.

## Prüfliste (Stand test12)

- Sektionen `DB/Atoms`/`Molecules`/`Organisms`/`Templates` korrekt befüllt
- Template = `composed-spliced`: volles Layout + ◇-Instanzen an Kind-Positionen
- Karten mit echtem Inhalt (kein „Card-Titel"-Stub, keine 239×66-Zwerge)
- Sidebar: volle Nav-Liste, KEINE Doppelungen (test-11-Befund B)
- Kein Rechts-Crop des Templates (test-11-Befund A; Rest-Issue s. u.)

## Bekannte Fallen

- **Flex-shrink-Falle:** synthetisches Overflow-Repro-HTML braucht `flex:0 0 <px>`,
  sonst shrinken die Kinder und `scrollWidth` bleibt = Containerbreite.
- Browser-Pane-Klicks: refs nach jedem Reload NEU per `read_page` holen.
- Menü offen? `key code 53` (Escape) räumt auf.
- Fenstertitel „Ohne Namen" = unbenannte Datei; Rob benennt Testdateien später um.

## Offene Rest-Issues nach test12 (nächste Fixes)

1. Gesplicte Instanzen bringen Eigenbreite mit → rechte Spalte kann über den
   Template-Rand ragen (Fix: Instanz per absolute auf ihr gemessenes Element-Rect
   dimensionieren — `applyAbsolute` resized Instanzen bereits, splice-Branch muss
   das Rect nur mitgeben).
2. SVG (Trend-Linie) skaliert im Template nicht mit (dokumentierte Grenze).
3. Titel/Wert-Abstände (Top Emissions) feinjustieren.
