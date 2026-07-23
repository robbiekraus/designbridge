# Architektur: Interpretation wird gegen ein Design System gegroundet (Katalog als Vokabular)

**Datum:** 2026-07-23
**Status:** Richtung mit Rob durchgebrainstormt. Erster Schnitt vorgeschlagen. Noch KEIN Code. Richtungsdokument über mehrere Scheiben.
**Betroffen:** `server/` (Interpretations-Prompt + neuer Katalog-Baustein), `web/` (Emitter lesen weiter aus dem `plan`, verändern sich zunächst kaum).
**Baut auf:** `2026-07-19-canonical-plan-model-architecture.md` (ein Modell → zwei Emitter). Diese Spec ist die **nächste Schicht darüber**.

## Was aufgedeckt wurde (Robs Reframe, 23.07.)

Der bisherige Ansatz ist der **falsche**: Ein PNG/JPEG/Screenshot wird interpretiert und daraus werden
verklasserte, verschachtelte Items in Figma — „frame, frame, frame, frame". Das ist nett anzusehen,
aber ein **technisches Repository gewinnt daraus nichts.** Die Interpretation läuft freihändig, ohne
Bezug auf ein reales Komponenten-Vokabular. Deshalb ist die Figma-Ausgabe „beiläufig" und der
Dev-Empfang (shadcn/Storybook/Tailwind) nie eingelöst.

Der eigentliche Wert ist eine **Verbindung zwischen Figma und einem Repository**, vermittelt durch ein
**Design System als gemeinsames Vokabular.** Ohne dieses Grounding ist die Interpretation Richtung Figma
nur halb so viel wert.

## Entscheidung

**Die Interpretation löst jeden erkannten Baustein gegen einen Design-System-Katalog auf**, statt ihn
freihändig als HTML/Boxen nachzubauen. Ein erkannter Button ist nicht mehr „box mit radius 8", sondern
`Button { variant: "secondary", size: "sm" }` — gebunden an einen realen Katalog-Baustein per Identität.

Damit referenzieren **beide** Ausgabe-Enden (Figma-Instanzen UND Repo-Code) dieselben Katalog-Komponenten
per Identität → Figma und Repo sind über den Katalog **verbunden.** Das ist der „Sync"/Connection-Kern,
aber richtig gegroundet statt frei zusammengeschraubt.

### Der Katalog = das verbindende Primitiv (existiert heute NICHT)

```
Katalog = {
  tokens:     [...],                      // Farben/Typo/Spacing/Radius/Schatten (haben wir schon)
  components: [                            // NEU: das Vokabular
    { name, variants, props, rendering }  // rendering = wie der Baustein aussieht/emittiert
  ]
}
```

Quellen des Katalogs (dieselbe Abstraktion, drei Lieferanten):

1. **Eigenes Repo des Users** (shadcn/ui + Tailwind) — Bausteine vorhanden: `extractRepoFiles`,
   `repoDecomposer`, `interpretComponents` lesen bereits React/shadcn/Tailwind-Source.
2. **Eigenes Figma-Design-System des Users** — `ingestFigmaFile` liest heute Styles zurück; Komponenten-
   Struktur wäre ein Vorstück.
3. **Fallback: mitgelieferter Default-Katalog** (shadcn/ui + Tailwind) — „falls kein eigenes DS da ist,
   zwinge den Scan ins nächstliegende/universellste System". shadcn/Tailwind gewählt, weil der Source dem
   User gehört und **lesbar** ist (≠ MUI/Ant, die Dependency-Blackboxes sind).

### Warum das die drei Schmerzpunkte auf einmal löst

