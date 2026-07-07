# Figma-Emitter v1 — Umsetzungsplan

Spec: `docs/superpowers/specs/2026-07-06-figma-emitter-v1-design.md`
Baseline vor Bau: Server 73/73, Web 100/100.

## Web (test-getrieben, Vitest)

- **T1 — `emitFigma`:** Test zuerst (`emitFigma.test.js`): normalisierte Tokens → `{designbridge,version,colors[],text[]}`; leere Gruppen → leere Arrays; fontSize/-weight numerisch. Dann `emitFigma.js`.
- **T2 — Registry:** `index.js`: Format `figma` in `EXPORT_FORMATS` + `buildExports().figma`. `index.test.js` auf `['css','tailwind','json','figma']` + `figma`-Assertion erweitern.
- **T3 — Export-UI:** `Export.jsx` Anleitungszeile bei `activeId==='figma'`. `Export.test.jsx` grün halten (additiver Button).
- **Verify:** `cd web && npx vitest run` → alles grün; `vite build` sauber.

## Plugin (build/typecheck-verifiziert)

- **T4 — parsePayload.ts (pur):** `hexToRgb` (3-/6-stellig, wirft bei ungültig), `parseImportPayload` (validiert `designbridge`, filtert colors/text, deutsche Fehler).
- **T5 — Typen:** `manifest.ts` um `ImportMessage`/`ImportSummary`/`ImportDoneMessage` + Unions erweitern.
- **T6 — applyImport.ts:** create-or-update Paint-/Text-Styles, Gewicht→Inter-Style, Summary.
- **T7 — main.ts:** `IMPORT`-Zweig.
- **T8 — ui.ts + ui.html:** Import-Karte + Handler + `IMPORT_DONE`-Rendern + Textarea-CSS.
- **Verify:** `npm run build` (esbuild) sauber + `npx tsc --noEmit` sauber.

## Abschluss

- Browser-Smoke Web (Export-Tab „Nach Figma").
- RESUME.md: Stand + **manueller Figma-Test** (Rob).
- Memory aktualisieren.
- **NICHT pushen** (stehende Regel).
