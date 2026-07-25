# Plan: Komposition in gegroundeten Bausteinen

Spec: `docs/superpowers/specs/2026-07-25-komposition-gegroundeter-bausteine-design.md`
Arbeitsweise: TDD, kleine Schritte. Orchestrierung Opus 5, Implementierung Sonnet-Subagents.

## Aufgaben

- [x] **1 — Katalog-Vertrag: `container`** (`web/src/lib/catalog/shadcn-default.js`,
      `web/src/lib/emit/htmlToPlan.js`)
      `Card` bekommt `container: true`; `matchCatalogComponent` reicht `container` durch (wie
      `voidElement`), `convertElement` setzt es auf den Ref-Knoten. Test in
      `htmlToPlan.grounding.test.js`: Card-Ref trägt `container: true`, Button-Ref nicht.

- [x] **2 — Code-Emit komponiert** (`web/src/lib/emit/planToJsx.js`, TDD)
      (a) `boxClasses` in `layoutClasses` + `visualClasses` zerlegen, Verkettung = altes Verhalten
      (bestehende Tests müssen unverändert grün bleiben);
      (b) Container-Zweig in `walkCatalogRef`: `<Card className="<layoutClasses(fallback)>">` +
      Kinder rekursiv via `walk`; `voidElement` gewinnt über `container`; Container ohne
      Element-Kinder → heutiges Text-Verhalten;
      (c) `extractText` steigt auch in `fallback` verschachtelter Refs ab;
      (d) `collectCatalogImports`/`groundedComponentNames` laufen bei Container-Refs in
      `fallback.children` weiter (eigener Import/Name zählt zusätzlich).

- [x] **3 — Plan→Plan-Grounding für Figma** (`web/src/lib/emit/groundPlan.js` neu + Tests)
      Katalog-Refs auflösen: Container → Hülle aus `entry.plan()` (fill/stroke/strokeWeight/radius) +
      Layout/Padding/Größe/Align/stretch/grow aus dem Fallback + rekursiv gegroundete Kinder;
      Blatt → `entry.plan(auswahl)` mit echtem Text aus dem Fallback; unbekannter Eintrag → Fallback.

- [x] **4 — Figma-Emit verdrahten** (`web/src/lib/emit/emitFigmaComponents.js` + Tests)
      `groundPlan` an beiden `htmlToPlan`-Stellen vor `scalePlan`. Test: Payload enthält für
      gegroundete Bausteine keine Katalog-`component-ref`s mehr, scan-interne Refs (Atomic-Nesting)
      bleiben unangetastet.

- [x] **5 — Render-Beweis + Repo-Kataloge** (`web/src/lib/emit/grounding.verify.test.js`,
      `web/src/lib/catalog/buildRepoCatalog.js`)
      (a) Card-mit-Kindern kompiliert und rendert mit verschachtelten DOM-Knoten;
      (b) `buildRepoCatalog` setzt `container` über die Namensliste (Card/Panel/Dialog/Sheet/Alert/
      Popover/Accordion/Drawer) + Test.

- [x] **6 — Verifikations-Werkzeug (KI-sparsam)** (`web/verification/`)
      `build-prod-storybook-fixture.mjs` friert zusätzlich `fixtures/prod-scan-raw.json` ein; neues
      `reemit-from-raw.mjs` baut das Storybook-Paket ohne KI-Call daraus neu; deterministische
      Kompositions-Fixture für den Vorher/Nachher-Vergleich.

- [x] **7 — Sichtprüfung Storybook** (Claude selbst)
      Harness-Build aus der Fixture, im echten Browser öffnen, Screenshot: KPI-Karte ist eine Karte.

- [~] **8 — Sichtprüfung Figma** (TEILWEISE: Payload-Ebene bewiesen, Figma-Render offen — Figma Desktop hatte kein offenes Fenster, s. RESUME)
      Gleiche Bausteine nach Figma, per Figma-MCP prüfen: (a) Optik wie Storybook, (b) keine
      „Komponente nicht gefunden"-Warnungen, (c) Atomic-Verschachtelung als ◇-Instanzen.

- [x] **9 — Abschluss** — volle Suiten (Web/Server/Plugin), Push auf `main`, RESUME + Memory.
