# Geometrie im echten Slot vermessen (Scheibe C)

**Status:** Design freigegeben 26.07.2026 (Rob: „A" → Breiten festnageln; dieser Spec ist der
tragfähige Mechanismus dafür). Folgt direkt auf
[2026-07-26-einheitlicher-massstab-design.md](2026-07-26-einheitlicher-massstab-design.md).
Branch `experiment/einheitlicher-massstab`.

## Problem

Der einheitliche Maßstab (`scanScaleFactor`, Commit `f625731`) hat die Schriftgrößen repariert
(Miniatur-Bausteine weg, im echten Browser belegt), aber die **Breiten kaputt gemacht**. Gemessen
mit `web/verification/emit-in-browser.html` am eingefrorenen Prod-Scan:

| Baustein | ist | Slot | |
|---|---|---|---|
| Event List Item | 1733 | 521 | 3,33× — breiter als das 1680px-Bild |
| Nav Icon | 92 | 34 | 2,71× |
| Metric Legend Item | 427 | 235 | 1,82× |
| Category Item Row | 525 | 319 | 1,65× |
| Top Header Bar | 1680 | 1210 | 1,39× |
| Left Sidebar Navigation | 471 | 470 | ✅ |
| Dashboard Page Layout | 1680 | 1680 | ✅ |

Dazu 6 Karten auf HUG, deren **Inhalt** 1,34–1,9× zu breit ist (Breite kommt aus den Kindern, nicht
aus `plan.width`). Zusammen 11 von 16 Bausteinen zu breit.

**Ursache:** Der alte Faktor `slot / naturalWidth` normierte die Wurzelbreite per Konstruktion exakt
auf den Slot — die Breite stand oben und unten in der Formel und kürzte sich heraus. Diese
Selbstkorrektur ist mit dem einheitlichen Faktor weg, und die KI zeichnet ihre Bausteine breiter
als die Vorlage.

## Zwei naheliegende Wege, beide widerlegt

**Wurzelbreite := Slot festnageln.** Reaktiviert Fix A vom 18.07. (`htmlToPlan.js:286-289`): dort
nimmt `readSize` für die Wurzel bewusst `Math.max(computed.width, el.scrollWidth)`, weil das Plugin
per `clipsContent` abschneidet — ohne diese Zeile verlor Rob die rechte Seite seines Dashboards
(Kartenreihe 1480px in einem 1024er-Frame). Ein Frame auf Slot-Breite zu zwingen macht ihn
schmaler als seinen Inhalt ⇒ genau dieser Bug kommt zurück. `scrollWidth` als Untergrenze hilft
nicht: bei einer gestreckten `width:100%`-Zeile ist `scrollWidth == width == Behälterbreite`, also
keine Information über die intrinsische Inhaltsbreite. Heilt außerdem nur 5 von 11 (die 6 HUG-Karten
gar nicht).

**Zwei Faktoren (Geometrie pro Baustein, Typografie einheitlich).** Der Geometrie-Faktor bräuchte
wieder `naturalWidth` — und genau bei `width:100%`-Wurzeln ist das die bedeutungslose
Behälterbreite. Die Willkür wandert nur von der Schrift in die Innengeometrie.

## Entscheidung

**Jeden Baustein in einem Messbehälter seiner ECHTEN Breite vermessen.** Der Behälter ist nicht mehr
konstant 1024px breit, sondern `designSlotWidth = bbox.w * PREVIEW_VIRTUAL_WIDTH` — die reale Breite
des Bausteins in Design-Pixeln. Danach skaliert der bestehende einheitliche Faktor `k` unverändert
auf echte Bildpixel.

Das ist „Variante C" aus [2026-07-26-skalierungs-messung-ergebnis.md](../../2026-07-26-skalierungs-messung-ergebnis.md).
Sie wurde dort verworfen, weil die Schrift damals am selben Faktor hing (Header wurde 15px, Page
Layout 22px). **Genau dieser Einwand ist entfallen:** die Schrift hängt jetzt an `k`, nicht an der
Geometrie. Die KI schreibt feste px-Schriftgrößen ins HTML — ein schmalerer Behälter ändert sie
nicht. C betrifft ausschließlich das Layout.

### Warum das beide Wege gleichzeitig heilt

- **Explizite Wurzelbreiten:** `width:100%` löst im 317px-Behälter zu 317 auf statt zu 1024
  → × k = 521 = Slot.
