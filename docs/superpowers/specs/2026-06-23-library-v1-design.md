# Spec: Library v1 — „letzter Import" ansehen (2026-06-23)

## Ziel

Den heute deaktivierten **„Open Library"**-Button lebendig machen: Nach einem Import
kann man das **zuletzt importierte Ergebnis** in einer vollwertigen Library-Ansicht
durchsehen. Tokens werden voll visuell dargestellt; Atomics/Components/Patterns
vorerst als Textkarten.

## Produkt-Richtung (Kontext, nicht Teil von v1)

Der langfristige Sinn von Designbridge: Screenshot → Interpretation der
Komponenten/Patterns → **Nachbau in Tailwind / shadcn / beliebigem Designsystem**.
Die Inventar-Darstellung soll später eine *aus Tokens rekonstruierte, exportierbare
Interpretation* werden (= „Weg 2"), **nicht** ein Pixel-Ausschnitt aus dem Screenshot
(„Weg 1" ist verworfen). v1 legt nur das Gerüst; der Token-Nachbau ist die nächste Stufe.

## Umfang v1

**Drin:**
- Library zeigt **das letzte Import-Ergebnis**, persistiert in `localStorage`
  (überlebt Reload; sammelt noch **keine** Historie).
- **Layout B**: getrennte Seiten über die bestehende Topnav. Die vorhandene linke
  Seitenleiste spiegelt die Auswahl (gleiche Punkte, bleibt mit der aktiven Seite synchron).
- **Dashboard** = Landeseite (Steckbrief + Zähler + Warnungen + Preview-Hinweis).
- **Tokens-Seite**: voll visuell.
- **Atomics / Components / Patterns**: Textkarten.
- „Open Library" wird aktiv und navigiert zum Dashboard.
- Leer-Zustand (noch kein Import) und Mock-Zustand (URL/Repo) sauber abgefangen.

**Nicht drin (Folgestufen):**
- Token-Nachbau / Code-Export (Tailwind/shadcn) — die eigentliche nächste Stufe
- Bildausschnitte aus dem Screenshot (Weg 1) — verworfen
- Import-Historie / mehrere Importe / Verwaltung (das spätere „echte Library B")
- Echte URL/Repo-Backends

## Datenlage (aus dem Image-Scan, `result.raw`)

```
summary: { source_description, app_type, color_mode, design_style }
tokens.colors:        [{ hex, role, confidence }]
tokens.typography:    [{ size, weight, role, sample, confidence }]
tokens.spacing:       [{ value, usage, confidence }]
tokens.border_radius: [{ value, usage, confidence }]
tokens.shadows:       [{ description, css, confidence }]
atomics:    [{ name, variants[], confidence, notes }]
components: [{ name, confidence, notes }]
patterns:   [{ name, confidence }]
warnings:   [string]
```

- Volle Detaildaten gibt es **nur bei Image-Importen**.
- **Mock-Importe (URL/Repo)** liefern `raw: null` — nur die Zähler in `result.categories`,
  keine Detail-Items.

## Seiten

### Dashboard (Landeseite von „Open Library")
- Steckbrief aus `summary`: source_description, app_type, Light/Dark, design_style.
- Quelle des Imports (Image/URL/Repo) + `PREVIEW`-Badge bei `mocked`.
- Zähler pro Kategorie (die `result.categories`-Zeilen, wie im Erfolgs-Screen).
- `warnings` als Hinweisliste (falls vorhanden).

### Tokens
- **Colors**: Raster aus Farbflächen; je Eintrag Farbfläche + `hex` + `role` + Confidence-Pill.
- **Typography**: je Eintrag das `sample` **live** in `size`/`weight` gerendert + `role` + Confidence.
- **Spacing**: Wert + `usage`, mit kleiner visueller Größenanzeige.
- **Border radius**: Box mit dem echten Radius + Wert + `usage`.
- **Shadows**: Box mit dem echten `css` (`box-shadow`) + `description` + Confidence.

### Atomics
- Karten: `name` + `variants` als Chips + Confidence + `notes`.

### Components
- Karten: `name` + Confidence + `notes`.

### Patterns
- Karten: `name` + Confidence.

Alle Detailseiten zeigen bei Mock-Import den Hinweis „Preview-Import — keine
Detaildaten" statt leerer Inhalte.

## Datenfluss & Persistenz

- Import-Ergebnis wird auf **App-Ebene** gehoben und nach erfolgreichem Import in
  `localStorage` unter `designbridge.lastImport` (JSON) gespeichert.
- Beim Start liest die App den Store und stellt die Library wieder her.
- „Open Library" (im Erfolgs-Screen): Modal schließen + `page = 'Dashboard'` setzen.
- Button ist **deaktiviert, solange kein Ergebnis** vorliegt.

## Bausteine (klein, fokussiert, testbar)

- `web/src/lib/libraryStore.js` — `loadLastImport()`, `saveLastImport(result)`, `clearLastImport()`.
- `web/src/pages/Dashboard.jsx`
- `web/src/pages/Tokens.jsx` (nutzt kleine Anzeige-Teile s. u.)
- `web/src/pages/Atomics.jsx`, `Components.jsx`, `Patterns.jsx`
- Anzeige-Teile: `ColorSwatch`, `TypographyRow`, `SpacingRow`, `RadiusRow`, `ShadowRow`,
  `InventoryCard` (für Atomics/Components/Patterns wiederverwendbar).
- `App.jsx`: Store beim Start laden; aktuelle Seite rendern; „Open Library" verdrahten.

## Stil

Bestehender Zinc/Weiß-Tailwind-Look aus `web/src/App.jsx` — kleine Schrift, enge
Abstände, kein neues Designsystem.

## Fehler-/Sonderzustände

- **Kein Import** (`loadLastImport()` → null): Library-Seiten zeigen leeren Zustand
  („Noch nichts importiert") + Button, der den Import-Dialog öffnet.
- **Mock-Import**: Dashboard zeigt Zähler + `PREVIEW`; Detailseiten zeigen den
  Preview-Hinweis.
- **Kaputter/alter `localStorage`-Eintrag**: defensiv parsen; bei Fehler wie „kein Import"
  behandeln und Eintrag verwerfen.

## Tests

- `libraryStore`: speichern → laden ergibt dasselbe; leer → null; kaputtes JSON → null.
- Je Seite ein Render-Test mit Fixture (Image-Ergebnis) — Tokens zeigt Farben/Typo,
  Inventar zeigt Karten. Mock-Fixture → Preview-Hinweis. Leer → Leer-Zustand.
- RTL mit **echten Timern** (bekannte Vitest/userEvent-Eigenheit auf diesem Volume).
