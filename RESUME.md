# Designbridge — Schnellstart-Spickzettel

Stand: **19.07.2026 abends (SVG currentColor-FIX LIVE `bc8ce99` — Robs schwarze-Icons-Befund gefixt & Figma-bewiesen; Chart-Trend-Linie NOCH OFFEN)** — **🚀 APP LIVE: https://designbridge-production.up.railway.app** mit **Gemini PAID**. Server **243/243** · Web **521/521** · Plugin **98/98**.

## ✅ SVG currentColor-AUFLÖSUNG (19.07. abends, `bc8ce99`) — Robs schwarze-Nav-Icons-Befund gefixt, Figma-E2E-bewiesen

Root Cause (Figma-E2E belegt): `convertSvgElement` übernahm SVG-Markup verbatim → `currentColor` blieb stehen → in Figma kein CSS-`color`-Kontext → Fallback auf **Schwarz**. Nav-Icons (erben `rgba(255,255,255,.7)`/`#fff`) + Profil-Zahnrad rendern schwarz. Fix (Spec `docs/superpowers/specs/2026-07-19-svg-currentcolor-resolution-design.md`, TDD Sonnet): currentColor vor Serialisierung im Klon-Subtree durch `getComputedStyle(el).color` ersetzen, Alpha<1 → rgb()+`fill-opacity`/`stroke-opacity` (Aktiv/Inaktiv-Abstufung erhalten). **Figma-E2E-bewiesen** (Datei `nXeYne63PmpFUeyfI2f2JW`, `scratchpad/sidebar_after_fix.png`): alle Icons weiß, inaktive leicht transparent. Web 514→**521**.

### Robs Sidebar-Befunde 19.07. — Status (aus autonomem Figma-E2E `UZHMxRz9KdAvOa8evtLYj6` diagnostiziert)
1. ✅ Schwarze Nav-Icons + Zahnrad → GEFIXT (currentColor, s.o.)
2. ⏳ **Margins werden vom Konverter komplett ignoriert** → „Shortcut"-Abstände weg (Team/Tasks kleben), auch Wurzel der hr-Kästen-Abstände. NOCH OFFEN, eigene Scheibe (Margin→Figma-Auto-Layout ist nicht-trivial: itemSpacing/Spacer).
3. ⏳ `<hr>`-Trenner = leere ~100px umrandete Boxen + Storage-Progress-Füllbalken = volle weiße Linie am Rand (height:100% kollabiert). **Läuft als Hintergrund-Task `task_9b25b9de`** (hr-Linie + Progress-Höhe).
4. ⏳ User-Profil in der Sidebar oben/unten geclippt + Avatar/Zahnrad überlappen Namen — **nur beim Shrink** in die Sidebar (Standalone rendert korrekt). Gehört zur größeren Shrink-to-fit-Fidelity-Baustelle.

## ✅ COMPOSITION-SPLICE v2 — TEXT-ANKER-MATCHING (19.07. nachm., `8be9fbd`) — Robs Befund „leere Sidebar-Frames" gefixt, E2E-bewiesen

Robs Befund: leere Frames in der Sidebar im letzten Figma-Import = **Fehler, keine Design-Entscheidung** (korrigiert die frühere Einordnung von Rest-Issue 3). **Root Cause belegt am echten Import `59c4365128f19efb`:** Splice-IoU vergleicht Screenshot-bbox mit KI-Neuzeichnungs-Layout — zwei unabhängige Geometrien, Best-IoU real 0.019–0.057 (Schwelle 0.35), bester Kandidat war der GANZE Container. Die guten Einzel-Interpretationen (Sidebar Logo mit echtem SVG, Storage-Widget, Jane-Smith-Profil) wurden nie instanziert → Low-Fidelity-Selbstzeichnung gewann.

