# Repo-Decompose v1 — Design-Spec

**Datum:** 2026-07-14
**Status:** In Brainstorm mit Rob freigegeben (A/B/C-Entscheidungen unten), wartet auf Spec-Review
**Vorgänger:** Scheibe ① (Bild-Decompose), Scheibe ② (URL-Decompose), Scheibe ③ v2 (HTML→Figma über computed styles)
**Verwandt:** [[project-designbridge-visual-reference]], [[project-designbridge-roadmap]]

## Ziel in einem Satz

Die letzte offene Quelle — das **Code-Repository** — bekommt dieselbe „interpretierte visuelle Referenz je Baustein" wie Bild und URL, aber nach dem repo-spezifischen Prinzip: **erkennbares Design-System → echten Code heben, nicht interpretieren.** Interpretation ist opt-in.

## Warum (Problem heute)

Der Repo-Import läuft schon end-to-end (`POST /api/scan/repo`, deterministisch, 0 Credits): Tarball → `extractRepoFiles(files[{path,content}])` → `ingestRepoFiles` = Tokens + `recognizeRepoInventory`. Zwei Lücken:

1. **Die Datei-Inhalte werden nach dem Zählen weggeworfen.** `recognizeRepoInventory` liefert nur Name + Pfad (der Pfad steckt heute nur in `notes: "aus <path>"`). Der echte Komponenten-Quellcode fließt nirgends durch.
2. **Es gibt keinen `repoDecomposer`.** Die Decompose-Fabrik (`server/lib/decompose/index.js`) kennt nur `image` + `url`.

Folge: Repo-Bausteine ohne Hand-Template zeigen in der Library nur den „Vorlage fehlt"-Platzhalter — genau die Lücke, die Scheibe ① (Bild) und ② (URL) für ihre Quellen geschlossen haben.

## Grundprinzipien (Robs Vision, im Brainstorm bestätigt)

- **Invarianter Weg:** Quelle → technisches Repository (Library) → Figma. Nie direkt Quelle→Figma.
- **Bei einem Repo ist die Quelle bereits ein echtes, erkennbares Design-System** (shadcn/Tailwind-Code). Deshalb gilt hier die „heben statt interpretieren"-Regel: der echte Code IST das technische Artefakt. Keine toten Pixel, keine unnötige Neu-Erfindung von Code, der schon gut ist.
- **KI-Interpretation ist Veredelung auf Knopfdruck**, nie Grundvoraussetzung (ADR-001). Der Import ist auch mit leeren Credits voll vorzeigbar.

## Entscheidungen aus dem Brainstorm

| Frage | Entscheidung |
|---|---|
| Komponente ohne Hand-Template → was tun? | **C) Hybrid nach Prinzip:** erkennbares DS → echten Code **heben**; Interpretation nur als Fallback. |
| Wie wird eine gehobene Komponente in v1 zur Vorschau? | **C) pragmatisch:** echten Quellcode als Wahrheit zeigen · gerenderte Vorschau nur für die 4 Templates (Token-Render, existiert) · gerenderte Vorschau des Rests = KI-Interpretation. **Kein deterministischer tsx-Parser in v1.** |
| Wann läuft die KI-Interpretation? | **Auf Knopfdruck pro Baustein** (nicht automatisch wie bei Bild/URL). Repo hat schon echten Code → Interpretation ist Kür. |
| Patterns/Seiten/Layouts heben? | **Nein — nur Namen** wie heute. Eine Next.js-Seite/Layout ist keine einzelne renderbare Einheit. |
| Code beim Import mitliefern oder lazy? | **Beim Import mit**, mit Größen-Cap pro Datei (`CODE_CAP = 8000` Zeichen). Lazy-Nachladen ist eine spätere Optimierung. |

## Architektur

### Neue Bausteine (nur 4 Dinge sind echtes Neuland)

**1. `server/lib/repoStore.js`** — ephemerer Speicher der extrahierten Repo-Dateien, keyed by `import_id`, TTL 15 min. Exakte Kopie des Musters von `imageStore.js` / `pageStore.js`.
- API: `putRepo(files, meta) -> import_id` · `getRepo(import_id) -> {files, meta} | null`.
- `files` = das `[{path, content}]`-Array aus `extractRepoFiles`. Wird beim Ablegen NICHT beschnitten (Cap greift erst im Decomposer, damit die AI-Vertiefung später vollen Kontext hätte).

