# Composition-Nesting (Scheibe 1: Fundament + Figma-Port)

**Datum:** 2026-07-18
**Status:** Spec — zur Review
**Kontext:** Robs Figma-Test `test8` (18.07. abends). Zielbild aus dem Brainstorm:
Die Atomic-Kompositionshierarchie (Tokens → Atom → Molecule → Organism → Template,
jede Ebene als **Instanz** der darunterliegenden) wird **zentrales Datenmodell** in
DesignBridge — die eine Quelle der Wahrheit — und dieselbe Verschachtelung wird nach
Figma (und später nach Code) portiert. Diese Scheibe baut das **Fundament** + den
**Figma-Port**. Code-rein (Scheibe 2) und Code-raus (Scheibe 3) folgen und nutzen
dasselbe Modell.

---

## Problem (per Code + Figma-MCP bewiesen, `test8`)

`test8` (fileKey `iETez9rUCuiupQRNhVqxWC`) zeigte:

- **Taxonomie (Atomic Design) sitzt** — Sektionen `DB/Atoms…DB/Templates`, korrekt einsortiert, ganzer Screen = 1 Template. ✅
- **Einzelne Organismen sind top** — z. B. „Emissions Trend Chart" (Node `1:327`) einzeln: Monats-Labels verteilt, Achsen korrekt, beide Linien + Tooltip. ✅
- **Im Template „Dashboard Layout" (`1:933`) bricht dasselbe wieder** — Monats-Labels gestaucht („DecJanFebMarAprMayJun"), Trend-Linie kollabiert, Titel/Wert überlappen; „Top Emissions" ist im Organism ein leerer Platzhalter (239×66), im Template dagegen voll gerendert.

**Root Cause (Explore-Kartografie, s. u.):** Das Template bekommt eine **eigene,
monolithische Ganz-Seiten-Interpretation** (eigener KI-Pass, bbox `{0,0,1,1}`), die
die separat interpretierten Organismen **nicht referenziert**. Der Emitter versucht
die Schachtelung erst nachträglich per Klassen-Heuristik zu rekonstruieren
(`matchKnownComponent` kennt nur **Button/Suche/Input/Badge**), was für benannte
Organismen strukturell scheitert. Ergebnis: das Template wird flach **neu geraten**
statt aus den (guten) Organismen komponiert. Die Enthaltung wird zwar berechnet
(`classifyByContainment`), aber **nur zur kind-Korrektur genutzt und dann weggeworfen** —
kein `parent`/`children` wird je persistiert.

---

## Kernidee

1. **Enthaltungs-Baum als kanonisches Modell persistieren.** Aus derselben
   `contains`/`areaOf`-Relation, die der Guard schon nutzt, den **direkten**
   Eltern-Kind-Baum ableiten und in `raw.composition` ablegen. Quellen-agnostisch
   (Bild: bbox; Repo später: Import-/JSX-Graph).
2. **Eltern-Ebenen aus Instanzen ihrer direkten Kinder komponieren** (per Identität,
   nicht Heuristik). Ein Baustein *mit* Kindern wird zu einem Layout-Frame, der pro
   direktem Kind einen `component-ref` **absolut positioniert** platziert. Blätter
   (keine Kinder) behalten ihr heutiges Verhalten (Hand-Template / KI-Interpretation /
   Platzhalter).

Weil `component-ref` → Instanz und absolute Positionierung **im Plugin bereits
existieren und zusammen funktionieren** (`renderPlan.ts` L312-322 wendet
`applyAbsolute` auf jedes Kind inkl. Instanzen an), ist diese Scheibe **rein
web-/server-seitig — keine Plugin-Änderung, kein Dev-Plugin-Reload nötig.**

Das ergibt in Figma **echte, mehrstufig verschachtelte Instanzen**: Template enthält
Organism-Instanzen; jede Organism-Instanz enthält ihre Molekül-/Atom-Instanzen
(Build-Reihenfolge atom→molecule→organism→template ist schon so — Kinder existieren
vor ihren Verwendern).

---

## PINNED CONTRACT

