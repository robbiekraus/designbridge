# Briefing: Komposition in gegroundeten Bausteinen

**Status:** Übergabe an eine neue Session, die das autonom durchzieht. Kein fertiges Design — der
Befund ist verifiziert, die Lösungsentscheidung ist offen und gehört in ein Brainstorming.

**Auftrag von Rob (25.07.2026):** „Wir müssen das alles tatsächlich verbessern." Auslöser war der
erste echte Blick auf den Storybook-Export in der neuen Live-Preview: Atome sehen brauchbar aus,
zusammengesetzte Bausteine grausam.

---

## Der Befund (im Code verifiziert, nicht aus der Historie abgeleitet)

Ein gegroundeter Baustein verliert beim Code-Emit seine **innere Struktur** und wird zu einer
flachen Textzeile.

Konkret an Robs Live-Scan: „KPI Card – Orders" rendert im Storybook als eine Zeile
`Orders 13.465 3.1% Last month: 11.246` statt als Karte mit Titel, Wert und Vergleichszeile.

**Die Kette, Stelle für Stelle:**

1. `htmlToPlan` erkennt die Katalog-Komponente und baut einen `component-ref`. Der vollständige
   inline-gestylte Unterbaum bleibt als `fallback` am Knoten erhalten —
   `web/src/lib/emit/htmlToPlan.js:1140` (`fallback: ensureBox(buildNormalNode(el, ctx, parent))`).
   **Die Struktur ist an dieser Stelle noch komplett vorhanden.**
2. `planToJsx` → `walkCatalogRef` plattet sie zu einem String:
   `web/src/lib/emit/planToJsx.js:254` — `extractText(node.fallback)`, danach
   `<Card>flacher Text</Card>`. Es gibt keinen Abstieg in die Kinder.
3. Konsistent dazu steigen auch `collectCatalogImports` und `groundedComponentNames` bewusst nicht
   in den `fallback` ab (`planToJsx.js:259-295`).

**Das ist ausdrücklich die dokumentierte Grenze von DS-Grounding Scheibe 1**
(`docs/superpowers/specs/2026-07-23-slice1-ds-grounding-default-catalog-design.md`), nicht ein
neuer Regressionsfehler. Sie war bisher nur nie sichtbar, weil niemand die Bausteine gerendert
nebeneinander gesehen hat — der Storybook-Export macht sie erstmals ungefiltert sichtbar.

## Was ausdrücklich NICHT die Ursache ist (jeweils live geprüft, 25.07.)

Diese Punkte sind abgeklärt, damit die neue Session sie nicht erneut untersucht:

- **Nicht die Live-Preview / der Storybook-Build.** Läuft live korrekt: echter Scan (21 Bausteine)
  → `/build` → gerendertes Storybook, Status 200, keine Konsolenfehler.
- **Nicht fehlendes CSS.** Im Browser am Live-Build gemessen: Stylesheet mit 102 Regeln geladen,
  Tailwind-Utilities greifen (`display: flex` wirkt). Ich hatte das zwischenzeitlich falsch
  behauptet, weil ich in `iframe.html`/`iframe.js` statt in den geladenen Stylesheets gesucht habe.
- **Nicht die Atomic-Taxonomie.** Atoms/Molecules/Organisms/Templates sind gebaut und greifen; die
  rekursive Zerlegung ist seit 23.07. auf `main`. Robs Eindruck „ich dachte, Atomic Design ist
  schon drin" ist richtig — die Taxonomie ist drin. Was fehlt, ist die **Komposition innerhalb
  eines gegroundeten Knotens**. Diese Unterscheidung ist der Kern des Missverständnisses und sollte
  in jeder Kommunikation darüber sauber getrennt werden.
- **Nicht die KI-Interpretationsqualität an sich.** Das Modell liefert Struktur; sie wird erst im
  Emit verworfen. Das ist vor der Arbeit noch an echten Daten zu bestätigen (s. Schritt 1 unten).

## Aufgabe

Gegroundete Bausteine sollen ihre Kinder behalten, statt zu Text zu kollabieren — sodass eine
KPI-Karte als Karte mit Struktur ankommt.

## Vorgehen (empfohlen)

