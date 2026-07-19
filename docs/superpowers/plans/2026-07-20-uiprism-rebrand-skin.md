# UIPrism Rebrand Skin — 2026-07-20

Reines Ausführungs-Rebranding von "Designbridge" → "UIPrism" in `web/`. Marke war bereits
vollständig entschieden (Tokens/Logos/Checkliste in `../Designbridge_Webpage_Presentation/`).
Kein Design-Neuentwurf, nur Umsetzung der freigegebenen Entscheidungen. `server/` und
`designbridge-plugin/` nicht angefasst. Nicht gepusht.

## Geänderte Dateien

- `web/tailwind.config.js` — `theme.extend.colors`: `primary` (DEFAULT/hover/soft/ink),
  `ink`, `spectrum.*`; `fontFamily.sans` um `Inter` erweitert.
- `web/index.html` — `<title>UIPrism</title>`, Favicon-Links (`uiprism-favicon.svg` +
  PNG-Fallback), Google-Fonts-Link für Inter 400/600/800.
- `web/public/uiprism-favicon.svg`, `web/public/uiprism-favicon-32.png`,
  `web/public/uiprism-mark.svg` — neu kopiert aus
  `Designbridge_Webpage_Presentation/Brand/UIPrism-Logos/`.
- `web/src/App.jsx` — Header-Wortmarke (Mark-SVG + „UI" in Ink / „Prism" in Indigo statt
  Icon-Kästchen + „Designbridge"); „Neuer Import"-Button → Indigo; aktive Nav-States
  (Dashboard + Library-Einträge) → `bg-primary-soft text-primary-ink`; Spektrum-Hairline
  (`h-0.5`, Gradient) direkt unter dem `<header>`.
- `web/src/index.css` — `.btn-primary` → `bg-primary`.
- `web/src/components/ImportModal/ImportSuccess.jsx` — „Open library"-Button → Indigo.
- `web/src/components/ImportModal/tabs/{ImageTab,UrlTab,RepoTab,FigmaTab}.jsx` —
  „Import"-Submit-Button (enabled state) → Indigo; disabled state (`bg-zinc-300`)
  unverändert.
- `web/src/components/library/AiDeepenBanner.jsx`,
  `web/src/components/library/EmptyState.jsx`,
  `web/src/components/library/InterpretAllBar.jsx` — Primärbuttons → Indigo.
- `web/src/components/library/LibraryObjectList.jsx` — „Herunterladen"-Button → Indigo;
  aktiver Variant-Selector-Pill → Indigo statt Schwarz.
- `web/src/pages/Export.jsx` — „An Figma senden", beide „Herunterladen"-Buttons, „Ganze
  Library exportieren" → Indigo; aktiver Format-Tab → `bg-primary-soft text-primary-ink`.

## Bewusst NICHT geändert (Begründung)

- **`ImportModalShell.jsx`** (interne Modal-Tabs, `border-zinc-900 text-zinc-900` aktiver
  Zustand): nutzt ein anderes Pattern (Border-Underline, nicht `bg-zinc-100 text-zinc-900`)
  und war in den 7 freigegebenen Aufgaben nicht explizit benannt. Sichtbare
  Schwarz/Grau-Optik bleibt hier vorerst bestehen — Kandidat für einen Folge-Task, falls
  gewünscht.
- **Export.jsx „DesignBridge-Plugin"-Copy** (Zeilen ~101/104: „im Plugin „Aus
  DesignBridge übernehmen""): bezieht sich auf den tatsächlichen Namen des Figma-Plugins,
  das laut Auftrag NICHT umbenannt wird (`designbridge-plugin/` ist tabu). Text bliebe
  sonst falsch/irreführend, da das Plugin real noch „DesignBridge" heißt.
- Interne, nicht sichtbare Identifiers (`localStorage`-Keys `designbridge.*`, JSON-Envelope
  `designbridge: 'figma-import'`, `postMessage`-Typ `designbridge-preview-height`,
  Dateiname `designbridge-figma.json`, Auto-generated-Kommentare in Emit-Templates) —
  Protokoll-/Datenformat-Bezeichner, kein UI-Branding, vom Figma-Plugin konsumiert
  (out of scope). Nicht angefasst.
- Badges/Pills mit `bg-zinc-100` außerhalb des Nav-/Tab-Patterns (`ConfidencePill`,
  `SourcePill`, `tokenViews`, `Dashboard.jsx`-Status-Pill, generischer-Stub-Badge in
  `LibraryObjectList`) — keine aktiven Nav-/Tab-States, sondern informative Badges;
  nicht in Task 6 gemeint, unverändert gelassen.

## Guard-Tests (neu)

- `web/src/App.test.jsx` — Header zeigt „UI"/„Prism"-Spans + Mark-Bild, kein
  „Designbridge" im DOM.
- `web/src/components/library/EmptyState.test.jsx` — zusätzlicher Test: Primärbutton
  trägt `bg-primary`, nicht `bg-zinc-900`.
- `web/tests/index.html.test.js` — `index.html` enthält `<title>UIPrism</title>` und
  einen `uiprism-favicon`-Link, keinen „Designbridge"-String.

## Tests

- Vorher: 43 Test-Dateien, 579 Tests, alle grün.
- Nachher: 45 Test-Dateien, 584 Tests, alle grün (keine bestehenden Tests mussten
  angepasst werden — keiner prüfte die alte Wortmarke/Farbklassen direkt).

## Verifikation

- Vite-Dev-Server (Port 5173) neu gestartet (die vorher laufende Instanz hatte die
  Tailwind-Config-Änderung nicht übernommen → PostCSS-Fehler „bg-primary class does not
  exist" im Overlay). Nach Neustart: Header, Spektrum-Hairline, Indigo-Buttons, aktive
  Nav-/Tab-States und Export-Seite visuell im Browser geprüft — sehen wie erwartet aus.
- `find . -name '._*' -delete` nach dem Asset-Kopieren in `web/public/` ausgeführt
  (exFAT-AppleDouble-Falle).

## Offen / Empfehlung für Folge-Task

- `ImportModalShell.jsx`-Tab-Unterstreichung optional auch auf Indigo umstellen, falls
  gewünscht (aktuell außerhalb des Scopes dieser Aufgabe).