### 1. Kanonisches Modell: `raw.composition`

Neues Feld am Scan-Ergebnis (`raw`), von jeder Quelle befüllbar:

```js
raw.composition = {
  children: { [name: string]: string[] },  // DIREKTE Kinder je Baustein, in Lesereihenfolge
  roots: string[],                          // Bausteine ohne Eltern (i. d. R. das Template)
}
```

- Knoten-ID = **Baustein-Name** (systemweit schon der Schlüssel: `mergeByName`,
  `result.interpretations[name]`, `matchTemplate(name)`). Namen sind global dedupliziert.
- **Direkter Elternteil von B** = der **flächenkleinste** Baustein A (A≠B) mit
  `contains(A, B)`. Gleichstand → größeres Enthaltungsverhältnis, dann erster Fund.
- **Lesereihenfolge** der Kinder: nach `bbox.y`, dann `bbox.x` (Bild-Pfad). Quellen
  ohne bbox liefern ihre natürliche Reihenfolge.
- Bausteine ohne bbox / ohne Enthaltung → kein Elternteil, kein Kind (Blatt, Root).
- `contains`/`areaOf` werden wie beim Guard **injiziert** (Bild: bbox; Repo: später Graph).

### 2. Baum-Extraktion (neue reine Funktion in `server/lib/taxonomy.js`)

```js
export function buildCompositionTree(items, { areaOf, contains }) -> { children, roots }
```

- `items` = dieselbe flache `{ name, kind, ref }`-Liste wie `classifyByContainment`,
  **mit den bereits korrigierten kinds** (Baum wird NACH der Klassifikation gebaut).
- Rein, deterministisch, keine Seiteneffekte. Kein Zyklus möglich (Enthaltung ist
  strikt flächenmonoton). Nur **direkte** Kanten (Großkinder hängen an ihrem eigenen
  Elternteil, nicht am Template).

### 3. Verdrahtung Bild-Pfad (`server/lib/claude.js`)

- `applyContainmentGuard(...)` gibt zusätzlich `composition` zurück (baut den Baum aus
  denselben `areaOf`/`contains` wie der Guard, auf den klassifizierten Items).
- `analyzeScreenshot(...)` legt `result.composition` und **`result.meta.image_width` /
  `result.meta.image_height`** (px) ab. Bilddimensionen kommen aus derselben Bildlib,
  die `cropVisual` nutzt (`imageDecomposer.js`). Fehlen die Maße → quadratischer
  Fallback (`h = w`) **+ Warnung** in `raw.warnings`.

### 4. Figma-Port: Komposition im Emitter (`web/src/lib/emit/`)

Neue reine Helferfunktion:

```js
// web/src/lib/emit/composePlan.js
export function composePlan(parentItem, childItems, canvas) -> PlanBox
```

**Zwei Modi (automatisch nach bbox-Verfügbarkeit):**
- **Räumlich** (Eltern **und alle** Kinder tragen bbox — Bild-Pfad): Kinder **absolut**
  positioniert (unten). Das ist der einzige in dieser Scheibe genutzte Modus.
- **Fluss** (ein Kind ohne bbox — Repo-Pfad, Scheibe 2): Eltern-Frame = `column`, HUG,
  Kinder als `component-ref` **ohne** `absolute`, in gegebener Reihenfolge (Auto-Layout
  stapelt). Von Scheibe 2 genutzt; hier mitgebaut + mitgetestet, damit Scheibe 2 keine
  Emit-Änderung braucht. Robuster Nebeneffekt: fehlt im Bild-Pfad einem Kind die bbox,
  degradiert es sauber zu Fluss statt zu brechen.

