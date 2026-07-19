# Plan: Geminis `jsx`-Erzeugung abschalten (Token-Sparmaßnahme)

Stand: 2026-07-19 (nach Architektur-Pivot Scheibe 1–3)

## Ziel & Begründung

Seit **Scheibe 1** wird der Code-Export aus dem kanonischen `plan` erzeugt
(`interp.html` → `htmlToPlan` → `planToJsx`). Geminis separates `jsx`-Feld hat
**keinen echten Konsumenten mehr** (Server/Web/Plugin verifiziert) — es wird nur
noch erzeugt und verworfen. Bei jedem echten Scan verdoppelt es grob die
Ausgabelänge → verbrennt Paid-Tier-Tokens ohne Nutzen.

**Maßnahme:** Gemini nicht mehr um `jsx` bitten; das tote Feld überall entfernen,
sodass Live- und Demo-Shape identisch (`{ name, html, model }`) sind.

Bewiesen sicher durch Regressionstest `web/src/lib/emit/emitComponents.test.js:201-218`
(„Code aus planToJsx, NICHT interp.jsx") — der bleibt und wird nach der Änderung
sogar noch definitiver grün.

## Bewusste Grenzen

- `max_tokens: 32768` bleibt als Sicherheits-Ceiling (lange SVG-HTML bei
  Linien-Charts kann allein groß sein; ein Ceiling kostet nichts, nur echte
  Ausgabe-Tokens werden bezahlt). Nur der begründende Kommentar wird aktualisiert.
- Der Guard-Test in `emitComponents.test.js` (Fixture mit `jsx:'<div>real jsx</div>'`)
  bleibt unverändert — er beweist Nicht-Nutzung auch für den hypothetischen Fall,
  dass ein `jsx` doch mal durchkommt.

## TDD-Schritte

### 1. Rote Tests zuerst
- `server/lib/interpretComponents.test.js`: neuer Test — der an den (gemockten)
  Client gesendete Prompt-Text enthält **kein** `"jsx"`-Schemafeld und keine
  jsx-Anweisung; UND die von `interpretComponents` zurückgegebenen
  Interpretations-Objekte haben **keinen** `jsx`-Key (nur `name`, `html`, `model`).
- `web/src/lib/interpret.test.js`: die beiden `toEqual`-Erwartungen (ca. Z.145 &
  Z.574) von `{ html, jsx, model, demo }` auf `{ html, model, demo }` umstellen
  (rot, bis interpret.js angepasst ist).

### 2. Implementierung (grün machen)
- `server/lib/interpretComponents.js`
  - Z.57 Schema: `, "jsx": "..."` entfernen → `{ "name": "...", "html": "..." }`.
  - Z.62: den Klammerzusatz `(The separate "jsx" field DOES use shadcn/Tailwind — keep that.)` streichen.
  - Z.70: aus dem `hasStructure`- und `hasCode`-Zusatz die jsx-Erwähnungen
    entfernen (`(and shadcn/Tailwind jsx)` bzw. `and keep the original shadcn/Tailwind flavour in jsx`).
  - Z.166-169: Kommentar aktualisieren (Antwort trägt kein JSX mehr; Ceiling bleibt
    für lange SVG-HTML). `max_tokens` **nicht** senken.
  - Z.191-196: `jsx: ...` aus dem gepushten Objekt entfernen.
- `web/src/lib/interpret.js:82`: `jsx: it.jsx` aus der Map entfernen.

### 3. Demo-Shape angleichen (Fixtures + Schema-Tests)
- `server/fixtures/demo-interpretations.json`, `demo-url-interpretations.json`,
  `demo-repo-interpretations.json`: `jsx`-Feld aus jedem Eintrag entfernen.
- `server/lib/demoInterpretations.test.js` (Z.17/23),
  `server/lib/demoUrlFixture.test.js` (Z.37/45),
  `server/fixtures/demo-repo-interpretations.test.js` (Z.9/15):
  die `typeof … jsx === 'string'`-Assertion entfernen; stattdessen assert, dass
  **kein** `jsx`-Key mehr existiert (`assert.equal('jsx' in it, false)` o.ä.).

### 4. Verifikation
- `npm run test:server` (Baseline vorher: 246/246) → grün, Netto-Testzahl ≥246.
- `cd web && npm test` (Baseline vorher: 566/566) → grün.
- Kein Figma-/AI-/Quota-Lauf nötig (rein statische Änderung; kein Plugin-Change,
  kein Dev-Plugin-Reload).

## Nicht anfassen
- Plugin-Code (keine jsx-Referenz vorhanden).
- Emitter (`emitComponents.js`/`emitFigmaComponents.js`) — lesen schon nur `.html`.
- `.jsx`/`.tsx` als **Datei-Endungen** in Repo-Erkennungs-Regexen
  (`repoFilePatterns.js`, `repoComposition.js`) — anderes Thema, nicht berühren.
