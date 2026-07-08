# Quellen-agnostische Decomposition — „erst zerlegen, dann interpretieren"

**Datum:** 2026-07-08 · **Status:** Entwurf, im Brainstorm mit Rob freigegeben (Richtung + 3-Scheiben-Schnitt, Option C „saubere Architektur"). Detail-Entscheidungen für Scheibe ① von Claude (Opus) nach Robs Delegation für den autarken Nacht-Lauf getroffen; Rob reviewt diesen Spec.

## Problem (verifiziert am Code, 08.07.)

Die KI-Interpretation wirkt „fahrig": In der Library sehen **Stat Card** und **Line Chart Card** identisch und nicht getroffen aus, **Donut Chart** dagegen ist näher dran. Ursache sind **zwei Lecks**, nicht die KI selbst:

1. **Routing zu grob.** Das Template-Gate (`web/src/lib/components/templates/registry.js`) matcht per Teilstring. Regel `/card|tile|panel/` kapert *jeden* Baustein mit „card" im Namen auf **ein generisches Card-Template**, bevor die KI ihn sieht. → Stat Card und Line Chart Card werden dieselbe leere Karte. `/butt|btn|cta/`, `/input|field/` haben dasselbe Problem (Icon Button, Search Input).
2. **Kein Grounding.** Wo interpretiert wird, bekommt die KI nur das **ganze Bild** + einen Namen + kurze Notiz (`interpretComponents.js`, ein Batch-Call). Keine Position, kein Ausschnitt. Sie muss raten, welcher Bildbereich gemeint ist. Donut trifft, weil visuell einzigartig; Karten verschwimmen.

Robs Kern-Einsicht: **Der wichtigste Schritt ist die Zerlegung der Quelle in abgegrenzte Einzelteile — *vor* der Interpretation.** Erst wenn feststeht „hier sind N Elemente mit Grenzen", kann jedes einzeln und originalgetreu interpretiert werden.

## Grundprinzipien (aus Slice-1-Spec, weiter gültig)

- **Invarianter Weg:** Quelle → technisches Repository (Library) → Figma. Nie direkt Quelle→Figma.
- **Auslöser für Interpretation:** kein erkennbares Design-System in der Quelle (nicht die Medienart).
- **Ziel-System gephast:** jetzt fix shadcn + Tailwind.
- **Motor: Hybrid** (Hand-Templates + KI). Neu präzisiert: das Template-Gate darf Bausteine nicht mehr fälschlich kapern (Leck 1).

## Zielarchitektur (Option C — eine Schere, quellen-agnostisch)

Zwischen „Erkennen" und „Interpretieren" kommt eine neue Stufe **Decompose**. Sie ist als **ein Contract mit zwei Implementierungen** entworfen — von Anfang an für Bild *und* URL gedacht, aber inkrementell gebaut.

```
Quelle → Erkennen (Design-System da?) → ✂️ DECOMPOSE → Interpret (je Segment einzeln) → Library
                                          │
                     ┌────────────────────┴────────────────────┐
                     │                                          │
             ImageDecomposer (①)                        UrlDecomposer (②, später)
             Vision-Boxen → Crops → visual              DOM-Zellen → structure
                     └──────────────► gleiches Segment[] ◄──────┘
```

### Der Contract — `Segment`

Das einzige, worauf alles nach Decompose sich stützt. Quellen-agnostisch:

```jsonc
{
  "id": "seg_3",              // stabil innerhalb eines Imports
  "label": "Stat Card",       // Name aus dem Scan
  "kind": "component",        // atomic | component | pattern
  "confidence": "high",
  "notes": "Your Sales",
  "bounds": { … },            // WO im Original — Bild: {x,y,w,h} normiert 0..1 · URL: DOM-Pfad
  "visual": "seg_3.png",      // OPTIONAL: isolierter Bild-Ausschnitt (Crop). Bild füllt das.
  "structure": null           // OPTIONAL: { html, css } — URL füllt das (Scheibe ②)
}
```

### Das Interface — `Decomposer`

```
decompose(source, inventory) → Promise<Segment[]>
```

- `source`: für Bild `{ imagePath, mimetype }`; für URL später `{ url }`.
- `inventory`: die vom Scan erkannten Bausteine (atomics/components/patterns) — die Liste dessen, was zerlegt werden soll.
- Rückgabe: `Segment[]` mit gefüllten `bounds` und (Bild) `visual` bzw. (URL) `structure`.

**Downstream (Interpret + Library) wird quellen-agnostisch:** es konsumiert `Segment[]` und nutzt, was da ist — `visual` (Bild-Crop) und/oder `structure` (DOM). Es weiß nie, woher das Segment kam. Genau das ist „saubere Architektur".

---

# Scheibe ① — Bild-Zerlegung (diese Session)

Ziel: Der Bild-Import (heutiger Live-Pfad) zerlegt das Bild in echte Einzel-Segmente und interpretiert **jeden Ausschnitt einzeln** → sichtbar treffsicherere Library-Vorschauen. Behebt Leck 1 **und** Leck 2.

## Entscheidungen (Detail, Opus-Judgment)

| Frage | Entscheidung | Warum |
|---|---|---|
| Woher kommen die Bounding-Boxes? | **Scan erweitern:** `analyzeScreenshot` liefert je Baustein zusätzlich `bbox` (normiert 0..1). | Spart einen extra Vision-Call — der Scan schaut das Bild ohnehin an. Kein neuer „Locate"-Call nötig. |
| Wer schneidet zu? | **`ImageDecomposer`** (server), croppt aus dem gespeicherten Bild per `bbox`. | Decompose besitzt die physische Zerlegung; der Scan liefert nur die Hinweise. |
| Bild-Bibliothek | **`jimp`** (neue Dependency, reines JS). | Kein native Build → sicher für unbeaufsichtigten Lauf auf dem externen Volume. `sharp` bewusst vermieden. |
| Interpret-Grounding | **Multi-Image-Call:** alle Crops in EINEM Vision-Call (je Segment ein Bild + Label), Antwort = Interpretation je Segment. | Per-Crop-Treffsicherheit *und* nur ein Call pro Import (Credit-schonend). Claude nimmt mehrere Bilder pro Nachricht. |
| Vision-Calls pro Import | **2** (Scan mit bbox + Interpret mit Crops), wie vorher. | Keine Call-Inflation trotz besserem Grounding. |
| Leck 1 (Routing-Fix) | Template-Match wird **präziser**: „card" allein triggert nicht mehr. Chart-/Stat-/Karten-mit-Inhalt gehen in die Interpretation. Genaue Regeln unten. | Karten mit spezifischem Inhalt gehören interpretiert, nicht generisch bemalt. |
| Fehlt `bbox` (alte Fixtures / Modell liefert keine) | **Graceful:** Segment ohne `visual`; Interpret fällt für dieses Segment auf Ganz-Bild-Grounding zurück (heutiges Verhalten). | Kein Hard-Fail; abwärtskompatibel. |
| `DEMO_FALLBACK=1` | Fixtures liefern segmentierte Interpretationen; Crops werden im Demo-Pfad übersprungen. | Feature komplett ohne Credits baubar/testbar. |
| Figma-Export | **Nicht in ① (Scheibe ③).** | Baut auf treuen Segmenten auf. |

## Routing-Fix (Leck 1) — präzise Regeln

Das Gate soll nur noch **generische, inhaltsarme Primitive** als Template abfangen. Ein „Card"-Name mit spezifischem Inhalt (Chart, Stat/Metric, Map …) gehört zur Interpretation.

- `matchTemplate(name)` wird verschärft: Ein Treffer auf `card/tile/panel` gilt **nur**, wenn der Name **keine** inhaltstragende Qualifizierung enthält (`chart|graph|stat|metric|map|line|bar|donut|pie|activity|feed|list|table|calendar|…`). Beispiel: „Card" → Template; „Line Chart Card", „Stat Card" → Interpretation.
- Analog für `button` (z. B. „Icon Button" bleibt Template, ok) und `input`/`field` (bleibt Template) — hier ist die generische Umsetzung meist tragbar; Fokus des Fixes liegt auf `card`.
- Regeln liegen **datengetrieben** im Template-Modul (Blockliste inhaltstragender Tokens), damit sie testbar und leicht erweiterbar sind.

## Server

### 1. Scan erweitern — `server/lib/claude.js`
- Prompt: je `atomics/components/patterns`-Eintrag zusätzlich `"bbox": { "x":0..1, "y":0..1, "w":0..1, "h":0..1 }` (Anteil der Bildbreite/-höhe), „tight box around the element as it appears".
- Rückgabe-Shape unverändert außer dem neuen optionalen `bbox` je Baustein. Fehlt es, bleibt alles wie heute (graceful).

### 2. `ImageDecomposer` — `server/lib/decompose/imageDecomposer.js` (NEU)
- `decompose({ imagePath, mimetype }, inventory) → Segment[]`.
- Für jeden Inventar-Baustein: hat er `bbox` → mit **jimp** aus dem Bild croppen (bbox × Bildmaße, mit kleinem Padding, geclamped auf Bildgrenzen), Crop als PNG-Buffer/temp-Datei, `visual` setzen. Kein `bbox` → Segment ohne `visual`.
- `bounds` = die normierte bbox (auch ohne Crop nützlich).
- Rein server-intern; Crops leben so kurzlebig wie das Bild (`imageStore`-TTL).

### 3. `Decomposer`-Contract — `server/lib/decompose/index.js` (NEU)
- Exportiert die Segment-Typdoku (JSDoc) und eine `getDecomposer(sourceKind)`-Fabrik (jetzt nur `'image'` → `ImageDecomposer`; `'url'` folgt in ②). Hält die Naht explizit.

### 4. Interpret auf Segmente + Crops umstellen — `server/lib/interpretComponents.js`
- Signatur nimmt zusätzlich Segmente/Crops entgegen. Baut den Vision-Call als **Multi-Image**: pro Segment mit `visual` ein Bild-Block + Textlabel „Component: <label>"; Segmente ohne `visual` werden im Prompt mit Verweis aufs (weiterhin mitgesendete) Gesamtbild geführt.
- Prompt-Kern bleibt: originalgetreue shadcn/Tailwind-Umsetzung je Baustein, JSON-Antwort `{ interpretations:[{name,html,jsx}] }`. `sanitizeHtml` unverändert.
- Rückgabe unverändert (`{ interpretations, failed }`), Schlüssel = `label`/Name — Web bleibt kompatibel.

### 5. Route verdrahten — `server/routes/interpret.js`
- Ablauf: `getImage(importId)` → `getDecomposer('image').decompose(image, components)` → `interpretComponents(image, segments)`.
- `components` im Request tragen künftig ihre `bbox` mit (Web reicht sie vom Scan durch). Fehlt sie, Ganz-Bild-Pfad.
- Fehler-/`DEMO_FALLBACK`-Semantik wie heute (410/502/Fixture).

## Web

### 6. bbox durchreichen — `web/src/lib/interpret.js`
- `componentsNeedingInterpretation` nimmt `bbox` (falls im Scan-`raw` vorhanden) mit in die Baustein-Objekte auf. Sonst unverändert.
- `matchTemplate`-Aufruf nutzt automatisch die verschärften Regeln (Leck-1-Fix) → mehr Bausteine fließen in die Interpretation.

### 7. Rendering/Anzeige — unverändert
- `InterpretedPreview` (iframe) und `LibraryObjectList`-Prioritätslogik bleiben wie in Slice 1. Es kommt nur **treffsichereres** `html`/`jsx` an. Kein UI-Umbau.

## Tests (TDD, Projektmuster — alle ohne Live-Credits)

- **Server (`node --test`):**
  - `imageDecomposer`: synthetisches jimp-Testbild (z. B. 200×100, farbige Quadranten) + bekannte bbox → Crop hat erwartete Maße/Region; fehlende bbox → Segment ohne `visual`; bbox-Clamping an Bildrändern.
  - `interpretComponents`: Fake-Anthropic-Client → Multi-Image-Message-Aufbau (richtige Anzahl Bild-Blöcke, Labels), JSON-Parsen, partielle Fehler → `failed`, Segmente ohne Crop → Ganz-Bild-Fallback im Prompt.
  - Routing-Blockliste: `matchTemplate('Card')` = Template; `matchTemplate('Line Chart Card')`/`'Stat Card'` = null; Regression für Button/Input.
  - Route `interpret.js`: Decompose→Interpret verdrahtet, 410/502/Fixture-Pfade.
  - Scan-Prompt-Erweiterung: bbox-Feld dokumentiert/geparst (mit Fixture, die bbox trägt).
- **Web (Vitest):** `componentsNeedingInterpretation` reicht bbox durch; verschärfte `matchTemplate`-Regeln (Stat Card/Line Chart Card fließen jetzt in die Interpretation).
- **Browser-Smoke (`DEMO_FALLBACK=1`):** Import → Nicht-Template-Bausteine zeigen gerenderte, jetzt unterscheidbare Vorschauen; Stat Card ≠ Line Chart Card.
- **Live-Verifikation (nur mit Credits):** echter Screenshot-Import → sichtbar treffsicherere Crops-basierte Interpretation. **Offen bis Credits da sind** — wird separat markiert, blockiert den Bau nicht.

## Demo-Fixtures (ohne Credits sichtbar)
- `demo-dashboard.json`: je Baustein eine plausible `bbox` ergänzen (damit der Demo-Pfad Segmente/Crops zeigt).
- `demo-interpretations.json`: Einträge für die bisher fehlenden Bausteine (u. a. **Stat Card**, **Line Chart Card**) ergänzen, visuell unterscheidbar — damit die Demo Leck 1 sichtbar behebt.

## Neue Dependency
- **`jimp`** (root `package.json`), reines JS. Begründung: server-seitiges Croppen der Segmente; kein native Build (sicher für unbeaufsichtigten Lauf). Task 0 installiert & verifiziert, bricht sonst früh ab.

## Bewusst NICHT in Scheibe ①
- URL-/DOM-Zerlegung (`UrlDecomposer`) — **Scheibe ②** (`node-html-parser` liegt bereit).
- Figma-Export der Segmente, Design-System-Erkennung, Template-„Einrasten", wählbares Ziel-System — **Scheibe ③ / Fernziel**.
- Ein-Call-pro-Segment (statt Multi-Image-Batch) — nur falls Multi-Image-Grounding nicht reicht.

## Roadmap-Kontext
- **② URL-Zerlegung:** echter Fetch + `UrlDecomposer` → gleiches `Segment[]` (füllt `structure`), Downstream unverändert.
- **③ Figma-Export + Design-System heben:** baut auf treuen Segmenten auf.
