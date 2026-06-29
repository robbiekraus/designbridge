# URL-Komponenten-Erkennung v1 — Design-Spec

**Datum:** 2026-06-29
**Phase:** „Komponenten aus jeder Quelle" — erster Schritt (URL), neu vor die restlichen Ingester sortiert
**Status:** Entwurf zur Review

## Ziel

Der URL-Import liefert heute nur Tokens, kein UI-Inventar. Diese Phase fügt **Komponenten- und Pattern-Erkennung für die URL-Quelle** hinzu — als eigenständige, später auf andere Quellen ausrollbare Fähigkeit.

Die Erkennung ist **hybrid**:

1. **Feste Regeln (gratis, immer):** Aus HTML + CSS werden Bausteine deterministisch herausgelesen — Atomics über Tags/Rollen, Patterns über HTML-Landmarken. Sofort sichtbar, ohne API-Credits.
2. **Claude veredelt (auf Knopfdruck, optional):** Erst nach einem expliziten Klick bekommt Claude HTML + CSS + die Regel-Liste als Text und gibt eine überarbeitete Liste zurück (bestätigt / korrigiert / ergänzt). Claude ist **Redakteur**, nicht Erstautor.

Beide Wege münden in **exakt die kanonische Form**, die die bestehende Phase-3-UI (Accordion, Templates, Confidence-Pills, Einzel-/Library-Export) schon versteht — sie „leuchtet automatisch auf", ohne Umbau.

**Leitstern:** *Der Designer sieht, was er bekommt — und wie verlässlich es ist.* Jeder Baustein trägt ein Herkunfts-Etikett (Regeln / KI / beides).

## Nicht-Ziele (v1)

