# Spec: Library-Gerüst (Phase 1)

Datum: 2026-06-23 · Status: Entwurf zur Review

## Kontext & Ziel

Designbridge ist langfristig eine **bidirektionale Brücke** zwischen visuellem Repo (Figma/Screenshot/URL) und Code-Design-System (Tailwind/shadcn) — mit einem quellen-neutralen Modell in der Mitte. Diese Spec deckt **Phase 1** ab: das **Library-Gerüst**, das ein importiertes Ergebnis sichtbar und navigierbar macht.

Heute lebt das Import-Ergebnis nur kurz im Speicher des Modals und verschwindet beim Schließen. Der „Open Library"-Button im Erfolgs-Screen ist deaktiviert. Phase 1 ändert das.

**Nicht in dieser Phase** (spätere Phasen, siehe Roadmap-Memory): Code-Export, Komponenten-Nachbau (Weg 2), echte URL/Figma-Backends, Schreiben nach Figma, Sync. Außerdem **nicht**: echte Bildausschnitte der Komponenten (Weg 1).

## Umfang Phase 1

1. **Persistenz des letzten Imports** im `localStorage`, übersteht Reload. Speichert nur das *letzte* Ergebnis (keine Historie).
2. **Dashboard** als Landeseite: Steckbrief + Kategorie-Zähler + Warnungen + Preview-Hinweis bei Mock-Import.
3. **Tokens-Seite** (voll visuell): Farben, Typografie, Spacing, Border-Radius, Shadows.
4. **Atomics / Components / Patterns** als ehrliche **Textkarten** (Name, Varianten, Confidence, Notiz).
5. **„Open Library" aktivieren**: schließt Modal, wechselt auf Dashboard.
6. **Leerer Zustand**: ohne Import zeigen die Seiten „Noch nichts importiert" + Import-Button.

## Architektur

### Datenmodell (quellen-neutral)
Das gespeicherte Objekt ist das bereits existierende Import-Result aus `scanResultAdapter` / `importMocks`:
```
{
  source: 'image' | 'url' | 'repo',
  mocked: boolean,
  categories: [{ key, label, count, confidence, extra? }],
  raw: { summary, tokens, atomics, components, patterns, warnings, meta } | null
}
```
- `raw` ist bei **Image** gefüllt (echte Details), bei **Mock** `null` (nur `categories`-Zähler).
- Bewusst nicht umbenannt/umgebaut — dieses Result IST der Keim des späteren kanonischen Modells.

### Neue Bausteine
- `web/src/lib/libraryStore.js` — `saveLastImport(result)`, `loadLastImport()`, `clearLastImport()`. Kapselt `localStorage`-Key `designbridge.lastImport`, fängt JSON-/Quota-Fehler ab (gibt bei Fehler `null` zurück).
- `web/src/pages/Dashboard.jsx` — Steckbrief + Zähler + Warnungen.
- `web/src/pages/Tokens.jsx` — die fünf Token-Gruppen.
- `web/src/pages/Atomics.jsx`, `Components.jsx`, `Patterns.jsx` — Textkarten.
- Anzeige-Teilchen (klein, präsentational): `ColorSwatch`, `TypographyRow`, `SpacingRow`, `RadiusRow`, `ShadowRow`, `InventoryCard`, `EmptyState`, `ConfidencePill` (Pill ggf. aus `ImportSuccess` extrahieren und teilen).

### Verdrahtung in `App.jsx`
- Bestehender `page`-State (Dashboard/Tokens/Atomics/Components/Patterns) steuert, welche Seite `<main>` rendert (ersetzt das „coming soon").
- Beim Start: `loadLastImport()` → in App-State legen.
- Modal meldet Erfolg über Callback (`onImported(result)`): App speichert via `saveLastImport` und legt das Result in den State.
- `ImportSuccess`-Button „Open Library": `disabled` entfernen, `onClick` → Modal schließen + `setPage('Dashboard')`.
- Sidebar-Einträge (Tokens/Atomics/Components/Patterns) werden klickbar und setzen `page`.

## Darstellung der Token-Seite

- **Farben**: Raster aus Farbflächen; je Eintrag Farbblock + `hex` + `role` + `ConfidencePill`.
- **Typografie**: je Eintrag das `sample` **live gerendert** mit `size`/`weight`, daneben `role` + Werte + Pill.
- **Spacing**: Wert als kleiner Balken visualisiert + `value` + `usage` + Pill.
- **Border-Radius**: kleine Box mit echtem `border-radius` + `value` + `usage` + Pill.
- **Shadows**: kleine Box mit echtem `box-shadow` (aus `css`) + `description` + Pill.
- Leere Gruppen werden ausgeblendet (oder dezent „keine erkannt").

## Inventar-Seiten (Textkarten)

- **Atomics**: Karte mit `name`, `variants` als Chips, `ConfidencePill`, `notes`.
- **Components**: Karte mit `name`, Pill, `notes`.
- **Patterns**: Karte mit `name`, Pill.
- Über den Karten ein Hinweis, dass visuelle Nachbauten in einer späteren Phase kommen.

## Sonderfälle / Fehler

- **Kein Import** (`loadLastImport()` → null): alle Seiten zeigen `EmptyState` mit „Neuer Import"-Button.
- **Mock-Import** (`raw === null`): Dashboard zeigt Zähler + `PREVIEW`-Badge; Detailseiten zeigen „Preview-Import — keine Detaildaten" statt Inhalten.
- **Kaputter/teilweiser `raw`**: Anzeige-Teile prüfen Arrays defensiv (`?? []`), nie crashen.
- **localStorage nicht verfügbar/voll**: Store schluckt Fehler, App läuft weiter (Library dann nur für die laufende Session).

## Stil

Bestehender Zinc/Weiß-Tailwind-Look aus `App.jsx`/`ImportSuccess.jsx`: kleine Schrift, enge Abstände, `border-zinc-200`, Pills wie gehabt. Kein neues Design-System.

## Tests (Vitest + RTL, echte Timer wegen bekannter Fake-Timer-Eigenheit)

- `libraryStore`: speichern→laden round-trip; leer → `null`; defekt-JSON → `null`.
- `Tokens`: rendert bei Fixture-Result Farben/Typo/Shadow; bei `raw:null` den Preview-Hinweis.
- `Dashboard`: zeigt Steckbrief + Zähler; bei Mock den PREVIEW-Hinweis.
- Eine Inventar-Seite (`Atomics`): Karten + Varianten-Chips aus Fixture.
- `EmptyState`: erscheint, wenn kein Import vorhanden.

## Definition of Done

- „Open Library" ist aktiv und landet auf Dashboard.
- Nach Image-Import: Tokens-Seite zeigt echte Farben/Typo/Shadows; Inventar zeigt Textkarten.
- Nach Mock-Import: Zähler + Preview-Hinweise.
- Nach Reload bleibt das letzte Ergebnis erhalten.
- Ohne Import: sauberer leerer Zustand.
- Alle Tests grün; Stil konsistent zum Bestehenden.
