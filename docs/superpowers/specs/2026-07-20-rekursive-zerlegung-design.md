# Rekursive Zerlegung — Kleinteile aus Organismen als eigene Library-Bausteine (Bild-Pfad v1)

**Datum:** 2026-07-20 · **Status:** Design freigegeben (Rob), Spec zum Review
**Branch:** `experiment/rekursive-zerlegung` (Experiment-Strang, kein Railway-Deploy; Rückführung nach `main` = bewusster Extra-Schritt, frühestens nach dem 29.07.)
**Baut auf:** [2026-07-18-atomic-design-taxonomy-design.md](2026-07-18-atomic-design-taxonomy-design.md) (`taxonomy.js`, 4 Ebenen, Enthaltungs-Guard)

## Anlass / Befund

Robs Bild-Import-Test (Executive-Dashboard) lieferte nur **3 Atome** (Logo, Notification Icon, Badge) und **0 Molecules** — keine Buttons, keine Nav-Items. **Ursache:** Der Bild-Scan listet die *eigenständigen Top-Level*-Bausteine je Ebene, zerlegt Organismen aber **nicht in ihre inneren wiederverwendbaren Teile**. Die 9 Sidebar-Nav-Items und die KPI-Card-Innereien (Label/Wert/Trend-Badge/Icon) stecken zwar in der Analyse, aber als namenlose Bestandteile *innerhalb* der Organismen — nicht als eigene Library-Atome/Moleküle. Gegenbeweis „kein Tool-Limit": ein Signup-Screen lieferte 11 Atome inkl. 3 Buttons.

## Ziel / Erfolgskriterium

Nach v1 liefert derselbe Executive-Dashboard-Scan zusätzlich die wiederverwendbaren Kleinteile als eigene Bausteine — konkret mindestens: **Nav Item** (1 Molekül, `instanceCount 9`, `partOf: Sidebar`), die KPI-Card-Innereien (**Stat Pair** o. Ä. als Molekül, `partOf: KPI-Card`), sowie einzelne echte Atome (Button/Search/Avatar), sofern im Screen vorhanden.

**Granularität = A (kuratiert)** (Robs Wahl): herausgezogen wird, was sich **wiederholt** ODER klar ein **Standard-Atom** ist (Button, Input, Icon, Badge, Avatar). Einmalige Deko-Container bleiben im Organismus. NICHT „voll atomar" (jedes Label/jede Zahl = Atom) — das wäre Rauschen.

## Ansatz (Robs Wahl: ② KI-Pass, quotaschonend)