**2. `server/lib/decompose/repoDecomposer.js`** — erfüllt `decompose(source, inventory) -> Segment[]`.
- `source = { files }` (aus `repoStore` bzw. direkt beim Scan).
- Baut eine `path → content`-Map aus `files`.
- Für jeden Inventar-Baustein: matcht über `item.path` (siehe Refactor unten) die Datei, hängt `structure: { code, path, lang }` an (`lang` aus der Dateiendung: `tsx|ts|jsx|js`). Optionaler Parameter `{ cap }`: ohne Cap voller Code (Interpret-Pfad), mit `cap: CODE_CAP` beschnitten (Scan-Response-Pfad).
- Fehlt die Datei (Pfad nicht in der Map): `structure: null`, Segment bleibt aber gelistet (graceful — Name/Confidence/notes bleiben).
- In `REGISTRY` unter `repo` eintragen.
- **Zwei Aufrufer, eine Funktion:** die Scan-Route ruft `repoDecomposer` beim Import über das ganze Inventar auf, um den gehobenen Code in den Response zu legen; die Interpret-Route ruft ihn pro Baustein für die on-demand-Interpretation auf. Kein zweiter Code-Pfad.

**3. `recognizeRepoInventory` (Refactor):** jeder Inventar-Eintrag bekommt zusätzlich ein **strukturiertes `path`-Feld** (heute nur in `notes`). Rückwärtskompatibel: `notes` bleibt. Betrifft `atomics` + `components` (die echte Komponentendateien haben); `patterns` (Seiten/Layouts) tragen kein `path` fürs Heben.

**4. `interpretComponents` (Erweiterung):** versteht ein Segment mit `structure.code`. Neue Prompt-Variante:
> „Hier ist echter shadcn/Tailwind-Quellcode einer Komponente. Erzeuge eine **originaltreue** eigenständige Vorschau, die die **echten Klassen/Styles bewahrt** — nicht neu erfinden. Gib `html` (Inline-Styles) + `jsx` (Tailwind) zurück."

Gleiche Ausgabe-Shape wie heute (`{name, html, jsx, ...}`) → die bestehende Vorschau- **und** Figma-Kette (`htmlToPlan` aus Scheibe ③ v2 → Plan → Figma) greift automatisch.

### Segment-Contract

Erweiterung von `structure` in `server/lib/decompose/index.js` (JSDoc):

```
@property {?{html?:string, css?:string, code?:string, path?:string, lang?:string}} structure
```

Bild nutzt `visual`; URL nutzt `structure.{html,css}`; Repo nutzt `structure.{code,path,lang}`. Downstream bleibt quellen-agnostisch.

### Route-Verdrahtung

