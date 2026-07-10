# Scheibe ②: URL/DOM-Decompose — KI-Interpretation für den URL-Import

**Datum:** 2026-07-10 · **Status:** Design freigegeben (Rob, Brainstorm 10.07.) · **Baut auf:** [2026-07-08-source-decomposition-design.md](2026-07-08-source-decomposition-design.md) (Slice 1, gemergt auf `main`)

## Ziel

Der URL-Import bekommt **dieselbe Systematik wie der Bild-Import**: Bausteine ohne Hand-Template werden nach dem Import automatisch KI-interpretiert und erscheinen mit gelber Pille „von KI interpretiert" in der Library. Quelle der Interpretation ist nicht ein Bild-Crop, sondern der **echte DOM-Ausschnitt** (HTML + relevantes CSS) des Bausteins — die KI übersetzt echtes Markup nach shadcn/Tailwind statt aus Pixeln zu raten.

**Scope:** nur URL. Repo-Import folgt als letzte Scheibe (eigenes Design — viele Dateien statt ein DOM).

## Entscheidungen (aus dem Brainstorm)

| Frage | Entscheidung |
|---|---|
| Auslöser | **Automatisch nach Import**, identisch zum Bild-Fluss (nicht der „Mit KI vertiefen"-Knopf) |
| Erkennung | **Instanzbasiert erweitern** — pro Baustein ein DOM-Selektor (Gegenstück zur `bbox`); zusätzlich „unerkannte" Baustein-Kandidaten mit Selektor |
| Transport Scan→Interpret | **Option A: `pageStore`** analog `imageStore` (HTML+CSS, 15 min TTL, `meta.import_id`) — kein Re-Fetch, kein Client-HTML |
| Interpretations-Call | **Text-basiert** (kein Vision): HTML-Ausschnitt + CSS-Digest je Segment, EIN Call pro Import |
| UI | **Null neue UI** — bestehende Orchestrierung (Pille, iframe, jsx, Retry) unverändert |

## Architektur

```
POST /api/scan/url
  fetchSite → ingestCss → recognizeComponents (NEU: + selector je Instanz,
                                               + unerkannte Kandidaten)
  → pageStore.put({html, css})  → meta.import_id
  → Response (Shape unverändert + selector-Felder)

Web (bestehende interpret.js-Orchestrierung, unverändert)
  → POST /api/interpret/components { import_id, components }

Route interpret:
  Store-Lookup: imageStore ODER pageStore (der Eintrag kennt seine Quelle)
  → getDecomposer('url').decompose({html, css}, components) → Segment[]
       bounds = DOM-Pfad · structure = { html: outerHTML, css: Digest } · visual = null
  → interpretComponents: bei structure-Segmenten Text-Prompt
       („übersetze dieses HTML/CSS so originalgetreu wie möglich in shadcn/Tailwind")
  → { interpretations: [{name, html, jsx}], failed: [...] }
```

## Komponenten

1. **`recognizeComponents` instanzbasiert** (`server/lib/recognizeComponents.js`)
   - Jeder erkannte Baustein bekommt `selector` (stabiler CSS-Pfad zur repräsentativen Instanz, z. B. `nav`, `form#login`, `.card:nth-of-type(1)`).
   - Neu: **unerkannte Kandidaten** — abgegrenzte Container/wiederholte Klassen-Cluster ohne Regel-Treffer → Einträge `{name (aus Klasse/Tag abgeleitet), confidence:'low', source:'rules', selector}`. Das sind die Interpretations-Kandidaten.
   - Aggregierte Antwort-Shape bleibt kompatibel (nur additive Felder).

2. **`pageStore`** (`server/lib/pageStore.js`) — Kopie des `imageStore`-Musters: `put({html, css}) → id`, `get(id)`, TTL 15 min, In-Memory. Eintrag trägt `kind:'url'`.

3. **`UrlDecomposer`** (`server/lib/decompose/urlDecomposer.js`) — implementiert den bestehenden `Segment`-Contract, registriert in `getDecomposer()`-Fabrik unter `'url'`:
   - `decompose({html, css}, components)` → je Baustein: Subtree via `selector` (node-html-parser), `structure.html` = outerHTML (gekappt ~8k Zeichen), `structure.css` = Regeln, deren Selektoren Klassen/Tags des Subtrees treffen (Heuristik, gekappt, Warnung bei Kürzung), `bounds` = DOM-Pfad.
   - Selector trifft nichts → Segment ohne `structure` (Vollseiten-Fallback wie beim Bild das Vollbild).

4. **`interpretComponents` text-fähig** (`server/lib/interpretComponents.js`) — Segmente mit `structure` statt `visual` → Textblöcke im Prompt statt Bilder. Prompt-Kern: originalgetreue Übersetzung (echte Texte, Struktur, Zustände aus dem Markup übernehmen — analog zur Chart-Fidelity-Härtung von Slice 1). Weiterhin EIN Call, JSON-Antwort `{name, html, jsx}` je Baustein, Script-Stripping unverändert.

5. **Route** (`server/routes/interpret.js`) — Lookup `imageStore` → `pageStore`; `kind` des Treffers wählt den Decomposer. 410 wenn nirgends, `DEMO_FALLBACK=1` → neue Fixture `demo-url-interpretations.json`.

6. **Web** (`web/src/...`) — URL-Import-Pfad reicht `meta.import_id` durch (wie Bild-Pfad); sonst keine Änderung. `adaptScanResponse` reicht `selector` mit durch.

## Fehlerbehandlung

Identisch Slice 1: KI-Fehler → Platzhalter + „Interpretation fehlgeschlagen" + „Erneut versuchen"; `DEMO_FALLBACK=1` → Fixtures; Import selbst scheitert **nie** an der Interpretation (ADR-001: KI nie Grundvoraussetzung). `import_id` abgelaufen → 410 mit deutscher Meldung.

## Tests (TDD, alle 0 Credits)

- `recognizeComponents`: Selektoren je Kategorie, unerkannte Kandidaten (Fixture-HTML), Shape-Kompatibilität.
- `pageStore`: put/get/TTL (Muster imageStore-Tests).
- `urlDecomposer`: Subtree-Extraktion, CSS-Digest-Heuristik, Kappung+Warnung, Selector-Miss → Fallback-Segment.
- `interpretComponents`: Text-Segment-Prompt-Aufbau, Fake-Client, gemischte visual/structure-Fälle.
- Route: pageStore-Lookup, kind-Weiche, 410, DEMO-Fallback.
- Web: bestehende interpret-Orchestrierung greift nach URL-Import (Fixture-Response).
- **Browser-Smoke:** `npm run dev:demo` → Demo-URL importieren → unerkannte Bausteine zeigen KI-Vorschau (Fixture). Live-Fidelity erst mit Credits — offen markieren, kein Gate.

## Nicht in dieser Scheibe

Repo-Decompose (letzte Scheibe) · Figma-Export der KI-Bausteine (Scheibe ③, plan-vs-jsx-Frage offen) · „Mit KI vertiefen"-Knopf ändern (bleibt wie er ist) · Slice-1-Feinschliff-Punkte (separat, ggf. nebenbei).