- **Figma-Treue („beiläufig"):** Der `plan` wird aus realen Komponenten-Definitionen gebaut → echte
  Bausteine statt approximierter Frames. Fällt als Nebenprodukt ab.
- **Dev-Empfang (shadcn/Storybook/Tailwind „nie gecheckt"):** Der Code-Emit produziert echte Imports
  realer Katalog-Komponenten → **kompiliert** in einem echten Projekt. Erstmals eingelöst.
- **Figma↔Repo-Verbindung (das Produktversprechen):** Katalog-Identität verbindet beide Enden.

## Zerlegung (jede Scheibe: eigener Spec → Plan → Bau)

1. **Grounding-Mechanismus mit Default-Katalog** — **← ZUERST (vorgeschlagener erster Schnitt).**
   Bild-Scan (der heute funktionierende Pfad) → Auflösung gegen den mitgelieferten shadcn/Tailwind-
   Default-Katalog → `plan` aus realen Komponenten → Emit von echtem, **kompilierendem** shadcn-JSX +
   Figma-Instanzen. Verifikation: Output fällt in ein echtes shadcn/Tailwind-Projekt und kompiliert/rendert.
   *Beweist den Mechanismus, ohne gleichzeitig Katalog-aus-fremdem-Repo bauen zu müssen.*
2. **Eigenes System als Katalog-Quelle** — derselbe Mechanismus, Katalog aus dem User-Repo statt Default.
   Direkt danebliegender zweiter Schritt.
3. **Storybook-Emit** — dritte Projektion desselben gegroundeten Modells (Story pro genutzter
   Komponente/Variante). Löst den heute deaktivierten „Nach Storybook (folgt)"-Button ein.
4. **Figma-DS als Katalog-Quelle** — Komponenten-Read-back aus Figma (Vorstück, größer).

## Von Rob getroffene Entscheidungen (Brainstorm 23.07.)

- Kern = **Verbindung Figma↔Repo, vermittelt durch ein Design System als Vokabular.** Figma-only
  („frame, frame, frame") ist der **falsche Ansatz**.
- Design-System-Input ist **first-class**: User bringt sein eigenes (Repo / Figma-DS) rein.
- **Fallback**, wenn keins da ist: nächstliegendes/universellstes System = **shadcn/ui + Tailwind**.
- Bekannteste Systeme laut Recherche: Tailwind (Styling-Basis), shadcn/ui (besitzbarer Source — beste
  Grounding-Wahl), MUI/Ant (größer, aber Blackbox → ungeeignet), Radix/Bootstrap/Chakra/Mantine.
- **Erster Schnitt (vorgeschlagen):** Mechanismus zuerst mit Default-Katalog (Scheibe 1); eigenes System
  = Scheibe 2.

## Offene Fragen (für den Detail-Spec von Scheibe 1)

- **Katalog-Format konkret:** Wie werden Varianten/Props je shadcn-Komponente repräsentiert (cva-Variants
  auslesen vs. kuratierter Default-Satz)?
- **Grounding-Mechanik:** Löst das Vision-Modell direkt gegen den Katalog auf (Katalog im Prompt), oder
  gibt es eine Zwischenstufe (freihändige Interpretation → nachgelagertes Matching auf Katalog)?
- **Rendering im Katalog:** Woher kommt das visuelle Erscheinungsbild eines Katalog-Bausteins für den
  Figma-Emit — aus dem `plan` desselben Bausteins, gebaut aus dem Source?
- **Fallback bei Nicht-Treffer:** Was passiert mit einem erkannten Element, das keiner Katalog-Komponente
  entspricht — freihändiger `plan` wie heute (degradiert sauber), oder nächstliegende Komponente erzwingen?

## Out of scope (bewusst nicht in dieser Richtung)

- Echter Live-Round-Trip / kontinuierlicher Abgleich (Änderung in Figma propagiert automatisch in Repo).
  Kommt erst, wenn Katalog-Identität auf beiden Enden steht.
- Diff-View als eigenständiges Feature (war meine verworfene Fehlrichtung — der Wert liegt im Grounding,
  nicht in einer Vergleichs-Tabelle).
- MUI/Ant/andere Blackbox-Libraries als Katalog-Quelle.