**`POST /api/scan/repo`** (bestehend, minimal erweitert): nach `extractRepoFiles`
1. die Dateien in `repoStore` ablegen und die ID durchreichen (für die spätere on-demand-Interpretation, die den vollen Datei-Kontext braucht);
2. `repoDecomposer` über das Inventar laufen lassen und den gehobenen Code (capped) in den Response legen — so ist der echte Quellcode **direkt beim Import da** (Robs Entscheidung „Code kommt beim Import mit"), ohne einen zweiten Roundtrip.

```js
const importId = putRepo(files, { sourceUrl, branch: usedBranch });
const inventory = [...result.atomics, ...result.components]; // patterns tragen keinen Code
const segments = await getDecomposer('repo').decompose({ files }, inventory, { cap: CODE_CAP });
// code/lang aus den Segmenten zurück in die atomics/components-Einträge mergen (per name/path)
result.meta = { ...result.meta, import_id: importId };
```
(`import_id` analog zu `import_id: putPage(html, css)` bei URL.)

**`POST /api/interpret/components`** (bestehend, erweitert): die Quellen-Weiche um Repo ergänzen:
```js
const image = getImage(importId);
const page  = image ? null : getPage(importId);
const repo  = image || page ? null : getRepo(importId);
if (!image && !page && !repo) return 410 …;
const kind = image ? 'image' : page ? 'url' : 'repo';
const source = image ? { imagePath: image.path, mimetype: image.mimetype }
             : page  ? { html: page.html, css: page.css }
             :         { files: repo.files };
const segments = await getDecomposer(kind).decompose(source, components);
const result = await interpretComponents(image?.path ?? null, image?.mimetype ?? null, segments);
```
`DEMO_FALLBACK`-Zweig bekommt eine dritte Fixture-Datei `demo-repo-interpretations.json` für `kind === 'repo'` (deckt die Nicht-Template-Bausteine des Smoke-Repos ab).

Kein neuer Endpoint nötig — Interpretation läuft über die bestehende `/api/interpret/components`, nur pro Baustein aufgerufen (der Client schickt jeweils genau einen Baustein in `components`).

## Datenfluss (end-to-end)

1. **Import:** `POST /api/scan/repo` → Tokens + Inventar (jeder gehobene Baustein trägt bereits `code` + `lang`, capped) + `meta.import_id`; volle Dateien liegen zusätzlich im `repoStore` (für die spätere Interpretation).
2. **Library rendert sofort (0 Credits):** Tokens wie heute · die 4 Templates als Token-Render · jeder gehobene Baustein zeigt seinen **echten Quellcode** (`code` aus dem Import-Response) + Pille **„aus Repo gehoben"** + Knopf **„Mit KI interpretieren"**.
3. **Opt-in Interpretation:** Klick auf einen gehobenen Baustein → `POST /api/interpret/components` mit genau diesem einen Baustein → `repoDecomposer` liefert (aus `repoStore`) das Code-Segment mit vollem, ungekürztem Code → `interpretComponents` → gerenderte iframe-Vorschau + jsx → Karte tauscht Platzhalter gegen Vorschau, Pille wird **„von KI interpretiert"** (gelb).

**Cap-Logik:** Der Import-Response trägt `code` auf `CODE_CAP` (8000) beschnitten (schlanker Response, reicht zum Lesen). Die on-demand-Interpretation liest den **vollen** Datei-Inhalt frisch aus `repoStore` (dort ungekürzt abgelegt), damit die KI den ganzen Kontext bekommt.

## Fehlerbehandlung

- `repoStore`-Miss (TTL abgelaufen) bei Interpret/Segments → **410** „Quelle nicht mehr verfügbar — bitte erneut importieren." (wie URL/Bild heute).
- Datei zu einem Inventar-Pfad fehlt → Segment ohne `structure`, kein Crash; die Karte zeigt dann nur Name + „kein Quellcode gefunden"-Hinweis, kein Interpret-Knopf.
- Live-Interpret-Call scheitert + `DEMO_FALLBACK=1` → Fixture-Fallback (bestehendes Muster).
- `CODE_CAP` überschritten → Code beschnitten + Segment-`notes` bekommt „(gekürzt)".

## Tests

**Server (`node --test`):**
- `repoStore`: put/get, TTL-Ablauf, Miss → null.
- `repoDecomposer`: Inventar + Dateien → Segmente mit `structure.code`; fehlende Datei → `structure:null`, Segment bleibt; `cap`-Kürzung (mit/ohne); `lang`-Ableitung.
- `recognizeRepoInventory`: `path`-Feld auf atomics/components vorhanden, patterns ohne `path`.
- `interpretComponents`: Code-Segment (Fake-Client) → korrekte Ausgabe-Shape; imagePath=null erlaubt.
- Route: `/api/scan/repo` gibt `import_id` zurück **und** `code`/`lang` auf den gehobenen Bausteinen; `/api/interpret/components` mit `kind:repo` (voller Code aus `repoStore`).

**Web (Vitest):**
- `SourcePill`: neue Variante „aus Repo gehoben".
- `LibraryObjectList`: gehobener Baustein zeigt Code + Interpret-Knopf; nach Interpret Vorschau + Pillenwechsel; Gating (`source:'repo'` durchlassen in `interpret.js` **und** `App.jsx` — beide Gates, s. Slice-2-Bug `0566cc8`).

**Browser-Smoke (`DEMO_FALLBACK=1`):** echtes Public-Repo (`shadcn-ui/taxonomy`, wie im Phase-4-Smoke) importieren → Tokens + Inventar; gehobene Bausteine zeigen echten Code + „aus Repo gehoben"; Klick „Mit KI interpretieren" an einem Nicht-Template-Baustein → Fixture-Vorschau + Pillenwechsel; keine Konsolenfehler.

## Scope / YAGNI

**Drin (v1):** `repoStore`, `repoDecomposer`, `path`-Feld im Inventar, `structure.code`, `code`/`lang` im Scan-Response, Code-Prompt-Variante, `SourcePill`-Variante, Per-Baustein-Interpret-Knopf in der Library, Demo-Fixtures.

**Bewusst draußen (später):** deterministischer tsx→HTML-Parser (die „Kür" statt KI) · Auto-Interpret · statische Render-Vorschau von rohem Code ohne KI · Heben von Patterns/Seiten · Lazy-Code-Nachladen pro Karte · private Repos / Monorepo-Unterpfade (schon bei Repo-Ingester offen).

## Wiederverwendung (der Hebel — meiste Arbeit steht schon)

- `htmlToPlan` (Scheibe ③ v2) → Figma-Export der interpretierten Bausteine läuft automatisch.
- `interpretComponents` → nur um Code-Variante erweitert.
- `imageStore`/`pageStore` → Vorlage für `repoStore` (fast 1:1).
- Decompose-Fabrik → nur ein Registry-Eintrag + eine Datei.
- `SourcePill`, `LibraryObjectList`, Per-Baustein-Interpret (Slice-1-Fast-Follow) → nur variantenerweitert.
- Interpret-Route → Quellen-Weiche um einen Zweig erweitert.
