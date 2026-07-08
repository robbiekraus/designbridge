# Visuelle Interpretation Slice 1 — KI-Referenz je Baustein in der Library (Bild-Quelle)

**Datum:** 2026-07-08 · **Status:** Entwurf, von Rob im Brainstorm freigegeben (Terminal, konversationell)

## Ziel

Jeder erkannte Baustein (Atomic / Component / Pattern) bekommt eine **echte visuelle Referenz in der Library** — nicht nur die 4 Template-Typen, sondern alle. Die Referenz ist kein Screenshot-Ausschnitt, sondern das **technische Abbild sichtbar gemacht**: eine von Claude aus dem Original-Bild interpretierte shadcn/Tailwind-Komponente, live gerendert im Vorschau-Slot, markiert mit der Pille „von KI interpretiert".

## Robs Grundprinzipien (Fundament, 08.07.2026 bestätigt)

1. **Invarianter Weg:** Quelle → technisches Repository (Library) → Figma. Nie direkt Quelle→Figma. Die Library hält **echte, editierbare technische Artefakte**, keine toten Pixel.
2. **Auslöser für Interpretation** ist nicht die Medienart, sondern: *kein erkennbares Design-System / keine Komponenten-Bibliothek in der Quelle.* Erkennbar → echte Komponenten heben (spätere Scheibe). Nicht erkennbar → interpretieren, **so nah wie möglich am Original**.
3. **Ziel-System der Interpretation, gephast:** jetzt fix **shadcn + Tailwind** (das System, das die App schon emittiert) → später wählbar pro Import → Fernziel erkannt/gematcht.
4. **Motor: Hybrid.** Hand-Templates (Button/Card/Badge/Input) bleiben erste Wahl — gratis, deterministisch. KI interpretiert **nur Bausteine ohne Template**. Der Hybrid ist die Auffahrt zu „KI für alles": gleiche Pipeline, Regler später hochdrehbar; gute KI-Ergebnisse können künftig als Templates „einrasten".

## Entscheidungen (Brainstorm 08.07.)

| Frage | Entscheidung |
|---|---|
| Erste Quelle | **Bild** (muss immer interpretiert werden, größter sichtbarer Schmerz) — URL/Repo folgen |
| Wo zuerst sichtbar | **Library (Web-App)**, nicht Figma — schnellste Iteration; Figma erbt später |
| Auslösung | **Automatisch beim Import** — kein Knopf. Herkunft als Tag/Pille „von KI interpretiert" (Robs Korrektur; Wiederverwendung `SourcePill`-Muster) |
| Credit-Schutz | **Ein einziger Claude-Vision-Call pro Import** (Bild + Liste ALLER Nicht-Template-Bausteine → alle Interpretationen in einer Antwort), statt 1 Call pro Baustein |
| KI-Antwortformat | Je Baustein **HTML mit Tailwind-Klassen** (Vorschau-Wahrheit) **+ shadcn/JSX-Code** (Export-Artefakt) |
| Vorschau-Rendering | **Sandboxed `<iframe>`** (srcdoc) mit Tailwind-Laufzeit — beliebige generierte Klassen funktionieren, kaputter Baustein crasht nie die Library |
| Fehlerfall | Import bricht **nie** — betroffene Bausteine fallen auf den heutigen Platzhalter zurück + „Interpretation fehlgeschlagen" + Knopf „Erneut versuchen" (nur Nachhol-Fall) |
| Entwicklung ohne Credits | `DEMO_FALLBACK=1` liefert Fixture-Interpretationen (wie beim Bild-Scan) |
| Figma-Export der KI-Bausteine | **Nicht in Slice 1** — Template-Bausteine exportieren weiter wie Phase 5.2; iframe-Rendering ist das Fundament der nächsten Scheibe |

## Datenfluss

