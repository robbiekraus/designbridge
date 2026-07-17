# Testrunde 7 — UX-Feedback: Parallelisierung, Auto-Retry, Thumbnail, Export-Tab, Tabellen

Stand: 2026-07-17 später Nachmittag. Quelle: Robs Test nach Gemini-Paid +
Timeout-Fix (Screenshots `Testdaten/interpretation 3`). Kontext: Paid-Tier
aktiv (kein RPM/RPD-Engpass mehr), Einzel-Requests à 15–55s.

## Fix A — Parallele Interpretation + Auto-Retry-Runde

**Befund:** 13 Bausteine × 15–55s SEQUENZIELL = 5–12 Minuten Batch. Hintere
Bausteine wirken „ewig interpretierend" (Robs Dropdown Selector). Fehlge-
schlagene müssen händisch nachgeklickt werden, obwohl ein zweiter Versuch
fast immer reicht — Rob: „die Vorschau ist semi, der Code ist Source of
Truth" → Interpretation darf nie nach Handarbeit verlangen, solange es eine
automatische Option gibt.

**Soll (web/src/lib/interpret.js, runInterpretation):**
- Worker-Pool mit **Konkurrenz 3** statt strikt sequenziell (CLIENT_CHUNK_SIZE
  bleibt 1). Merge-Reihenfolge egal (attachInterpretations ist per-Name).
  onProgress nach JEDER Antwort. Abort-Signal bricht den Pool ab (keine neuen
  Starts; laufende via signal an fetch). Free-Tier-sicher: 3 parallel bei
  15–55s/Call bleibt unter 10 RPM.
- **Auto-Retry-Runde:** nach Durchlauf aller Items bekommen die
  fehlgeschlagenen (OHNE dailyQuota-Abbruch — der bleibt Fail-Fast) genau
  EINE automatische zweite Runde über denselben Pool. Erst was danach noch
  failed ist, landet in interpretFailed/Retry-Knopf. interpretPending bleibt
  bis zum Ende der Auto-Retry-Runde true.
- Tests: Pool-Konkurrenz (max 3 in flight — über verzögerte Promises
  prüfbar), Auto-Retry (Item scheitert 1×, klappt in Runde 2 → NICHT in
  interpretFailed; Item scheitert 2× → failed), dailyQuota → kein Auto-Retry,
  Abort mitten im Pool → null.

## Fix B — Thumbnail content-adaptiv (Weißraum weg)

**Befund:** Wrapper ist fix 640px (virtuell) hoch → kleine Interpretationen
(KPI Card) haben ~900px Weißraum. Rob: volle Breite ok (Navigation braucht
sie), aber Höhe muss dem Inhalt folgen.

**Soll (web/src/components/library/InterpretedPreview.jsx):**
- Das srcdoc bekommt ein Mini-Script, das nach Load (und via
  ResizeObserver am body) `document.documentElement.scrollHeight` per
  `postMessage` an parent meldet (sandbox allow-scripts erlaubt postMessage;
  targetOrigin '*' ist hier ok — Inhalt ist eigene Vorschau ohne Secrets;
  Message trägt eine eindeutige id je Instanz, Parent filtert auf window
  source + id).
- Thumbnail-Wrapper-Höhe = min(contentHeight, 800) * scale, Fallback 640
  solange keine Meldung kam. Virtuelle Breite bleibt 1024, Skalierung wie
  gehabt.
- Vollbild-Modal unverändert.
- Tests: Message mit passender id setzt Wrapper-Höhe; fremde Messages
  (falsche id/kein Format) werden ignoriert; Fallback ohne Message.

## Fix C — Export-Tab-Hierarchie

**Befund (Rob, Designer-Sicht):** „Nach Figma (Plugin)" als vierter Eintrag
in der FORMAT-Liste ist hierarchisch falsch — Richtung Figma ist für ihn der
Hauptweg, Code-Formate sind sekundär. Storybook fehlt als (künftiger) Weg.

**Soll (web/src/pages/Export.jsx):**
- Neuer Bereich **„Ziele"** oben: prominenter Primär-Button **„An Figma
  senden"** (Stil wie „Ganze Library exportieren", schwarz) + darunter der
  bisherige Hinweistext (Plugin-Weg) + JSON-Details einklappbar wie bisher.
  Daneben/darunter deaktivierter Button **„Nach Storybook (folgt)"**
  (Optik wie die anderen Disabled-Stubs, title-Hinweis).
- FORMAT-Liste enthält nur noch CSS-Variablen / Tailwind-Config /
  tokens.json. Das designbridge-figma.json bleibt als Vorschau erreichbar
  über den Ziele-Bereich (einklappbares Detail oder kleiner „JSON anzeigen"-
  Link), nicht mehr als Format-Eintrag.
- „Alle herunterladen"/„Ganze Library exportieren" unverändert.
- Bestehende Export.jsx-Tests anpassen; neue: Figma-Senden-Button rendert im
  Ziele-Bereich und triggert denselben POST wie bisher; Format-Liste hat 3
  Einträge; Storybook-Button disabled.

## Fix E — Tabellen im Figma-Konverter

**Befund (Figma-Datei `test1707 -3`, Reports Table H=2199):** Fix 6 macht
JEDEN Nicht-Flex-Container mit Element-Kindern zur Spalte — auch `<tr>`.
Echte Tabellen kommen als ein vertikaler Turm aus Zellen an.

**Soll (web/src/lib/emit/htmlToPlan.js, readLayout):** CSS-Table-Displays
explizit behandeln, VOR dem Block-Default:
- `table-row`, `table-header-group`? nein — Gruppen stapeln Zeilen:
  `table-row` → **'row'**; `table`, `table-row-group`, `table-header-group`,
  `table-footer-group` → **'column'**; `table-cell` → wie Block-Default
  (Element-Kinder → column, sonst row/Leaf).
- Tests mit echtem `<table><thead><tr><th>…` -Markup (jsdom liefert die
  table-Displays nativ): tr → row, tbody/table → column; Regressionstests
  aus Fix 6 bleiben grün.
- Bekannte Grenze (dokumentieren, nicht fixen): Spaltenbreiten sind je Zeile
  HUG → Raster fluchtet nicht perfekt. Echte Tabellen-Fidelity = eigene
  Scheibe.

## Außerdem (Rob-Entscheid ausstehend)

- „Connect Figma"-Stub im Topbar entfernen (empfohlen) — erst nach Robs Go.

## Rahmen

Suiten müssen grün bleiben (Server 208 · Web 391 · Plugin 53 + neue), Push =
Deploy, kein neues Package, deutsche UI-Texte, zinc-Stil.
