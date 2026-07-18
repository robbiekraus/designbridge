# Repo-Composition-Extraktion (Scheibe 2: Code-rein)

**Datum:** 2026-07-18
**Status:** Spec — zur Review
**Baut auf:** `2026-07-18-composition-nesting-figma-design.md` (Scheibe 1). Nutzt dessen
kanonisches Modell `raw.composition` und den **Fluss-Modus** von `composePlan`
unverändert. Diese Scheibe fügt **eine** neue Fähigkeit hinzu: die echte Verschachtelung
aus einem Code-Repo lesen und in `raw.composition` schreiben.

---

## Kernidee

In einem Code-Repo **existiert die Verschachtelung bereits**: eine Komponente rendert
andere Komponenten (JSX-Nutzung), die sie importiert. Wir parsen den **Import-/JSX-Graph**
der Inventar-Dateien und leiten daraus **direkte** Eltern-Kind-Kanten ab (per
Komponenten-Identität = Baustein-Name). Das Ergebnis fließt in `raw.composition` — und
weil Scheibe 1 den Fluss-Modus schon baut, komponiert der Figma-Port Repo-Importe damit
**automatisch als verschachtelte Instanzen**, ganz ohne Emit-Änderung.

„Das Repo ist die Quelle der Wahrheit" (Robs Wortlaut) — wir raten nichts, wir übernehmen
die vorhandene Struktur.

---

## Ausgangslage (Explore-Kartografie)

- Repo-Import liefert dieselben Buckets wie der Bild-Scan, aber **flach & rein
  pfadbasiert** (`repoInventory.js`): `components/ui/*`→atoms, `components/*`→organisms,
  `layout.*`/Seiten→templates. **`molecules` ist immer `[]`.** Keine Hierarchie.
- Jedes Item trägt `{ name, confidence, source:'rules', notes:"aus <path>", path }`
  (+ `variants:[]` bei atoms) und bekommt via `liftRepoInventory` `sourceCode` (max
  8000 Zeichen) + `lang` angehängt.
- **Kein bbox.** Alle Segmente `bounds:null`. Der Import-/JSX-Graph steckt roh im
  `sourceCode` bzw. den Dateien im `repoStore`, wird aber **nicht geparst**.

---

## PINNED CONTRACT

### 1. Graph-Extraktion (neue Lib `server/lib/repoComposition.js`)

```js
export function buildRepoComposition(inventoryItems, files) -> { children, roots }
```

- `inventoryItems` = die klassifizierten Repo-Bausteine (alle 4 Buckets), jeder mit
  `name`, `path`, ggf. `sourceCode`/`lang`.
- `files` = die extrahierten Repo-Dateien (Pfad → Inhalt), aus `repoStore`.
- Ausgabe = **exakt** `raw.composition`-Vertrag aus Scheibe 1
  (`{ children:{[name]:string[]}, roots:string[] }`).

**Kanten-Ableitung (heuristisch, aber strukturell — kein Stil-Raten):**
1. **Namens-Index** bauen: jeder Inventar-Baustein → Menge seiner möglichen
   Code-Bezeichner. Quelle: der Datei-`basename` ohne Erweiterung (z. B.
   `SidebarNav.tsx`→`SidebarNav`) UND der Default-/Named-Export-Bezeichner, falls
   erkennbar. Mehrere Bausteine mit gleichem Bezeichner → dieser Bezeichner ist
   mehrdeutig und wird **ignoriert** (keine falsche Kante).
2. Pro Datei den Quelltext scannen auf **JSX-Verwendung** `<Ident …>` / `<Ident/>` von
   Bezeichnern aus dem Index (Groß-Anfangsbuchstabe = Komponente, nicht HTML-Tag).
   Optional gegen die `import`-Zeilen der Datei gegenprüfen (nur Verwendungen zählen,
   die auch importiert sind — schließt zufällige Namensgleichheit aus).
3. **Kante** parentName → childName, wenn Datei(parent) mindestens eine JSX-Verwendung
   von childName enthält. Selbstbezug ausgeschlossen.
4. **Nur direkte Kanten behalten:** enthält parent A ein Kind C **und** ein Kind B, und
   B enthält C ebenfalls, dann hängt C an B (dem tieferen), nicht an A. (Transitive
   Reduktion über die gerichteten Kanten; der Graph ist bei React-Rendern praktisch
   azyklisch — bei einem echten Zyklus die Kante(n) verwerfen, die ihn schließen, +
   Warnung.)
5. `roots` = Bausteine ohne eingehende Kante (i. d. R. `layout`/Seiten-Templates).
6. **Lesereihenfolge der Kinder** = Reihenfolge des ersten Auftretens im Elternteil-
   Quelltext (entspricht der Render-Reihenfolge → Fluss-Modus stapelt korrekt).

Rein, deterministisch, keine Netz-/FS-Seiteneffekte (Dateien werden reingereicht).

### 2. Verdrahtung Repo-Pfad (`server/routes/scan.js` + `server/lib/ingestRepoFiles.js`)