- **HUG-Karten:** die Kinder werden im 215px-Behälter gemessen → HUG-Breite ~215 → × k = 353 = Slot.
- **Fix A bleibt wirksam und wird erstmals sinnvoll:** `scrollWidth` guardet weiter gegen Clipping,
  aber jetzt gegen eine ECHTE Breite statt gegen ein Behälter-Artefakt. Passt der Inhalt wirklich
  nicht in den Slot, wächst der Frame — kein Abschneiden.
- **`freezeRootWidth` wird einfacher:** die gemessene Breite IST jetzt die Slot-Breite. Der
  `designSlotWidth`-Ersatzzweig aus `f625731` entfällt, die Funktion geht zurück auf ihre
  18.07.-Form (gemessene Breite einfrieren).

### Abwärtskompatibilität

Fehlt die bbox (URL-/Repo-Import, `raw.meta.image_width` nicht gesetzt), bleibt der Behälter bei
`PREVIEW_VIRTUAL_WIDTH` — **unverändertes heutiges Verhalten**, kein Raten.

## Der WYSIWYG-Vertrag muss mitwandern

`htmlToPlan.js:1319-1321` begründet die 1024px ausdrücklich damit, dass `InterpretedPreview.jsx`
die Vorschaukarte mit derselben virtuellen Breite rendert („was die Vorschau zeigt, kommt so in
Figma an"). Ändert nur der Emit seine Messbreite, divergieren Vorschau und Figma in den
Proportionen (eine Sidebar bricht anders um).

**Konsequenz:** die Vorschau muss dieselbe Breite verwenden. Als Nebeneffekt wird sie *wahrer* —
heute wird jeder Baustein auf 1024px breit gezeigt, unabhängig von seiner echten Breite. Weil das
eine sichtbare UI-Änderung ist, ist sie eine **eigene Scheibe (C2)** mit Screenshot-Vorlage für Rob,
nicht Teil von C1.

## Abnahme (im echten Browser, nicht in jsdom)

`web/verification/emit-in-browser.html` gegen `storybook-harness/fixtures/prod-scan-raw.json`:

1. Jeder Baustein mit bbox: effektive Breite ≈ Slot (Toleranz max(4px, 2%)).
2. Schriftgrößen unverändert gegenüber `f625731` — kein Baustein unter 12px, die 7 Treffer auf der
   Token-Skala bleiben Treffer.
3. Kein Baustein hat Inhalt breiter als seinen Frame (kein Clipping-Risiko).
4. Splice-Ergebnisse unverändert (Sidebar und Page Layout behalten ihre Instanzen — die
   bbox-Normierung ist relativ, darf also nicht kippen).

**jsdom kann Punkt 1-3 strukturell nicht zeigen** (keine Layout-Engine, `width:100%` löst nicht
auf). Vitest deckt ab: unveränderte Behälterbreite ohne `designSlotWidth`, `freezeRootWidth` in
seiner zurückgebauten Form, kein neuer Warnungspfad.

## Vollausbau: die Slot-Breite gehört auf die WURZEL, nicht nur auf den Behälter

Der erste Wurf setzte nur den Messbehälter auf die echte Breite. Das erreicht ausschließlich Wurzeln,
die sich strecken — trägt die KI-Wurzel eine eigene px-Breite, ignoriert sie den Behälter. Gemessen
blieben so 9 von 15 Bausteinen zu breit. **Deshalb bekommt die Wurzel selbst die gemessene Breite
aufgesetzt** (`roots[0].style.width = slotWidth`), danach bricht der Browser das Innere um.

Bewusst so und nicht per Geometrie-Faktor `slot/natural`: ein Faktor müsste Paddings, Gaps, absolute
Rects **und DS-Instanzen** mitskalieren — und `instance.rescale()` trifft in Figma auch die Schrift
innerhalb der Instanz, also genau die Inkonsistenz, die der einheitliche Maßstab beseitigt hat. Der
Reflow braucht davon nichts und lässt die Typografie unberührt.

**Untersizing ist strukturell ausgeschlossen:** passt der Inhalt wirklich nicht in den Slot, greift
Fix A vom 18.07. (`scrollWidth > width` → der Frame wächst, `readSize`). Der Emit weigert sich dann
korrekt zu schrumpfen, statt abzuschneiden. Nur bei EINER Wurzel angewandt — bei mehreren ist die
bbox ihr umschließendes Rechteck, die Einzelbreiten sind daraus nicht ableitbar.

## Ergebnis (gemessen 26.07. abends, echtes Chromium, kein KI-Call)

Effektive Wurzelbreite in Bildpixeln, Faktor gegen den Slot (1,00× = korrekt). Vorher/Nachher aus
demselben Browser, dieselben eingefrorenen Rohdaten:

| Baustein | vorher | nachher | |
|---|---|---|---|
| Left Sidebar Navigation | 3,57× | **1,00×** | ✅ |
| Event List Item | 3,33× | **1,10×** | ✅ (1733 → 573 px) |
| Metric Legend Item | 1,82× | **1,00×** | ✅ |
| Category Item Row | 1,65× | **1,00×** | ✅ |
| Top Header Bar | 1,39× | **1,00×** | ✅ |
| Income Details Card | 1,34× | **1,00×** | ✅ |
| Latest Events Card | 1,46× | **1,01×** | ✅ |
| Conversion History Card | 1,58× | **1,01×** | ✅ |
| Income Breakdown Card | 1,49× | **1,07×** | ✅ |
| Your Sales Chart Card | 1,49× | **1,11×** | ✅ |
| Dashboard Page Layout | 1,00× | 1,00× | unverändert korrekt |
| Popular Categories Card | 1,90× | 1,22× | verbessert, knapp über Toleranz |
| Time Period Filter | 1,52× | 1,49× | Fix A: Inhalt braucht 245 statt 164 |
| Nav Icon | 2,70× | 1,82× | Fix A: Inhalt braucht 38 statt 20 |
| User Avatar | 2,32× | 2,32× | Fix A: Inhalt braucht 48 statt 20 |

**Von 11 falschen Bausteinen sind 4 übrig — und alle vier aus demselben, dokumentierten Grund:** die
KI hat Inhalt gezeichnet, der in den echten Slot nicht hineinpasst (Icons und Steuerelemente zu groß).
Fix A lässt den Frame dort wachsen, statt abzuschneiden. **Der Emit weigert sich also korrekt** — der
Restfehler sitzt in der Interpretation, nicht in der Skalierung, und ist von hier aus nicht heilbar:
Schrumpfen würde Inhalt abschneiden (genau der Bug vom 18.07.).

Damit ist auch die im ersten Wurf geplante **Scheibe D (Geometrie-Faktor) erledigt bzw. gegenstandslos** —
der Reflow erreicht dasselbe ohne neuen Faktor und ohne die DS-Instanz-Mehrdeutigkeit.

**Abnahme 2 erfüllt:** Schriftgrößen bitidentisch zu `f625731` (Category Item Row 30 · Event List
Item 26 · Metric Legend Item 21 · Top Header Bar 25 · Sidebar 36 · Karten 30/46/49/53), **kein
Baustein unter 12px**. Die Entkopplung hält — C hat die Typografie nicht angefasst.

**Abnahme 3 erfüllt:** ein einziger Überlauf (User Avatar, `scrollWidth` 50 vs. 48 px) — Fix A
lässt den Frame dort wachsen, kein Clipping.

**Abnahme 4 übererfüllt:** die Splice-Zuordnung hält *und verbessert sich* — die
`Left Sidebar Navigation` hat jetzt **3 statt 2** gesplicte Instanzen (Gesamtzahl 26 statt 25,
DS-Instanzen unverändert 16, 0 leere Boxen). Das trifft Robs Befund vom 26.07. direkt: „Sidebar
Navigation ist 442×2366 px, enthält aber nur zwei Instanzen — rund 2200 px Leerraum." Ursache
plausibel: im echten Slot-Behälter liegen die Kind-Rects dort, wo die normierten bboxen sie
erwarten, also greift der Text-Anker/IoU-Match einmal mehr.

Tests: **Web 826/826** (+4) · Server 335/335 · Harness 19/19 · Build sauber. Plugin unberührt
(reine Web-Emit-Datei).

## Ausdrücklich NICHT in dieser Scheibe

- **Die 4 Restfälle** (Nav Icon, User Avatar, Time Period Filter, Popular Categories Card): die KI
  zeichnet Icons und Steuerelemente größer als die Vorlage. Das ist ein Interpretations-/Prompt-Thema
  — der Skalierungspfad kann es nicht heilen, ohne Inhalt abzuschneiden. Eigene Scheibe, am besten am
  Scan-Prompt ansetzend (die gemessene bbox als Größenvorgabe mitgeben).
- Die Vorschau-Angleichung (C2, s. o.).
- Die Sidebar-Interpretation mit 14.903 Zeichen und die `data-ds-variant="default"`-Fehllabelung
  (beide schon als eigene Scheiben notiert).