```
Bild-Upload → POST /api/scan/image                                  [existiert]
  → Scan-Ergebnis + NEU: Bild wird kurzlebig behalten (imageStore,
    Antwort trägt meta.import_id)                                   [erweitert, server]
    → Web: Import wie heute; danach automatisch:
      Bausteine ohne Template (matchTemplate(name) == null)
      → POST /api/interpret/components {import_id, components[]}    [NEU, web]
        → Server: EIN Claude-Vision-Call (Bild + Liste)
          → { interpretations: [{name, html, jsx}] }                [NEU, server]
            → Web: Ergebnis in lastImport.interpretations cachen,
              Vorschau-Slot rendert iframe + Pille „von KI
              interpretiert"                                        [NEU, web]
```

## Server

### 1. Bild kurzlebig behalten — `server/lib/imageStore.js` (NEU)

Heute löscht `scan.js` das Upload-Tempfile sofort (`finally { fs.unlink }`). Neu:

- In-Memory-Store nach dem Muster von `figmaExportStore.js`: `{ importId → { path, mimetype, createdAt } }`.
- `put(path, mimetype) → importId` (zufällige ID), `get(importId)`, TTL **15 Minuten** (Timer-Cleanup, löscht dann auch die Datei), `clear()` für Tests.
- `scan.js`: statt sofortigem `unlink` wird das Tempfile in den Store gelegt; die Scan-Antwort bekommt `meta.import_id`. Im `DEMO_FALLBACK`-Pfad ebenfalls (die Fixture-Interpretation braucht das Bild nicht, aber die Shape bleibt einheitlich).
- Kein Persistieren, kein Pfad nach außen — der Store gibt nur serverintern Pfade heraus.

### 2. Interpretations-Endpoint — `POST /api/interpret/components` (NEU, `server/routes/interpret.js`)

**Request:**
```jsonc
{
  "import_id": "abc123",
  "components": [   // NUR Bausteine ohne Template (Web filtert vor)
    { "name": "Stat Card", "kind": "component", "variants": ["default"], "notes": "…" }
  ]
}
```

**Verhalten:** `server/lib/interpretComponents.js` (injizierbarer Anthropic-Client wie `recognizeWithAi.js`) baut EINEN Vision-Call: Original-Bild (aus `imageStore`) + Baustein-Liste + Anweisung, je Baustein eine möglichst originalgetreue shadcn/Tailwind-Umsetzung zu liefern. Antwortformat vom Modell erzwungen als JSON.

**Response:**
```jsonc
{
  "interpretations": [
    {
      "name": "Stat Card",                    // Schlüssel = Baustein-Name
      "html": "<div class=\"rounded-lg …\">…</div>",  // Vorschau-Wahrheit (Tailwind-Klassen)
      "jsx": "export function StatCard() { … }"        // Export-Artefakt (shadcn-Stil)
    }
  ],
  "failed": ["Donut Chart"]                   // Bausteine ohne brauchbare Antwort
}
```

