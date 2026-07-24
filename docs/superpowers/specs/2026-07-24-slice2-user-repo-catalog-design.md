# DS-Grounding Scheibe 2 — Katalog aus dem User-Repo + abgeleitetes Rendering

**Datum:** 2026-07-24 · **Status:** Spec zum Bau (Rob-Scope: „+ abgeleitetes Rendering", 24.07.)
**Branch:** `claude/designbridge-tagesübersicht-0go7d3`
**Baut auf:** Scheibe 1 (Grounding gegen hartkodierten shadcn-Default-Katalog) + Richtungs-Doc `2026-07-23-design-system-grounded-interpretation-architecture.md` (§Zerlegung Punkt 2).

## Anlass / Ziel

Heute ist der Katalog an zwei Stellen **hartkodiert** (shadcn-Default):
`web/src/lib/catalog/shadcn-default.js` (voll: `plan`+`import`+`variants`+`match`) und
`server/lib/catalog/shadcnVocabulary.js` (Namen+Varianten fürs Prompt). Scheibe 2 ersetzt diese
Quelle durch das **echte shadcn/Tailwind-Repo des Users**: echte Komponenten-Namen, echte cva-
Varianten, echte Import-Pfade — und (Rob-Scope) ein **aus dem Tailwind-Source abgeleitetes `plan`**,
damit der Figma-Emit den **echten Look des User-Repos** zeigt, nicht die Default-Approximation.

## Erfolgskriterium

Ein User-Repo (shadcn/ui + Tailwind) → der Bild-Scan wird gegen dessen echte Komponenten gegroundet:
1. Code-Emit importiert die **echte** User-Komponente (`import { Button } from "<echter Pfad>"`) mit den
   **echten** cva-Varianten des Repos.
2. Der Figma-`plan` einer gegroundeten Komponente spiegelt den **Tailwind-Look aus dem Repo-Source**
   (Padding/Radius/Farb-Slots/Border/Font), nicht die handgeschriebene Default-Näherung.
3. Kein User-Repo da → sauberer Fallback auf den Scheibe-1-Default-Katalog (unverändert).

## Pipeline (neue Bausteine fett)

```
Repo rein (fetchRepoTarball/extractRepoFiles — vorhanden)
  → finde components/ui/*.{tsx,jsx}
  → **cvaParser**        je Komponente: base-Klassen + variants{achse:{option:klassen}} + defaultVariants
  → **themeReader**      globals.css :root / tailwind.config → slot→hex (bg-primary → #…)
  → **twToPlan**         Klassen-String → plan-Knoten (box/text: padding/radius/fill/stroke/font/layout)
  → **buildRepoCatalog** assembliert { name, import, variants, props, match, plan } je Komponente
  → ersetzt SHADCN_DEFAULT_CATALOG in htmlToPlan/planToJsx + speist Server-Vokabular
```

## PINNED CONTRACT

1. **`cvaParser(source)`** ist rein → `{ base: string, variants: { axis: { option: string } }, defaultVariants }`.
   Fokussierter, struktureller Parser auf shadcns reguläre `cva("base", { variants:{…}, defaultVariants:{…} })`-
   Form (KEIN voller TS-AST) — deckt den 95%-Fall, degradiert bei ungewohnter Form auf `{ base:'', variants:{} }`.
2. **`themeReader(files)`** liest CSS-Variablen aus `:root` (globals.css) → `{ slot: hex }`. Fallback: kein
   Theme gefunden → Slots bleiben unaufgelöst (`hex:null`, `token`-Referenz bleibt fürs Token-Snapping erhalten).
3. **`twToPlan(classString, { theme })`** ist rein → ein plan-Knoten. Bounded Utility-Map (Spacing `p*/px/py`,
   Radius `rounded*`, Farbe `bg-*/text-*/border-*` → colorRef, Border `border`, Font `text-*/font-*`, Layout
   `flex/inline-flex`). **Unbekannte Klassen werden ignoriert** (degradiert sauber, kein Absturz).
4. **`buildRepoCatalog(repoFiles)`** → Array im **exakt gleichen Format** wie `SHADCN_DEFAULT_CATALOG`
   (`{ name, import:{name,from}, variants, props, match:{tag,hints}, plan }`). `plan` ist eine aus `twToPlan`
   gebaute Funktion `(picks, item) => planNode`, `variants` aus `cvaParser`, `import.from` aus dem Dateipfad,
   `match.hints` aus dem Namen.
5. **Katalog-Auswahl:** liegt ein User-Repo-Katalog vor, wird er durchgereicht (statt `SHADCN_DEFAULT_CATALOG_OPTION`);
   sonst Default. Emit-Verträge (htmlToPlan promotet `data-ds-component`, planToJsx emittiert Import+JSX) **unverändert** —
   sie bekommen nur einen anderen Katalog.
6. **Server-Vokabular** (`shadcnVocabulary`) wird bei User-Repo aus `buildRepoCatalog` abgeleitet (Namen+Varianten),
   damit der Prompt die echten Namen lehrt. Fallback: Default-Vokabular.
7. Nicht getroffene Elemente: unverändert freihändiger `plan` wie heute (degradiert sauber).

## Änderungen (Blast Radius)

- **Neu `server/lib/catalog/cvaParser.js`** + Test — cva → base/variants/defaults.
- **Neu `server/lib/catalog/themeReader.js`** + Test — :root-Variablen → slot→hex.
- **Neu `web/src/lib/catalog/twToPlan.js`** + Test — Tailwind-Klassen → plan-Knoten (Emit-Belang → web/).
- **Neu `web/src/lib/catalog/buildRepoCatalog.js`** + Test — assembliert den Katalog (nutzt cvaParser-Output +
  twToPlan). *(cvaParser/themeReader ggf. gespiegelt/geteilt — Duplizierungs-Frage s.u.)*
- **`web/src/lib/emit/emitComponents.js` / `htmlToPlan` / `planToJsx`** — Katalog-Parameter durchreichen
  (User-Katalog statt Default, wenn vorhanden).
- **`server/…` Interpret-Pfad** — Vokabular aus User-Repo ableiten.
- **Neu Repo-Fixture** — realistischer shadcn-`button.tsx` mit echtem `cva` (die aktuelle Fixture ist ein
  Trivial-Button), plus `globals.css` mit `:root`-Theme, als Test-/Verifikations-Grundlage.

## Sub-Entscheidungen (Defaults gewählt, Rob-vetobar)

- **cva-Parsing** = fokussierter struktureller Parser, kein voller AST (kleiner; shadcns cva-Form ist regulär).
- **Theme-Auflösung** = `:root`-Variablen aus globals.css (wie im Storybook-Harness); tailwind.config-Farb-Mapping
  nur als Fallback.
- **twToPlan-Umfang** = das shadcn-Utility-Set (bounded); unbekannte Klassen ignoriert.
- **web/server-Duplizierung** = für Scheibe 2 pragmatisch belassen wie in Scheibe 1 (cvaParser/themeReader ggf.
  in `server/` gebaut und Ergebnis nach web/ gereicht bzw. gespiegelt); die Vereinheitlichung (ein geteiltes
  Katalog-JSON) bleibt der separate spätere Refactor aus dem Scheibe-1-Vertrag.

## Step-Zerlegung (jeder Schritt endet mit Test/Sichtbarem)

1. **Realistische Repo-Fixture** (shadcn-`button.tsx` mit echtem cva + `globals.css` :root-Theme).
2. **`cvaParser`** + Test → Achsen+Klassenmap aus dem Fixture-Button.
3. **`themeReader`** + Test → slot→hex aus der Fixture-`globals.css`.
4. **`twToPlan`** + Test → Klassen-String → plan (gegen bekannte shadcn-Button-Klassen).
5. **`buildRepoCatalog`** + Test → Katalog-Objekt aus dem Fixture (Format == Default-Katalog).
6. **Verdrahtung** (Katalog-Auswahl in Emit + Server-Vokabular; Fallback Default).
7. **End-to-End-Verifikation** gegen die Repo-Fixture: Emit importiert echten Pfad+Varianten; Figma-`plan`
   spiegelt den Fixture-Look. (Anschluss an `web/verification/`.)

## Non-Goals (Scheibe 2)

- Kein Figma-DS als Quelle (= Scheibe 4, bewusst raus).
- Kein voller TS-AST-Parser / keine beliebigen cva-Verschachtelungen (nur die reguläre shadcn-Form).
- Keine web/server-Katalog-Vereinheitlichung (bleibt späterer Refactor).
- Verschachtelte Katalog-Komposition unverändert (Scheibe-1-Grenze: genestete Komponenten → Text-Blatt).
- Kein cva jenseits von `class-variance-authority`-Standard (z. B. tailwind-variants `tv()`) — späterer Zusatz.
