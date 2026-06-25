# URL-Ingester v1 — Design-Spec

**Datum:** 2026-06-25
**Phase:** 4 (echte Ingester) — erster Ingester von dreien
**Status:** Entwurf zur Review

## Ziel

Den URL-Mock im Import-Dialog durch einen **echten URL-Ingester** ersetzen: Der Nutzer gibt eine Website-URL ein, der Server lädt die Seite, liest deren CSS und extrahiert **Design-Tokens** (Farben, Typografie, Spacing, Border-Radius, Schatten). Das Ergebnis hat dieselbe Datenform wie der bestehende Bild-Scan, sodass die gesamte vorhandene Pipeline (Import-Vorschau, Dashboard, Tokens-Ansicht, Emitter, Export) ohne Änderung darauf greift.

**Leitstern:** *Der Designer muss sehen, was er bekommt.* Nicht nur der Wert, sondern auch dessen Herkunft (aus welcher CSS-Variable / Regel er stammt) wird angezeigt.

## Nicht-Ziele (v1)

- Komponenten-/Pattern-Erkennung aus dem DOM (Inventory bleibt leer).
- JS-gerenderte Seiten (kein Headless-Browser).
- Tailwind-Utility-Extraktion (`bg-[#...]`-Klassen).
- Claude-gestützte Extraktion / Fallback (kostet Credits, nicht-deterministisch).
- Anti-Bot-Umgehung, Auth-geschützte Seiten, Rate-Limit-Handling.
- Repo- und Figma-Ingester (eigene spätere Phasen).

## Architektur-Prinzip

Ein Ingester füllt das quell-neutrale kanonische Modell. Konkret heißt das: Der URL-Ingester produziert **exakt dieselbe Server-Shape** wie `analyzeScreenshot` (`server/lib/claude.js`):

```json
{
  "summary":   { "source_description": "...", "app_type": "...", "color_mode": "light", "design_style": "..." },
  "tokens":    { "colors": [...], "typography": [...], "spacing": [...], "border_radius": [...], "shadows": [...] },
  "atomics":   [],
  "components":[],
  "patterns":  [],
  "warnings":  [ "..." ],
  "meta":      { "model": "css-ingest", "source_url": "...", "elapsed_ms": 0 }
}
```

Damit greift der bestehende Client-Adapter `adaptImageScanResponse` (umbenannt/generalisiert zu `adaptScanResponse(raw, source)`) unverändert, und Dashboard/Tokens/Emitter funktionieren sofort.

### Token-Shape (mit Herkunft)

Jeder Token bekommt **zusätzlich** ein `source`-Feld (Herkunft). Die bestehenden Felder bleiben, damit alle Ansichten weiter funktionieren:

```json
// colors
{ "hex": "#022d2c", "role": "primary", "confidence": "high", "source": "--color-primary" }
// typography
{ "size": 16, "weight": "400", "role": "base", "sample": "Aa", "confidence": "high", "source": "--font-size-base" }
// spacing
{ "value": 16, "usage": "space-4", "confidence": "high", "source": "--space-4" }
// border_radius
{ "value": "8px", "usage": "md", "confidence": "high", "source": "--radius-md" }
// shadows
{ "description": "card", "css": "0 1px 3px rgba(0,0,0,.1)", "confidence": "high", "source": "--shadow-card" }
```

`source` ist immer ein lesbarer String: der Variablenname (`--color-primary`) bei benannten Tokens, oder die Fundstelle (`.cta { background: … }`) beim Deklarations-Fallback.

## Komponenten

### Server

**1. `server/lib/fetchSite.js` — Netzwerk-Schicht (isoliert, damit testbar mockbar).**
- `fetchSite(url)` → `{ css: string, baseUrl: string }`.
- Holt das HTML per `fetch` (Node 24 global).
- Extrahiert: `<style>`-Inhalte, Inline-`style`-Attribute (gesammelt), und `<link rel="stylesheet" href>`-URLs (relativ → absolut über `baseUrl` aufgelöst).
- Lädt verlinkte CSS-Dateien nach und konkateniert alles zu einem CSS-String.
- Fehlerfälle: Timeout (z. B. 10 s), nicht-2xx-Status, `text/html` fehlt → wirft mit klarer Meldung (vom Endpoint als 4xx/5xx + Klartext weitergereicht).

**2. `server/lib/cssIngest.js` — reine Kern-Logik (keine I/O, voll Unit-testbar).**
- `ingestCss(cssText, { sourceUrl }) → ServerShape` (siehe oben).
- Geparst mit **`postcss`** (robustes CSS-Parsing statt Regex).
- **Strategie „CSS-Variablen zuerst":** alle Custom-Properties (vorrangig aus `:root`) einsammeln und nach Präfix einsortieren:
  - `--color-*`, `--c-*`, `--brand-*` → colors
  - `--font-size-*`, `--text-*`, `--fs-*` → typography (size); `--font-weight-*` → weight, gepaart per Suffix
  - `--space-*`, `--spacing-*`, `--gap-*` → spacing
  - `--radius-*`, `--rounded-*`, `--br-*` → border_radius
  - `--shadow-*`, `--elevation-*` → shadows
  - `role`/`usage`/`description` = bereinigter Variablenname (Präfix entfernt), `confidence: "high"`, `source: "--<voller-name>"`.
