# DesignBridge-Plugin gegen die Live-App testen

Seit diesem Update holt das Plugin den Export primär von der Live-App
(`https://designbridge-production.up.railway.app`). Nur wenn die Live-App
nicht erreichbar ist (Netzwerkfehler, nicht bei „noch kein Export" / 404),
fällt es automatisch auf den lokalen Dev-Server (`localhost:3047`) zurück.
Es gibt keine Einstellungs-UI — die Reihenfolge ist fest im Code hinterlegt.

## 1. Plugin bauen

```bash
cd designbridge-plugin
npm run build
```

Das erzeugt `dist/main.js` und `dist/ui.html` (Skript ist dort bereits
inline eingebettet).

## 2. Plugin in Figma Desktop laden

1. Figma Desktop App öffnen (nicht die Web-Version — lokale Manifeste gehen
   nur über die Desktop-App).
2. Ein beliebiges Figma-Design-File öffnen.
3. Menü: **Plugins → Development → Import plugin from manifest…**
4. Zur Datei `designbridge-plugin/manifest.json` in diesem Repo navigieren
   und auswählen.
5. Das Plugin taucht danach unter **Plugins → Development → DesignBridge**
   auf.

Falls das Plugin schon einmal importiert wurde: einfach erneut über
**Plugins → Development → DesignBridge** öffnen — nach jedem `npm run build`
lädt Figma die neue `dist/`-Version.

## 3. Rundlauf testen (Live-App → Figma)

1. In der **Live-App** (`https://designbridge-production.up.railway.app`)
   einen Import machen und über den Export-Bereich einen Figma-Export
   erzeugen (Knopf „An Figma senden" / vergleichbar).
2. In **Figma** das DesignBridge-Plugin öffnen (siehe Schritt 2).
3. Im Plugin-Panel auf **„Aus DesignBridge übernehmen"** klicken
   (der Fetch-Button neben dem Import-Textfeld).
4. Erwartetes Verhalten:
   - Status zeigt kurz „Hole Export aus DesignBridge…", dann
     „Schreibe nach Figma…", danach eine Zusammenfassung
     (z. B. „Fertig — X Farben neu, Y Textstile neu…").
   - Die aus der Live-App exportierten Farben/Textstile/Komponenten
     erscheinen im Figma-File.

## 4. Fallback auf lokal testen (optional)

1. Lokalen Server starten: `npm run dev` im Projekt-Root (Server läuft auf
   `:3047`).
2. In der lokalen Web-App (`localhost:5173` bzw. wie im Root-`README.md`
   beschrieben) einen Export erzeugen.
3. Live-App-Domain kurz unerreichbar machen (z. B. WLAN aus) — oder einfach
   davon ausgehen, dass der Fallback nur bei echten Netzwerkfehlern greift,
   nicht bei einem simplen 404 der Live-App.
4. Im Plugin wieder auf „Aus DesignBridge übernehmen" klicken — bei
   Netzwerkfehler auf der Live-Domain wird automatisch `localhost:3047`
   versucht.

## Fehlerbilder

| Meldung im Plugin | Bedeutung |
|---|---|
| „Noch kein Export — in DesignBridge zuerst „An Figma senden" klicken." | Live-App (oder Fallback) erreichbar, aber noch kein Export vorhanden (404). |
| „DesignBridge-Server antwortete mit &lt;Code&gt;." | Server erreichbar, aber Fehlerstatus ungleich 404. |
| „DesignBridge nicht erreichbar — weder live noch lokal (läuft „npm run dev"?)." | Weder Live-App noch `localhost:3047` sind per Netzwerk erreichbar. |