Kein zweiter API-Call. Der bestehende **einzige** Bild-Scan-Call (`analyzeScreenshot` → `EXTRACTION_PROMPT` in `server/lib/claude.js`) wird um eine Zerlegungs-Instruktion **angereichert**. Damit: KI-Qualität bei den Namen, **null zusätzlicher Quota-Verbrauch** pro Organismus. (Robs Vorgabe: „wenn es bessere Ergebnisse liefert, darf es was kosten" — hier kostet es sogar nichts extra.)

Die bestehende Infrastruktur trägt den Rest:
- `mergeByName` dedupt gleichnamige Items → Basis fürs Instanz-Zählen.
- `applyContainmentGuard` + `buildCompositionTree` (bbox-basiert) kennen bereits Eltern-Kind über Enthaltung → Basis für `partOf`.

## Datenmodell (minimaler Zusatz)

Jedes Inventory-Item (atoms/molecules/organisms) bekommt zwei **optionale** Felder (weggelassen = Default, analog zur `stretch`/`grow`-Konvention):

| Feld | Typ | Default | Bedeutung |
|---|---|---|---|
| `instanceCount` | number | `1` | Wie oft der Baustein im Screen vorkommt (Nav Item → 9). |
| `partOf` | string \| undefined | `undefined` | Name des Organismus/Templates, in dem der Baustein steckt (herausgezogenes Kind). Top-Level-Bausteine haben kein `partOf`. |

`bbox` bleibt Pflicht für alle Nicht-Template-Items (nötig für `partOf`-Ableitung).

## PINNED CONTRACT

1. Feldnamen exakt: `instanceCount` (Zahl ≥ 1), `partOf` (String, Name eines Items aus derselben Antwort, oder weggelassen).
2. `instanceCount` fehlt/ungültig → als `1` behandeln. `partOf` fehlt → Top-Level.
3. Reihenfolge/Bucket-Keys/`kind`-Werte unverändert aus der Taxonomie-Spec (`atoms|molecules|organisms|templates`).
4. `partOf` verweist immer auf einen **Namen** (nicht Index), damit web/adapter es ohne Positionswissen anzeigen kann.

## Änderungen (Blast Radius)

### Server

**`server/lib/claude.js` — `EXTRACTION_PROMPT`:** Neuer Instruktionsblock (englisch, da Prompt englisch), sinngemäß:
> After listing the top-level inventory, also DECOMPOSE each organism into its reusable inner building blocks and add them to the appropriate `atoms`/`molecules` arrays. Extract an inner element when it (a) repeats within the screen, OR (b) is a standard reusable atom (button, input, icon, badge, avatar, single control). Do NOT extract one-off decorative containers. When an element repeats (e.g. sidebar nav items), emit it ONCE with `instanceCount` = how many times it appears — never list it multiple times. For every extracted inner element set `partOf` to the exact `name` of the organism it belongs to. Give inner elements a reusable, generic name (e.g. "Nav Item", not "Dashboard nav item 3").

- JSON-Schema im Prompt: `atoms`/`molecules`/`organisms` um `"instanceCount": 1` und `"partOf": "organism name"` (optional) ergänzen.

**`server/lib/claude.js` — `mergeByName`:** akkumuliert `instanceCount` — `instanceCount` des zusammengeführten Items = Summe der `instanceCount` je Einzeltreffer (fehlend = 1). Robust gegen beide KI-Verhalten (1× mit Count 9 **oder** 9× mit Count 1). `partOf` des ersten Treffers behalten (wie notes/confidence); bbox-Regel unverändert (größte gewinnt).

**`server/lib/claude.js` — `partOf`-Ableitung (Sicherheitsnetz):** nach `applyContainmentGuard` einmal `buildCompositionTree` über alle Nicht-Template-Items laufen lassen; für jedes Item **ohne** von der KI gesetztes `partOf`, das laut Baum einen Elternteil hat, `partOf` = Elternname setzen. KI-gesetztes `partOf` gewinnt (KI kennt Semantik besser als bbox-Heuristik). Rein additiv, überschreibt nichts.

**`server/lib/taxonomy.js`:** neue reine Helfer-Funktion `parentByName(items, { areaOf, contains }) → { [childName]: parentName }` (leitet aus `buildCompositionTree` ab; nur direkte Kante). Keine Änderung an bestehenden Funktionen.

**`server/routes/scan.js`:** Merge-/Lift-Logik trägt `instanceCount`/`partOf` unverändert durch (Felder nicht verlieren). „Code heben" (`liftRepoInventory`) unberührt.

### Web

- **`web/src/lib/scanResultAdapter.js`:** `instanceCount`/`partOf` mit in `extra:{atoms,molecules,organisms,templates}` durchreichen.
- **`web/src/pages/LibraryLevel.jsx`** (generische Ebenen-Seite): pro Baustein ein kleines Label rendern: `Teil von {partOf} · ×{instanceCount}` — beide Teile nur zeigen, wenn vorhanden/`>1` (Top-Level ohne `partOf` und `instanceCount 1` → kein Label, wie heute). Stil: bestehender zinc/white-Look, kleiner, unaufdringlich.
- Counts in Nav/Dashboard: **unverändert** — sie zählen Bausteine (distinct), nicht Instanzen. `instanceCount` ist reine Anzeige am Baustein.

### Plugin — BEWUSST NICHT in v1

`instanceCount`/`partOf` sind Anzeige-Metadaten; der Figma-Import legt weiterhin je Baustein *ein* Component an. Kein Plugin-Change nötig. (Später denkbar: Instanzen im Figma-Frame, oder `partOf` als Sektions-Hinweis — Folge-Schritt.)

## Tests (TDD)

Reine, KI-freie Funktionen zuerst:
1. **`mergeByName`** (`claude.test.js` bzw. dediziert): 9× „Nav Item" (je ohne Count) → 1 Item, `instanceCount 9`. 1× „Nav Item" mit `instanceCount 9` + 1× ohne → `instanceCount 10`. Fehlendes/0/negatives Count → als 1.
2. **`parentByName`** (`taxonomy.test.js`): kleine Items in großem Container → `{child: parent}`; ohne Enthaltung → kein Eintrag; kleinster enthaltender Container gewinnt (verschachtelt).
3. **`partOf`-Ableitung** (`claude.test.js`): Item ohne KI-`partOf` aber im Baum enthalten → `partOf` gesetzt; KI-`partOf` bleibt unangetastet.
4. **Integration mit Fake-KI-Client** (`claude.test.js`): KI liefert Sidebar-Organism (bbox groß) + 9 gleichnamige „Nav Item"-Atome/Moleküle (bbox innerhalb) → Endergebnis: genau 1 „Nav Item" mit `instanceCount 9`, `partOf: Sidebar`; Sidebar bleibt Organism.
5. **Web:** `scanResultAdapter`-Test führt `instanceCount`/`partOf` durch; ein `LibraryLevel`-Render-Test zeigt „Teil von Sidebar · ×9" bzw. kein Label für Top-Level.

Baseline vor Start: Server 289/289 grün (bereits verifiziert im Worktree).

## Bewusste Grenzen / Non-Goals (dokumentiert)

- **KI-Namen nicht-deterministisch** — mal „Nav Item", mal „Menu Entry". Für v1 akzeptiert (Umbenennen in der Library möglich); Namens-Konsistenz härten, falls es stört (z. B. kontrolliertes Vokabular im Prompt).
- **Token-/subatomare Verlinkung** (Robs Punkt: extrahierte Kleinteil-Werte auf schon extrahierte Tokens verknüpfen) — **Folge-Schritt**, nicht v1. Das Datenmodell (eigene Bausteine mit Werten) ist die Voraussetzung dafür und wird hier gelegt.
- **URL- & Repo-Pfad** — nur Bild-Pfad v1 (dort trat der Befund auf, schnellster Beweis). Repo-Pfad hebt ohnehin echten Code; DOM-basierte Zerlegung = eigener Folge-Schritt.
- **`partOf` nur eine Ebene** — Baustein zeigt auf seinen direkten Organismus, keine tiefe Pfad-Kette. Reicht für A.
- **Enthaltungs-Ableitung ist bbox-Heuristik** — überlappende/ungenaue KI-bboxes können `partOf` mal danebenlegen; KI-`partOf` als bevorzugte Quelle mildert das.