1. **Erst messen, dann entscheiden.** Einen echten Scan über die Live-App interpretieren lassen
   (`/api/interpret/components`, ein Baustein pro Request wie der Web-Client), den emittierten Code
   einer KPI-Karte ansehen und den Befund oben an echten Daten bestätigen. Kostet Gemini-Kontingent
   — Robs Konto ist aufgeladen, sparsam bleiben. Hilfsskripte als Muster:
   `web/verification/build-prod-storybook-fixture.mjs`.
2. **Brainstorming mit Rob** (`superpowers:brainstorming`) über die offenen Entscheidungen unten.
   **Nicht ohne seine Richtung entwerfen** — harte Projektregel, und hier gibt es echte Alternativen.
3. Spec unter `docs/superpowers/specs/`, Plan unter `docs/superpowers/plans/`, dann TDD.

## Offene Entscheidungen (gehören ins Brainstorming, nicht vorab festlegen)

- **Slots vs. flache Kinder.** shadcn-`Card` ist idiomatisch keine Komponente mit einem
  Kinder-Block, sondern `Card > CardHeader > CardTitle` / `CardContent`. Soll der Emit auf diese
  Unterkomponenten abbilden (idiomatischer, braucht eine Zuordnung von Unterbaum-Rollen zu
  Slots und Katalog-Einträge für die Unterkomponenten) oder die Kinder direkt als
  `<Card>{Kinder}</Card>` rendern (einfacher, weniger idiomatisch)?
- **Wie tief wird komponiert?** Verschachtelte Katalog-Refs innerhalb des Fallbacks — rekursiv
  weitergrounden oder ab Ebene 2 als normale Knoten rendern?
- **Was passiert mit den Fallback-Stilen?** Die Katalog-Komponente bringt eigenes Styling mit; die
  inline-gestylten Kinder ebenfalls. Doppelt gestylte Knoten sehen schnell falsch aus. Regel nötig,
  welche Stile beim Komponieren gewinnen.
- **Figma-Weg mitziehen?** Rob vermutet dasselbe Problem beim Figma-Export. Der Figma-Emitter nutzt
  denselben `htmlToPlan`, also denselben Plan mit intaktem `fallback`
  (`emitFigmaComponents.js:126,162`); das Plugin verwirft den Fallback aber nur bei erfolgreicher
  Komponenten-Auflösung, sonst rendert es ihn. **Ungeprüft, ob Figma deshalb sogar besser aussieht
  als der Code-Weg** — vor dem Bauen einmal verifizieren, sonst wird eine Grenze behoben, die dort
  nie existierte.
- **Void-Elemente und Namenskollisionen** dürfen nicht zurückfallen: `voidElement` (Input darf nie
  Kinder bekommen, `shadcn-default.js:175`) und `catalogLocalName` (Alias bei Namensgleichheit) sind
  beide echte Live-Funde mit Regressionstests. Beim Umbau von `walkCatalogRef` erhalten.

## Verifikation

Nicht „Tests grün" allein — das Ergebnis ist visuell:

- Regressionstests in `planToJsx.grounding.test.js`, `htmlToPlan.grounding.test.js`.
- Kompilier-/Render-Beweis: `cd web && npx vitest run src/lib/emit/grounding.verify.test.js`.
- **Sichtprüfung im echten Storybook** über die Live-Preview: exportieren → „In Storybook öffnen" →
  eine KPI-Karte muss als Karte erkennbar sein. Das ist das Abnahmekriterium, nicht die Testzahl.
- Volle Suiten vorher/nachher: Web, Server, Plugin.

## Kontext, den die neue Session braucht

- `CLAUDE.md` im Projekt zuerst lesen (harte Regeln, Arbeitsstil, Modellwahl kommunizieren).
- `RESUME.md` für den Ist-Stand.
- Live-App: https://designbridge-production.up.railway.app — jeder Push auf `main` deployt automatisch.
- Storybook-Builder (zweiter Railway-Service, seit 25.07. live):
  https://extraordinary-encouragement-production-d73d.up.railway.app
  Adresse liegt als Code-Default in `server/lib/healthInfo.js`, `STORYBOOK_BUILDER_URL` überschreibt.
- Rob hasst Terminal-Arbeit. Server für ihn selbst starten oder VS-Code-Tasks nutzen
  (`.vscode/tasks.json` im Worktree als Muster), keine Terminal-Anleitungen erwarten.
- Rob hat am 25.07. „vielleicht noch eine andere Baustelle" angedeutet, ohne sie zu benennen —
  beim Wiedereinstieg nachfragen.
