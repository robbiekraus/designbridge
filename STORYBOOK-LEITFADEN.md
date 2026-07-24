# Storybook-Leitfaden — für Rob zum Selbst-Durchspielen

Diese Datei ist der **Schritt-für-Schritt-Fahrplan** für das Storybook-Harness (`storybook-harness/`).
Für die technische Referenz (wie es intern funktioniert, Grenzen) siehe
`storybook-harness/README.md` — hier geht's nur ums **Tun**.

## Was das überhaupt ist

Ein Scan in UIPrism liefert heute ein ZIP zum Mitnehmen ("Nach Storybook exportieren"). Dieses
Harness ist der **Beweis, dass ein Entwickler dieses ZIP nimmt und es läuft wirklich** — ein
kleines, eigenständiges Storybook, das die gescannten Bausteine visuell zeigt.

## Voraussetzungen — was du wirklich brauchst

**Kein Login, kein Account, nichts anzumelden.** Das Harness läuft komplett lokal auf deinem Rechner.

- **Node.js** — hast du schon (Projekt braucht ≥ 20, bei dir läuft v24). Nichts extra installieren.
- **Einmalig `npm install` im Harness-Ordner** (Storybook 8 + Vite + Tailwind + React — alles Dev-Zeug,
  landet NUR in `storybook-harness/node_modules`, rührt `web/` oder `server/` nicht an):
  ```bash
  cd storybook-harness
  npm install
  npm run sync-shadcn
  ```
  `sync-shadcn` kopiert die 8 shadcn-Stubs (Button, Input, Card, …) einmalig rein. Musst du nur
  neu laufen lassen, falls sich `web/verification/shadcn-target/` mal ändert.
- **"shadcn/Tailwind" — musst du NICHTS separat installieren.** Das ist kein externes Tool, das du
  einrichten müsstest — die Storybook-Harness bringt ihr eigenes, kleines Tailwind-Setup +
  API-kompatible shadcn-Stub-Komponenten schon mit (liegen als Dateien im Ordner). `npm install`
  oben zieht alles, was dafür nötig ist.
- **Nichts muss vorher laufen.** Kein Server, kein `npm run dev`, keine offenen Tabs. Jeder der drei
  Wege unten startet seinen eigenen Storybook-Dev-Server auf Port 6006.

## Die drei Wege

### Weg 1 — Eingefrorener echter Scan (der schnellste, garantiert funktionierende)

Schon fertig eingefroren (`storybook-harness/fixtures/prod-export.zip`, aus einem echten
Prod-Scan). Einfach:

```bash
cd storybook-harness
npm run storybook:demo:prod
```

Browser (`http://localhost:6006`) zeigt die echten gescannten Bausteine, gruppiert nach
Atoms/Molecules/Organisms/Templates.

### Weg 2 — Synthetische Demo (kein Scan nötig, immer verfügbar)

```bash
cd storybook-harness
npm run storybook:demo
```

Nutzt eine mitgelieferte, deterministische Beispiel-Fixture (Login-Formular). Guter Fallback,
falls du offline bist oder kein frisches Prod-Ergebnis zur Hand hast.

### Weg 3 — Dein eigener frischer Scan (der "Recording"-Weg)

1. Auf **https://designbridge-production.up.railway.app** einen Screenshot importieren (Bild-Tab).
2. Warten, bis die KI-Interpretation durchgelaufen ist (Bausteine zeigen Confidence-Pillen).
3. Zur **Export**-Seite → **"Nach Storybook exportieren"** klicken → `designbridge-storybook.zip`
   landet in deinem Downloads-Ordner.
4. Im Terminal:
   ```bash
   cd storybook-harness
   npm run storybook:ingest -- ~/Downloads/designbridge-storybook.zip
   npm run storybook
   ```
5. Browser öffnet `http://localhost:6006` — deine eigenen Bausteine, live gerendert.

**Willst du den eingefrorenen Prod-Fixture selbst neu erzeugen** (z. B. mit einem anderen
Screenshot)? Dafür gibt's ein Script, das Schritt 1–3 oben ersetzt (kein Browser-Klicken nötig):

```bash
cd web
node verification/build-prod-storybook-fixture.mjs <pfad-zu-deinem-screenshot.png>
```

Schreibt direkt nach `storybook-harness/fixtures/prod-export.zip`. Danach `cd ../storybook-harness
&& npm run storybook:demo:prod` wie in Weg 1.

## Wenn etwas hakt

- **Port 6006 schon belegt** — ein alter Storybook-Prozess läuft noch: `pkill -f "storybook dev"`.
- **AppleDouble-Dateien (`._*`)** — auf diesem Volume können sie Tools verwirren. Falls ein Build
  komisch abbricht: `find . -name '._*' -delete` im Projektordner.
- **Ein Baustein zeigt nur einen generischen Platzhalter statt seines echten Looks** — das ist der
  eingebaute Fallback (die KI hat bei diesem einen Baustein zweimal ungültiges JSON geliefert,
  bekanntes gelegentliches Modell-Flackern, betrifft nur einzelne Bausteine). Kein Fehler bei dir,
  einfach nochmal scannen oder den Baustein ignorieren.
- **`fixtures/prod-export.zip` fehlt** (`storybook:demo:prod` meckert) — entweder Weg 3 durchlaufen
  oder das Script oben nutzen, um sie neu zu erzeugen.