- **Deklarations-Fallback** (für Seiten ohne Variablen): leichter Durchlauf über Regeln und Eigenschaften `color` / `background(-color)` / `font-size` / `box-shadow` / `border-radius`. Eindeutige Werte werden als Tokens mit `confidence: "low"`, `source: "<selector> { <prop>: … }"` aufgenommen. Dedupliziert gegen die Variablen-Tokens.
- Werte-Normalisierung: Hex/`rgb()`/`hsl()` → Hex (so weit trivial), `rem`→`px` (Basis 16), Whitespace getrimmt. Ungültige/leere Werte werden verworfen.
- `summary` knapp aus dem, was bekannt ist (`source_description: "Tokens aus CSS extrahiert"`, `color_mode` heuristisch hell/dunkel anhand Hintergrundfarbe falls erkennbar, sonst `"unknown"`).
- `warnings`: feste Hinweise, z. B. „Nur Tokens — Komponenten werden aus CSS nicht erkannt." und „Werte aus Deklarationen (niedrige Confidence) bitte prüfen." (nur wenn Fallback-Tokens vorkamen).

**3. Endpoint `POST /api/scan/url` (in `server/routes/scan.js`).**
- Body: `{ url: string }`. Validierung: `http(s)://`.
- Ruft `fetchSite(url)` → `ingestCss(css, { sourceUrl: url })`, setzt `meta.source_url`, antwortet mit der Server-Shape.
- Fehler → 4xx (ungültige URL) / 502 (Seite nicht erreichbar) / 500 (Parse-Fehler) mit Klartext-`error`.

**4. Demo-Seite.**
- Statische `demo-site/index.html` + CSS mit echten Custom-Properties (fiktive „ACME"-Landingpage: Palette, Typo-Skala, Spacing, Radius, Schatten + sichtbare Button/Card/Badge).
- Vom Express-Server unter **`GET /demo`** als statisches Verzeichnis ausgeliefert (`express.static`).
- Dient gleichzeitig als Grundlage für den Endpoint-Integrationstest. Scannbar über `http://localhost:3047/demo`.

### Client

**5. `web/src/lib/scanResultAdapter.js`.**
- `adaptImageScanResponse` → generalisieren zu `adaptScanResponse(raw, source = 'image')`; bestehende Funktion als dünner Alias erhalten, damit Bild-Pfad/Tests unverändert bleiben. `mocked: false`, `source` durchgereicht.

**6. `web/src/lib/useImportSession.js`.**
- Neue `submitUrl(url)`: `POST /api/scan/url` → `adaptScanResponse(data, 'url')`.
- Die `source === 'url'`-Zeile ruft `submitUrl` statt `mockUrlImport`.
- `repo` bleibt vorerst Mock (eigene spätere Phase).

**7. `web/src/components/ImportModal/tabs/UrlTab.jsx`.**
- „mocked"-Hinweis entfernen.
- Kleiner Button **„Demo-Seite verwenden"**, der das Eingabefeld mit `http://localhost:3047/demo` vorbefüllt.

**8. Token-Herkunft in der Anzeige.**
- In den Token-Kacheln (`web/src/components/library/tokenViews.jsx`) pro Token eine kleine zweite Zeile: `↳ aus <source>` (monospace, gedämpft), nur wenn `source` vorhanden.
- Greift für alle Quellen — bei Bild-Scan-Tokens ist `source` schlicht nicht gesetzt, also keine Zeile. Keine Regression.

## Datenfluss (Ende zu Ende)

```
UrlTab (URL eingeben / „Demo-Seite verwenden")
  → useImportSession.submit({source:'url', payload:{url}})
    → POST /api/scan/url
        → fetchSite(url)            (HTML + verlinktes CSS holen)
        → ingestCss(css, {sourceUrl}) (postcss parsen → Tokens + source)
        → Server-Shape JSON
    → adaptScanResponse(data, 'url')  → {source:'url', categories, raw}
  → ImportSuccess zeigt Kategorien + Anzahl + Confidence (Vorschau)
  → „Open Library" → Dashboard/Tokens zeigen Werte + Herkunft
```

## Testing (TDD)

- **`cssIngest.js`** — Kern, viele Pure-Unit-Tests: Variablen je Kategorie, Präfix-Varianten, `rem→px`, `rgb→hex`, Schatten, Deklarations-Fallback, Dedup gegen Variablen, ungültige Werte, leeres CSS, `source`-Feld korrekt gesetzt.
- **`fetchSite.js`** — `fetch` gemockt: `<link>`-Auflösung (relativ/absolut), `<style>`-Sammlung, Inline-Styles, Fehlerstatus, fehlendes CSS.
- **Endpoint** — Integrationstest gegen die ausgelieferte Demo-Seite (oder gemockten `fetchSite`): liefert erwartete Token-Anzahlen + 200.
- **Adapter** — `adaptScanResponse(raw,'url')` setzt `source`/`mocked` korrekt; Alias-Verhalten für Bild unverändert.
- **tokenViews** — Herkunfts-Zeile erscheint mit `source`, fehlt ohne.
- **Browser-Smoke** (Abschluss): Server starten, im Import-Dialog „Demo-Seite verwenden" → Import → Dashboard + Tokens zeigen Farben/Typo/Spacing/Radius/Schatten mit „↳ aus --…"-Herkunft, keine Konsolenfehler.

## Neue Abhängigkeit

- **`postcss`** als Root-(Server-)Dependency. Begründung: robustes CSS-Parsing; Regex auf CSS ist fehleranfällig. Bereits im Projekt vorhanden (in `web/` via Tailwind), also vertraut. Node 24 liefert `fetch` eingebaut — keine HTTP-Lib nötig.

## Offene Punkte für die Review

- Präfix-Liste der erkannten Variablennamen — pragmatisch gewählt, in den Tests fixierbar/erweiterbar.
- Confidence-Stufung (benannte Variable = high, Deklaration = low) — bewusst grob.