**Räumlicher Modus:**
- `canvas = { w: PREVIEW_VIRTUAL_WIDTH /*1024*/, h: round(1024 * image_height/image_width) }`.
- Rückgabe = `type:'box'` mit:
  - `layout:'column'`, HUG-Defaults, `fill:null`, `stroke:null`, `radius:0`,
    `padding:[0,0,0,0]`, `gap:0`;
  - `width = round(parent.bbox.w * canvas.w)`, `height = round(parent.bbox.h * canvas.h)`
    (Eltern-Frame trägt feste Maße → Kinder positionieren sich absolut darin);
  - `children`: pro direktem Kind **genau ein** Knoten. bbox-Brüche sind relativ zum
    **ganzen Bild**, `canvas` ist die Bild-px-Größe → die relative Position im Eltern-
    Frame kürzt sich zu einer einfachen Differenz mal canvas:
    ```js
    { type:'component-ref', name: childName, variant: null,
      absolute: {
        x: max(0, round((child.bbox.x - parent.bbox.x) * canvas.w)),
        y: max(0, round((child.bbox.y - parent.bbox.y) * canvas.h)),
        width:  round(child.bbox.w * canvas.w),
        height: round(child.bbox.h * canvas.h),
      },
      fallback: <Notice-Box „Baustein &lt;name&gt; fehlt"> }
    ```
    (Herleitung: Kind-px-im-Bild − Eltern-px-im-Bild = (child.x−parent.x)·canvas.w.
    Positionen relativ zum Eltern-Frame, in px; auf ≥0 geklemmt. Das Plugin verwirft
    den `fallback` bei erfolgreicher Referenz-Auflösung — da **jeder** Baustein als
    Figma-Komponente gebaut wird, löst die Referenz zuverlässig auf.)

`emitFigmaComponents(result)`:

- Vor der Baustein-Schleife `raw.composition` lesen; `canvas` aus `raw.meta` bestimmen.
- Pro Baustein: **hat `composition.children[item.name]?.length > 0`** →
  `variants:[{ name:'default', plan: composePlan(item, kinder, canvas) }]`,
  `source:'composed'`, `placeholder:false`. Kinder-Items werden über den Namen aus den
  4 Buckets aufgelöst (Helfer, der bbox trägt).
- **Sonst** exakt der heutige Pfad (Hand-Template → KI-Interpretation → Platzhalter).
- Die **monolithische Template-Interpretation wird für den Export nicht mehr genutzt**,
  sobald das Template Kinder hat (das ist der Fix). Die App-Vorschau bleibt in dieser
  Scheibe unverändert (nutzt weiter die Interpretation) — komponierte App-Vorschau ist
  Folge-Arbeit.

### 5. Keine Plugin-Änderung

`renderPlan.ts` verarbeitet `component-ref`-Kinder mit `absolute` bereits korrekt
(L268-269 `renderComponentRef`, L312-322 `applyAbsolute` auf jedes Kind, L240-254
resize für Nicht-Text/Instanzen). **Kein Plugin-Code, kein Rebuild, kein Reload.**
Verifikationspunkt in den Tests: eine Composition-`PlanBox` (Box mit `component-ref`-
Kindern, die `absolute` tragen) rendert Instanzen an relativer Position.

---

## Datenfluss (nachher)

```
Scan (Bild) ─► items+bbox ─► classifyByContainment (kind) ─► buildCompositionTree
   └─► raw = { …buckets, tokens, composition:{children,roots}, meta:{image_w,image_h} }
Interpret ─► result.interpretations[name] (nur Blätter faktisch genutzt; Eltern egal)
Emit ─► emitFigmaComponents:
          Eltern (children>0) ─► composePlan ─► box + component-ref[] (absolute)
          Blätter             ─► heutiger Pfad (Hand-Tpl / KI / Platzhalter)
       ─► payload v2 { colors, text, components } ─► /api/figma-export/latest
Plugin (unverändert) ─► buildComponents (atom→…→template) ─► component-ref → Instanz
                     ─► echte verschachtelte Instanzen in Figma
```

---

## Bewusste Grenzen (dokumentiert, nicht in dieser Scheibe)

- **Eltern-Chrome ohne eigenen Baustein** (z. B. ein Template-Hintergrund/Padding, der
  nicht als Kind erkannt wurde) geht verloren — der Eltern-Frame trägt nur die
  Kind-Instanzen. Wichtiger Inhalt (Organismen) bleibt erhalten. Verfeinerung später.
