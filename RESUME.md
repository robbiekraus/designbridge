# Designbridge — Schnellstart-Spickzettel

Stand: **15.07.2026 (Feierabend)** — **🚀 APP IST LIVE: https://designbridge-production.up.railway.app** mit **echter, dauerhaft kostenloser KI** (Google Gemini Free-Tier). Working Tree sauber, `main` == `origin/main` (`6cace04`). Server **150/150** · Web **303/303**.

> ## ⚠️ BETRIEBS-REGELN (seit heute)
> 1. **Jeder Push auf `main` = automatischer Railway-Re-Deploy.** Was auf main landet, geht live.
> 2. Railway: **EIN Projekt = `appealing-mindfulness`** (hält die Domain). Das Duplikat `practical-creativity` wurde 15.07. gelöscht — nicht wundern, wenn alte Screenshots es zeigen.
> 3. KI-Provider: **Gemini** (Railway-Variable `GEMINI_API_KEY`, Robs Gratis-Key von aistudio.google.com). Claude bleibt als Fallback im Code (gesetzter `ANTHROPIC_API_KEY` hätte Vorrang; `AI_PROVIDER` erzwingt). Modell = Alias `gemini-flash-latest` + automatische Ausweich-Kette (`gemini-3.1-flash-lite`, `gemini-3-flash-preview`) bei 404/429/503.
> 4. Free-Tier-Limits: ~10 Anfragen/Min, 1.500/Tag — für Robs Nutzung irrelevant, aber bei Testreihen nicht im Sekundentakt scannen.
> 5. Lokal entwickeln wie immer: `npm run dev` (bzw. `dev:demo`), Port-Falle beachten (`PORT=3047`). Lokal echten KI-Test: `GEMINI_API_KEY` in die lokale `.env` übernehmen (steht nur in Railway!).

## Session 15.07.2026 — Deployment & Gemini (komplett erledigt)

1. **Deploy-Prep** (`1f5bf5b`): Prod-Static-Serving (Express liefert bei `NODE_ENV=production` `web/dist` + SPA-Fallback), `railway.json`, `DEPLOY.md`, `build`/`start`-Scripts, CORS via Env. Lokal im Prod-Modus verifiziert.
2. **Rob deployte auf Railway** → Domain generiert → Live-Smoke grün (URL-Import end-to-end, Export echt).
3. **Live-Fixes** (test-first): Demo-Seite-Knopf zeigte auf localhost (`50b3611`) · roher SDK-Fehler ohne Key → deutsche 503-Meldung (`e8a4821`).
4. **Gemini-Provider-Swap** (`6817286`, Spec `docs/superpowers/specs/2026-07-15-gemini-provider-swap.md`): `server/lib/geminiClient.js` (Anthropic-kompatibler Adapter, reines fetch, kein SDK) + `server/lib/aiClient.js` (Umschalter, `aiKeyConfigured()`). Alle 4 KI-Callsites nutzen `client ?? getAiClient()` — Prompts/Pipeline/Fach-Tests unangetastet.
5. **4 Live-Hürden gelöst:** doppeltes Railway-Projekt (Key lag im falschen; per Env-Sonde bewiesen) · kyrillisches „А" im gepasteten Key (ByteString-Error 1040) · `gemini-2.5-flash` für Neukonten 404 → Alias `gemini-flash-latest` · 503 „high demand" → **Fallback-Kette** (`fd15663`, test-first).
6. **Beweis:** Erster echter Live-Bild-Scan — `Testdaten/Reports/02.png` → `gemini-3.1-flash-lite`, 4,2 s, „SaaS analytics dashboard", 6 Farben + 5 Components mit bboxes. Diagnose-Sonden danach entfernt (`6cace04`).
7. **Credits-Thema ist Geschichte** — Memory bereinigt, 0 € laufende Kosten.

## 🎯 NÄCHSTE SESSION = TESTING-PHASE

Rob testet bereits selbst auf der Live-App. Plan für die strukturierte Runde:

### Die 3 Ebenen der Testumgebung (Grundlagen, für Rob)
1. **Automatisierte Tests** (Fundament, existiert): Server 150 (`npm run test:server`) + Web 303 (`cd web && npx vitest run`). Prüfen Logik isoliert, laufen vor jedem Push. Decken NICHT ab: echtes KI-Verhalten, Figma-Laufzeit, Browser-Eigenheiten — dafür Ebene 2+3.
2. **Manueller E2E-Testplan** (Live-App, Checkliste unten): jeden User-Weg einmal echt durchklicken, Ergebnis notieren (✅/❌ + Screenshot bei ❌).
3. **Echte Testdaten** (Robs Beitrag): eigenes technisches Repo, eigene Screenshots, echte fremde Websites — statt nur Demo-Fixtures. Erst echte Daten decken echte Schwächen auf.

### E2E-Checkliste (Live-URL, gemeinsam abarbeiten)
- [ ] **Bild-Import** mit echtem Screenshot (nicht Testdaten) → Tokens/Inventar plausibel?
- [ ] **KI-Interpretationen** je Baustein (Vorschau, „Erneut versuchen") → echte gerenderte Referenz?
- [ ] **„Mit KI vertiefen"** nach URL-Import → Anreicherung + Herkunfts-Pillen korrekt?
- [ ] **URL-Import** mit echter fremder Website (nicht Demo-Seite)
- [ ] **Repo-Import** mit Robs technischem Repo (s. u.) → Code gehoben, „aus Repo gehoben"-Pille?
- [ ] **Export alle 4 Formate** (CSS/Tailwind/tokens.json/Figma) + „Ganze Library exportieren" (zip)
- [ ] **Export-Verifikation im Ziel-Repo** (s. u.)
- [ ] **Figma-Rundlauf:** „An Figma senden" → Plugin „Aus DesignBridge übernehmen". ⚠️ Plugin-Auto-Fetch + manifest `allowedDomains` zeigen vermutlich noch auf `localhost:3047` — prüfen/anpassen, damit das Plugin gegen die **Live-URL** sprechen kann.
- [ ] **Fehlerpfade:** kaputtes Bild, private Repo-URL, tote Website → verständliche deutsche Meldungen?
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
- Tests: `npm run test:server` (150) · `cd web && npx vitest run` (303) · Plugin: `cd designbridge-plugin && npm run typecheck && npm run build`
- Repo-Regel 7: nach Datei-Writes `find . -name '._*' -delete` (AppleDouble)

## Wiedereinstiegs-Prompt (nächste Session)
> „Testing-Phase Designbridge: Lies RESUME.md. Zuerst Connect-Figma-Stub entschärfen (Option B), dann die E2E-Checkliste auf der Live-App abarbeiten. Mein Test-Repo: <GitHub-URL>. Mein Export-Zielprojekt: <Name>."
