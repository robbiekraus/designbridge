# Sub-Komponenten-Slots (Card → CardHeader/CardContent) — Design

Robs angekündigter nächster Schritt nach der Katalog-Bibliothek + dem Phantom-Kästchen-Fix (s.
RESUME.md, Stand 25.07. nachts): `Card > CardHeader > CardTitle` statt flacher Kinder direkt unter
`<Card>`. Ziel laut Rob: idiomatischeres Markup — **ändert die Optik nicht.**

## Scheibe A (dieser Spec): Code-Emit, nur `Card`

Bewusst eng geschnitten, analog zum bisherigen Vorgehen (erst Code, Figma-Instanz-Slots wären eine
eigene, spätere Scheibe — brauchen Figma-Component-Property-Slots im Plugin, ungeprüft ob
`instance.rescale`-Fallback-Ansatz dafür überhaupt taugt). Scope dieser Scheibe:

- Nur der Code-Emitter (`planToJsx.js`). **Figma-Emit (`groundPlan.js`) bleibt unangetastet** — Cards
  landen dort weiter als inline gegroundete Frames mit flachen Kindern, exakt wie heute. Kein
  Regressionsrisiko dort, weil `groundPlan` das neue `slots`-Feld schlicht nicht liest.
- Nur der `Card`-Katalog-Eintrag (`shadcn-default.js`) bekommt `slots`. Repo-Kataloge
  (`buildRepoCatalog.js`) bekommen in dieser Scheibe **kein** `slots` — ihre Card-Einträge bleiben
  ohne das Feld, verhalten sich also unverändert (additiv, kein Zwang).
- **Kein `CardTitle`/`CardDescription`** in dieser Scheibe (bewusste Grenze, s. unten).

## Entscheidung 1: Wann wird gesplittet?

Nur wenn der Container **≥ 2 Kinder** hat. Bei genau einem Kind bringt ein Header/Content-Split
nichts (ein Slot für ein einzelnes Kind ist reine Verpackung) — Verhalten bleibt der bestehende
flache Fall. Erstes Kind → `CardHeader`, alle übrigen → `CardContent`. Einfache, deterministische
Regel; keine Versuche, "das ist der Titel" semantisch zu erraten (das wäre Kandidat für eine
eigene, riskantere Folge-Scheibe, s. unten).

## Entscheidung 2: Optik bleibt exakt gleich — `!`-Important gegen die Stub-Paddings

Die echten shadcn-Komponenten `CardHeader` (`p-6`) und `CardContent` (`p-6 pt-0`) bringen eigenes
Padding mit. Würden wir das per angehängter `className` unterdrücken wollen (`p-0`), ist das in
Tailwind **nicht verlässlich** — bei gleicher Spezifität entscheidet die Reihenfolge in der
GENERIERTEN Stylesheet, nicht die Reihenfolge im `class`-Attribut; ein später im DOM stehendes
`p-0` gewinnt nicht zuverlässig gegen ein früher generiertes `p-6`. Die einzige verlässliche Art,
eine fremde, hartkodierte Utility von außen zu überschreiben, ist Tailwinds `!`-Modifier
(`!p-0` → `padding: 0 !important`). Beide Slot-Tags bekommen deshalb `!p-0`.

`Card` selbst behält seine volle gemessene Klasse (inkl. `gap`) unverändert. Der Gap zwischen
Header und Content ist derselbe Wert, der vorher ALLE flachen Geschwister trennte (CSS-`gap` ist
zwischen alle Flex-Kinder gleich, unabhängig davon wie viele es sind) — `CardContent` bekommt für
seine jetzt darin verschachtelten eigenen Geschwister denselben Gap erneut (abgeleitet aus
`node.fallback`, Padding/Sizing/Stretch/Grow dabei auf neutral gesetzt, da die zum äußeren `Card`
gehören, nicht zum inneren Content-Slot). `CardHeader` trägt genau ein Kind → kein eigener Gap
nötig.

## Entscheidung 3 (bewusst NICHT gebaut): `CardTitle`/`CardDescription`

Robs Beispiel nennt explizit `CardTitle`. Trotzdem in dieser Scheibe ausgelassen: das erste Kind im
Header trägt schon seine eigenen, aus der Messung abgeleiteten Text-Klassen (Schriftgröße/-gewicht/
Farbe). `CardTitle` bringt eigene hartkodierte Defaults mit (`text-2xl font-semibold …`) — die
müssten wieder per `!`-Overrides neutralisiert werden, diesmal aber auf Text-Ebene für JEDEN
gemessenen Wert einzeln (Schriftgröße UND Gewicht UND Farbe), was `walkText`/`textClasses`
durchgängig ändern würde. Das ist ein eigenständiges, klar abgegrenztes Folge-Stück mit echtem
Optik-Risiko, wenn es schlampig gemacht wird — kein Grund, es an diese risikoarme Scheibe zu
hängen. `CardHeader`/`CardContent` bringen strukturell den größten Teil des Werts (idiomatisches
Markup, Grundlage für spätere Figma-Instanz-Slots); `CardTitle` ist Kosmetik obendrauf.

## Umsetzung

- `htmlToPlan.js` (`matchCatalogComponent`): neues Feld `slots` reist wie `container` am
  component-ref-Knoten mit (`catalogRef.slots` aus `entry.slots`, `undefined` wenn der Katalog-
  Eintrag keins hat).
- `shadcn-default.js`: `Card`-Eintrag bekommt
  `slots: { header: { name: 'CardHeader', import: {...} }, content: { name: 'CardContent', import: {...} } }`.
- `planToJsx.js`:
  - `walkCatalogRef`: bei `isCatalogContainer(node)` UND `node.slots` UND ≥2 Fallback-Kindern →
    `walkCatalogSlots` (neu) statt der bisherigen flachen Kinderliste. Sonst unverändert (Rückfall
    auf den bestehenden Pfad — deckt sowohl "kein `slots`" als auch "genau 1 Kind" ab).
  - `walkCatalogSlots`: rendert `<Card ...><CardHeader className="!p-0">{Kind 1}</CardHeader>
    <CardContent className="!p-0 {gap/flex-Klassen}">{Kind 2..n}</CardContent></Card>`.
    Kollisions-Aliasing (`catalogLocalName`) gilt auch für die Slot-Tags.
  - `collectCatalogImports`: sammelt bei einem gesplitteten Container zusätzlich die beiden
    Slot-Imports (gleiche Modul-Gruppierung wie bestehende Imports).
  - `groundedComponentNames`: unverändert — Slot-Tags sind kein eigenständiger "gegroundeter"
    Baustein, nur internes Rendering-Detail von `Card`.

## Tests

Bestehende Grounding-Tests (`planToJsx.grounding.test.js`) bauen ihre Katalog-Refs von Hand OHNE
`slots`-Feld → laufen unverändert durch den alten flachen Pfad, keine Anpassung nötig (additiv,
verifiziert die Rückwärtskompatibilität von selbst). Neue Tests decken ab: Split ab 2 Kindern /
kein Split bei 1 Kind / `!p-0` auf beiden Slots / Content-Gap entspricht dem Card-Gap / Imports für
beide Slot-Tags gesammelt / Kollisions-Aliasing greift auch für Slot-Tags / Figma-Pfad
(`groundPlan.js`) unverändert bei Vorhandensein von `slots` (Regressionstest, dass Figma es
schlicht ignoriert).
