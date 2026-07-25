# Design: Komposition in gegroundeten Bausteinen (Code + Figma, eine Wahrheit)

**Status:** Entscheidungen getroffen (autonom, Rob-Vorgabe 25.07.: kein Brainstorming, Claude
entscheidet und dokumentiert). Grundlage: `2026-07-25-komposition-gegroundeter-bausteine-brief.md`
inkl. Nachtrag + Messung.

## Zielbild (Robs Messlatte, 25.07.)

**shadcn/ui + Tailwind + React ist das Fundament. Figma und Storybook sind zwei Ableitungen davon
und müssen visuell identisch aussehen.** Ein gegroundeter Baustein sieht in Figma aus wie derselbe
Baustein in Storybook — nicht ähnlich, sondern gleich, weil beide dieselbe Katalog-Wahrheit rendern.

Heute (gemessen, s. Briefing §Messung):

| | Struktur | Grounding |
|---|---|---|
| Code/Storybook | ✘ (flacher Text, verschachtelte Refs fallen ganz raus) | ✔ (`import { Card }`) |
| Figma | ✔ (Fallback-Baum) | ✘ (Katalog unbekannt → Warnung + freihändiger Look) |

Diese Asymmetrie ist das eigentliche Problem. Beide Wege bekommen dieselbe Regel.

## Kernidee: ein gegroundeter Knoten = Katalog-Hülle + gemessene Komposition

Ein Katalog-`component-ref` wird nicht mehr entweder „Komponente ODER Fallback", sondern beides
zusammengesetzt, nach einer einzigen Vorrangregel:

- **Die Hülle (visuelle Identität) kommt aus dem Katalog:** fill, stroke, radius, Schatten, also
  „was macht eine Card zu einer Card". Das ist das Design System.
- **Layout, Abstände, Größe und Inhalt kommen aus der Interpretation:** flex/column, gap, padding,
  width/height, Texte, Kinder. Das ist das, was der Scan gemessen hat.
- **Die Kinder behalten ihre eigenen Stile** und werden rekursiv weitergegroundet: ein Badge in
  einer Card wird zu einem echten Badge.

Damit ist auch die Briefing-Frage „welche Stile gewinnen" beantwortet: **Katalog gewinnt für die
Hülle, Messung gewinnt für Layout und Inhalt.** Doppelte Rahmen/Radien können strukturell nicht
mehr entstehen, weil die Fallback-Wurzel ihre visuellen Klassen abgibt.

## Entscheidungen (die offenen Punkte des Briefings)

### 1. Slots vs. flache Kinder → **flache Kinder in v1**

`<Card className="flex flex-col gap-[8px] p-[20px]">{Kinder}</Card>`, **nicht**
`Card > CardHeader > CardTitle`.

Begründung: Die Zuordnung „Unterbaum-Rolle → Slot" (was ist Header, was Titel, was Content?) ist
geraten und geht bei realen Scans oft daneben; ein falsch geratener `CardHeader` sieht schlechter
aus als ein neutrales, korrekt vermessenes Layout. Entscheidend ist Robs Abnahmekriterium — das ist
**visuell**, und visuell ist das Ergebnis identisch: shadcns `Card` bringt Rahmen/Radius/Hintergrund,
das gemessene Layout bringt Spalte/Gap/Padding. `className` wird von shadcns `Card` (und von unseren
Stubs in `storybook-harness/components/ui/` und `web/verification/shadcn-target/`) durchgereicht,
der Weg ist also idiomatisch gedeckt.

**Folge-Scheibe (bewusst später, nicht nötig fürs Abnahmekriterium):** Sub-Komponenten-Mapping
(`CardHeader`/`CardTitle`/`CardContent`) als idiomatischere Markup-Form. Ändert das Aussehen nicht,
nur die Lesbarkeit des Codes.

### 2. Kompositionstiefe → **unbegrenzt rekursiv, Katalog-Refs bleiben gegroundet**

Kinder werden mit demselben Walker gerendert. Ein `data-ds-component="Badge"` in einer Card wird
also zu `<Badge variant="secondary">3.1%</Badge>`, kein Abstieg wird gekappt. Das behebt gleich den
in der Messung gefundenen **Inhaltsverlust** (verschachtelte Refs verschwanden bisher spurlos).

### 3. Welche Katalog-Einträge dürfen Kinder tragen → **explizites Feld `container: true`**

