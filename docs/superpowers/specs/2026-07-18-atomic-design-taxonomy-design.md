# Atomic-Design-Taxonomie — Umstellung `atomic/component/pattern` → `atom/molecule/organism/template`

**Datum:** 2026-07-18 · **Status:** Ansatz A GELANDET & LIVE (`a220ac4`, Server 217 · Web 448 · Plugin 92) · Ansatz B (Enthaltungs-Guard) in Umsetzung
**Anlass:** Robs Figma-Test `test 7`: Cards/Charts/Tabellen liefen als „component", die ganze Seite als einziges „pattern" — aus Designer-Sicht falsch. Umstellung auf Atomic Design (Brad Frost).

**Reconcile 18.07.:** Zwei parallele Session-Stränge. Der Fork hat **Ansatz A** (Prompt-Definitionen + Regel-Remap, dieses Dokument unten) gebaut, committet & gepusht (`a220ac4`) — verifiziert grün. Der andere Strang klärte im Brainstorm die Grundsatz-Entscheidungen (4 Ebenen + Tokens subatomar, englische Labels, oberste Ebene **Templates** nicht „Page") und ergänzt **Ansatz B** (unten). Beide Stränge kamen aufs selbe Modell; Naming final **Templates** (Rob).

## Zielmodell (Robs Wahl: 5 Ebenen, englische Begriffe)

| Ebene | `kind` | Bucket-Key | Was gehört rein |
|---|---|---|---|
| Tokens | *(kein kind)* | `tokens` | Farben/Typo/Spacing/Radius/Schatten — **unverändert**, eigene Sicht |
| Atoms | `atom` | `atoms` | Nicht weiter teilbar: Button, Input, Label, Icon, Badge/Chip, Avatar, Status-Dot, einzelne Checkbox/Radio/Toggle |
| Molecules | `molecule` | `molecules` | Kleine Gruppe von Atomen als EINE einfache Einheit: Suchfeld (Input+Icon), Dropdown (Feld+Menü), einzelnes Formularfeld (Label+Input+Hint), Listeneintrag, Metrik-/Stat-Paar (Label+Zahl), Breadcrumb, Pagination |
| Organisms | `organism` | `organisms` | Größerer eigenständiger Abschnitt: **Card, Chart, Tabelle**, ganzes Formular, Navbar, Header/Topbar, **Sidebar-Navigation**, Footer, Hero, KPI-Card |
| Templates | `template` | `templates` | Gesamt-Layout des Screens (Anordnung der Organismen zu einem Screen). **Höchstens EIN** Template pro Import = der ganze Screen |

**Kernkorrektur (Robs Kritik):** Eine Card/ein Chart/eine Tabelle ist ein **Organism**, kein „component"/molecule. Ein Button/ein nacktes Input ist ein **Atom**. Die alten „patterns" Navbar/Hero/Footer/**Sidebar** werden **Organisms** — NUR der ganze Screen wird **Template**. Es ist also KEIN Wholesale-Rename `pattern→template`.

## PINNED CONTRACT (alle drei Bau-Zweige MÜSSEN exakt übereinstimmen)

1. **`kind`-Feldwert** (Singular, am einzelnen Baustein, web→plugin-Payload + überall): genau `'atom' | 'molecule' | 'organism' | 'template'`.
2. **Bucket-Keys** (Plural, HTTP-Vertrag server→web, Result-Shape, Inventory `extra`): genau `atoms`, `molecules`, `organisms`, `templates`.
3. **UI-/Sektions-Labels** (englisch, Sentence-Case im UI wie bisher): `Atoms`, `Molecules`, `Organisms`, `Templates`. Reihenfolge immer atom→molecule→organism→template.
4. **Figma-Seiten-Sektionen** (Plugin `upsertPage`): `DB/Atoms`, `DB/Molecules`, `DB/Organisms`, `DB/Templates`.
5. **Fallback-Default** für unbekannten/fehlenden kind: `'organism'` (der frühere Default `'component'` mappte auf organism; sicherer Mittelwert).
6. **Alte→neue Zuordnung** (für Fixture-Reklassifikation + Tests): `atomic`→`atom` (Ausnahme Suche/Dropdown→`molecule`); `component`→`organism`; `pattern` (Navbar/Hero/Footer/Sidebar)→`organism`, `pattern` (ganzer Screen/page.tsx)→`template`.

## Klassifikations-Logik (der wertvolle Teil — hier bricht die Migration, wenn oberflächlich)

### KI-Prompts (identischer Definitions-Block in `server/lib/claude.js` EXTRACTION_PROMPT **und** `server/lib/recognizeWithAi.js` buildPrompt)

JSON-Schema-Keys werden `atoms`/`molecules`/`organisms`/`templates`. Dazu WÖRTLICH dieser Definitions-Block (Kern der Qualität — er kodiert Robs Korrektur; englisch, da die Prompts englisch sind):

```
Classify every UI element into exactly ONE of four atomic-design levels:
- "atoms": smallest indivisible UI elements — button, input field, label, icon, badge/chip, avatar, status dot, single checkbox/radio/toggle. If it can't be split into smaller meaningful UI parts, it's an atom.
- "molecules": a small group of atoms acting as ONE simple unit — search field (input + icon), dropdown/select (field + menu), one form field (label + input + hint), a list item (icon + text + value), a metric/stat pair (label + number), breadcrumb, pagination.
- "organisms": a larger self-contained section built from molecules and atoms — a card (KPI/stat card), a chart (bar/line/donut incl. its legend and axes), a data table, a full form, a navigation bar, a header/topbar, a sidebar navigation, a footer, a hero. If it's a distinct block you could lift out and reuse as a whole section, it's an organism.
- "templates": the overall screen layout — how organisms are arranged into a full screen (e.g. sidebar + topbar + content grid). Emit AT MOST ONE template for the whole screen.
CRITICAL: a card, a chart and a table are ORGANISMS, not molecules. A button and a bare input are ATOMS. The whole screen is the single TEMPLATE — never fold the individual sections into it, and never mark an individual section as a template.
```

- Image-Prompt (`claude.js`): bbox bleibt Pflicht; für das `templates`-Element ist die bbox der ganze Screen (x:0,y:0,w:1,h:1).
- `recognizeWithAi.js`: `trimRuleList` + Rückgabe + `parsed.*` auf die 4 Keys umstellen; Draft-Schema im Prompt ebenso.

### Regelbasierter Klassifikator (`server/lib/recognizeComponents.js`)

Funktionen neu schneiden (nicht nur umbenennen). Rückgabe-Shape: `{ atoms, molecules, organisms, templates }`.

- **atoms**: Button, Input, Badge (bisher `recognizeAtomics`, aber OHNE Suche).
- **molecules**: **Suche** (Input+Icon = funktionale Kleingruppe) wandert hierher; (Listeneintrag/Formularfeld sind einzeln nicht regel-erkennbar → bleiben KI-Sache).
- **organisms**: Formular (ganzes `<form>`), Tabelle, Liste (ul/ol ≥3 li), Card (bisher `recognizeComposed`) **plus** Navbar/Hero/Footer/Sidebar (bisher `recognizePatterns`!) **plus** die Klassen-Kandidaten (bisher `recognizeCandidates` → landeten in `components`; Default jetzt organism).
- **templates**: neuer `recognizeTemplate(root)` — emittiert **höchstens ein** Template „Page Layout" (confidence low/med), wenn der Screen ein erkennbares Gesamt-Gerüst hat: ein `<main>`-Landmark ODER ein äußerster Container, der sowohl eine Navigation/Sidebar (`<nav>`/`<aside>`) als auch einen Inhaltsbereich umschließt. Kein Treffer → leeres `templates`.

### Repo-Klassifikator (`server/lib/repoInventory.js`)

- `components/ui/*` → `atoms` (unverändert die Idee „kleinste Bausteine").
- übrige Komponenten → `organisms` (bisher `components`).
- `page.tsx`/`page.jsx` → **`templates`** (bisher `patterns`); `layout.tsx` → `templates`.
- Sonstige `pages/`-Einträge → `templates`.

### Decompose-Defaults (`server/lib/decompose/{image,url,repo}Decomposer.js`)

Fallback `item.kind ?? 'component'` → `item.kind ?? 'organism'`.

### Scan-Route-Merge (`server/routes/scan.js`)

Alle `result.atomics/components/patterns` → `result.atoms/molecules/organisms/templates`; Merge-/Lift-Logik (Zeilen ~133–234) auf 4 Buckets erweitern. „Code heben" (`liftRepoInventory`) betrifft atoms+molecules+organisms (Templates tragen keinen eigenen Code — wie bisher patterns).

## Web

- **`scanResultAdapter.js`**: liest `raw.atoms/molecules/organisms/templates`, baut `extra:{atoms,molecules,organisms,templates}`.
- **`App.jsx`**: Nav-Array `['Tokens','Atoms','Molecules','Organisms','Templates','Export']`; Route-Switch + Nav-Counts + Library-Gate auf die 4 Ebenen.
- **Library-Ebenen-Seiten**: die drei fast identischen `Atomics.jsx`/`Components.jsx`/`Patterns.jsx` zu **einer generischen `LibraryLevel.jsx`** konsolidieren (Props `kind` + `title`), die 4 Routen mappen darauf. (DRY; vermeidet 4 Duplikate. Bestehende Tests der alten Seiten entsprechend auf die generische Seite umstellen.)
- **`interpret.js`, `emit/emitComponents.js`, `emit/emitFigmaComponents.js`**: die `KINDS`-Tabellen auf 4 Einträge (Reihenfolge atom→molecule→organism→template; der Ordering-Kommentar in emitFigmaComponents bleibt gültig/erweitert).
- **`Dashboard.jsx`**: Inventory-Zeilen 4 statt 3.
- **`ImportSuccess.jsx`**: „{atoms} atoms · {molecules} molecules · {organisms} organisms · {templates} templates".
- **Copy-Strings** (`Export.jsx`, `AiDeepenBanner.jsx`) auf neue Begriffe.

## Plugin

- **`types/manifest.ts`**: `ImportComponentKind = 'atom'|'molecule'|'organism'|'template'`.
- **`writer/parsePayload.ts`**: `KINDS` (4 Werte) + Fallback `'organism'`.
- **`writer/applyImport.ts`**: `KIND_ORDER` (4) + `KIND_LABELS` (Singular/Plural: Atom/Atoms, Molecule/Molecules, Organism/Organisms, Template/Templates).
- **`writer/buildComponents.ts`**: `SectionFrames` 4 Keys, `createdByKind`/`updatedByKind` init 4.
- **`writer/upsertPage.ts`**: `SECTIONS` → `DB/Atoms`, `DB/Molecules`, `DB/Organisms`, `DB/Templates`.
- **`writer/renderPlan.ts`**: `findComponentByName` iteriert die 4 Section-Keys.
- **Import-Meldung** (`formatImportSummary`): „N Bausteine neu (a Atoms, b Molecules, c Organisms, d Templates)" — leere Kategorien wie bisher weglassen, falls die bestehende Logik das tut (sonst konsistent zu heute).

## Demo-Fixtures

- **`server/fixtures/demo-dashboard.json`**: Buckets `atomics/components/patterns` → `atoms/molecules/organisms/templates`; Items nach den neuen Definitionen umsortieren (Cards/Charts/Tabelle → organisms; ein `templates`-Eintrag „Dashboard Layout" für den Screen; Button/Badge → atoms; Suche/Dropdown → molecules).
- `demo-interpretations*.json` tragen keinen kind → unverändert.

## Tests

Alle in der Blast-Radius-Karte gelisteten Tests auf die neuen Werte anpassen (Server/Web/Plugin). Besonders: exakte String-Assertions in `designbridge-plugin/tests/formatImportSummary.test.ts`; Bucket-Erwartungen in `recognizeComponents.test.js`, `repoInventory.test.js`, `scanResultAdapter.test.js`. **Neue Tests:** (a) recognizeComponents: Navbar/Sidebar → `organisms` (nicht template!), Card/Table → `organisms`, Suche → `molecules`, `<main>`-Screen → genau 1 `templates`-Eintrag; (b) repoInventory: `page.tsx` → `templates`; (c) ein Web-Test, dass die generische `LibraryLevel`-Seite für alle 4 kinds rendert.

## Ansatz B — Enthaltungs-Guard (Folge-Scheibe auf grüner A-Basis, Bild-Pfad v1)

Ansatz A verlässt sich auf die Prompt-Definitionen (nicht-deterministisch). Der Guard ist das **deterministische Sicherheitsnetz**, das genau Robs systematischen Fehler strukturell erzwingt — über die Komposition (das Wesen von Atomic Design), nicht über Bauchgefühl. **Promote-only** (hebt nur an) außer der Template-Regel (setzt hart).

**Neues Modul `server/lib/taxonomy.js`** — reine Funktion, testbar ohne KI/DOM:
```
classifyByContainment(items, { areaOf, contains }) → items mit korrigiertem kind
```
`items` = flache Liste `{ name, kind, ref }`; `areaOf(ref)` → Fläche 0..1; `contains(a, b)` → bool. Quellen-agnostisch: der Bild-Pfad liefert bbox-basierte `areaOf`/`contains`, ein späterer URL/Repo-Pfad DOM-basierte.

**Konstanten (benannt, per TDD gepinnt, als Heuristik dokumentiert):** `CONTAIN_RATIO = 0.75` (B liegt zu ≥75 % seiner Fläche in A **und** A ist flächengrößer → A enthält B), `CANVAS_RATIO = 0.80` (deckt Screen), `SECTION_RATIO = 0.05` (Mindestgröße für Organism-Boden — schützt kleine Moleküle).

**Zwei Regeln (in dieser Reihenfolge):**
1. **Template-Boden (hart):** die flächengrößte Einheit, die (a) Fläche ≥ `CANVAS_RATIO` hat UND (b) ≥ 2 andere erkannte Einheiten enthält → `kind = 'template'`. Setzt auch runter (der Screen darf kein Organism-Geschwister sein). Höchstens EINE.
2. **Organism-Boden (promote-only):** jede Einheit, die ≥ 2 andere enthält UND Fläche ≥ `SECTION_RATIO` hat → mindestens `organism` (nie zurück auf atom/molecule). Der Größenfilter lässt eine KPI-Kachel (Icon+2 Labels, < SECTION_RATIO) als `molecule` in Ruhe.

**Bild-Pfad-Verdrahtung (`server/lib/claude.js`, v1):** nach `mergeByName` die vier Arrays flach zusammenführen (kind je Herkunft), `classifyByContainment` mit bbox-`areaOf`=`w*h` (Helper existiert) und bbox-`contains` laufen lassen, dann nach kind zurück in die vier Arrays bucketen. Das `templates`-Item trägt laut Prompt bbox {0,0,1,1} → die Template-Regel greift robust, korrigiert aber auch, wenn die KI den Screen fälschlich als organism ausgibt.

**Tests:** `taxonomy.test.js` (rein) — ganzflächige Einheit mit 2 Kindern → template; große Sektion mit 2 Kindern → organism; kleine Kachel < SECTION_RATIO → bleibt molecule; promote-only (Atom ohne Enthaltung bleibt Atom); genau EIN Template. Plus `claude.test.js`-Integration mit Fake-KI-Client: KI labelt Card als molecule + Screen als organism → Guard hebt Card→organism, Screen→template.

**Bewusst NICHT in B v1 (YAGNI/Folge):** URL/Repo-DOM-Guard (Selektoren tragen keine bbox; die Regel-Remap aus A klassifiziert dort bereits Card→organism etc.) — dokumentierter Folge-Schritt, sobald der Bild-Guard sich bewährt.

## Bewusste Grenzen (dokumentiert)

- **Enthaltungs-Guard ist Heuristik** (bbox): überlappende/ungenaue KI-bboxes können Kanten falsch einordnen; Schwellen tunebar. Greift v1 nur im Bild-Pfad.
- **Persistierte Figma-Frame-Namen** (`DB/Atomics` … in ALTEN Files) werden nach dem Rename NICHT wiederverwendet — der Import legt neue `DB/Atoms`-Sektionen an. Akzeptiert: Robs Workflow importiert in LEERE Files (RESUME-Regel).
- **Alte `localStorage`-Library-Daten** (Bucket `atomics/…`) einer laufenden Sitzung erscheinen nach dem Deploy leer, bis neu importiert wird. Akzeptiert (kein Migrations-Shim; Testphase).
- **Template-Erkennung aus einem Screenshot** bleibt heuristisch (höchstens 1, „Page Layout") — Template↔Page-Feinunterscheidung wurde bewusst zu einer Ebene zusammengefasst.
- Molecule↔Organism-Grenze ist bei Auto-Erkennung naturgemäß unscharf; die KI-Definitionen + Regel-Defaults setzen die dokumentierte Konvention, der Designer kann in der Library urteilen (Re-Kategorisierungs-UI = spätere Scheibe, nicht hier).