- Keine neue Render-Vorschau für unbekannte Bausteine. Echte token-gefärbte Vorschau bleibt auf die vier Templates beschränkt (Button, Card, Badge, Input); alles andere = Code-Stub + „Vorschau folgt". Wir verbessern das **Erkennen**, nicht das **Nachbauen**.
- Keine Komponenten-Erkennung für Repo-/Figma-Import (eigene spätere Schritte der neuen Roadmap).
- Kein automatisches Nachfassen / mehrfache Claude-Durchläufe bei Unsicherheit — **ein Durchlauf pro Klick**.
- Keine feingranulare Auswahl („nur Patterns vertiefen") — **ein Knopf für alles**.
- Kein Speichern mehrerer Analyse-Versuche nebeneinander; die KI-Liste ersetzt (nach Merge) die Regel-Liste des aktuellen Imports.
- Kein JS-Rendering (kein Headless-Browser) — wir arbeiten auf dem ausgelieferten HTML + CSS, derselben Datenquelle wie der bestehende CSS-Token-Ingester.

## Architektur-Prinzip

Zwei Erkennungs-Stufen, eine Zielform.

```
                 ┌─────────────── gratis, immer ───────────────┐
  URL → fetchSite(html, css) → recognizeComponents(html, css) → ServerShape (Regel-Liste)
                                                                      │
                                              ┌──── auf Knopfdruck, optional (Credits) ────┐
                 URL → fetchSite(html, css) → recognizeWithAi(html, css, regelListe) → ServerShape (gemerged)
```

Beide Stufen liefern dieselbe **Server-Shape** wie `analyzeScreenshot` / `ingestCss`:

```json
{
  "summary":   { ... },
  "tokens":    { ... },          // unverändert vom CSS-Ingester
  "atomics":   [ ... ],          // NEU befüllt
  "components":[ ... ],          // NEU befüllt
  "patterns":  [ ... ],          // NEU befüllt
  "warnings":  [ "..." ],
  "meta":      { "model": "rules" | "rules+ai", "source_url": "...", "ai_deepened": false }
}
```

Damit greift `adaptScanResponse(raw, 'url')` unverändert, und die Accordion-Seiten (Atomics/Components/Patterns), die `raw.atomics/components/patterns` durch `emitComponents` zu Vorschau + Code anreichern, funktionieren sofort.

### Kanonische Baustein-Shape (mit Herkunft)

Wir behalten die bestehende Form je Ebene und ergänzen **`source`** (und nutzen das vorhandene `notes` für Korrektur-Hinweise):

```json
// atomics  (wie Bild-Scan: name, variants, confidence, notes)
{ "name": "Button", "variants": ["primary","secondary"], "confidence": "high", "source": "rules", "notes": "" }

// components  (wie Bild-Scan: name, confidence, notes)
{ "name": "Card", "confidence": "med", "source": "rules+ai", "notes": "" }

// patterns  (wie Bild-Scan: name, confidence; + source, notes)
{ "name": "Navbar", "confidence": "med", "source": "rules", "notes": "aus <nav>-Landmarke" }
```

`source` ∈ `"rules"` | `"ai"` | `"rules+ai"`. Bei Korrekturen durch Claude nennt `notes` die Änderung (z. B. `"Input → Suche"`). Bestehende Bild-Scan-Daten haben kein `source` → das UI behandelt „kein source" wie bisher (keine Herkunfts-Pille), keine Regression.

## Komponenten

### Server

**1. `server/lib/fetchSite.js` — HTML zusätzlich zurückgeben.**
- Rückgabe wird `{ html, css, baseUrl }` (heute `{ css, baseUrl }`).
- `html` ist der bereits geladene Seiten-Quelltext (liegt in der Funktion ohnehin vor). Kein neuer Netzwerkaufruf.
- Bestehende Aufrufer (`/api/scan/url`) destrukturieren weiter nur `{ css }` — abwärtskompatibel.

**2. `server/lib/recognizeComponents.js` — reine Regel-Logik (keine I/O, voll Unit-testbar).**
- `recognizeComponents(html, css) → { atomics, components, patterns }`.
- HTML wird mit einem leichten Parser (`node-html-parser`, siehe „Neue Abhängigkeit") in einen abfragbaren Baum gelesen.
- **Atomics** (Tag-/Rollen-Regeln, hohe Sicherheit):
  - `<button>`, `[role="button"]`, `<a class*="btn">` → **Button**; Varianten aus wiederkehrenden Klassen-Suffixen (`btn-primary`/`btn-secondary` → `["primary","secondary"]`).
  - `<input>` (außer `type=search`), `<textarea>`, `<select>` → **Input**.
  - `<input type="search">`, `[role="search"]`, `form[role=search]` → **Suche**.
  - Elemente mit Klassen `*badge*` / `*tag*` / `*chip*` → **Badge**.
  - Standalone-`<a>` (Navigationslinks außerhalb von `<nav>`) → **Link**.
  - `confidence`: explizites Tag/Rolle = `high`; nur Klassen-Heuristik = `low`.
- **Patterns** (HTML-Landmarken, mittlere Sicherheit — Struktur sicher, Bedeutung gedeutet):
  - `<nav>` / `[role="navigation"]` → **Navbar**.
  - `<header>` (oder erstes großes Section mit H1) → **Hero**.
  - `<footer>` / `[role="contentinfo"]` → **Footer**.
  - `<aside>` / `[role="complementary"]` → **Sidebar**.
  - `confidence: "med"`, `notes: "aus <…>-Landmarke"`.
- **Components** (zusammengesetzt, vorsichtig):
  - `<form>` (mit ≥1 Feld) → **Formular**.
  - `<table>` → **Tabelle**.
  - `<ul>`/`<ol>` mit ≥3 gleichartigen `<li>` → **Liste**.
  - Wiederkehrende Karten-Container (gleiche Klasse, ≥2 Vorkommen, mit Bild/Überschrift/Text) → **Card**.
  - `confidence: "med"` (struktur-erkannt) bzw. `"low"` (klassen-erkannt).
- **Dedup:** je Ebene nach `name` eindeutig; Mehrfachfunde erhöhen nicht die Liste, sondern werden zusammengefasst (Varianten vereint).
- Findet die Regel-Schicht nichts auf einer Ebene → leeres Array (kein Fehler).

**3. `server/lib/recognizeWithAi.js` — Claude-Veredelung (injizierbarer Client, testbar ohne Credits).**
- `recognizeWithAi(html, css, ruleList, { client } = {}) → { atomics, components, patterns, warnings }`.
- Baut einen **HTML-Erkennungs-Prompt** (analog `EXTRACTION_PROMPT` in `claude.js`, aber für Text statt Bild). Der Prompt:
  - bekommt HTML (ggf. gekürzt, siehe unten) + CSS + die **Regel-Liste als JSON**;
  - Auftrag: bestätige korrekte Einträge, korrigiere falsche (nenne die Änderung in `notes`), ergänze übersehene; gib **eine** zusammengeführte Liste in der kanonischen Shape zurück, jeder Eintrag mit `source` (`"rules+ai"` wenn aus der Regel-Liste bestätigt/korrigiert, `"ai"` wenn neu) und `confidence`.
  - Modell `claude-sonnet-4-5`, `max_tokens` großzügig; JSON-only-Parsing wie im Bild-Pfad (` ```json `-Strip, `JSON.parse`, klare Fehlermeldung bei ungültigem JSON).
- **Größenkappung:** sehr großes HTML wird vor dem Senden gekürzt (z. B. Skripte/SVG-Pfade/Kommentare entfernt, harte Zeichen-Obergrenze) — die Erkennung braucht Struktur, nicht Inhalt. Wird gekürzt, ergänzt `warnings` einen Hinweis.
- **Injizierbarer Client** wie `fetchSite` ein injizierbares `fetch` hat → Tests übergeben einen Fake-Client mit fester Antwort (keine echten Credits).

**4. Endpoints (`server/routes/scan.js`).**
- `POST /api/scan/url` (bestehend): ruft jetzt zusätzlich `recognizeComponents(html, css)` und legt `atomics/components/patterns` in die Antwort. `fetchSite` liefert dafür `html` mit. `meta.model = "rules"`, `meta.ai_deepened = false`. **Kostet keine Credits.**
- `POST /api/scan/url/ai` (**neu**): Body `{ url }`. Re-`fetchSite(url)` → `recognizeComponents` (Baseline) → `recognizeWithAi(html, css, baseline)` → Antwort-ServerShape mit gemergten Listen, `meta.model = "rules+ai"`, `meta.ai_deepened = true`. Fehler (kein Credit / API-Fehler / ungültiges JSON) → **4xx/5xx mit Klartext**; der Client behält dann die Regel-Liste (siehe UX). Tokens bleiben unverändert (wir senden sie nicht erneut durch Claude).

### Client

**5. `web/src/lib/useImportSession.js` — Veredelung anstoßen.**
- Neue `deepenWithAi()`: liest die aktuelle URL aus dem gespeicherten Import (`designbridge.lastImport.raw.meta.source_url`), `POST /api/scan/url/ai`, ersetzt bei Erfolg `raw.atomics/components/patterns` + `raw.warnings` + `raw.meta`, schreibt zurück in den Store, gibt `{ ok, error? }` zurück. Bei Fehler bleibt der gespeicherte Import unverändert.
- Lade-/Fehler-Status wird als State exponiert (`deepening`, `deepenError`).

**6. `web/src/components/library/AiDeepenBanner.jsx` (neu).**
- Sichtbar, wenn der aktive Import aus der URL stammt **und** `raw.meta.ai_deepened !== true`.
- Zeigt: Titel „Komponenten & Patterns noch nicht analysiert", Knopf **„Mit KI vertiefen"**.
- Zustände: Ruhe → Knopf aktiv; läuft → Knopf „Analysiere…", gesperrt; Fehler → ruhige Zeile „KI-Analyse gerade nicht möglich — die Regel-Funde bleiben erhalten." (Knopf wieder aktiv zum erneuten Versuch).
- Platzierung: oben im Library-Bereich (über Dashboard/Atomics/Components/Patterns) — eine Instanz, ein Klick für den ganzen Import.

**7. `web/src/components/library/SourcePill.jsx` (neu, neben `ConfidencePill`).**
- Bildet `source` auf eine kleine Pille ab: `rules+ai` → grün „Regeln + KI", `ai` → gelb „von KI", `rules` → grau „nur Regeln". Kein `source` → nichts (Bild-Scan-Kompatibilität).
- Wird in `LibraryObjectList.jsx` neben der `ConfidencePill` in der Accordion-Kopfzeile gezeigt; bei Korrektur-`notes` erscheint der Hinweis im aufgeklappten Bereich.

**8. Anreicherungs-Pipeline unverändert.**
- Die Seiten (`Atomics/Components/Patterns.jsx`) reichern `raw.*` weiter via `emitComponents` zu `{ name, variants, confidence, hasPreview, templateKey, code, filename, slug, kind, source, notes }` an. `source`/`notes` werden durchgereicht. Kein Umbau der Templates/Previews.

## Datenfluss (Ende zu Ende)

```
URL importieren
  → POST /api/scan/url
      → fetchSite(url) → { html, css }
      → ingestCss(css) → tokens
      → recognizeComponents(html, css) → atomics/components/patterns (source:"rules")
      → ServerShape (ai_deepened:false)
  → adaptScanResponse(raw,'url') → Store
  → Library zeigt Tokens + erste Bausteine (graue „nur Regeln"-Pillen) + Banner

[optional] „Mit KI vertiefen"
  → deepenWithAi() → POST /api/scan/url/ai
      → fetchSite(url) → recognizeComponents (Baseline)
      → recognizeWithAi(html, css, baseline) → gemergte Listen (source:"rules+ai"|"ai")
      → ServerShape (ai_deepened:true)
  → Store aktualisiert → Banner verschwindet, Pillen färben sich um, Korrekturen sichtbar
  (Fehler → Regel-Liste bleibt, ruhige Fehlerzeile)
```

## Zustände / UX

- **Nach URL-Import:** Banner sichtbar, Bausteine mit grauer „nur Regeln · prüfen"-Pille.
- **Während Analyse:** Knopf „Analysiere…", gesperrt (kein Doppelklick, kein Doppel-Credit).
- **Nach Analyse:** Banner weg; Pillen grün („Regeln + KI") / gelb („von KI") / grau (unverändert); Korrekturen in `notes`.
- **Fehler / keine Credits:** ruhige Inline-Meldung, **gratis Regel-Liste bleibt erhalten**.

## Confidence- & Herkunfts-Modell

- **Atomics:** explizites Tag/Rolle → `high`; reine Klassen-Heuristik → `low`.
- **Patterns:** Landmarke → `med` (Struktur sicher, Bedeutung gedeutet).
- **Components:** struktur-erkannt → `med`; klassen-erkannt → `low`.
- **Claude:** darf Confidence anheben/senken und korrigieren; `source` markiert die Herkunft. Die Pille bildet die gestaffelte Sicherheit ab (Frage-1-Entscheidung: alle drei Ebenen, gestaffelt).

## Testing (TDD)

- **`recognizeComponents.js`** — viele Pure-Unit-Tests gegen HTML-Schnipsel: Button (+Varianten aus Klassen), Input vs. Suche, Badge, Navbar/Hero/Footer/Sidebar aus Landmarken, Formular/Tabelle/Liste/Card, Dedup je Ebene, leere Ebenen, `source`/`confidence` korrekt.
- **`recognizeWithAi.js`** — mit **Fake-Client** (feste JSON-Antwort, keine echten Credits): Merge bestätigt Regel-Eintrag (`source:"rules+ai"`), korrigiert (`notes` gesetzt), ergänzt neuen (`source:"ai"`); ungültiges JSON → klare Fehlermeldung; HTML-Kürzung setzt `warnings`.
- **`fetchSite.js`** — Rückgabe enthält jetzt `html`; bestehende CSS-/`<link>`-Tests unverändert grün.
- **Endpoints** — `/api/scan/url` liefert befüllte Listen aus der Demo-Seite; `/api/scan/url/ai` (mit gemocktem `recognizeWithAi`) liefert gemergte Shape + `ai_deepened:true`; Fehlerpfad → Statuscode + Klartext.
- **Demo-Seite** — `demo-site/index.html` enthält bereits sichtbare Button/Card/Badge sowie `<nav>`/`<header>`/`<footer>` (ggf. minimal ergänzen), damit die Regeln dort verlässlich greifen — dient als Fixture **und** Browser-Prüfstein.
- **Client** — `deepenWithAi` ersetzt Listen bei Erfolg / lässt sie bei Fehler stehen; `AiDeepenBanner` Sichtbarkeitslogik; `SourcePill` Mapping; `LibraryObjectList` zeigt Source-Pille nur bei vorhandenem `source`.
- **Browser-Smoke (Abschluss):** Server starten → Demo-Seite per URL importieren → erste Liste mit grauen Pillen + Banner → „Mit KI vertiefen" → veredelte Liste mit grün/gelb-Pillen, keine Konsolenfehler. (Echter Claude-Lauf nur, wenn Credits vorhanden; sonst Fehlerpfad demonstrieren.)

## Neue Abhängigkeit

- **`node-html-parser`** (Server) — leichter, schneller HTML-Parser mit `querySelector`-Abfragen, ohne volles DOM/jsdom-Gewicht. Begründung: robuste Tag-/Rollen-/Struktur-Erkennung; Regex auf HTML ist für diese Aufgabe zu fehleranfällig. **Pro CLAUDE.md-Regel 6 ausdrücklich zur Freigabe vorgelegt.** Alternative ohne neue Dep: reines Regex (riskanter, nur grobe Tag-Treffer) — möglich, aber nicht empfohlen.
- Claude läuft über das bereits vorhandene `@anthropic-ai/sdk`. Kein weiterer Bedarf.

## Roadmap-Update

Neu sortiert (mit Rob am 2026-06-29 entschieden): Komponenten-Erkennung wird eigener Schritt, **URL zuerst**, danach Breite vor Gegenrichtung.

- ✅ Library-Gerüst · Token-Export · Komponenten-Export · URL → Tokens
- 🟢 **Jetzt: Komponenten aus URL (Regeln + KI)** — diese Spec
- ⚪ Danach (A→B): Repo als Quelle → Figma lesen → Figma schreiben → Sync (beide Richtungen)

## Offene Punkte für die Review

- **`node-html-parser` freigeben?** (Regel 6) — oder regex-only ohne neue Dep.
- Regel-Heuristiken (Klassen-Namen für Badge/Card, „Hero = header") sind pragmatisch und in Tests fixierbar/erweiterbar.
- HTML-Kürzungsstrategie für sehr große Seiten — Obergrenze in Tests festklopfen.
- `recognizeWithAi` re-fetcht die Seite (statt HTML/CSS clientseitig zwischenzulagern) — bewusst, hält den Client dumm und vertraut keiner client-gesendeten Liste.
