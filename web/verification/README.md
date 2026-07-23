# DS-Grounding — Verifikations-Harness (Scheibe 1 Schritt 6)

Beweist, dass der aus einem Scan gegroundete Code **in einem echten shadcn/ui + Tailwind-Projekt
kompiliert und rendert** — der bislang ungecheckte Dev-Empfang.

## Was hier liegt

- **`shadcn-target/`** — ein minimales, aber **API-kompatibles** shadcn/ui-Ziel:
  `components/ui/*.jsx` mit derselben öffentlichen Prop-API wie shadcn (Button `variant`/`size`,
  Badge `variant`, …) und dem `@/`-Alias (`jsconfig.json`). Echte Radix-/cva-Abhängigkeiten sind für
  den Kompilier-/Render-Beweis nicht nötig — es geht um Import-Auflösung + gültiges JSX + Prop-Vertrag.
- **`generate-sample.mjs`** — Demo: führt die echte Pipeline (`htmlToPlan → planToJsx`) über jsdom aus
  und druckt den emittierten shadcn-Code. Aufruf: `node web/verification/generate-sample.mjs`.

## Der automatische Beweis

`web/src/lib/emit/grounding.verify.test.js` (läuft in der normalen Vitest-Suite):

1. generiert aus markiertem Interpretations-HTML echten Code (`planToJsx`),
2. **bündelt** ihn mit esbuild gegen `shadcn-target/` (löst `@/…`-Imports auf) — gelingt das Bundle,
   sind alle Imports auflösbar und das JSX gültig (**Kompilier-Beweis**),
3. **rendert** die Komponente via react-dom serverseitig (**Render-Beweis**) und prüft Inhalte +
   Varianten (`bg-secondary` etc.).

Läuft im Node-Environment (esbuild braucht natives `TextEncoder`); jsdom wird dort manuell als
Bibliothek instanziiert, damit `htmlToPlan` ein DOM hat.

## Grenze (bewusst, Scheibe 1)

Ein Katalog-Baustein wird als **Blatt** mit Textinhalt gerendert. In einen gegroundeten Baustein
verschachtelte weitere Katalog-Komponenten (z. B. Buttons *in* einer `<Card>`) werden noch nicht als
Kinder komponiert — Komposition gegroundeter Komponenten ist Folgearbeit.