**Fehler-Semantik:**
- Einzelner Baustein unbrauchbar (kaputtes/leeres HTML) → landet in `failed`, Rest liefert normal. Kein Alles-oder-nichts.
- `import_id` unbekannt/abgelaufen → `410 Gone` mit deutscher Meldung („Bild nicht mehr verfügbar — bitte erneut importieren").
- Claude-Fehler (Credits/API down): bei `DEMO_FALLBACK=1` → Fixture (`server/fixtures/demo-interpretations.json`, passend zu den Bausteinen der Demo-Dashboard-Fixture); sonst `502` mit deutscher Meldung.
- HTML-Hygiene serverseitig: `<script>`-Tags und `on*`-Attribute werden aus `html` gestrippt (Belt-and-Suspenders zusätzlich zur iframe-Sandbox).

## Web

### 3. Auto-Trigger nach Bild-Import — `web/src/lib/interpret.js` (NEU) + `useImportSession.js` (erweitert)

- Nach erfolgreichem Bild-Import: Inventar durch `matchTemplate(name)` filtern → Liste der Nicht-Template-Bausteine → falls nicht leer, `POST /api/interpret/components`.
- Ergebnis wird als `interpretations: { [name]: { html, jsx } }` und `interpretFailed: [name]` in `designbridge.lastImport` (localStorage, `libraryStore`) gecacht — überlebt Reload, kein zweiter Call.
- Der Import-Erfolgs-Screen wartet NICHT auf die Interpretation (läuft parallel weiter; die Library zeigt pro Baustein Ladezustand „Wird interpretiert …" bis Antwort da ist).
- „Erneut versuchen" (nur bei `failed`/Fehler sichtbar) ruft denselben Endpoint mit den offenen Bausteinen nochmal.

### 4. Vorschau-Rendering — `web/src/components/library/InterpretedPreview.jsx` (NEU)

- Sandboxed `<iframe sandbox="allow-scripts" srcdoc="…">`; srcdoc = minimales HTML-Gerüst + Tailwind-Laufzeit (`https://cdn.tailwindcss.com`) + das gelieferte `html`. Kein `allow-same-origin` → kein Zugriff auf App, localStorage oder Cookies.
- Gleicher Slot/gleiche Maße wie Template-Vorschauen in `LibraryObjectList`; **feste Max-Höhe mit Scroll** (kein postMessage-Height-Geraffel — einfach und verlässlich).
- Offline-Hinweis: ohne Netz lädt die Tailwind-Laufzeit nicht → Vorschau erscheint ungestylt. Akzeptiert für ein lokales Dev-Tool; als Notiz in der UI nicht nötig.

### 5. Einbindung in die Library — `LibraryObjectList.jsx` (erweitert)

Vorschau-Priorität je Baustein: **Template** (wie heute) → **Interpretation** (iframe + gelbe `SourcePill`-Variante „von KI interpretiert") → **Ladezustand** („Wird interpretiert …") → **Platzhalter** (heutiger Zustand, ggf. + Fehlerzeile und „Erneut versuchen").
Der Code-Bereich (Kopieren / `<Name>.jsx` herunterladen) zeigt bei interpretierten Bausteinen das gelieferte `jsx` — gleiche Bedienung wie bei Templates.

## Fehlerbehandlung (Zusammenfassung)

| Fall | Verhalten |
|---|---|
| KI down / Credits leer | Import komplett normal; betroffene Bausteine = Platzhalter + „Interpretation fehlgeschlagen" + „Erneut versuchen" |
| Einzelner Baustein Murks | Nur dieser fällt zurück (via `failed`), Rest rendert |
| `import_id` abgelaufen (>15 min) | 410 + Meldung „bitte erneut importieren"; UI zeigt sie an der Fehlerzeile |
| `DEMO_FALLBACK=1` | Fixture-Interpretationen — Feature komplett ohne Credits baubar/testbar |
| Kaputtes generiertes HTML | bleibt im iframe-Käfig; crasht nie die Library |

## Tests (TDD, Muster des Projekts)

- **Server (`node --test`):** `imageStore` (put/get/TTL/clear) · `interpretComponents` mit Fake-Claude-Client (0 Credits): Prompt-Aufbau, JSON-Parsen, partielle Fehler → `failed`, Script-Stripping · Route: 410/502/Fallback-Pfade.
- **Web (Vitest):** `interpret.js` (Filterung via `matchTemplate`, Request-Shape, Cache-Write, Retry nur für offene) · `libraryStore`-Erweiterung · `InterpretedPreview` (srcdoc-Aufbau, sandbox-Attribute) · `LibraryObjectList`-Prioritätslogik (Template > Interpretation > Laden > Platzhalter).
- **Browser-Smoke:** Import mit `DEMO_FALLBACK=1` → Nicht-Template-Bausteine zeigen gerenderte iframe-Vorschau + gelbe Pille; Fehlerpfad durch Abschalten der Fixture prüfbar.

## Bewusst NICHT in Slice 1

- Figma-Export der interpretierten Bausteine (nächste Scheibe; iframe-Rendering ist deren Fundament).
- URL-/Repo-Quellen (gleiches Muster, andere Interpretations-Eingabe: HTML/Code statt Bild).
- Design-System-Erkennung in der Quelle („echte Komponenten heben") — eigene Scheibe.
- Template-„Einrasten" von KI-Ergebnissen, wählbares/gematchtes Ziel-System (Fernziel).
- Bounding-Boxes/Crops pro Baustein — erst nachrüsten, falls Ganzes-Bild-Interpretation nicht treu genug ist.
