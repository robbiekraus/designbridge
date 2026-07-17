# Testrunde-8-Fixes: Mess-Breite + Export-Ehrlichkeit (Kurz-Spec)

Stand 17.07.2026 nachts. Befunde: RESUME.md §Testrunde 8. Bewusst SCHMALER Zuschnitt —
die große Plan-Fidelity-Scheibe (absolute Positionierung, Prozent-Höhen, Tabellenraster)
bleibt separat.

## Fix 1 — Offscreen-Mess-Breite an die Vorschau angleichen (360 → 1024)

**Problem (bewiesen):** `htmlToPlan.js` misst KI-HTML in einem 360px-Container
(`OFFSCREEN_WIDTH=360`); Inline-Prozentbreiten (`width:100%`) werden als absolute px
eingefroren → Emissions-Trend-Chart ging mit 360px nach Figma („extrem in der Breite
gekroppt"), während die App-Vorschau (`InterpretedPreview.jsx`, `THUMB_VIRTUAL_WIDTH=1024`)
korrekt aussah.

**Vertrag:** *Die Figma-Vermessung nutzt dieselbe virtuelle Breite wie die Vorschau.*
WYSIWYG: Was die Vorschaukarte zeigt, kommt in Figma an. Sieht die Vorschau falsch aus,
ist das ein (separates) Interpretations-/Fidelity-Problem, kein Mess-Problem.

**Umsetzung:**
- Gemeinsame Konstante `PREVIEW_VIRTUAL_WIDTH = 1024` (neues Modul `web/src/lib/previewWidth.js`),
  genutzt von `htmlToPlan.js` (statt `OFFSCREEN_WIDTH`) und `InterpretedPreview.jsx`
  (statt lokalem `THUMB_VIRTUAL_WIDTH`).
- Kommentar in `htmlToPlan.js` auf den Vertrag umschreiben (alte „Startannahme 360"-Notiz raus).
- Die Einfrier-Heuristik in `readSize()` bleibt UNVERÄNDERT (Prozent → px der Mess-Breite
  ist jetzt akzeptabel, weil die Mess-Breite realistisch ist).

**Nicht-Ziele:** kein FILL-Konzept im Plan-Modell, kein bbox-basiertes Mounten (beides
Kandidaten für die Fidelity-Scheibe, dort gegen diesen Vertrag abwägen).

## Fix 2 — Export-Ehrlichkeit (Warnung + Meldungs-Klarheit)

**Problem (bewiesen):** Rob exportierte den Donut („Category Of Emissions Chart") als
`placeholder:true` ohne jeden Hinweis — `Export.jsx` kennt den Interpretationszustand
nicht. Plugin-Meldung „13 Bausteine neu (…), 1 Platzhalter" liest sich wie 13+1
(der Platzhalter ist in den 13 ENTHALTEN). Außerdem unkommuniziert: App zeigt 20 Tokens,
nach Figma gehen nur Farben+Textstile (13 Styles).

**Umsetzung (alles nicht-blockierend, Export bleibt möglich):**
1. `Export.jsx`, ZIELE-Bereich: Amber-Warnkasten, wenn der Figma-Payload
   Platzhalter-Bausteine enthält (`JSON.parse(exports.figma).components` mit
   `placeholder===true`, memoized): Anzahl + Namen + Hinweis „werden in Figma nur als
   Platzhalter-Karte angelegt — vorher unter Components/Atomics erneut interpretieren".
   Bestehender Stil: zinc/amber, kleiner Text, wie 0-Tokens-Warnzustand im Import-Modal.
2. `Export.jsx`, unter „An Figma senden": ein Satz Scope-Hinweis
   („Nach Figma gehen Farben & Textstile; Spacing/Radius/Schatten stecken in den Code-Formaten.").
3. `designbridge-plugin` `applyImport.ts` (buildMessage): „…, 1 Platzhalter" →
   „…, davon 1 Platzhalter" (bzw. n). Tests entsprechend anpassen.

## Verifikation
- TDD je Task; volle Suiten: Server 208 · Web 412 · Plugin 53 (+ neue).
- Browser-Smoke Export-Tab (Warnkasten sichtbar bei Platzhalter, sonst nicht).
- Nach Push: Railway-Auto-Deploy; Plugin neu bauen → Rob muss Dev-Plugin in Figma neu laden.