- Nach der Inventar-Klassifikation und dem Code-Lift: `buildRepoComposition(items, files)`
  aufrufen und Ergebnis als `result.composition` ablegen — **derselbe Feldname** wie
  Bild-Pfad. Kein bbox, kein `meta.image_*` (Fluss-Modus braucht beides nicht).
- Betrifft beide Repo-Routen (`/api/scan/repo` und `/api/scan/repo/ai`).

### 3. Emitter — **keine Änderung**

`emitFigmaComponents` + `composePlan` (Scheibe 1) verarbeiten `raw.composition` schon.
Da Repo-Kinder **kein bbox** tragen, greift automatisch der **Fluss-Modus**: Eltern-Frame
`column`, Kinder als `component-ref` in Reihenfolge. Kinder existieren in Figma vor ihren
Verwendern (Build-Reihenfolge atom→…→template unverändert).

### 4. `molecules`-Lücke (im Zuge dieser Scheibe schließen — klein & sinnvoll)

Die Graph-Tiefe erlaubt eine **belastbarere** Ebenen-Zuordnung als der Dateipfad allein.
Optionaler, klar abgegrenzter Zusatz (per Test abgesichert, sonst weglassbar):
- Baustein, der **andere `components/ui`-Atome rendert** und selbst **von einem
  `components/*`-Organismus gerendert** wird, darf von `atom`→`molecule` hochgestuft
  werden. Rein promote, nie zurück. Wenn zu unsicher/zu breit → **auslassen** und als
  Folge-Scheibe notieren (YAGNI). Kein Muss für den Nesting-Kern.

---

## Bewusste Grenzen (dokumentiert)

- **Tailwind-4 → 0 Tokens bleibt ungelöst** (eigene, bekannte Baustelle — Design lebt in
  Utility-Klassen, nicht in `@theme`/Config). Diese Scheibe ändert **nichts** an der
  Token-Extraktion. Der Nesting-Nutzen greift auch bei 0 Tokens (Struktur ≠ Tokens).
- **Dynamische/prop-gesteuerte Komposition** (`{items.map(...)}`, `<Comp as={X}/>`,
  Render-Props) wird nicht aufgelöst — nur statische JSX-Verwendung. Dokumentiert.
- **Mehrdeutige Bezeichner** (zwei Bausteine gleichen Namens) erzeugen **keine** Kante
  (lieber fehlende als falsche Verschachtelung).
- **Kein bbox → keine pixelgenaue Anordnung**: Repo-Komposition ist Fluss (Stapel in
  Render-Reihenfolge), nicht räumlich. Das ist bewusst — der Code hat keine Koordinaten.
- **URL-Pfad** bleibt weiter ohne Komposition (kein bbox, kein Code-Graph) — eigener
  DOM-Container-Pfad wäre eine spätere Scheibe.

---

## Tests (TDD)

**`server/lib/repoComposition.js` — `buildRepoComposition` (Unit):**
- `Layout.tsx` rendert `<SidebarNav/>` + `<Header/>`; `SidebarNav.tsx` rendert `<Button/>`
  → direkte Kanten Layout→{SidebarNav,Header}, SidebarNav→Button; `roots=[Layout]`.
- **Transitive Reduktion**: Layout rendert `<SidebarNav/>` UND `<Button/>`, SidebarNav
  rendert `<Button/>` → Button hängt an SidebarNav, **nicht** an Layout.
- **Import-Gegenprüfung**: JSX-Verwendung eines nicht importierten Bezeichners → keine
  Kante.
- **Mehrdeutiger Bezeichner** (zwei Bausteine „Card") → keine Kante, Warnung.
- **HTML-Tags ignoriert** (`<div>`, `<button>` klein) → keine Kante.
- **Zyklus** (A rendert B, B rendert A) → zyklusschließende Kante verworfen + Warnung.
- **Reihenfolge**: Kinder in Erst-Auftretens-Reihenfolge des Quelltextes.

**`server/lib/ingestRepoFiles.js` / Route (Integration):**
- Repo-Fixture mit Layout→Organism→Atom → `result.composition` trägt die Kanten;
  `result.composition.children` nicht leer.

**End-to-End gegen den Scheibe-1-Emitter (Integration, web):**
- `result` mit Repo-`composition` (Kinder ohne bbox) → `emitFigmaComponents` liefert für
  den Elternteil einen `composed`-Eintrag im **Fluss-Modus** (`column`, `component-ref`-
  Kinder ohne `absolute`).

**(Falls molecules-Zusatz gebaut:)** Atom, das Atome rendert und von Organismus gerendert
wird → `kind:'molecule'`; Gegenprobe: bleibt sonst `atom`.

---

## Verifikation (autonom)

1. Volle Suiten grün (Server + Web).
2. **Live-API-Beweis**: `rk-landing` (oder ein kleines shadcn-Repo) importieren, dann
   `raw.composition` im Scan-Response prüfen (sinnvolle Layout→Component-Kanten) und
   `/api/figma-export/latest` prüfen (Template/Layout-Eintrag = `composed`, Fluss-Modus,
   `component-ref`-Kinder). ⚠️ `rk-landing` ist Tailwind-4 → 0 Tokens erwartet; die
   **Struktur** muss trotzdem verschachtelt sein (das ist der Beweis dieser Scheibe).
