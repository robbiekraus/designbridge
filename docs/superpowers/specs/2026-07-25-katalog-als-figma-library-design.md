# Katalog als echte Figma-Komponenten-Bibliothek (v1)

**Datum:** 2026-07-25 (nachts) · **Status:** Design, zur Umsetzung
**Vorgänger:** `2026-07-25-komposition-gegroundeter-bausteine-design.md` (Grounding + Komposition)
**Roadmap-Herkunft:** RESUME.md §Offene Aufgaben, Punkt 1 („die naheliegende nächste Scheibe")

## Problem

Der Grounding-Katalog (shadcn-Default oder aus dem User-Repo gelesen) ist heute **nur im Emit
sichtbar**, nicht in Figma:

- Im Code-Emit wird er zu echten Imports (`import { Button } from "@/components/ui/button"`).
- Im Figma-Emit löst `groundPlan` Katalog-Refs zu **inline gegroundeten Frames** auf (25.07.
  nachmittags gebaut). Visuell korrekt — aber in Figma existiert weder eine `Card`- noch eine
  `Button`-Komponente. Es gibt keine ◇-Instanzen, keine Library, kein „ein Edit an Button wirkt
  überall".

Robs Zielbild („shadcn = Fundament, Figma und Storybook sind Ableitungen") ist visuell erfüllt,
strukturell aber nur auf der Code-Seite. In Figma fehlt das Fundament als *Objekt*.

## Ziel

1. **Der Katalog erscheint in Figma als echte Komponenten-Bibliothek** — eigene Sektion, echte
   `COMPONENT`/`COMPONENT_SET`-Nodes mit echten Figma-Varianten-Properties.
2. **Gegroundete Blatt-Refs im Scan werden ◇-Instanzen dieser Komponenten** statt inline
   gegroundeter Frames — soweit das ohne visuelle Regression möglich ist (s. §Grenzen).

## Kernentscheidungen

### 1. Die Library ist 1× — Instanzen tragen einen `scale`

Der Figma-Emit skaliert jeden Baustein per `scalePlan` auf echte Bildpixel (ein 2296px-Screenshot
ergibt Faktor ≈ 2,24). Eine Figma-**Instanz** kann diese Skalierung nicht aus sich heraus
übernehmen: ihr Inhalt kommt aus der Komponente.

Zwei Dinge dürfen daher nicht vermischt werden:

- Die **Bibliothek** wird bei 1× emittiert — das ist die Wahrheit des Design Systems
  (Button 14px/`rounded-md`, Card `radius 8`). Eine „2,24× Library" wäre wertlos.
- Die **Instanz** bekommt das Feld `scale` mit dem Faktor ihres Bausteins und das Plugin ruft
  `instance.rescale(scale)` — dieselbe Transformation, die `scalePlan` auf den inline gegroundeten
  Frame anwendet. Ergebnis ist per Konstruktion deckungsgleich mit heute.

`scalePlan` multipliziert `scale` an `component-ref`-Knoten, die das Feld **explizit tragen** (also
nur von diesem Emit erzeugte Katalog-Instanzen), scan-interne Refs bleiben unberührt.

### 2. Nur Blätter werden Instanzen, Container bleiben inline

Eine Figma-Instanz nimmt **keine neuen Kinder** an. Ein Container-Katalog-Eintrag (`Card`,
`container: true`) trägt aber genau das: den gemessenen Unterbaum der Interpretation. Container-Refs
bleiben deshalb inline gegroundete Frames (heutiges Verhalten, unverändert).

Blatt-Refs (Button, Badge, Input, Avatar, …) werden Instanzen — ihr sichtbarer Inhalt ist maximal
**ein Text**, und Text ist auf einer Instanz überschreibbar.

### 3. Text per Override, Icons bleiben inline

Der Ref-Knoten trägt `overrideText` (der echte, sichtbare Text aus der Messung). Das Plugin setzt
damit den **ersten** `TEXT`-Node der Instanz (Font des Nodes vorher laden).

Der Icon-Fall (Fallback enthält ein SVG, kein Text — Icon-Button, 25.07. gefixt) kann **nicht** als
Instanz gehen: dafür müssten Kinder in die Instanz eingesetzt werden. Diese Blätter bleiben inline
gegroundet, das echte Icon der Vorlage gewinnt weiterhin.

### 4. Namespacing über den Namen, Quelle der Wahrheit ist der Web-Emit

Katalog-Komponenten heißen in Figma `DS/<Name>` (`DS/Button`, `DS/Card`). Der Präfix

- verhindert Kollisionen mit gescannten Bausteinen, die zufällig `Button` heißen,
- gruppiert die Library im Assets-Panel,
- steht **im Payload** (Web-Emit), nicht im Plugin — das Plugin nimmt Namen wie bisher wörtlich.

Varianten-Namen folgen der Figma-Konvention `variant=secondary, size=lg` (echte
Varianten-Properties). Einträge ohne Varianten-Achsen (`Card`, `Input`, `Label`, `Avatar`,
`Checkbox`, `Separator`) werden eine einzelne `COMPONENT`, kein Set-mit-einem-Kind.

### 5. Abwärtskompatibel per `fallback` — ein nicht neu geladenes Plugin verhält sich wie heute

Jeder Katalog-Instanz-Ref trägt als `fallback` **genau den Plan, der heute inline emittiert würde**.
Damit gilt:

| Situation | Ergebnis |
|---|---|
| Neues Plugin, alles klappt | ◇-Instanz aus `DS/…`, rescaled, Text überschrieben |
| Neues Plugin, `rescale`/Override/Instanz schlägt fehl | Fallback-Plan → heutiges Bild |
| **Altes Plugin** (kennt `catalog` nicht, findet `DS/Button` nicht) | Fallback-Plan → heutiges Bild + Warnung „Komponente nicht gefunden" |

Ein Plugin-Reload ist damit **kein Blocker**, nur eine Verbesserung. Die Warnung im alten Plugin ist
Rauschen, aber sie ist wahr und verschwindet nach dem Reload.

## Verträge

### Payload (additiv, `version` bleibt 2)

```jsonc
{
  "designbridge": "figma-import",
  "version": 2,
  "colors": [...], "text": [...], "components": [...],
  "catalog": [                              // NEU, fehlt bei leerem Katalog ganz
    { "name": "DS/Button", "catalogName": "Button", "source": "shadcn-default",
      "variants": [ { "name": "variant=default, size=default", "plan": { "type": "box", ... } }, ... ] },
    { "name": "DS/Card", "catalogName": "Card", "source": "shadcn-default",
      "variants": [ { "name": "default", "plan": { ... } } ] }
  ]
}
```

- `variants[].plan` ist ein normaler `PlanBox` (1×, token-referenziert) — derselbe Renderer wie
  überall (`renderPlan`).
- Kreuzprodukt aller Varianten-Achsen, deterministische Reihenfolge (Achsen in Katalog-Reihenfolge,
  Werte in Listenreihenfolge). **Deckel 32 Varianten** pro Eintrag (Default-Katalog: Button = 24).
  Wird gedeckelt, landet das in den Konverter-Warnungen — nichts wird stillschweigend verschluckt.
- Einträge, deren `plan()` wirft oder deren Plan-Wurzel kein `box` ist (`Label` → Text-Node), werden
  **übersprungen** (keine Komponente, kein Ref → heutiges Inline-Verhalten bleibt).

### `PlanRef` (Plugin ↔ Web, PINNED — additiv, optional)

```ts
interface PlanRef {
  type: 'component-ref';
  name: string;                 // 'DS/Button' bei Katalog-Instanzen
  variant: string | null;       // 'variant=secondary, size=lg' | null
  fallback: PlanBox | null;     // heutiger Inline-Plan (s. Entscheidung 5)
  overrideText?: string;        // NEU — ersetzt den ersten TEXT-Node der Instanz
  scale?: number;               // NEU — instance.rescale(scale), von scalePlan multipliziert
  absolute?, stretch?, grow?    // unverändert
}
```

Beide neuen Felder werden **nur gesetzt, wenn sie gelten** (kein `null`/`1` als Rauschen) — gleiche
Konvention wie `stretch`/`grow`.

### Plugin-Ablauf

1. `upsertPage` legt eine **fünfte** Sektion `DB/Design System` an, als **erste** (Fundament oben).
2. `buildCatalogComponents` baut die Library **vor** `buildComponents` — sonst finden die Refs der
   Bausteine nichts.
3. `findComponentByName` sucht zusätzlich in der Katalog-Sektion.
4. `renderComponentRef`: Varianten-Kind wird per **rohem Namen** ODER `Variant=<name>` gematcht
   (Katalog vs. gescannte Bausteine, eine Codestelle).
5. Nach `createInstance()`: `rescale(scale)` → `overrideText` setzen. Wirft eines von beiden oder
   fehlt ein `TEXT`-Node, obwohl `overrideText` gesetzt ist → Instanz entfernen, `fallback` rendern,
   Warnung.

### Zählung / Meldung

`ImportSummary` bekommt `catalogCreated?` / `catalogUpdated?`. Die Bausteine-Zählung
(`componentsCreated`, `…ByKind`) bleibt **unverändert** — DS-Komponenten sind keine gescannten
Bausteine. `formatImportSummary` hängt „N DS-Komponenten neu/aktualisiert" an.

## Bewusste Grenzen (dokumentiert, nicht gebaut)

- **Container-Refs (`Card`) bleiben Frames** — Figma-Instanzen nehmen keine Kinder an. Wer „Card als
  echte Instanz mit Slots" will, braucht Sub-Komponenten-Slots (`CardHeader`/`CardContent`) *und*
  einen Weg, gemessene Inhalte in Instanz-Slots zu legen. Eigene Scheibe.
- **Icon-Blätter bleiben Frames** (s. Entscheidung 3).
- **`Label` wird keine Komponente** (Plan-Wurzel ist ein Text-Node, kein Frame).
- **Kein Figma-Team-Library-Publish** — die Komponenten liegen in der Datei. Publish ist ein
  manueller Figma-Schritt (und Enterprise-abhängig), kein Plugin-API-Feature.
- **`rescale` ist hier nicht live verifizierbar** (kein Figma-Fenster in dieser Session). Genau
  deshalb ist der Fallback-Pfad Pflicht — schlägt es fehl, ist das Ergebnis das heutige.

## Abnahme

1. Web-Emit-Test an echten Prod-Rohdaten (`prod-scan-raw.json`, **null KI-Calls**): Payload enthält
   `catalog` mit `DS/Button` (24 Varianten) und `DS/Card`; mindestens ein Baustein enthält einen
   `component-ref` auf `DS/…` mit `overrideText` und `scale ≈ 2,2`; **kein** Ref ohne `fallback`.
2. Plugin-Unit-Tests: Parser (neue Felder + `catalog`), `buildCatalogComponents`
   (Component vs. Set, Update behält Identität), `renderComponentRef` (Instanz + Override +
   Rescale + Fallback bei Fehler).
3. Alle vier Suiten grün + Typecheck (Web · Server · Plugin · Storybook-Harness).
4. Robs Klick: Plugin **neu laden** (dist neu gebaut!) → Import → Sektion „Design System" steht
   oben, Button-Set hat Varianten-Properties, Bausteine zeigen ◇ statt Frames.
