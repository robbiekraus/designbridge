# Composition-Fidelity v2: Instanz-Resize nur verkleinern, nie strecken

Stand: 19.07.2026. Folgeschritt zu `2026-07-18-splice-instance-slot-sizing-design.md`.
Reiner Plugin-/Rendering-Fix — KEIN Web-/Payload-Change, KEIN Re-Emit nötig.

## Problem (Mechanismus am Payload bestätigt)

Der Slot-Sizing-Fix (`de2d4fc`) gibt gesplicten Instanzen ein `absolute`-Rect = gemessener
Slot; `applyAbsolute` (`renderPlan.ts`) resized die Instanz hart auf `abs.width × abs.height`.
Das ist richtig, wenn die Instanz VERKLEINERT wird (natürlich größer als Slot → kachelt sauber,
Beweis: KPI/Chart-Karten im Figma-Render). Es ist FALSCH, wenn die Instanz GESTRECKT wird:

- **Sidebar Navigation:** natürlich `320×940` (Root HUG-Höhe, innere Box `280×900` fixed,
  space-between). Als Template-Instanz auf Slot `260×1553` gezwungen → Höhe 940→1553 gestreckt
  → Inhalt oben zusammengestaucht/überlappt (Figma-Test 18.07., `de2d4fc`-Regression).

Grund: unabhängig interpretierte Bausteine haben unterschiedlichen Maßstab. Der template-eigene
Slot (aus der Template-Interpretation gemessen) ≠ natürliche Größe des Organism (eigene
Interpretation). Eine Instanz über ihre designte Größe zu strecken verzerrt/leert sie — für ein
Fidelity-Tool nie erwünscht.

## Fix

In `applyAbsolute` (`designbridge-plugin/src/writer/renderPlan.ts`) für
`el.type === 'component-ref'`: pro Achse auf `min(natürliche Größe, Slot)` resizen statt hart auf
den Slot — nie vergrößern. Die natürliche Größe = `node.width`/`node.height` NACH `createInstance()`,
VOR dem resize (die Größe der referenzierten Komponente).

```ts
} else if (el.type === 'component-ref') {
  const resizable = node as SceneNode & { resize(w: number, h: number): void };
  const w = Math.min(node.width, abs.width);
  const h = Math.min(node.height, abs.height);
  resizable.resize(w, h);
} else {
  (node as SceneNode & { resize(w, h): void }).resize(abs.width, abs.height);
}
```

Position (`x`/`y`) bleibt unverändert aus `abs`. box/svg/text bleiben unverändert (dort IST `abs`
die gebaute Zielgröße, keine „natürliche" Größe zu erhalten).

## Erwartetes Ergebnis

- Sidebar: bleibt `260×940` statt `260×1553` (Breite darf schrumpfen — Slot < natürlich; Höhe
  NICHT gestreckt) → space-between-Inhalt in natürlicher Verteilung, keine Stauchung. Kleiner
  Rest: innere 280er-Box wird bei 260 leicht geclippt (7 %, akzeptabel, eigener Polish falls stört).
- Karten: unverändert verkleinert → kacheln wie gehabt; wo Slot höher als natürlich, bleibt die
  Karte natürlich hoch (kleiner Bodenspalt statt Streckung — bewusst).
- Overflow-Fix (`de2d4fc`) bleibt intakt (Verkleinern unverändert).

## Bewusste Grenzen

- Bausteine, die designt WÜRDEN mitwachsen (responsive Auto-Layout), wachsen jetzt nicht mehr über
  natürlich → gelegentliche Lücken. Für ein Fidelity-Tool ist „Lücke" < „Verzerrung". Akzeptiert.
- Echter Beweis = Figma-Re-Import desselben Prod-Payloads mit neuem Plugin-Build.

## Tests (designbridge-plugin, Figma-API gemockt wie bestehende renderPlan-Tests)

1. component-ref, Slot KLEINER als natürlich (beide Achsen) → resize auf Slot (Verkleinern erlaubt).
2. component-ref, Slot GRÖSSER als natürlich (Höhe) → resize-Höhe = natürlich (kein Strecken),
   Breite = min.
3. component-ref, gemischt (Breite kleiner, Höhe größer) → `min` pro Achse einzeln.
4. box/svg mit absolute → unverändert hart auf `abs` (Regression-Schutz für den bestehenden Vertrag).
5. Position x/y in allen Fällen aus `abs` gesetzt.