- **App-Vorschau der Eltern** bleibt monolithisch (visuell wie bisher); komponierte
  Vorschau ist Folge-Arbeit.
- **Nicht erkannte Kinder**: Erkennt der Scan ein Molekül/Atom innerhalb eines
  Organismus nicht als eigenen Baustein, bleibt der Organismus ein Blatt und nutzt
  seine (gute) Einzel-Interpretation — korrekt, kein Regressionsrisiko.
- **Repo-/URL-Pfad**: bekommt in dieser Scheibe noch **keine** Komposition (kein bbox
  bzw. kein Graph) → `raw.composition` ist dort leer, alle Bausteine Blätter (heutiges
  Verhalten). Scheibe 2 füllt den Baum aus dem Code.
- **Bilddimensionen**: fehlen sie ausnahmsweise, quadratischer Fallback + Warnung
  (vertikale Proportionen können dann leicht verzerren).
- **Tabellen-Spaltenraster**, Spacing/Radius/Shadow-Absenz im Figma-Payload: unverändert
  (eigene Themen).

---

## Tests (TDD)

**`server/lib/taxonomy.js` — `buildCompositionTree` (Unit):**
- Template ⊃ 2 Organismen, Organism ⊃ 1 Molekül ⊃ 1 Atom → korrekte **direkte** Kanten,
  Großkind hängt am Molekül, nicht am Template.
- Zwei Geschwister im selben Elternteil → beide als direkte Kinder, Lesereihenfolge y,x.
- Baustein ohne bbox → weder Kind noch Elternteil.
- Mehrere Roots (Template + loser Baustein) → beide in `roots`.
- Überlappende Geschwister → beide Kinder desselben Elternteils (kein gegenseitiges
  Enthalten, da `areaA > areaB` verlangt).

**`server/lib/claude.js` — `applyContainmentGuard` (Unit):**
- gibt `composition` mit denselben Kanten zurück; kinds bleiben wie vom Guard korrigiert.

**`web/src/lib/emit/composePlan.js` (Unit):**
- **Räumlich**: Eltern mit 2 Kindern (alle bbox) → `box` mit 2 `component-ref`-Kindern,
  korrekte **relative px** (Beispielrechnung gepinnt), `variant:null`, Namen stimmen,
  Reihenfolge stimmt. Positionen auf ≥0 geklemmt; canvas-Höhe aus image-Ratio.
- **Fluss**: Eltern mit 2 Kindern **ohne** bbox → `column`-Box, `component-ref`-Kinder
  **ohne** `absolute`, Reihenfolge erhalten.

**`web/src/lib/emit/emitFigmaComponents.js` (Integration):**
- Ergebnis mit `composition.children[Template]=[…]` → Template-Eintrag ist `composed`,
  `variants[0].plan` enthält `component-ref`-Kinder (NICHT das Ergebnis von `htmlToPlan`).
- Blatt-Baustein ohne Kinder → unverändert (KI-Interpretation/Platzhalter).

**`designbridge-plugin/tests/renderPlan.test.ts` (Regressions-Absicherung):**
- Composition-PlanBox (Box + `component-ref`-Kinder mit `absolute`) → Instanzen werden
  erzeugt, `layoutPositioning='ABSOLUTE'`, resize auf abs-Maße. (Bestätigt: keine
  Plugin-Änderung, nur Absicherung des Vertrags.)

**Verträge per Grep prüfen:** `composition`-Feldname, `source:'composed'`,
`component-ref`-Knotenform Web↔Plugin.

---

## Verifikation (autonom, ohne Robs Figma-Render)

1. Volle Suiten: Server, Web, Plugin grün.
2. **Live-API-Beweis**: Bild-Import über die Live-/lokale API fahren, dann
   `/api/figma-export/latest` prüfen — der Template-Eintrag muss `component-ref`-Kinder
   mit `absolute` tragen (statt eines flachen KI-Plans). Das beweist den Port bis an die
   Plugin-Grenze; der visuelle Figma-Render bleibt Robs Test.
3. `raw.composition` im Scan-Response stichprobenhaft auf sinnvolle Kanten prüfen.
