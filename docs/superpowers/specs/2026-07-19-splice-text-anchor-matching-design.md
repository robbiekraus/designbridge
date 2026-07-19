# Composition-Splice v2 — Text-Anker-Matching (statt rein räumlichem IoU)

Datum: 2026-07-19 · Status: beschlossen (Rob: „Text-Anker + Plausibilität")
Baut auf: `2026-07-18-composition-splice-parent-fidelity-design.md` (Splice-Mechanik bleibt)

## Problem (Root Cause, belegt am echten Import `59c4365128f19efb`)

Der Splice ordnet Kind-Bausteine über IoU zwischen (a) Gemini-geschätzten bboxes aus dem
**Original-Screenshot** und (b) dem im Browser gemessenen Layout der **KI-neu-gezeichneten**
Eltern-Interpretation zu. Das sind zwei unabhängig entstandene Geometrien — die vertikalen
Proportionen stimmen nicht überein (Storage-Widget: Original y≈52%, Neuzeichnung mit
`space-between` y≈75%). Gemessene Best-IoU im echten Import: **Sidebar Logo 0.019,
Storage Progress Widget 0.057, User Profile Widget 0.038** — und der jeweils „beste"
Kandidat war der **gesamte Sidebar-Container**, nicht das richtige Element.
→ Kein Schwellwert-Tuning kann das retten; rein räumliches Matching ist strukturell falsch.
Folge in Figma: die guten Einzel-Interpretationen werden nicht instanziert, die Low-Fidelity-
Selbstzeichnung des Elternteils gewinnt (leere Logo-/Avatar-Boxen — Robs Befund 19.07.).

## Kernidee

Text ist das stabile Signal zwischen beiden Renditionen (beide lasen dasselbe Bild):
„EcoMetrics", „Storage / Upgrade / 3.4 GB of 15 GB", „Jane Smith" kommen wörtlich in
Kind-Interpretation UND Eltern-HTML vor. **Prototyp-Messung am echten Import: alle drei
Kinder matchen ihr Element mit Token-Jaccard 1.0; falsche Konkurrenten ≤ 0.1** (einzige
Ausnahme 0.75 = direkter Vorfahre des Treffers, kein Fehlmatch).

## Vertrag

### 1. Anker-Extraktion (Aufrufer-Seite, `emitFigmaComponents`)

- `spliceTargets`-Einträge werden um `anchorTokens: string[]` erweitert:
  aus `result.interpretations[childName].html` per DOM-Parse (`innerHTML` in Detached-Div,
  kein Layout nötig) den `textContent` ziehen und tokenisieren.
- Tokenisierung (Single Source of Truth, eine exportierte Funktion):
  lowercase → alles außer Buchstaben/Ziffern/`.`/`%` durch Space ersetzen →
  Tokens mit Länge ≥ 2 behalten (Set).
- Kind ohne Interpretation oder ohne Tokens → `anchorTokens: []` (Fallback greift, s. §3).

### 2. Text-Matching (in `computeSpliceAssignment`, Phase 1)

- Score = **Token-Jaccard** zwischen `anchorTokens` (Set) und den Subtree-Tokens des
  Kandidaten-Elements (gleiche Tokenisierung auf `el.textContent`).
- Kandidaten wie bisher: alle Elemente in Dokumentreihenfolge (`collectCandidateElements`).
- Schwelle: `SPLICE_MIN_TEXT = 0.5` (Beleg: echte Treffer 1.0, echtes Rauschen ≤ 0.1;
  Puffer für leicht abweichende Zahlen/Formatierungen zwischen zwei Gemini-Läufen).
- **Tie-Break bei gleichem Score: das ÄUSSERSTE Element gewinnt** (Vorfahre schlägt
  Nachfahre). Beleg: „Jane Smith" liefert Span → Wrapper → Profilzeile alle mit 1.0;
  richtig ist die ganze Zeile (Kind-Baustein umfasst Avatar + Name + Icon — Bildknoten
  tragen keinen Text bei). Implementierung: bei Score-Gleichstand ersetzt ein Vorfahre
  den bisherigen Kandidaten; Elemente ohne Vorfahren-Beziehung: erster in Dokumentreihenfolge.
- **Plausibilitäts-Deckel (Robs „+ Plausibilität"):**
  (a) Element hat messbares Rect (Breite UND Höhe > 0);
  (b) Element-Fläche ≤ **80%** der Referenzrahmen-Fläche (verhindert Wurzel-/Fast-Wurzel-
  Match, wenn ein Kind fast den gesamten Eltern-Text trägt).
  Kandidaten, die (a) oder (b) verletzen, werden übersprungen (nächstbester zählt).
- Globale Zuordnung bleibt Greedy wie heute: alle (Element, Ziel)-Paare ≥ Schwelle nach
  Score absteigend, jedes Ziel max. 1×, jedes Element max. 1×. Bei Score-Gleichstand
  über VERSCHIEDENE Ziele hinweg: Dokumentreihenfolge (deterministisch).

### 3. IoU-Fallback (Phase 2, unveränderte Semantik)

- Ziele ohne `anchorTokens` (leer/fehlend) ODER ohne Text-Match ≥ Schwelle laufen danach
  durch das **bestehende** IoU-Matching (`SPLICE_MIN_IOU = 0.35`, unverändert) — gegen die
  in Phase 1 noch nicht verbrauchten Elemente/Ziele.
- Damit bleiben textlose Kinder (Charts, Icon-only) und alle heute funktionierenden
  Splices (13 Instanzen im Dashboard-Template) exakt gleich.

### 4. Warnung

- Unverändert EINE Warnung pro htmlToPlan-Lauf für unmatched Ziele, Text angepasst:
  `Composition-Splice: kein passendes Element gefunden für: <Namen> (weder Text-Anker
  noch IoU ≥ 0.35) — Inhalt bleibt Teil der Eltern-Interpretation.`

## Bewusste Grenzen

- Zwei Geschwister mit IDENTISCHEM Text (z. B. zwei gleiche Buttons): bestes Jaccard ist
  gleich → Dokumentreihenfolge entscheidet. Falschzuordnung möglich, aber beide Kandidaten
  sind dann darstellungsgleich — visuell folgenlos.
- Anker-Tokens aus nur 1 Token („ecometrics") sind zulässig (Beleg: funktioniert); das
  Risiko generischer Einzel-Tokens fängt die 0.5-Schwelle plus Flächen-Deckel.
- Die Ziel-bbox wird in Phase 1 NICHT mehr geprüft (bewusst: sie ist das nachweislich
  unzuverlässige Signal). Slot-Sizing der gesplicten Instanz (separate Scheibe
  `2026-07-18-splice-instance-slot-sizing`) misst ohnehin das ECHTE Element-Rect.

## Tests (TDD, Reihenfolge = Implementierungsreihenfolge)

Unit (reine Funktionen, kein DOM wo möglich):
1. `tokenizeAnchorText`: lowercase, Satzzeichen raus, `3.4`/`15`/`gb` bleiben, Länge-1 fliegt.
2. `textJaccard`: identisch → 1; disjunkt → 0; leeres Set → 0 (nie NaN/throw).
3. `bestTextMatch`: höchster Score gewinnt; < Schwelle → null; usedNames respektiert.
4. Tie-Break: Vorfahre schlägt Nachfahre bei gleichem Score (jsdom-DOM).
5. Plausibilität: Element ohne Rect wird übersprungen; Element > 80% Fläche wird übersprungen.

Integration (`htmlToPlan` mit gemocktem getBoundingClientRect, Muster wie bestehende
Splice-Tests):
6. Sidebar-Szenario aus dem echten Import (vereinfachtes Fixture): 3 Ziele mit Anker-Tokens
   und ABSICHTLICH falschen bboxes (IoU ≈ 0) → alle 3 werden per Text gesplict
   (`component-ref` an der richtigen Stelle, äußerste Zeile ersetzt).
7. Ziel ohne anchorTokens + passender bbox → IoU-Fallback greift (Bestandsverhalten).
8. Ziel ohne Text-Match UND ohne IoU-Match → Warnung mit neuem Wortlaut.
9. Bestehende Splice-Tests bleiben grün (Web-Suite komplett).

`emitFigmaComponents`:
10. spliceTargets tragen anchorTokens aus den Kind-Interpretationen; Kind ohne Interp → [].

## Verifikation

- Web-Suite komplett grün (492 + neue).
- Browser-E2E gegen den echten persistierten Import (localStorage `designbridge.lastImport`):
  Export erzeugen → „Sidebar Navigation" ist `composed-spliced` mit 3 Instanzen;
  Warnungen zu Logo/Storage/Profile verschwinden. Danach Robs Figma-Beweis-Import.