Nach dem Muster von `voidElement`. Im Default-Katalog trägt es **nur `Card`**. Button, Badge und
Label bleiben Text-Träger (Label-Extraktion ist dort richtig), Input/Checkbox/Separator/Avatar
bleiben Blätter. Grund für ein explizites Feld statt einer Heuristik („hat Kinder → Container"):
`<Button><span>Speichern</span></Button>` hat auch Kinder, soll aber ein Label-Button bleiben. Das
ist DS-Wissen, es gehört in den Katalog.

`voidElement` gewinnt immer über `container` (Input bekommt nie Kinder — Live-Fund 24.07. bleibt
geschützt). `catalogLocalName`-Aliasing (Namenskollision) bleibt unverändert und gilt auch für
Container.

**Repo-Kataloge (Scheibe 2):** `buildRepoCatalog` setzt `container: true` über eine kleine
Namensliste (`Card`, `Panel`, `Dialog`, `Sheet`, `Alert`, `Popover`, `Accordion`, `Drawer`).
Bekannte Grenze: ein eigenwillig benannter Container im User-Repo bleibt Blatt (= heutiges
Verhalten, kein Rückschritt).

### 4. Figma zieht mit → **ja, und zwar über denselben Vertrag** (neue Antwort auf die offene Frage)

Die Messung hat die Vermutung des Briefings korrigiert: Figma hat die Flach-Grenze **nicht**, dafür
löst dort **kein** Katalog-Ref auf (das Plugin kennt `catalog` nicht, und für Katalog-Einträge
existiert keine Figma-Komponente) → jedes gegroundete Element rendert freihändig plus Warnung
„Komponente „X" nicht gefunden".

Lösung ohne Plugin-Änderung: ein **Plan→Plan-Transform** `groundPlan(plan, catalog)`, das im
Figma-Emit vor `scalePlan` läuft und Katalog-Refs nach genau derselben Vorrangregel wie oben
auflöst:

- **Container-Ref** → Box mit **Hülle aus `entry.plan()`** (fill/stroke/strokeWeight/radius) +
  **Layout/Padding/Gap/Größe/Align/stretch/grow aus dem Fallback** + rekursiv gegroundeten Kindern.
- **Blatt-Ref** → der Knoten aus `entry.plan(auswahl)` (echte shadcn-Optik je Variante), dessen
  Platzhaltertext durch den echten Text aus dem Fallback ersetzt wird (`Button` → „Speichern").
  Kein Text im Fallback (Icon-Button, Checkbox, Separator) → Katalog-Rendering bleibt wie es ist.
- **Unbekannter Eintrag** (Ref-Name nicht im aktiven Katalog) → Fallback wie heute, keine Ausnahme.

Ergebnis: Figma rendert dieselbe Hülle + dieselbe Komposition wie Storybook, die Warnungsflut
verschwindet strukturell (es gibt keine unauflösbaren Katalog-Refs mehr), und **kein Plugin-Update,
kein Plugin-Reload durch Rob**.

**Was ausdrücklich NICHT angetastet wird:** scan-interne `component-ref`s (ohne `catalog`) — das ist
die Atomic-Design-Verschachtelung (Molekül-Instanzen in Organismen, Organismen in Templates). Die
läuft weiter über echte Figma-Instanzen und bleibt unberührt.

**Bewusst nicht in dieser Scheibe:** den Katalog selbst als echte Figma-Komponenten-Bibliothek
anlegen (`shadcn/Card` als Component, Refs als ◇-Instanzen). Wäre der nächste Schritt für „das
Design System liegt als Library in Figma", braucht aber Plugin-Änderungen (`parsePayload` müsste
`catalog` lernen), Namespacing gegen Namenskollisionen mit gescannten Bausteinen und einen
Plugin-Reload. Visuelle Identität — Robs Kriterium — ist ohne das erreicht.

### 5. Bekannte, dokumentierte Rest-Unterschiede Figma ↔ Storybook

Ehrlich benannt, damit später niemand danach sucht:

- **Schatten:** shadcns Card hat `shadow-sm`; das kanonische Plan-Modell hat kein Schatten-Feld →
  Figma zeigt keinen. Sichtbar nur als sehr weicher Rand-Schatten. Eigene kleine Scheibe, wenn's
  störfähig wird.
- **Größe:** Figma skaliert 1:1 auf Bildmaße (`scalePlan`), der Code bleibt aufs Token-Raster
  gesnappt — Architektur-Invariante, keine Regression. „Visuell identisch" heißt gleiches Design und
  gleiche Proportionen, nicht gleiche Pixelmaße.
- **Icon-Glyphen:** der Katalog rendert für `size="icon"` einen Plus-Glyph; das echte Icon der
  Vorlage kennt er nicht.

## Umbau im Detail

### `web/src/lib/catalog/shadcn-default.js`
`Card`-Eintrag bekommt `container: true`. Kommentar am Eintrag: `cardPlan()`s Padding und
Platzhalter-Kinder sind das **eigenständige** Rendering der Card (Katalog-Vorschau); als Hülle
werden nur fill/stroke/radius genommen — shadcns echte Card hat selbst kein Padding
(das liegt in `CardHeader`/`CardContent`).

### `web/src/lib/emit/htmlToPlan.js`
`matchCatalogComponent` reicht `container: Boolean(entry.container)` durch (genau wie
`voidElement`); `convertElement` setzt es auf den Ref-Knoten. Sonst unverändert — der Fallback wurde
schon immer vollständig gebaut.

### `web/src/lib/emit/planToJsx.js`
- `boxClasses` wird in `layoutClasses(node, tokens)` (flex/justify/items/self-stretch/flex-1/w/h/
  gap/padding) und `visualClasses(node, tokens)` (bg/border/rounded) zerlegt; `boxClasses` =
  Verkettung beider → **kein Verhaltensunterschied für normale Boxen** (Reihenfolge beibehalten,
  damit bestehende Klassen-Assertions grün bleiben).
- `walkCatalogRef` bekommt den Container-Zweig: `container && !voidElement && Fallback hat Kinder`
  → `<Tag className="<layoutClasses(fallback)>" …props>` + Kinder via `walk` auf `depth+1` +
  schließendes Tag. Auch reine Text-Kinder werden komponiert (als `<span>` mit ihren Typografie-
  Klassen) — das erhält Schriftgröße/-gewicht/-farbe, die die Text-Einschmelzung bisher verlor.
  Fallback ohne Kinder oder Nicht-Container → exakt heutiges Verhalten.
- `extractText` steigt zusätzlich in `fallback` ab (behebt den Inhaltsverlust bei verschachtelten
  Refs auch für Blatt-Container wie `<Button>` mit Badge drin).
- `collectCatalogImports` und `groundedComponentNames`: bei Container-Refs den eigenen Import/Namen
  zählen **und** in `fallback.children` weiterlaufen (Blatt-Refs unverändert kein Abstieg).

### `web/src/lib/emit/groundPlan.js` (neu, reine Funktion, kein DOM)
`groundPlan(plan, catalogOption)` wie in Entscheidung 4 beschrieben. Braucht aus dem Katalog nur
`components.get(name)` bzw. die `components`-Liste → nimmt dieselbe Option, die `htmlToPlan`
bekommt. Kein Katalog übergeben → Plan unverändert zurück.

### `web/src/lib/emit/emitFigmaComponents.js`
`groundPlan(plan, catalog)` an beiden `htmlToPlan`-Aufrufstellen (gespliced + `ai-interpreted`)
zwischen Konvertierung und `scalePlan`. `composePlan`-Pfad (Bausteine mit Kompositions-Kindern)
bleibt unberührt — dort kommen die Kinder als scan-interne Instanzen, nicht als Katalog-Refs.

## Verifikation (Abnahme ist visuell, nicht die Testzahl)

1. **Regressionstests:** `planToJsx.grounding.test.js`, `htmlToPlan.grounding.test.js`,
   `emitFigmaComponents.test.js`, neu `groundPlan.test.js`. Explizit weiter grün halten:
   `voidElement` (Input nie mit Kindern), `catalogLocalName` (Alias bei Namensgleichheit),
   Blatt-Verhalten (Button/Badge bleiben Label-Träger).
2. **Kompilier-/Render-Beweis:** `cd web && npx vitest run src/lib/emit/grounding.verify.test.js` —
   erweitert um eine Card-mit-Kindern: der gerenderte DOM muss **verschachtelte Elemente** haben
   (Titel, Wert, Badge als eigene Knoten), nicht einen Textklumpen.
3. **Echtes Storybook, deterministisch (0 KI-Calls):** Kompositions-Fixture aus realistischem
   Interpretations-HTML → Emit → `storybook-harness`-Build → Screenshot. Vorher/Nachher-Vergleich.
4. **Echte Daten, ein Lauf:** `build-prod-storybook-fixture.mjs` friert zusätzlich das **rohe
   Scan-/Interpretations-JSON** ein (`fixtures/prod-scan-raw.json`) und ein neues
   `reemit-from-raw.mjs` baut daraus jederzeit neu — danach sind alle weiteren Durchläufe
   KI-kostenlos. Ein Prod-Lauf am Ende liefert den Abnahme-Screenshot: **die KPI-Karte ist eine
   Karte.**
5. **Figma, autonom:** `figma-e2e-test`-Skill (Rob klickt nichts). Zu prüfen:
   (a) gegroundete Bausteine sehen aus wie im Storybook,
   (b) **keine** „Komponente „X" nicht gefunden"-Warnungen mehr,
   (c) **Atomic-Design-Verschachtelung** (Robs Notiz): Organismen enthalten ◇-Instanzen ihrer
   Moleküle, Templates ◇-Instanzen ihrer Organismen — per Figma-MCP am echten File nachsehen.
6. **Volle Suiten vorher/nachher:** Web, Server, Plugin.