**Fix (Spec `docs/superpowers/specs/2026-07-19-splice-text-anchor-matching-design.md`, Robs Wahl „Text-Anker + Plausibilität", TDD Sonnet):** Phase 1 Token-Jaccard Kind-Anker-Texte ↔ Eltern-Subtree (`SPLICE_MIN_TEXT=0.5`, Tie-Break Vorfahre>Nachfahre, Deckel: messbares Rect + ≤80% Referenzfläche), Phase 2 = bestehendes IoU unverändert (textlose Kinder/Bestand). **E2E am echten Import: Sidebar 3/3 gesplict (vorher 0/3), Dashboard Template 15/15 (vorher 13/15), Reports Table 1/1, NULL Splice-Warnungen.** Web 492→**514** (+22). Außerdem `37e22ff`: Connect-Figma-Stub aus Topbar entfernt (Robs Call). **NÄCHSTER SCHRITT: Robs Figma-Beweis-Import (frisches Bild → leere Datei; Plugin-dist unverändert, kein Reload nötig).**

**⏭️ Notierte Folge-Scheibe (klein, Befund aus derselben Analyse):** `<hr>`-Trenner werden zu leeren 0×0-Boxen (nur 1px-Stroke, width/height null → Figma-Hug kollabiert) + Storage-Progress-Füllbalken verliert Höhe (`height:null`). Konverter-Scheibe in htmlToPlan: hr → 1px-Linie mit Breite, %-Höhen-Füllungen einfrieren.

## ⚠️ CHART-TREND-LINIE: viewBox-Fix (`682e8ca`) WAR DIE FALSCHE WURZEL — echte Ursache jetzt belegt

Ehrliche Korrektur (systematic-debugging Phase 4, „Fix hat nicht gewirkt"): `682e8ca` injiziert fehlende `viewBox`/`width`/`height` in SVGs (reasonable Hygiene, 488→492, bleibt drin) — ABER die Trend-Linie kollabiert **weiterhin** (Figma-Re-Test: Linien nur Dez–Jan). **Echte Ursache per `get_design_context` belegt:** der Chart-Body-Flex-Container rendert nur **`w-[106px] overflow-clip`** (y-Achse 30px + Mindest-Inhalt), weil sein 670px-breiter Inhalt (Trend-`img`, Gridlines bis `left-[669px]`) **absolut positioniert** ist und die Flow-Breite nicht aufspannt → der Clip schneidet die Linie bei 106px ab. Die Card selbst ist `w-[750px]`, aber die Breiten-Determiniertheit propagiert nicht in den verschachtelten Flex-Body → er huggt auf Inhalt statt zu stretchen. **= Breiten-Determinismus-Problem (Familie stretch/grow + freezeRootWidth + test6/test-11-A), NICHT SVG-Sizing.**

**Empfohlener echter Fix (eigene Scheibe, delikat → sauber speccen+TDD+Figma-verifizieren, NICHT blind):** Box mit `overflow:hidden/clip`, deren `scrollWidth` > gehuggte Breite (weite absolute Kinder), auf `scrollWidth` (Inhalts-Extent) einfrieren statt auf die kollabierte eigene Breite — analog zu test-11-A (`readSize` nahm für die WURZEL `max(computed.width, scrollWidth)`), hier auf verschachtelte geclippte Container ausgeweitet. Nebenwirkungs-Risiko (legitime Clips) → Grenzen sorgfältig. `682e8ca` bleibt (viewBox-Hygiene korrekt, nur unzureichend für DIESEN Bug).

## ✅ v3 Flow-Box + BILD-GLYPH (19.07.) — LIVE & FIGMA-BEWIESEN (Overflow+Overlap+leere Logo/Avatar-Boxen behoben)

## ✅ BILD-PLATZHALTER-GLYPH (19.07., `ef14c3a`) — Robs „ungefüllte Platzhalter" (Logo/Avatar) behoben & Figma-bewiesen

Robs Freigabe („wie empfohlen"). Gemini malt Logos/Marken als leere gestylte Divs (kein `<img>`) → leere Boxen in Figma. Fix (Spec `docs/superpowers/specs/2026-07-19-image-placeholder-glyph-design.md`, Web-only, TDD Sonnet, 482→**488**): zentrierter grauer Bild-Glyph (svg) für `<img>`-Elemente + leere gefüllte ~quadratische Boxen ≥24px. **Grenzen an echten Daten trennscharf** (Fehlalarm-Test über alle Bausteine): trifft NUR den Logo (32×32) + Avatar-imgs, NICHT Dots (6-10px)/Legenden-Chips (32×14, Ratio 2.3)/Icon-BGs (haben Kinder)/Badges (haben Text). **Figma-bewiesen** (`Testdaten/figma-e2e-1807-splice-fix/sidebar-logo-avatar-glyph.png`): EcoMetrics-Logo + Jane-Smith-Avatar zeigen jetzt das Bild-Icon.

**⚠️ NEU beobachtet (dein Call, NICHT autonom gefixt):** Im Sidebar-Render bleiben ZWEI große umrandete leere Boxen (unter Logo, über Profil) — pre-existierende Gemini-Artefakte OHNE Fill/Border-im-HTML (Rendering-Effekt leerer Regionen), mehrdeutig (kein klares Bild). Bewusst NICHT auto-geglypht (leere umrandete Container sind oft legitime UI → Fehlalarm-Risiko). Falls stören: erst klären was Gemini da meint.

## ✅ COMPOSITION-FIDELITY v3 (19.07., `35f4937`) — FORK AUFGELÖST, autonom gebaut & Figma-bewiesen

Rob deferte die Architektur-Entscheidung an Claude („keine Ahnung" + „entscheide selbst"). Claude wählte **v3 Flow-Box-Wrapping** (risikoarme Variante, die die unsicheren Figma-stretch/grow-Semantiken vermeidet). Spec `docs/superpowers/specs/2026-07-19-composition-fidelity-v3-flow-box-wrap-design.md`, TDD via Sonnet, Web 481→**482**.

**Fix:** Splice ersetzt ein Flow-Element durch eine **Flow-Box in Slot-Größe** mit der Instanz als absolut positioniertem Kind (0,0). Box hält den Flow-Platz (Geschwister korrekt positioniert → kein Overlap), Instanz wird von `applyAbsolute` shrink-only (v2) auf min(natürlich, Slot) resized (kein Stretch), Slot-Größe verhindert Hug-Overflow. CSS-absolute Elemente bleiben bare absolute. **Kein Plugin-Change.**

**LIVE FIGMA-BEWIESEN** (Datei `Z4pIw3Ey0gw3Cqljco15og`, Screenshot `Testdaten/figma-e2e-1807-splice-fix/dashboard-template-v3-FLOW-BOX-overlap-behoben.png`): **Sidebar heil als eigene Spalte** (EcoMetrics oben, Nav komplett, Jane Smith+Avatar unten — space-between korrekt, KEIN Stretch/Cram); **Hauptinhalt korrekt rechts daneben, KEIN Overlap**; KPI-Cards gekachelt; Layout kohärent wie ein echtes Dashboard. Payload-Beweis: alle 13 Instanzen als `box{width×height=slot, children:[component-ref{absolute:0,0,slot}]}`.

**Fix-Kette dieser Session (alle live):** `de2d4fc` Slot-Sizing (Overflow) → `c5283b8` v2 shrink-only (kein Stretch, Plugin 93→98) → `35f4937` v3 Flow-Box (Overlap behoben). de2d4fc's Bare-Absolute-Ansatz für Flow-Elemente ist durch v3 ersetzt; die v2-shrink-only-Maschinerie bleibt zentral (Instanz absolut IN der Box).

### Verbleibende Rest-Issues (unverändert, nächste Scheiben)
1. **SVG skaliert nicht mit** (Trend-Linie kollabiert) — harte Figma-Grenze (Vektor-Node skaliert nicht beim Frame-Resize). Eigene Scheibe.
2. **KPI-Cards/Content leicht rechts geclippt** (Inhalt für ~480px designt, auf 217er-Slot geschrumpft → „O2"/Prozent-Enden abgeschnitten) — Fidelity-Tradeoff des Shrink-to-fit. Polish/eigene Scheibe.
3. ~~Sidebar-Logo & Avatar = leere weiße Boxen~~ — **GELÖST 19.07. nachm. in zwei Teilen:** Bild-Glyph (`ef14c3a`) + Splice v2 Text-Anker (`8be9fbd`, die ECHTEN Einzel-Interpretationen werden jetzt instanziert). Robs Einordnung „das ist ein Fehler" war korrekt, die frühere „Design-Entscheidung"-Rahmung nicht.
4. **v3-Nebenwirkung (dokumentiert):** `buildBoxNode`-Absolut-Freeze greift für Wrapper-Kinder nicht mehr (Wrapper-Box ist selbst normaler Flow-Teilnehmer). Korrekt, aber Tradeoff falls ein Flow-Parent visuell größer als sein einziges gesplictes Kind ist (Zentrierung/Padding). Bei Befund anfassen.

## (historisch) 🛑 ARCHITEKTUR-FORK (19.07., systematic-debugging Phase 4.5) — von v3 aufgelöst

Zwei verifizierte Fixes diese Session, aber der zweite legte eine tiefere Kopplung offen → Ansatz hinterfragen statt weiterpatchen.

- **`de2d4fc` (LIVE): Splice-Slot-Sizing** — gesplicte Instanzen bekommen `absolute`=gemessenes Slot-Rect. **Fixte das Karten-Overflow** (rechte Spalten ragten über den Rand), Figma-bewiesen (`Testdaten/figma-e2e-1807-splice-fix/dashboard-template-NACH-splice-fix.png`).
- **`c5283b8` (LIVE): Fidelity v2 shrink-only** — `applyAbsolute` resized component-ref jetzt nur `min(natürlich, slot)`, nie strecken. Plugin 93→**98**. Figma-verifiziert: Sidebar-Höhe nicht mehr gestreckt (260×940 statt 260×1553, `justify-between` intakt).
- **🔴 NEUE REGRESSION durch den Absolut-Ansatz (Root Cause per get_design_context belegt):** In der Template-Interpretation ist die Sidebar ein **Flow-Kind** einer Flex-Row `[Sidebar | Hauptinhalt]`. `de2d4fc` macht sie `absolute` → aus dem Fluss → Hauptinhalt (Topbar, KPI-Grid) rutscht auf `left-0` und **überlagert die Sidebar** (Screenshot `…/dashboard-template-v2-shrink-only-OVERLAP-bug.png`; Carbon-KPI + Search Bar liegen bei `left-0 top-0` auf der Sidebar). In test12 (Sidebar im Fluss) gab es das NICHT. → **Absolut fixt Grid-Overflow, bricht aber flow-abhängige Layouts.**

### Empfehlung: Composition-Fidelity v3 (Flow-Box-Wrapping) — löst BEIDES sauber
Splice ersetzt ein Element NICHT durch eine bare absolute Instanz, sondern durch eine **Flow-Box mit gemessener Größe**, die die Instanz als Kind mit `stretch+grow` (Füllen) enthält. Vorteile: (1) Box bleibt im Fluss → Sidebar positioniert Hauptinhalt korrekt → KEIN Overlap; (2) Box hat feste Slot-Größe → Karten kacheln, KEIN Hug-Overflow; (3) Instanz füllt die Box (Plugin `applyStretchGrow` kann component-ref schon → evtl. KEIN Plugin-Change); v2-shrink-only cappt weiterhin auf natürlich → kein Stretch. **⚠️ Subtile Interaktionen (Flow-Box × stretch × shrink-cap) → braucht eigene Spec + TDD + Figma-Verifikation, kein Blind-Blitz.** Ersetzt den Absolut-Ansatz von `de2d4fc` weitgehend.

### Robs Optionen (dein Call — Rob war weg, autonom bis zum Fork gefahren)
1. **v3 bauen** (empfohlen) — Flow-Box-Wrapping, löst Overflow + Overlap; eigene Scheibe.
2. **de2d4fc/v2 zurücknehmen** → test12-Stand (Karten-Overflow, aber KEIN Overlap) als Zwischenstand, dann v3.
3. **Aktuellen Stand akzeptieren** (Overlap live) und andere Baustelle priorisieren.
Ungelöst bleiben ohnehin: SVG-Skalierung (harte Figma-Grenze), Donut-Clip, Sidebar-Logo/Avatar-Design-Frage (s. u.).

## ✅ SPLICE-SLOT-SIZING FIX (18.07. spätnachts, `de2d4fc`) — test12 Rest-Issue 1 BEHOBEN & LIVE FIGMA-BEWIESEN (autonom, Claude solo)

Robs Auftrag: autonom weiter, erst Hierarchie/Verschachtelung, Token-Burn beachten. **Root Cause (systematic-debugging, an beiden Codebasen belegt):** Splice-Branch gab gesplicten Instanzen nur bei CSS-Positionierung ein `absolute`-Rect (`readAbsolute`-Guard); Flow-Elemente (Normalfall Template-Grid) huggten im Plugin ihre Eigengröße (`renderPlan.ts` resized component-ref NUR über `applyAbsolute`) → rechte Spalten (Energy/Category) ragten über den Template-Rand. **Fix (Spec `docs/superpowers/specs/2026-07-18-splice-instance-slot-sizing-design.md`, KEIN Plugin-Change):** neuer Helfer `measureRectRelParent` misst das Slot-Rect relativ zum direkten Parent auch für Flow-Elemente; `absolute = readAbsolute || measureRectRelParent`. TDD via Sonnet-Subagent, Web 477→**481**. **LIVE FIGMA-BEWIESEN** (autonomer E2E-Test, Datei `Vy9GW77zHyIcOh0hOP6UUf`): Payload-Ebene — alle 13 Template-Instanzen tragen jetzt echtes `absolute`-Rect (vorher alle `abs=NONE`); Screenshot `Testdaten/figma-e2e-1807-splice-fix/dashboard-template-NACH-splice-fix.png` — **Overflow WEG, sauberes Grid** (KPI-Cards gekachelt, Energy/Category rechts gebunden, Reports-Tabelle voll).

### ⚠️ Vom Figma-Render neu/präziser diagnostiziert (nächste Scheibe = „COMPOSITION-FIDELITY v2")
Der Overflow-Fix legt EINE tiefere Sache offen: **unabhängig interpretierte Bausteine haben unterschiedlichen Maßstab; das Force-Fit in den gemessenen Slot ist verlustbehaftet.**
1. **Sidebar-Stretch-Regression (NEU, durch diesen Fix):** Standalone-Sidebar-Organism rendert sauber (`…/sidebar-standalone-OK.png`, space-between top/bottom korrekt). Als Template-Instanz aber von natürlich 320×940 auf Slot 260×1553 gezwungen → Inhalt gestaucht/überlappt oben. **Hypothese (NICHT bestätigt, Iron Law):** das HOCH-Strecken (940→1553) ist der Treiber, VERKLEINERN (Cards 450→225) kachelt dagegen sauber. **Empfohlene Strategie v2: Instanzen NIE über ihre natürliche Größe strecken, nur verkleinern (shrink-to-fit)** — braucht kleinen Plugin-Change in `applyAbsolute` (natürliche Instanzgröße nach `createInstance` als Obergrenze) + Figma-Re-Verifikation. Mechanismus vor dem Bau bestätigen (get_design_context auf die Template-Instanz).
2. **SVG skaliert nicht mit (Rest-Issue 2, bestätigt):** Trend-Linie kollabiert winzig, weil Figma Vektor-Nodes beim Frame-Resize nicht mitskalieren (dokumentierte harte Grenze). Eigene Scheibe.
3. **Donut rechts leicht geclippt** (Category-Card-Inhalt breiter als Slot) — selbe Maßstab-Familie.

### 🎨 DESIGN-ENTSCHEIDUNG offen (Robs Urteil, NICHT autonom entschieden — stehende Regel „nie ohne Richtung")
Sidebar-**Logo** & **Avatar** („Jane Smith") kommen von Gemini als LEERE weiße gestylte Divs (Logo: `32×32 border-radius:16px 16px 0 16px`, leer) — das sind Robs „seltsame ungefüllte Platzhalter". KEIN Hierarchie-Bug, sondern KI-Interpretations-Fidelity (Familie test-11-Befund D). Optionen: (a) so lassen (Geminis Interpretation), (b) Konverter-Heuristik „kleine leere Box mit Fill → erkennbares Bild-Glyph" (Risiko: Badges/Icon-BGs mit-treffen — aber die haben Kinder, leere Box nicht → recht sicher), (c) Interpretations-Prompt schärfen (Marken-Mark/Avatar erkennbar) — braucht KI-Test/Quota. **Empfehlung: (b) für Avatare/Logos, konservativ auf leere-Box-ohne-Kinder beschränkt.** Rob entscheidet Richtung.

### Token-Bewusst (Robs Auflage)
Statt pro Fix einen Figma-Rundlauf: Result aus test12 (`inject-result.json`) mit neuem Code re-emittiert (kein frischer Gemini-Scan), EIN Figma-E2E-Rundlauf deckte Overflow-Beweis + alle Rest-Diagnosen ab. Speculative Fixes bewusst NICHT blind gefahren (unbestätigter Mechanismus + Token). Figma-Testdateien („Ohne Namen", key `Vy9GW77…`) bleiben für Rob; ein paar leere Extra-Dateien durch cmd-N-Timing entstanden (harmlos).

## 🤖 AUTONOMER FIGMA-E2E-TEST STEHT (18.07. tiefe Nacht) — ROB MUSS NICHT MEHR KLICKEN!
Robs Frust nach 11 manuellen Tests → Testlauf komplett automatisiert und **als test12 erfolgreich bewiesen**: Payload auf Prod legen → Figma Desktop per AppleScript (⌘N neue Datei, Menü Plugins→Entwicklung→DesignBridge, `AXManualAccessibility=true` für Electron-Webview, Button „Aus DesignBridge übernehmen" per Accessibility-Klick, Status „Fertig — …" auslesen, ⌘L+pbpaste für den Link) → Figma-MCP-Verifikation. **Komplette Anleitung + Fallen: `.claude/skills/figma-e2e-test/SKILL.md`** (im Repo). Einmalige Voraussetzung (erledigt): Bedienungshilfen-Freigabe für „Claude"; Bildschirmaufnahme NICHT freigegeben (nicht nötig).

## ⏭️ WIEDEREINSTIEG NÄCHSTE SESSION (Robs Schnitt 18.07. tief nachts)
**test12-Ergebnis (autonom gefahren, Datei `iSMO0AzME4GIEkntYut1kf`, „Ohne Namen"):** DEUTLICH besser — Sidebar volle Nav-Liste ohne Fragmente/Doppelung (test-11-Befund B trat NICHT mehr auf), KPI-Cards vollständig ohne Überlappung, Reports-Tabelle komplett, Bild-Platzhalter erkennbar. **Nächste priorisierte Fixes (Rest-Issues, Root Causes bekannt):**
1. **Gesplicte Instanzen ohne Ziel-Maße** → rechte Template-Spalte (Energy/Category) ragt über den Rand. Fix-Richtung klar: splice-Branch in `htmlToPlan` gibt das gemessene Element-Rect als `absolute` mit (Plugin resized Instanzen via `applyAbsolute` schon) — ODER Instanz in Flow lassen und Root breiter (abwägen in kurzer Spec).
2. **SVG skaliert nicht mit** (Trend-Linie im Template kollabiert klein; einzeln perfekt) — dokumentierte Grenze, jetzt sichtbar → eigene kleine Scheibe.
3. Titel/Wert-Abstände (Top Emissions) — Polish.
Danach: Robs test-11-Befund **D** (Balken/Donut-Rundungen = KI-Interpretationsqualität, Prompt-Schärfung „exakte border-radius-Treue") als eigene Scheibe; dann zurück zur Roadmap (Breiten-Test Eingabetypen → Figma-Reverse-Import → Developer-Empfangsseite).
**Testen ab jetzt: `/figma-e2e-test`-Skill nutzen — Claude fährt den Beweis selbst, Rob schaut nur noch Ergebnisse an.**

## 🔧 TEST-11-FIXES A+C (18.07. tiefe Nacht, `994ebe4`+`dfd0224`) — 2 von 4 Befunden behoben, 2 bewusst offen
Robs test-11 (`hruC4fV2yaPyD8IVynmA6Z`): 4 Befunde, systematisch diagnostiziert:
- **A Template-Crop (gefixt ✅, Robs „Quatsch"):** Eltern-Root bekam Mount-Breite 1024 + Plugin-clipsContent → breitere Karten-Reihen rechts abgeschnitten. Fix: `readSize` nimmt für die WURZEL `max(computed.width, scrollWidth)` — Live-Browser-bewiesen (Overflow-Fall Root=1480 statt 1024; ohne Overflow unverändert 1024). ⚠️ Falle für Nachtests: Flex-Kinder shrinken — Overflow-Repro braucht `flex:0 0 <px>`.
- **C Leere Bild-Kästen (gefixt ✅):** `IMG_PLACEHOLDER` war fixer 48×48-Kasten → jetzt viewBox-basiert (skaliert auf Img-Box) + Berg/Sonne-Bild-Glyph.
- **B Sidebar-Doppelungen (OFFEN, bewusst):** „Storage Upgrade" doppelt (Eltern-Interpretation zeichnet + Splice setzt Instanz daneben) — in meinem Inject-Lauf NICHT reproduzierbar (13 saubere Instanzen), scan-abhängig → nicht blind gepatcht (Iron Law). Beim nächsten Rob-Test gezielt prüfen; Fix-Richtung wäre: gematchtes Element-Subtree beim Splice sicher ERSETZEN statt koexistieren (falls Reproduktion).
- **D Balken/Donut-Rundungen (OFFEN, anderes Thema):** Gemini zeichnet Stapelbalken als einzelne abgerundete Chips / Donut mit runden Kappen — KI-Interpretationsqualität (Prompt/Modell), NICHT Converter. Eigene Scheibe (ggf. Interpretations-Prompt um „exakte border-radius-Treue" schärfen).
Suiten: Server 246 · Web 477 · Plugin 93. **NÄCHSTER SCHRITT = Robs Figma-Test (frischer Bild-Import → leere Datei): Template ohne Crop, Bild-Platzhalter erkennbar, UND gezielt auf B (Doppelungen) achten.**

## 🧩 COMPOSITION-SPLICE (18.07. nachts, `17b5c79`+`8cb61f5`) — Robs test10-Befund behoben
test10: Verschachtelung ✅ + Card-Fix ✅ (Karten echte Größen), ABER komponierte Eltern (Template + Sidebar) zerschossen — Sidebar in Fragmente zerfallen, KPI-Cards überlappen/abgeschnitten. **Root Cause (systematic-debugging):** `composePlan` (Scheibe 1) baute Eltern NUR aus Instanz-Rechtecken + verwarf die eigene Interpretation → (1) verlorener Inhalt (Sidebar-Nav/Logos/Backgrounds), (2) fehlpassende resizte Instanzen. **Fix (Robs Wahl „Splice"):** komponierte Eltern rendern aus ihrer EIGENEN Interpretation, erkannte Kinder werden per räumlichem IoU-Match (Element-Rect ↔ Kind-bbox, Schwelle `SPLICE_MIN_IOU=0.35`, globale Greedy-Zuordnung) an Ort und Stelle durch `component-ref`-Instanzen ersetzt (Fallback=Original-Subtree). `htmlToPlan` bekam `spliceTargets`; `emitFigmaComponents` → `source:'composed-spliced'` wenn Eltern-Interpretation+bbox da, sonst Fallback `composePlan`. Spec `docs/superpowers/specs/2026-07-18-composition-splice-parent-fidelity-design.md`, Plan `…/plans/2026-07-18-composition-splice.md`. **Kein Plugin-Change.** **LIVE-BROWSER-BEWIESEN** (echte EcoMetrics-Interpretation in lokale App injiziert, Export im echten Browser mit echtem Layout): Dashboard Template = `composed-spliced` mit **13 gesplicten Instanzen** (volles Grid + echte Nesting); Sidebar rendert voll aus eigener Interpretation (0 Sub-Instanzen, IoU<0.35 — Inhalt erhalten, graceful). **Bewusste Grenze:** Match ist heuristisch — bei ungenauer KI-bbox bleibt ein Kind Teil der Eltern-Interpretation (nie kaputt). Robs Figma-Import = finaler visueller Beweis; ggf. `SPLICE_MIN_IOU` nachjustieren, falls zu viele Kinder nicht instanziert werden. **NÄCHSTER SCHRITT = Robs Figma-Test (frischer Bild-Import → leere Datei).**

## 🩹 CARD-TEMPLATE-FIX (18.07. nachts, `22f6509`) — Robs test9-Befund behoben
Robs test9: Verschachtelung ✅ (Template enthält echte ◇-Instanzen, mehrstufig — Session-Ziel erreicht!), ABER 3 „…Card"-Bausteine kamen als generische lila „Card-Titel"-Stubs (App + Figma). **Root Cause (systematic-debugging):** das generische **Card-Template** kaperte inhaltstragende Karten, deren Name kein Wort aus einer festen `CONTENT_TOKENS`-Liste (chart/kpi/table…) trug — auf ZWEI Ebenen: (1) `interpret.js:24` schloss Template-Treffer vom Interpretieren aus, (2) Emit stubte sie. Nicht neu, aber durch die Komposition sichtbar geworden (früher malte die monolithische Template-Interpretation sie selbst). **Fix (Robs Entscheidung):** Card-Template komplett gestrichen (eine Karte ist Inhaltscontainer, nie Leaf-Primitive → immer interpretiert/komponiert; Button/Badge/Input bleiben). **Live bewiesen (Prod, EcoMetrics-Bild):** „Energy Consumption Type Card"/„Top Emissions By Plants Card"/„Category Of Emissions Chart Card" liefern jetzt echtes HTML (2146/2875/2542 Zeichen, failed:[]) statt Stub. Web 454→455.

## 🧬 COMPOSITION-NESTING (18.07. spätabends, Robs Kernauftrag aus `test8`) — Scheibe 1+2 FERTIG

**Robs Zielbild:** Die Atomic-Verschachtelung (Tokens→Atom→Molecule→Organism→Template, jede Ebene als Instanz der darunterliegenden) ist **zentrales Datenmodell** und wird überall portiert (Figma + Code). Specs: `docs/superpowers/specs/2026-07-18-composition-nesting-figma-design.md` + `2026-07-18-repo-composition-extraction-design.md`, Plan `docs/superpowers/plans/2026-07-18-composition-nesting.md`.

- **Fundament:** `raw.composition = { children:{name→[names]}, roots[] }` — direkter Enthaltungs-Baum, quellen-agnostisch. Bild-Pfad: aus denselben bbox-`contains` wie der Guard (`buildCompositionTree` in `server/lib/taxonomy.js`); `meta.image_width/height` fürs Canvas.
- **Figma-Port:** `composePlan` (web/src/lib/emit/) — Eltern mit Kindern werden Box aus **`component-ref`-Instanzen** (bbox → absolut positioniert; ohne bbox → Fluss/column). Ersetzt für Eltern die monolithische Ganz-Seiten-Interpretation (DAS war Robs test8-Root-Cause: Template riet alles flach neu). **KEINE Plugin-Änderung** — renderPlan wendet absolute auf Instanzen schon an (Regressions-Test `a059285`). ⚠️ **Kein Dev-Plugin-Reload nötig!**
- **Repo-Pfad (Scheibe 2):** `buildRepoComposition` (`server/lib/repoComposition.js`) liest die ECHTE Verschachtelung aus dem JSX-/Import-Graph (transitiv reduziert, Ambiguitäten verwerfen, kebab-case→PascalCase). 3 Live-Beweis-Fixes nötig: Templates tragen jetzt `path` (`7e64c93`), Seiten/Layout-Inhalte werden gehoben (`7b11c4c`), PascalCase-Idents (`3c4dc5d`).
- **LIVE BEWIESEN (lokal, voller Rundlauf):** shadcn-ui/taxonomy Repo-Import → 20 Eltern mit Kanten (Layout→ThemeProvider/Toaster/…, Seiten→Formulare, UserAccountNav→UserAvatar→Avatar mehrstufig) → Export → `/api/figma-export/latest` trägt 20 `source:'composed'`-Einträge mit component-ref-Kindern. Bild-Pfad-Beweis auf Prod ausstehend (s. Wiedereinstieg).
- **Bewusste Grenzen:** Eltern-Chrome (Hintergrund/Padding des Templates) geht im composed-Plan verloren; App-Vorschau der Eltern bleibt monolithisch; dynamisches JSX (`{map}`) ohne Kante; URL-Pfad noch ohne Komposition. Offen notiert: molecule-Promotion via Graph (YAGNI, übersprungen).

**Guard (Ansatz B, `77655b1`):** deterministisches Sicherheitsnetz `server/lib/taxonomy.js` oben auf der KI-Klassifikation (Bild-Pfad): über bbox-Komposition wird erzwungen, dass die flächengrößte Einheit (≥80% Canvas, ≥2 enthaltene) = **1 Template** und alles, was ≥2 andere enthält (≥5% Fläche), **mind. Organism** ist. Fängt Robs test-7-Fehler strukturell ab, auch wenn die KI mal daneben liegt. Folge-Schritt offen: URL/Repo-DOM-Guard (dort kein bbox; Regel-Remap greift schon).

## ⏭️ WIEDEREINSTIEG NÄCHSTE SESSION (Robs Figma-Test: Composition-Nesting + Stretch&Grow + Taxonomie in einem Durchlauf)

**Robs Testprogramm:** ⚠️ **Dev-Plugin in Figma NEU LADEN** (dist seit Taxonomie neu; für Composition-Nesting selbst wäre keins nötig, aber falls seit `test8` nicht geschehen: laden!) → App neu laden → **Bild-Import** → Plugin-Import in **leere** Seite/Datei. Drei Dinge prüfen: **(A) NEU — Verschachtelung:** Template „Dashboard Layout" besteht jetzt aus INSTANZEN der Organismen (in Figma: Kinder des Templates sind ◇-Instanzen, nicht Frames!), Organismen ggf. aus Molekül-/Atom-Instanzen; Layout-Brüche des Templates (gestauchte Monats-Labels, Titel/Wert-Overlap) sollten VERSCHWUNDEN sein, weil die (guten) Einzel-Interpretationen instanziert werden. **(B) Layout** (Stretch&Grow + Wurzel-Freeze in den Einzel-Bausteinen): Sidebar volle Höhe, Monats-Labels verteilt. **(C) Taxonomie:** Sektionen `DB/Atoms`…`DB/Templates` korrekt befüllt (war in test8 schon ✅). Claude verifiziert per Figma-MCP (Datei-Link geben). Aus test8 zusätzlich offen: Top-Emissions-Zustandslücke in der App (weder interpretiert noch Platzhalter angezeigt — UI-Zustand prüfen), leere Avatar/Logo-Kästen + fehlendes „Export"-Label (Bild-Platzhalter/Text-Verlust in kompakten Bausteinen), Tabellen-Spaltenraster (eigene Scheibe).

**Offene Entscheidung von Rob:** „Connect Figma"-Stub im Topbar entfernen? (empfohlen: ja). — *Namensfrage (Refracta) RUHT seit 18.07.: Rob hält den Namen für vermutlich besetzt, nicht entschieden — Thema nicht proaktiv wieder aufbringen.*

**📋 Breiten-Test der Eingabetypen (Robs Wunsch 17.07. nachts):** Qualitativer Vergleich Bild vs. URL vs. Repo — gleiche/vergleichbare Quelle durch alle drei Wege, Ergebnis nach Tokens/Bausteinen/Interpretationen vergleichen. **Termin: direkt NACH der Plan-Fidelity-Scheibe** (sonst verfälschen die bekannten Fidelity-Lücken das Urteil). Ablauf: Claude baut die Matrix + fährt alle Imports selbst über die Live-API (Kandidaten: rk-landing als Repo + Screenshot; stripe.com o. ä. als URL + Screenshot derselben Seite für den Direktvergleich URL↔Bild), Rob liefert nur das Designer-Urteil pro Zelle. ⚠️ Bekannte Vorbelastung einpreisen: Tailwind-4-Repos (rk-landing) liefern 0 Tokens (Befund 15.07.) — der Vergleich macht diese Lücke sichtbar/messbar, das ist gewollt.

**Nächste Baustellen (priorisiert, Robs Richtung vom 18.07.: „App muss erst richtig funktionieren, so gut wie möglich nachschärfen"):**
1. **Robs Figma-Beweis-Test** (Layout + Taxonomie in einem Durchlauf, s. Wiedereinstieg oben) + Rest-Scheibe **Tabellen-Spaltenraster**.
2. **📋 Breiten-Test der Eingabetypen** (Robs Wunsch 17.07., jetzt dran, da Fidelity-Scheibe durch): Bild vs. URL vs. Repo, gleiche Quelle durch alle drei Wege (`demo-site/report.html` liegt bereit + rk-landing als Repo-Kandidat); Claude fährt die Imports über die Live-API, Rob liefert das Designer-Urteil pro Zelle. ⚠️ Tailwind-4-Repos liefern 0 Tokens (Befund 15.07.) — der Vergleich macht das sichtbar, gewollt.
3. **Figma-Reverse-Import** (Robs Punkt 18.07.: „aus dem Figma-File in DesignBridge importieren" — bisher ungetestet/ungebaut): Figma-Ingester-Spec liegt seit 03.07. (`docs/superpowers/specs/2026-07-03-figma-ingester-v1-design.md`), Plan + Bau fehlen.
4. **Developer-Empfangsseite** (Robs Use Case 18.07.: Developer nutzen DesignBridge zur Kommunikation mit Designern und schicken Interpretationen Richtung GitHub/Storybook/shadcn/Tailwind): Storybook-Emitter (Stub steht im Export-Tab), shadcn/Tailwind-Ziel-Repos, Export-Wege für Devs. Braucht Brainstorm/Spec mit Rob.
5. **Export-Ehrlichkeit Rest** (Testrunde 8): Token-Zahl-Diskrepanz kommunizieren (App 20 Tokens ↔ Figma 13 Styles, Spacing/Radius/Shadow sind BY DESIGN nicht im Figma-Payload).
6. Figma-Seiten-Namespacing pro Import (Mehrfach-Importe mischen sich per Namens-Match).
7. Polish: Scan-Retry bei abgeschnittener KI-Antwort (transient, 1× gesehen); Patterns-Begriff mit Rob klären (ganze nachgebaute Seite zählt aktuell als „Pattern" — Rob versteht darunter etwas anderes).

## Session 18.07.2026 abends — ATOMIC-DESIGN-TAXONOMIE komplett umgestellt (Spec `docs/superpowers/specs/2026-07-18-atomic-design-taxonomy-design.md`, 3 parallele Sonnet-Subagents, TDD)

Robs Kernkritik aus `test 7`: Cards/Charts/Tabellen liefen als „component", die ganze Seite als „pattern" — aus Designer-Sicht falsch. Rob wählte **Atomic Design** (Brad Frost) als Grundlage (Research bestätigte: Standard 2026; „modernere" Alternativen sind Code-Architektur, kein Designer-Modell). **Entschieden: 5 Ebenen, englisch — Tokens · Atoms · Molecules · Organisms · Templates** (oberste Ebene „Templates", nicht „Page" — Reconcile aus 2 Session-Strängen, s. Memory `project-designbridge-taxonomy`).

Umbau `kind` `atomic/component/pattern` → `atom/molecule/organism/template` + Buckets `atoms/molecules/organisms/templates`, über Server+Web+Plugin (gepinnter Vertrag in der Spec). **KEIN reiner Rename:** die alten „patterns" (Navbar/Hero/**Sidebar**) wurden **Organisms**, nur der ganze Screen wird **Template**; beide KI-Prompts (Bild + URL-AI) bekamen wörtliche Atomic-Design-Definitionen (Card/Chart/Table = organism, Button/Input = atom, ganzer Screen = 1 template); `recognizeComponents.js` neu geschnitten (+ `recognizeTemplate` via `<main>`/Shell); `repoInventory` page.tsx→template; Web: 3 fast identische Ebenen-Seiten zu einer generischen `LibraryLevel.jsx` konsolidiert; Plugin: Figma-Sektionen `DB/Atoms…DB/Templates`.

**Verifiziert:** Server 217/217 (+9) · Web 448/448 (+2, inkl. neuer Klassifikations-Tests: Navbar/Sidebar→organisms, Card/Table→organisms, Suche→molecules, `<main>`→1 template, repo page.tsx→template) · Plugin 92/92 · Typecheck+Build sauber. Vertrags-Konsistenz per Grep geprüft. **End-to-End-Demo-Scan bewiesen:** atoms=Button/Icon Button/Avatar/Status Dot/Tooltip · molecules=Search/Segmented Control/Category List Item · organisms=Sidebar Nav/Stat Card/Line+Donut+Bar Chart/Data Table · templates=Dashboard Layout. Keine Legacy-Buckets. **Bewusste Grenzen:** alte `DB/Atomics`-Frames in Bestands-Files + alte localStorage-Library werden NICHT migriert (Rob importiert frisch/leer); Molecule↔Organism-Grenze bleibt bei Auto-Erkennung heuristisch. Plugin-dist neu → **Rob: Dev-Plugin neu laden.**

**Reconcile-Hinweis:** Diese Umstellung (A) entstand in EINEM Session-Strang (Fork) und wurde als `a220ac4` committet+gepusht, während ein zweiter Strang parallel die Grundsatz-Entscheidungen brainstormte. Beim Zusammenführen kein Code-Konflikt (Fork war fertig, bevor er gestoppt wurde), Doku-Widerspruch „Page vs. Templates" → final **Templates** (Rob). Danach Ansatz B draufgesetzt.

### Session 18.07.2026 abends (2) — Enthaltungs-Guard (Ansatz B) FERTIG & LIVE (`77655b1`, Server 225/225)

Ansatz A verließ sich rein auf KI-Prompt-Definitionen (nicht-deterministisch). Ansatz B = deterministisches Sicherheitsnetz `server/lib/taxonomy.js` (`classifyByContainment`, reine Funktion + 7 Tests): über bbox-**Komposition** wird strukturell erzwungen, was die KI mal verfehlt — flächengrößte Einheit (≥80% Canvas, ≥2 enthaltene) = genau **1 Template** (hart), alles was ≥2 andere enthält (≥5% Fläche) = mind. **Organism** (promote-only). Verdrahtet im Bild-Pfad (`claude.js`, nach mergeByName, bbox-`contains` = ≥75% enthalten + größer). Server 217→**225** (+8). **Folge-Schritt offen:** URL/Repo-DOM-Guard (dort tragen Items nur Selektoren, keine bbox — der A-Regel-Remap klassifiziert dort aber schon Card→organism). Spec §Ansatz B.

## Session 18.07.2026 nachmittags — Robs Figma-Test `test 7` + WURZEL-BREITEN-FREEZE-Nachfix

Robs Import in `test 7` (https://www.figma.com/design/yGRVlvSazHbkEAnXRtHesE/, Node 1:875, per Figma-MCP verifiziert): **Sidebar oben + volle Höhe ✅** (Stretch-Scheibe wirkt), ABER Monats-Labels im Pattern weiter gestaucht + Top-Emissions-Wert klebt am Titel. **Root Cause per Live-Payload bewiesen** (`/api/figma-export/latest`): alle betroffenen Zeilen trugen korrekt `stretch:true`, aber die WURZELN von „Dashboard Layout" (Pattern) und „Reports Table" hatten `width:null` → Plugin-HUG-Guard schaltete die ganze Kette ab (die Spec-Annahme „Pattern-Wurzeln tragen immer Inline-Breite" war falsch; die anderen Component-Wurzeln hatten 480/520/640/720/960). **Nachfix (Spec-Nachtrag):** `freezeRootWidth` in htmlToPlan — Box-Wurzel ohne width + Unterbaum mit stretch/grow + echtes Rect (>0) → gemessene Breite einfrieren; NUR Breite (Höhen-Freeze würde bei Figmas Font-Metriken Inhalte abschneiden); Atomics ohne Stretch-Bedarf bleiben HUG. Web 446/446 (+6), Browser-verifiziert (Pattern-Nachbau: Wurzel 1024, Kette durchgängig; Avatar-Gegenprobe HUG). Plugin unverändert (kein Dev-Plugin-Reload nötig für DIESEN Fix — aber der von mittags steht noch aus, falls nicht geschehen). **Robs Re-Test: einfach App neu laden + erneut „An Figma senden".**

**Robs Taxonomie-Kritik aus demselben Test → Baustelle 0 oben** (wartet auf Robs Zielmodell-Antwort).

## Session 18.07.2026 mittags — Pattern-Fidelity-Scheibe „STRETCH & GROW" FERTIG (Spec `docs/superpowers/specs/2026-07-18-pattern-fidelity-stretch-grow-design.md`, 2 parallele Sonnet-Subagents, TDD)

Robs Go („Wir gehen weiter mit der Fidelity-Scheibe"). **Root Causes der 3 test6-Pattern-Befunde per Live-Browser-Messung BEWIESEN** (Fixture-HTML „Line Chart Card"/„Sidebar + Content Shell"): (1) `readAlignment` mappte Nicht-Flex UND `align-items:stretch/normal` (= CSS-Default!) auf counterAlign CENTER → alles wurde fälschlich zentriert; (2) Plan-Vertrag kannte kein „Kind füllt Gegenachse" → `justify-content:space-between`-Zeilen ohne Breite kollabierten in Figma auf HUG (Labels/Titel+Wert klebten aneinander); (3) kein `flex-grow` → `flex:1`-Spalten kollabierten. Der Browser misst alles richtig — der Konverter warf es weg.

**Fix (Vertrag PINNED Web↔Plugin):** alle 4 PlanNode-Typen haben jetzt optionale Felder `stretch: true` (Gegenachse füllen → Figma `layoutAlign='STRETCH'`) und `grow: true` (`flex-grow>0` → Figma `layoutGrow=1`), weggelassen statt false (wie `absolute`); counterAlign-Mapping stretch/normal→MIN, Nicht-Flex→MIN. Erkennung mit Eltern-Kontext (absolute gewinnt, Wurzeln/svg/lose Textknoten nie); Inline-`width/height:100%` (nicht Wurzel) → stretch/grow statt px-Freeze (Testrunde-8-Fix-Richtung „Prozent→FILL"); Absolute-Kinder-Freeze spart stretch-/grow-Achsen aus. Plugin wendet STRETCH/GROW nur bei **bestimmter Achse** des Parents an (Guard: HUG-Parent → heutiges Verhalten) und propagiert Achsen-Bestimmtheit rekursiv; Text-Stretch nur in column-Parents (+`textAutoResize='HEIGHT'`), Text-Grow in row-Parents ebenso.

**Verifiziert:** Server 208/208 · Web 440/440 (+12) · Plugin 92/92 (+18) · Plugin-Typecheck + Build (dist NEU → **Rob: Dev-Plugin neu laden!**) · Browser-Nachmessung: Label-Zeile `stretch:true`+SPACE_BETWEEN, Sidebar `stretch:true` (Höhe), Content `grow:true`, alle Aligns MIN — exakt die 3 Befunde. Echter Beweis = Robs nächster Figma-Import. Bewusste Grenzen (Spec §Grenzen): svg skaliert nicht mit, Wurzeln ohne Breite bleiben HUG, Tabellen-Spaltenraster + Direkter-Parent-Vereinfachung unverändert (eigene Scheiben).

**Außerdem 18.07.:** Refracta-Thema RUHT (Rob: nicht entschieden, Name vermutlich besetzt — nicht proaktiv aufbringen); Robs neue Roadmap-Punkte als Baustellen 3+4 oben aufgenommen (Figma-Reverse-Import, Developer-Empfangsseite Storybook/shadcn).

## Session 17.07.2026 spätnachts, Teil 3 — PLAN-FIDELITY Scheibe A+B (2 parallele Sonnet-Subagents, Spec `docs/superpowers/specs/2026-07-17-plan-fidelity-design.md`)

Robs „ja" zur Fidelity-Spec. Umgesetzt & getestet:
1. **Scheibe A — Absolute Positionierung:** CSS `position:absolute/fixed` → Plan-Feld `absolute:{x,y,width,height}` (Rect relativ zum DIREKTEN Parent, min 1px; Web lässt das Feld bei normalen Nodes WEG) → Plugin setzt `layoutPositioning='ABSOLUTE'` + x/y + resize NACH appendChild (`applyAbsolute` in renderPlan.ts; text: textAutoResize HEIGHT + Breite nur wenn >0). Soll lösen: Donut-Mitte („73%"), Y-Achsen-Labels, fehlende Monats-Labels, Sidebar-Überlappungen. Bewusste Vereinfachung: direkter Parent statt nächster POSITIONIERTER Vorfahre (dokumentiert).
2. **Scheibe B — Höhen-Kontext:** Mount-Container zusätzlich `height: PREVIEW_VIRTUAL_HEIGHT=768` — Prozent-Höhen (Bar-Segmente) sollen wie in der Vorschau-iframe-Kette auflösen.
Suiten: Server 208/208 · Web **425/425** (+7) · Plugin **74/74** (+20) · Typecheck · Build; Plugin-dist neu → **Rob: Dev-Plugin neu laden.** Echter Beweis = nächster Figma-Import (Donut-Mitte, Achsen-Labels, Sidebar prüfen). Bekannte offene Kante (Review-Notiz): absolute HUG-Boxen könnten trotz resize huggen (Figma-AUTO-Sizing) — erst bei Befund anfassen.
**Nachfix 18.07. früh (Robs Figma-Test `test6`, per MCP verifiziert):** Donut-Mitte ✅ + Sidebar ohne Überlappung ✅, ABER Trend-Chart kollabierte — Root Cause: Figma-Auto-Layout huggt nur In-Flow-Kinder; Chart-Body hatte NUR absolute Kinder → Frame ~0 breit + clipsContent. Fix in `buildBoxNode`: Parent mit ≥1 absolutem Kind friert fehlende Maße aus dem eigenen Rect ein (Web 428/428). Kein Plugin-Rebuild nötig — Rob muss nur die App neu laden + erneut „An Figma senden".
**Re-Test 18.07. ~00:10 (`test6` Seite 2, per MCP verifiziert): KOMPONENTEN-EBENE KOMPLETT ✅** — Trend-Chart volle Breite mit Y-Werten links, Monats-Labels korrekt verteilt, Tooltip richtig positioniert; Donut-Mitte ✅; Sidebar ✅. **Rest-Befunde NUR im Pattern „Dashboard Layout"** (= nächste Fidelity-Scheibe „verschachtelte Layouts", NICHT blockierend):
1. Sidebar im Pattern vertikal versetzt (beginnt ~1/4 unterhalb der Oberkante, schwebt)
2. Monats-Labels im Pattern-Chart zusammengestaucht („DecJanFeb…" mittig statt verteilt) — im Einzel-Baustein korrekt; vermutlich Direkter-Parent-Vereinfachung + tiefe Verschachtelung
3. Top-Emissions-Zeilen: Wert überlappt Titel („Bangalore Plant 11019.27")
4. Tabellen-Spaltenraster wackelt (bekannte eigene Scheibe)

**Danach begonnen: Report-Testseite für den Eingabetypen-Breiten-Test** (`demo-site/report.html`, orientiert an EcoMetrics-Elementklassen) — Ziel: dieselbe Quelle als URL- UND Bild-Import (Ground Truth bekannt), s. 📋-Absatz oben.

## Session 17.07.2026 nachts, Teil 2 — Testrunde-8-FIXES (2 parallele Sonnet-Subagents, Spec `docs/superpowers/specs/2026-07-17-testrunde8-fixes-design.md`)

Robs Go („macht schnell, kritisch, autonom"). Bewusst schmaler Zuschnitt — große Fidelity-Scheibe bleibt separat:
1. **Fix 1 — Mess-Breite 360→1024:** gemeinsame Konstante `PREVIEW_VIRTUAL_WIDTH=1024` (`web/src/lib/previewWidth.js`), genutzt von `htmlToPlan.js` (Offscreen-Mount) UND `InterpretedPreview.jsx` (Thumbnail). Vertrag: **WYSIWYG — Figma-Vermessung = Vorschau-Breite.** Damit lösen `width:100%`-Wurzeln zu 1024 statt 360 auf → Robs „Chart in der Breite gekroppt" behoben. ⚠️ jsdom löst `width:100%` nicht auf — Tests sichern per Spy die Container-Breite + Konstanten-Gleichheit ab, echter Beweis = Robs nächster Figma-Import.
2. **Fix 2 — Export-Ehrlichkeit:** Export-Tab zeigt Amber-Warnkasten mit Namen, wenn Platzhalter-Bausteine im Figma-Payload sind (vorher: stiller Platzhalter-Export, s. Donut-Befund) + einzeiliger Scope-Hinweis (Farben+Textstile → Figma; Spacing/Radius/Schatten → Code-Formate). Plugin-Meldung sagt jetzt „…, **davon** N Platzhalter" (in den „X neu" enthalten, nicht 13+1).

Suiten: Server 208/208 · Web 418/418 (+6) · Plugin 54/54 (+1) + Typecheck; Plugin-dist neu gebaut → **Rob: Dev-Plugin neu laden.** Offen bleibt (unverändert): Plan-Fidelity-Scheibe, Namespacing, Patterns-Begriff, Refracta, Connect-Figma-Stub.

## Session 17.07.2026 nachts — Testrunde 8: Diagnose zu Robs Figma-Test (Screenshots `Testdaten/interpretation 1707- 4`)

Robs Test lief durch (Import ✅, alle 13 Bausteine, Figma-Import ✅ in `test 1707-4`), zwei Befunde read-only diagnostiziert (Fable, keine Fixes — Spec zuerst):

1. **„Emissions-Chart in der Breite gekroppt" — Root Cause BEWIESEN, Bug liegt NICHT im Plugin:** Der Export-Payload (`/api/figma-export/latest`) enthält den Chart bereits mit fester Breite **360px**. Ursache: `htmlToPlan.js` misst die KI-HTML in einem Offscreen-Container mit `OFFSCREEN_WIDTH = 360` (Z. 19, 498); `readSize()` (Z. 249) friert Inline-Prozentbreiten (`width:100%`) als absolute px ein → 100% von 360 = 360. Beweis: exakt 3 Bausteine haben root-width 360 (Sidebar, Emissions Trend, Top Emissions = die mit `width:100%`), KPI-Cards tragen echte px-Breiten (480/520) und stimmen. Die App-Vorschau sieht richtig aus, weil das Thumbnail mit virtueller Breite 1024 rendert — Messung für Figma aber mit 360. Gleiche Familie wie 7.5-Befund (Prozent-Höhen→0). **Fix-Richtung (in Plan-Fidelity-Spec):** Prozentbreiten nicht als px einfrieren, sondern als FILL übersetzen; Offscreen-Breite an Vorschau angleichen (1024).
2. **Zähl-Diskrepanzen aufgeklärt (keine Zähl-Bugs, aber 2 UX-Lücken):** (a) Der „1 Platzhalter" = **Category Of Emissions Chart (Donut)** — ging mit `placeholder:true, plan:null` raus, d. h. beim Export fehlte eine verwertbare Interpretation; der Export-Tab hat davor nicht gewarnt (Lücke, s. Baustelle 2). (b) App „20 Tokens" ↔ Plugin „9 Farben + 4 Textstile": die übrigen 7 (3 Spacing, 3 Radius, 1 Shadow) sind im Figma-Payload strukturell nicht enthalten — korrekt, aber unkommuniziert.

## Session 17.07.2026 mittags/nachmittags — Testrunde 6 (Robs Bild-Test + Figma-Rundlauf)

**Testergebnis vormittags:** Figma-Rundlauf mechanisch ✅ (leere Datei, Zahlen exakt, Tokens/Textstile sauber, Metric Cards fast pixelgenau). **KI-Qualität ✅ auch im Free-Tier** (Modell-Alias liefert jetzt `gemini-3.5-flash`) — alle Probleme lagen in unserem Code. Robs Screenshots: `Testdaten/interpretation 1707_1`. Figma-Testdatei `ys40ZWYrbHsyhM6gykrhOg` (Seite „🌉 DesignBridge") — **per Figma-MCP direkt inspizierbar** (get_metadata/use_figma; nur die in Figma sichtbare Seite ist zugreifbar).

**Alle 6 Befunde gefixt (Commits `b5d081c`..`afb1995`, subagent-getrieben Sonnet, TDD):**
1. **Retry-Race (ernstester Bug):** parallele Einzel-Retries verschiedener Bausteine überschrieben sich gegenseitig (stale Closure) → Interpretationen „verschwanden". Jetzt Delta-Merge via `applyRetryOutcome(cur,name,outcome)`; `retryInterpretation` liefert nur noch Outcome, wirft nie.
2. **Verfeinern-Schwund:** `handleDeepened` ersetzte das Result komplett → `carryInterpretations(prev,next)` trägt interpretations/gefiltertes interpretFailed/Quota-Flag weiter.
3. **Quota-Meldung an der Zeile:** Row zeigt echte Fehlermeldung (inkl. Tages-Quota-Text), bei Quota-Erschöpfung alle Retry-Knöpfe gesperrt (vorher: Meldung nur in InterpretAllBar → stiller Blindflug).
4. **Sichtbare Aktivität:** Spinner im Detail + Pille „interpretiert …" im zugeklappten Header, Button „Läuft …".
5. **Vorschau:** skaliertes Thumbnail (virtuelle Breite 1024, transform:scale) + Klick = Vollbild-Modal (90vw×85vh, ESC/Backdrop/×). Browser-Smoke ✅.
6. **Figma-Layout-Bug (per MCP bewiesen & gefixt):** Chart kam KOMPLETT an, war aber unsichtbar — (a) `readLayout` machte Block-Container zu `row` → HORIZONTAL+Clip; jetzt: Nicht-Flex mit Element-Kindern → `column`. (b) `figma.createFrame()` clippt per API-DEFAULT → `renderPlan` setzt clipsContent nur noch bei expliziter Größe. Plugin-Meldung schlüsselt jetzt auf: „13 Bausteine neu (3 Atomics, 9 Components, 1 Pattern)".

**⚠️ Für Robs nächsten Figma-Test:** Plugin wurde neu gebaut (`npm run build` im Plugin-Ordner, dist aktuell) — in Figma das Dev-Plugin neu laden, dann Import wiederholen (leere Datei oder neue Seite). Erwartung: Trend-Chart sichtbar mit beiden Linien.

**Offen/nächste Kandidaten:** Thumbnail-Höhe bei kleinen Interpretationen großzügig (viel Weißraum — Polish); Tailwind-Runtime im htmlToPlan-Offscreen-Mount (größere Fidelity-Scheibe).

## Session 17.07.2026 spätabends — Testrunde 7.5: Token-Limit + Fidelity-Befunde (`5c40739`)

**Root Cause „Trend-Chart scheitert immer":** Antwort (langes SVG, HTML+JSX doppelt) wurde bei `max_tokens: 16384` abgeschnitten → Parse-Fehler → generischer 502, deterministisch bei jedem Retry (2× ~57s). Fix: **32768** + Route reicht die echte Ursache in der 502-Meldung durch (Row-UI zeigt sie seit Testrunde 6). Außerdem POOL_CONCURRENCY 3→6 (Batch jetzt ~1–2 Min).

**Fidelity-Befunde aus Robs Figma-Import (`KXnDV0BzDIHuWYXQ9Mzy2K`, per MCP seziert) — Input für eine eigene „Plan-Fidelity"-Scheibe:**
- Sidebar: gut, aber Texte überlappen (Logo/Nav, Storage-Karte) → **absolute Positionierung fehlt im Plan-Modell**
- Energy-Chart: Legende ✅, farbige Balken-Segmente fehlen → **Prozent-Höhen lösen im Offscreen-Mount zu 0 auf**
- Category-Donut: SVG-Passthrough ✅, „73 Known" neben statt im Donut → wieder absolute Positionierung
- Tabellen: Zeilen ✅ (Fix E), Spaltenraster fluchtet nicht → Teil derselben Scheibe

## Session 17.07.2026 abends — Testrunde 7 (Robs UX-Feedback, `a15814e`..`be40030`)

Alle 4 Punkte aus Robs Nachmittags-Test umgesetzt (Sonnet-Subagents, TDD, Browser-Smoke ✅, Suiten Server 208 · Web 412 · Plugin 53):
1. **Fix A:** Interpretation im Worker-Pool (Konkurrenz 3, weiterhin 1 Item/Request) + **automatische zweite Runde** für Fehlschläge — Batch-Dauer ÷3, Handarbeit erst nach echtem Doppel-Fehlschlag. Quota-Fail-Fast unverändert.
2. **Fix B:** Thumbnail content-adaptiv — srcdoc meldet Inhaltshöhe per postMessage, Wrapper klemmt [40, 800]. ⚠️ Falle gefunden: `documentElement.scrollHeight` im iframe = min. Viewport-Höhe (meldete konstant 640) → **`body.scrollHeight`** nehmen.
3. **Fix C:** Export-Tab: neuer ZIELE-Bereich (Primär-Button „An Figma senden", JSON einklappbar, „Nach Storybook (folgt)"-Stub); FORMAT-Liste nur noch CSS/Tailwind/tokens.json.
4. **Fix E:** Tabellen-Regression von Fix 6 behoben: `table-row`→row, `table`/row-groups→column. Grenze: Spaltenraster fluchtet nicht (eigene Scheibe „Tabellen-Fidelity").
Offen: Robs Antwort zu „Connect Figma"-Stub entfernen (empfohlen); Storybook-Emitter als echte Scheibe.

## Session 17.07.2026 später Nachmittag — Gemini Paid + Timeout-Root-Cause

**💳 Gemini Paid AKTIV** (Rob: Google Cloud Billing, 10-€-Budget) — Modell-Frage ERLEDIGT, Key/Railway unverändert, kein 429 mehr. **Danach echter Root Cause der Massen-Fehlschläge gefunden (`b45915f`):** 4 Bausteine pro Gemini-Call > 60s → Server-Timeout → 502 für den ganzen Chunk. Einzeln gehen 14–54s durch. **Fix:** CLIENT_CHUNK_SIZE 4→1 + DEFAULT_TIMEOUT_MS 60s→120s (Env `GEMINI_TIMEOUT_MS` bleibt Übersteuerung). Diagnose lief komplett über die Live-API (curl-Flow siehe Memory).

> ## ⚠️ BETRIEBS-REGELN (seit heute)
> 1. **Jeder Push auf `main` = automatischer Railway-Re-Deploy.** Was auf main landet, geht live.
> 2. Railway: **EIN Projekt = `appealing-mindfulness`** (hält die Domain). Das Duplikat `practical-creativity` wurde 15.07. gelöscht — nicht wundern, wenn alte Screenshots es zeigen.
> 3. KI-Provider: **Gemini** (Railway-Variable `GEMINI_API_KEY`, Robs Gratis-Key von aistudio.google.com). Claude bleibt als Fallback im Code (gesetzter `ANTHROPIC_API_KEY` hätte Vorrang; `AI_PROVIDER` erzwingt). Modell = Alias `gemini-flash-latest` + Ausweich NUR noch auf `gemini-3-flash-preview` bei 404/429/503 — **flash-lite ist seit Testrunde 4 raus** (erfand generische Inhalte; lieber ehrlich scheitern + Retry). Temperature client-weit 0.2.
> 4. Free-Tier-Limits: ~10 Anfragen/Min, 1.500/Tag — für Robs Nutzung irrelevant, aber bei Testreihen nicht im Sekundentakt scannen.
> 5. Lokal entwickeln wie immer: `npm run dev` (bzw. `dev:demo`), Port-Falle beachten (`PORT=3047`). Lokal echten KI-Test: `GEMINI_API_KEY` in die lokale `.env` übernehmen (steht nur in Railway!).

## Session 17.07.2026 Nachtschicht — Quota-Bremse + Modell-Research (Claude solo, Robs Auftrag „die Nacht durcharbeiten")

**Anlass:** Rob konnte abends nicht weitertesten (Tages-Quota leer, Reset ~09:00). Nachtprogramm = alles, was KEINE KI-Calls braucht. Alles gepusht & deployt (`9399b6a`..`d308cc7`), subagent-getrieben (Sonnet), Review-Pass + Full-Suite durch Koordination (Fable).

1. **Quota-Bremse (Spec `docs/superpowers/specs/2026-07-16-quota-bremse-design.md`):** `geminiClient.js` unterscheidet jetzt Tages-Quota (RPD, QuotaFailure `quotaId` ~ PerDay) von Minuten-Drosselung (RPM). Bei RPD: **sofort aufgeben** (1 Call statt bis zu 6 — kein Modell-Fallback, kein Backoff, gleicher Topf), Fehler trägt `isDailyQuota`. Alle 4 KI-Routen mappen das auf **HTTP 429 + `daily_quota:true`** mit deutscher Meldung („…Reset … ca. 09:00 deutscher Zeit"). Web: Chunk-Schleife stoppt beim ersten Quota-Fehler (Rest = failed statt sinnlos weiterfeuern), Result trägt `interpretQuotaExhausted`, InterpretAllBar zeigt die Meldung + Batch-Knopf disabled; Einzel-Retries bleiben aktiv, ein Erfolg räumt die Sperre. RPM-429 verhält sich exakt wie bisher.
2. **KI-Modell-Research-Doc** (`docs/2026-07-17-ki-modell-research.md`, der offene Task vom 15.07.): Empfehlung = (1) Anthropic-Payment nochmal versuchen (andere Kartenmarke + support.claude.com; Umschalten = nur Env-Var), (2) parallel **Gemini Paid Tier via Google Cloud Billing** (ANDERER Zahlungsabwickler als Stripe, ~3–60 $/Monat bei Robs Volumen, 0 Code-Änderung), (3) OpenRouter hilft NICHT (kein PayPal, wieder nur Karte), (4) Notlösung gemini-2.5-flash-Zusatz-Fallback (separater, kleinerer Topf, für Neukonten unzuverlässig). Unverifizierte Zahlen sind im Doc markiert.

## Session 16.07.2026 spät — Autonome Test- & Fix-Session (Claude solo, Robs Vorarbeit abgenommen)

**Erledigt & gepusht (`c69fbc9`..`ecf7682`, live):**
1. **`/api/health` zeigt jetzt `demo_fallback`** (`c69fbc9`, testbarer Helper `server/lib/healthInfo.js`). **Live geprüft: `demo_fallback:false`** → Robs Schritt 1 (Railway-Variable prüfen) ist ERLEDIGT, kein Handlungsbedarf, alle Qualitätstests laufen auf echten Ergebnissen.
2. **Reload-Limbo gefixt** (`2ddf31a`): `normalizeStalePending()` in `web/src/lib/interpret.js` — nach Reload werden hängende „Wird interpretiert…"-Zustände zu failed + „Erneut versuchen"-Knopf. 6 neue Tests.
3. **Per-Fetch-Timeout im Gemini-Client** (`ecf7682`): AbortController, Default 60s, `GEMINI_TIMEOUT_MS`-Env, Timeout wird wie 503 behandelt (Kette+Backoff greifen). 5 neue Tests.
4. Demo-model-Kosmetik-Befund vom 15.07. geprüft: **war schon sauber** (Testrunde 4 hatte alle Pfade abgedeckt; kein Claude-Name kann durchschlagen).

**E2E live abgehakt:** URL-Import (Demo-Seite, 8/4/3/5/3 + 10 Inventar, Warnungen im Modal) · „Komponenten-Erkennung verfeinern" (Herkunfts-Pillen „Regeln + KI" korrekt; 1. Versuch 429, 2. Versuch grün) · Export alle 4 Formate + Zip ohne Konsolenfehler · „An Figma senden" → Payload serverseitig unter `/api/figma-export/latest` verifiziert · **Export-Verifikation rk-landing:** tokens.css + `@import` eingebaut, `npm run build` grün, Variablen lösen zur Laufzeit auf, Seite rendert unverändert. ⚠️ Die 2 Dateien liegen UNCOMMITTED in rk-landing (`src/tokens.css` neu, `src/index.css` +1 Zeile) — Rob entscheidet behalten/verwerfen.

**🔑 KERNBEFUND — Gemini-Free-Tier-Quota ist das echte Limit:** Bild-Import-Test war NICHT möglich: 3× HTTP 429 über ~10 Min, auch nach 4 Min Pause → **Tages-Quota** (Metrik `generate_content_free_tier_requests`, **limit: 20, model: gemini-3-flash**). Zwei Verschärfer: (a) **beide Ketten-Modelle (`gemini-flash-latest` UND `gemini-3-flash-preview`) teilen sich denselben Quota-Topf** — der Modell-Fallback rettet bei 429 gar nichts; (b) **der Testrunde-5-Backoff verbrennt bis zu 6 API-Calls pro Klick** (2 Modelle × 3 Runden) — Quota-Verbrauch ×6. Reset Mitternacht PT ≈ **09:00 deutscher Zeit**. Folge-Ideen (offen, erst mit Rob): RPD-429 erkennen und NICHT retryen (Geminis Fehler nennt die Quota-Metrik) · Fallback in andere Modell-Familie · `ANTHROPIC_API_KEY` auf Railway (Payment-Hürde, s. 15.07.) · Robs Modell-Research-Task.

## Session 16.07.2026 abends — Testrunde 5: Robs Test-Befunde behoben

Robs Live-Test (Screenshots `Testdaten/screens designbridge test 1607_1` + `_2`) fand: Interpretationen scheiterten massenhaft, dauerten Minuten im Blindflug, „Erneut versuchen" wirkte tot, Figma-Export = fast nur Platzhalter. **Root Cause:** Free-Tier-Bursts (Scan + Chunks + Retries + zweiter Import) drosselten beide Ketten-Modelle gleichzeitig; die Kette gab nach ~1s endgültig auf; alles lief unsichtbar in EINEM Request; Retry ohne jedes Feedback. Fixes (Plan `docs/superpowers/plans/2026-07-16-testrunde5-tempo-und-retry.md`, je Task Spec-Review, Final-Review Opus = SHIP):

1. **Gemini-Backoff** (`39b9d66`): bis zu 3 Runden über die Kette, Wartezeit = max(2s/8s, Geminis eigenes `retryDelay`), Deckel 15s.
2. **Progressive Interpretation** (`b75f9b2`): Client sendet 4er-Chunks einzeln (sequenziell), UI füllt sich nach jedem Chunk, neuer Import bricht laufende Requests ab (AbortController).
3. **Retry-Feedback + Races zu** (`6171d06`, `0b2bc58`): Einzel-Retry zeigt „Wird erneut interpretiert …" + gesperrter Button; Batch↔Einzel-Retry sperren sich gegenseitig (2 vom Review gefundene Race-Conditions geschlossen).

**⚠️ FÜR ROBS NÄCHSTEN FIGMA-TEST: LEERE Figma-Datei verwenden!** Die bisherige Testdatei enthält die alten Demo-Komponenten vom 13.07. — das Plugin aktualisiert per Namens-Match („5 aktualisiert") und vermischt alte und neue Inhalte. Außerdem gilt: Platzhalter in Figma = Interpretation war fehlgeschlagen (jetzt seltener) — erst in der App prüfen, dass die Bausteine echte Vorschauen haben, DANN exportieren.

**Folge-Kandidaten (nicht blockierend):** Reload mitten im Batch lässt Items in „Wird interpretiert …"-Limbo (pre-existing; beim App-Load pending→failed normalisieren) · Per-Fetch-Timeout im Gemini-Client · Chunk-Parallelität 2, falls Rob nach dem Backoff-Beweis noch mehr Tempo braucht · Figma-Seiten-Namespacing pro Import.

## Session 15.07.2026 — Deployment & Gemini (komplett erledigt)

1. **Deploy-Prep** (`1f5bf5b`): Prod-Static-Serving (Express liefert bei `NODE_ENV=production` `web/dist` + SPA-Fallback), `railway.json`, `DEPLOY.md`, `build`/`start`-Scripts, CORS via Env. Lokal im Prod-Modus verifiziert.
2. **Rob deployte auf Railway** → Domain generiert → Live-Smoke grün (URL-Import end-to-end, Export echt).
3. **Live-Fixes** (test-first): Demo-Seite-Knopf zeigte auf localhost (`50b3611`) · roher SDK-Fehler ohne Key → deutsche 503-Meldung (`e8a4821`).
4. **Gemini-Provider-Swap** (`6817286`, Spec `docs/superpowers/specs/2026-07-15-gemini-provider-swap.md`): `server/lib/geminiClient.js` (Anthropic-kompatibler Adapter, reines fetch, kein SDK) + `server/lib/aiClient.js` (Umschalter, `aiKeyConfigured()`). Alle 4 KI-Callsites nutzen `client ?? getAiClient()` — Prompts/Pipeline/Fach-Tests unangetastet.
5. **4 Live-Hürden gelöst:** doppeltes Railway-Projekt (Key lag im falschen; per Env-Sonde bewiesen) · kyrillisches „А" im gepasteten Key (ByteString-Error 1040) · `gemini-2.5-flash` für Neukonten 404 → Alias `gemini-flash-latest` · 503 „high demand" → **Fallback-Kette** (`fd15663`, test-first).
6. **Beweis:** Erster echter Live-Bild-Scan — `Testdaten/Reports/02.png` → `gemini-3.1-flash-lite`, 4,2 s, „SaaS analytics dashboard", 6 Farben + 5 Components mit bboxes. Diagnose-Sonden danach entfernt (`6cace04`).
7. **Credits-Thema ist Geschichte** — Memory bereinigt, 0 € laufende Kosten.

## Session 15.07.2026 abends — Testing-Phase Runde 1 (4 Bugs gefunden, 4 gefixt)

1. **Stubs entschärft** (`d18088c`): Settings + Connect Figma disabled + Tooltip „Folgt in einer späteren Version".
2. **Bild-Import-Doppelbug gefixt** (`40eebfd` + `ed16804`): (a) max_tokens 4096→16384 an allen KI-Callsites, Gemini-Adapter meldet Abschneiden als `stop_reason max_tokens`; (b) **Root Cause per Diagnose-Sonde bewiesen:** gemini-3.1-flash-lite hängt sporadisch eine überzählige `}` ans Antwort-Ende → neues `lib/aiJson.js` (`extractJson`) löst das erste balancierte JSON-Objekt heraus, alle 4 Callsites umgestellt. 5/5 Live-Scans grün.
3. **URL-Import überlebt kaputte Stylesheets** (`7617a25`): linear.app schlug fehl — Inline-Style-Regex griff `data-style=`-Attribute (→ `.inline { a }`, postcss-Absturz „Unknown word a"); Regex präzisiert + jeder CSS-Block einzeln validiert, unlesbare übersprungen + gezählt (UI-Warnung). linear.app liefert jetzt 278 Tokens.
4. **Fehlerpfade deutsch** (`47100ec`): kaputtes Bild + tote Website → verständliche Meldungen (live verifiziert); private Repo-URL war schon gut.
5. **Befund (offen, Roadmap):** Repo-Import mit Tailwind-4-Repos (CSS-first, kein tailwind.config, Design in Utility-Klassen im JSX — z. B. `rk-landing`) liefert **0 Tokens**. Dazu UX-Lücke: Erfolgs-Modal zeigt grünes Häkchen bei 0 Ergebnissen, Server-Warnung wird im Modal nicht angezeigt.
6. Test-Setup: `rk-landing` ist jetzt **public** (Import-Quelle), Export-Ziel = rk-landing lokal.
7. **Runde 2 (spät):** pxpx-Anzeige-Bug gefixt (`c166c28`, normalizeTokenUnits streift Einheiten — Gemini liefert '64px' als String). **Qualitäts-Befund:** flash-lite erfindet bei Interpretationen generische Inhalte trotz korrektem Crop → **Gemini-Kette umsortiert** (`3afc56a`): `gemini-3-flash-preview` vor `flash-lite`; live bewiesen (Scan lief auf preview). **Claude-Pfad vorbereitet aber schlafend:** Modell-IDs auf `claude-sonnet-5` (`bce05cd`, 2/10 $ Intro-Preis); Robs Guthaben-Kauf scheiterte am Payment (Bank graut 0-$-Verifizierung aus — support.claude.com, kein Code-Thema); greift automatisch, sobald ANTHROPIC_API_KEY (aus lokaler `.env`) als Railway-Variable gesetzt wird. Weitere offene UX-Funde: URL-Tab warnt nicht bei GitHub-URLs (Rob scannte versehentlich GitHubs Primer: 1734 Farben); pickTokens gab Button-Template dieselbe Farbe für bg+text (#79c0ff auf #79c0ff); „Mit KI vertiefen" verspricht Token-Verbesserung, verfeinert aber nur die Komponenten-Liste. Roadmap-Kernbefund: Tailwind-4-Quellen (Repo UND URL) tragen keine benannten Tokens → Feature „KI-Token-Veredelung" nötig.

## Session 16.07.2026 — Testrunde 3 (Subagent-Workflow, 4 Fixes + Interpretations-Diagnose)

1. **Figma-Plugin → Live-App** (`8b6589c`): `fetchLatestExport` (neu, 5 Tests) probiert erst die Railway-URL, Fallback auf localhost:3047 nur bei Netzwerkfehler; manifest erlaubt beide Domains. **Robs Test-Anleitung: `designbridge-plugin/ANLEITUNG-LIVE-TEST.md`.**
2. **Emit-Farbbug** (`3de0c2e`): `ensureReadableText()` — nie mehr bg == Textfarbe (Rollen-Kollision, #79c0ff auf #79c0ff), Kontrast-Heuristik + Token-Namen-Rückmapping.
3. **UX ehrlich** (`aa19fb6`, `8bac17b`): GitHub-URL-Hinweis im URL-Tab · 0-Tokens = Amber-Warnzustand statt grünem Häkchen + Server-Warnungen im Modal · „Mit KI vertiefen" → „Komponenten-Erkennung verfeinern".
4. **Interpretations-Diagnose (read-only, Fable):** Pipeline im Kern gesund — Live-Test lieferte für große Karte originalgetreue Interpretation (exakte Zahlen/Farben/Icons). „Generisch"-Ursachen bewiesen: **(a)** Winzige Atomic-Crops ohne Mindestgröße/Upscaling (Avatar 34×31 px → Modell erfindet, lieferte Unsplash-Stockfoto; `imageDecomposer.js cropVisual`), **(b)** stille Fallback-Degradierung auf flash-lite bei 429/503, Modellname wird bei /api/interpret verworfen, „Erneut versuchen" läuft in dieselbe Falle (`geminiClient.js` + `interpretComponents.js`), **(c)** Alles-in-einem-Batch (13 Bausteine, 1 Call) + Default-Temperature ≈1.0, **(d)** `mergeByName` behält erste statt größte bbox, **(e)** `sanitizeHtml` lässt externe `<img src>` durch, **(f)** ⚠️ `DEMO_FALLBACK` evtl. noch =1 auf Railway → unmarkierte Konserven-Interpretationen! **→ Empfehlungen = Plan Testrunde 4** (Prio: Mindest-Crop-Größe/Upscaling → temperature 0–0.2 → Modell-Badge + Degradierungs-Stopp vor flash-lite → Batch-Chunking 3–4 → DEMO_FALLBACK prüfen/badgen → mergeByName größte bbox → sanitizeHtml externe Bilder ersetzen).

## Session 16.07.2026 nachmittags — Testrunde 4 (subagent-getrieben, alle 7 Diagnose-Ursachen gefixt)

Plan: `docs/superpowers/plans/2026-07-16-testrunde4-interpretationsqualitaet.md`. 11 Commits (`d6839f8`…`79efb8a`), jeder Task mit Spec- + Quality-Review, Final-Review (Opus): SHIP.

1. **Crop-Upscaling** (`d6839f8`): Crops < 128px kurze Kante werden bikubisch hochskaliert (max 4×) — Ursache (a) Mini-Crops.
2. **Temperature 0.2** (`cc3b28e`): client-weit statt Default ~1.0 — Ursache (c2).
3. **Degradierungs-Stopp** (`8a6df75`): flash-lite komplett aus der Fallback-Kette — Ursache (b). Kettenerschöpfung wird geloggt (`79efb8a`).
4. **Chunking à 4** (`a56de34` + `a489e93`): statt 13-Bausteine-Monsterbatch; bare-Segmente gruppiert (Vollbild nur in ⌈bare/4⌉ Chunks); Chunk-Ausfall isoliert (nur seine Labels failed, Rest liefert); **jede Interpretation trägt `model`** — Ursachen (c1) + (b2).
5. **Demo-Kennzeichnung** (`5476f3e`): interpret-Demo-Response `demo:true`, scan-Demo `meta.demo` + `model:'demo-fixture'` — Ursache (f), nie mehr unmarkierte Konserven.
6. **UI-Badges** (`630a6ee`): Modell-Tag (mono) + rote „Demo-Daten"-Pill an interpretierten Bausteinen; alte localStorage-Caches bleiben kompatibel.
7. **mergeByName größte bbox** (`1bc08a6`) — Ursache (d).
8. **sanitizeHtml externe Bilder** (`d13b2ef` + `09eb2e2`): externe/protokoll-relative img-src → quote-freier SVG-Platzhalter (Review fand & fixte Attribut-Abbruch bei single-quote-src) — Ursache (e).

**Gemini-Pro-A/B-Test (Robs Frage):** jetzt trivial — auf Railway `GEMINI_MODEL=gemini-3-pro-preview` setzen, gleichen Screenshot importieren, Modell-Badge zeigt ehrlich wer antwortete. Free-Tier-Limits für Pro beachten (wenige Anfragen/Tag). Erst NACH Robs Flash-Urteil sinnvoll.

## 🎯 TESTING-PHASE — Reststand

Rob testet bereits selbst auf der Live-App. Plan für die strukturierte Runde:

### Die 3 Ebenen der Testumgebung (Grundlagen, für Rob)
1. **Automatisierte Tests** (Fundament, existiert): Server 150 (`npm run test:server`) + Web 303 (`cd web && npx vitest run`). Prüfen Logik isoliert, laufen vor jedem Push. Decken NICHT ab: echtes KI-Verhalten, Figma-Laufzeit, Browser-Eigenheiten — dafür Ebene 2+3.
2. **Manueller E2E-Testplan** (Live-App, Checkliste unten): jeden User-Weg einmal echt durchklicken, Ergebnis notieren (✅/❌ + Screenshot bei ❌).
3. **Echte Testdaten** (Robs Beitrag): eigenes technisches Repo, eigene Screenshots, echte fremde Websites — statt nur Demo-Fixtures. Erst echte Daten decken echte Schwächen auf.

### E2E-Checkliste (Live-URL, gemeinsam abarbeiten)
- [x] **Bild-Import** technisch ✅ (nach Doppelbug-Fix, 5/5 Scans grün) — **Robs Qualitätsurteil steht noch aus**
- [ ] **KI-Interpretationen** je Baustein (Vorschau, „Erneut versuchen") → echte gerenderte Referenz? ⚠️ 16.07. spät an Tages-Quota gescheitert — ab ~09:00 dt. Zeit wieder möglich
- [x] **„Komponenten-Erkennung verfeinern"** nach URL-Import ✅ 16.07. spät (Herkunfts-Pillen „Regeln + KI" korrekt)
- [x] **URL-Import** mit echter fremder Website ✅ (stripe.com 152 Tokens · linear.app nach Fix 278 Tokens)
- [x] **Repo-Import** mit rk-landing ⚠️ läuft technisch, aber 0 Tokens (Tailwind-4-Lücke, s. Befund oben)
- [x] **Export alle 4 Formate** ✅ 16.07. spät (alle 4 rendern korrekt, Zip ohne Konsolenfehler, „An Figma senden" serverseitig bestätigt)
- [x] **Export-Verifikation im Ziel-Repo** ✅ 16.07. spät (rk-landing: Build grün, Variablen lösen auf; Dateien uncommitted, Rob entscheidet)
- [ ] **Figma-Rundlauf:** „An Figma senden" → Plugin „Aus DesignBridge übernehmen". ✅ Plugin spricht seit 16.07. mit der Live-URL (`8b6589c`) — **Robs Part:** Plugin in Figma Desktop laden, Anleitung: `designbridge-plugin/ANLEITUNG-LIVE-TEST.md`.
- [x] **Fehlerpfade** ✅ (alle drei deutsch & verständlich, live verifiziert)
- [ ] **Gemini-Qualität bewerten** (Robs Designer-Auge, Stichprobe vs. frühere Claude-Ergebnisse). Falls schwächer → Modell/`AI_PROVIDER` diskutieren.

### Robs technisches Repo einbinden (seine Frage vom 15.07.)
Zwei getrennte Zwecke, zwei einfache Wege — kein „Verlinken"/Setup nötig:
1. **Als Import-QUELLE:** Repo muss nur **öffentlich auf GitHub** liegen → URL in den Repo-Tab, App zieht den Tarball selbst. Kandidaten: `rk-landing`, Portfolio-Repo, oder ein shadcn-Projekt.
2. **Als Export-ZIEL (Verifikation):** Export herunterladen (`tokens.css`/`tailwind.config`/zip) → lokal in ein echtes Projekt einbauen → baut es, sieht es richtig aus? Machen wir zusammen in einer Session; Rob bestimmt nur das Zielprojekt.

### 🐛 Bekannte offene Punkte (15.07. gefunden)
1. **„Connect Figma"-Knopf = STUB** — `web/src/App.jsx:131`, kein onClick (nie verdrahtet; Figma-LESEN wurde nie gebaut — nur Schreiben via Export→Plugin existiert). **Entscheidung:** (A) entfernen, (B) disabled + Tooltip „folgt" *(Empfehlung für Testphase, 5 Min)*, (C) Figma-Ingester bauen (Spec liegt: `docs/superpowers/specs/2026-07-03-figma-ingester-v1-design.md`).
2. **„Settings"-Knopf ebenso Stub** (daneben, kein onClick) — gleiche Entscheidung.
3. **Figma-Plugin vs. Live-URL** (s. Checkliste).
4. Kosmetik: `meta.model` zeigt im Demo-Fallback weiter Claude-Namen.

### Danach / weiter offen
- **🏷️ Namensfrage Refracta** (vertagt 14.07., Rob bestätigt) → dann technische Umbenennung + eigene Domain statt `…up.railway.app`. Doku: `docs/2026-07-14-naming-positionierung.md`. ⛔ Umbenennung erst nach Bestätigung.
- html.to.design-Zielbild-Vergleich (Robs Beitrag, Fidelity-Fazit).
- Produkt-Ausbau später: Datenbank + Auth + In-Memory-Puffer → Postgres/Redis (bleibt auf Railway; Vercel bewusst verworfen — Details im Memory).

## App starten / Tests
- Lokal: `PORT=3047 npm run dev` (echt, braucht Key in lokaler `.env`) oder `npm run dev:demo` (Demo-Daten) → http://localhost:5173
- Prod-Simulation lokal: `npm run build` → `PORT=3047 npm start` → alles auf :3047
- Tests: `npm run test:server` (**225**) · `cd web && npx vitest run` (**448**) · Plugin: `cd designbridge-plugin && npm run test:writer` (**92**) + `npm run typecheck` + `npm run build`
- Repo-Regel 7: nach Datei-Writes `find . -name '._*' -delete` (AppleDouble)

## 👤 ROBS AUFGABEN — nächste Runde, gemeinsam mit Anleitung (Plan für den Wiedereinstieg)

Die nächste Session ist **Robs Wiederholungstest** (der erste Durchlauf 16.07. 16:21–16:30 lief in die Free-Tier-Falle, siehe Testrunde 5 oben — die Fixes dafür sind live). Claude führt Schritt für Schritt durch, Rob klickt/urteilt. Reihenfolge:

1. ~~**DEMO_FALLBACK auf Railway prüfen**~~ ✅ **ERLEDIGT 16.07. spät ohne Rob:** `/api/health` zeigt jetzt `demo_fallback` an — live geprüft, steht auf `false`. Nichts zu tun.
2. **Figma-Rundlauf** (15 Min): Anleitung liegt fertig in `designbridge-plugin/ANLEITUNG-LIVE-TEST.md` — kurz: Live-App → Import → Export-Tab → „An Figma senden"; dann Figma **Desktop** → Plugins → Development → „Import plugin from manifest…" → `designbridge-plugin/manifest.json` → Plugin öffnen → „Aus DesignBridge übernehmen". Plugin spricht seit 16.07. automatisch mit der Live-URL (localhost nur noch Dev-Fallback). Erwartung: Styles unter `DesignBridge/Color/*` + `/Text/*` + Sticker-Sheet-Seite. **⚠️ In eine LEERE Figma-Datei importieren** (die bisherige Testdatei enthält die alten Demo-Komponenten → Namens-Match vermischt alt/neu). **Erst exportieren, wenn die Bausteine in der App echte Vorschauen (mit Modell-Badge) haben** — Platzhalter in Figma = Interpretation fehlte.
3. ~~**Export-Verifikation im Ziel-Repo**~~ ✅ **ERLEDIGT 16.07. spät ohne Rob** (rk-landing: Build grün, Tokens live aufgelöst, Seite unverändert). Robs Rest-Entscheidung: die 2 uncommitteten Dateien in rk-landing behalten oder `git checkout .`.
4. **Robs Qualitätsurteil Interpretation**: Contact-/Portfolio-Screenshot importieren, Interpretationen anschauen. ✅ Testrunde 4 ist durch — die bekannten Schwächen (Mini-Crops, stille flash-lite-Degradierung, Monsterbatch) sind gefixt, das Urteil lohnt jetzt. Das Modell-Badge an jedem Baustein zeigt, wer wirklich geantwortet hat; eine rote „Demo-Daten"-Pill heißt: DEMO_FALLBACK hat gegriffen → Health-Endpoint prüfen! **⚠️ WICHTIG: erst ab ~09:00 dt. Zeit (Gemini-Tages-Quota-Reset) — und sparsam klicken: nur ~20 KI-Calls/Tag im `gemini-3-flash`-Topf.** Seit der Nachtschicht-Quota-Bremse kostet ein Klick bei leerem Topf nur noch **1** Call statt 6, und die App sagt ehrlich „Tages-Kontingent erschöpft" — aber der Topf bleibt klein. Bei der Quota-Meldung: aufhören, warten, nicht klicken.
5. **Modell-Entscheidung** (5 Min Lesen): `docs/2026-07-17-ki-modell-research.md` — Robs Entscheidung: Anthropic-Payment-Anlauf 2 und/oder Gemini Paid Tier via Google Cloud Billing (anderer Zahlungsabwickler als Stripe!).

✅ **Testrunde 4 + 5 sind FERTIG & LIVE** (beide Sessions 16.07., s. oben). Erwartungshaltung für den Wiederholungstest: Voll-Import braucht weiterhin 1–3 Min (Free-Tier, bewusst sequenziell), aber die UI füllt sich progressiv in 4er-Gruppen, Fehlschläge sind die Ausnahme (Backoff) und Retry zeigt Ladezustand. Zwischen zwei Imports kurz warten (Quota). Wenn Rob danach noch mehr Tempo will → Folge-Task „Chunk-Parallelität 2". Offener Chip: Reload-Limbo-Fix.

## Wiedereinstiegs-Prompt (nächste Session)
> „Designbridge: Lies RESUME.md. Stand 18.07. abends — Atomic-Design-Taxonomie (A `a220ac4` + Enthaltungs-Guard B `77655b1`) und Stretch&Grow/Wurzel-Freeze sind FERTIG & LIVE, alles grün (Server 225 · Web 448 · Plugin 92). Heute mein Figma-Beweis-Test in EINEM Durchlauf: ⚠️ Dev-Plugin NEU laden → Bild-Import → Export → in LEERE Figma-Datei importieren; ich gebe dir den Datei-Link, du verifizierst per Figma-MCP **(A) Layout** (Sidebar oben+volle Höhe, Monats-Labels verteilt, Titel/Wert getrennt) und **(B) Taxonomie** (Cards/Charts/Tabelle/Sidebar in Organisms, ganzer Screen = 1 Template, Buttons/Icons = Atoms, Suchfeld = Molecule; Figma-Sektionen DB/Atoms…DB/Templates). Danach je nach Ergebnis: URL/Repo-DOM-Guard nachziehen ODER Eingabetypen-Breiten-Test (Bild vs. URL vs. Repo, demo-site/report.html liegt) ODER Figma-Reverse-Import. Refracta-Namensfrage NICHT aufbringen (ruht)."

**Separater Research-Task angelegt (15.07. spät):** „KI-Modell-Research für Designbridge-Interpretationen" — vergleicht Gemini-Tiers/Claude/Alternativen nach Treffsicherheit, Kosten und Payment-Hürde (Robs Anthropic-Payment scheitert an der Bank-Verifizierung; Ausweg prüfen, z. B. bezahlter Gemini-Tier). Deliverable: Entscheidungs-Doc unter docs/. Letzte Fixes Runde 2 (`443d6c2`): gleichnamige Bausteine werden verschmolzen (3× „button" → 1 mit Varianten) + Icon-Regel im Interpret-Prompt (keine grauen Platzhalter-Kästchen mehr). Robs Vergleichs-Import des Contact-Screenshots steht noch aus.
