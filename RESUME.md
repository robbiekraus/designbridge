# Designbridge — Schnellstart-Spickzettel

Stand: **16.07.2026 (Testing-Phase Runde 3 durch)** — **🚀 APP IST LIVE: https://designbridge-production.up.railway.app** mit **echter, dauerhaft kostenloser KI** (Google Gemini Free-Tier). Server **170/170** · Web **321/321** · Plugin-Tests 39/39.

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

## 🎯 TESTING-PHASE — Reststand

Rob testet bereits selbst auf der Live-App. Plan für die strukturierte Runde:

### Die 3 Ebenen der Testumgebung (Grundlagen, für Rob)
1. **Automatisierte Tests** (Fundament, existiert): Server 150 (`npm run test:server`) + Web 303 (`cd web && npx vitest run`). Prüfen Logik isoliert, laufen vor jedem Push. Decken NICHT ab: echtes KI-Verhalten, Figma-Laufzeit, Browser-Eigenheiten — dafür Ebene 2+3.
2. **Manueller E2E-Testplan** (Live-App, Checkliste unten): jeden User-Weg einmal echt durchklicken, Ergebnis notieren (✅/❌ + Screenshot bei ❌).
3. **Echte Testdaten** (Robs Beitrag): eigenes technisches Repo, eigene Screenshots, echte fremde Websites — statt nur Demo-Fixtures. Erst echte Daten decken echte Schwächen auf.

### E2E-Checkliste (Live-URL, gemeinsam abarbeiten)
- [x] **Bild-Import** technisch ✅ (nach Doppelbug-Fix, 5/5 Scans grün) — **Robs Qualitätsurteil steht noch aus**
- [ ] **KI-Interpretationen** je Baustein (Vorschau, „Erneut versuchen") → echte gerenderte Referenz?
- [ ] **„Mit KI vertiefen"** nach URL-Import → Anreicherung + Herkunfts-Pillen korrekt?
- [x] **URL-Import** mit echter fremder Website ✅ (stripe.com 152 Tokens · linear.app nach Fix 278 Tokens)
- [x] **Repo-Import** mit rk-landing ⚠️ läuft technisch, aber 0 Tokens (Tailwind-4-Lücke, s. Befund oben)
- [ ] **Export alle 4 Formate** (CSS/Tailwind/tokens.json/Figma) + „Ganze Library exportieren" (zip)
- [ ] **Export-Verifikation im Ziel-Repo** (rk-landing lokal)
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
- Tests: `npm run test:server` (150) · `cd web && npx vitest run` (303) · Plugin: `cd designbridge-plugin && npm run typecheck && npm run build`
- Repo-Regel 7: nach Datei-Writes `find . -name '._*' -delete` (AppleDouble)

## 👤 ROBS AUFGABEN — nächste Runde, gemeinsam mit Anleitung (Plan für den Wiedereinstieg)

Die nächste Session ist **Robs Test-Session**: Claude führt Schritt für Schritt durch, Rob klickt/urteilt. Reihenfolge:

1. **DEMO_FALLBACK auf Railway prüfen** (5 Min): railway.app → Projekt `appealing-mindfulness` → Service → Variables. Steht dort `DEMO_FALLBACK=1`? → auf `0` setzen oder Variable löschen (Redeploy passiert automatisch). Sonst liefert die App bei Interpret-Fehlern **unmarkierte Demo-Konserven** statt echter Ergebnisse — das verfälscht jeden Qualitätstest. **Diesen Schritt ZUERST, vor allen anderen Tests.**
2. **Figma-Rundlauf** (15 Min): Anleitung liegt fertig in `designbridge-plugin/ANLEITUNG-LIVE-TEST.md` — kurz: Live-App → Import → Export-Tab → „An Figma senden"; dann Figma **Desktop** → Plugins → Development → „Import plugin from manifest…" → `designbridge-plugin/manifest.json` → Plugin öffnen → „Aus DesignBridge übernehmen". Plugin spricht seit 16.07. automatisch mit der Live-URL (localhost nur noch Dev-Fallback). Erwartung: Styles unter `DesignBridge/Color/*` + `/Text/*` + Sticker-Sheet-Seite.
3. **Export-Verifikation im Ziel-Repo** (30 Min, gemeinsam): Zielprojekt = **rk-landing lokal** (falls Rob nichts anderes sagt). Live-App → Export-Tab → alle 4 Formate durchklicken (CSS/Tailwind/tokens.json/Figma) + „Ganze Library exportieren" (Zip). Dann bauen wir zusammen `tokens.css`/Tailwind-Config in rk-landing ein und prüfen: baut es, sieht es richtig aus?
4. **Robs Qualitätsurteil Interpretation**: Contact-/Portfolio-Screenshot importieren, Interpretationen anschauen. WICHTIG: Das volle Urteil lohnt erst NACH Testrunde 4 (s. u.) — vorher sind die bekannten Schwächen (Mini-Crops, stille flash-lite-Degradierung) noch drin.

Danach (oder parallel als eigene Runde): **Testrunde 4 = Interpretations-Qualität fixen** — die 7 priorisierten Empfehlungen aus der Diagnose (Session 16.07. oben): Mindest-Crop-Größe/Upscaling → temperature 0–0.2 → Modell-Badge + Degradierungs-Stopp vor flash-lite → Batch-Chunking → DEMO-Kennzeichnung → mergeByName größte bbox → sanitizeHtml externe Bilder. Gut subagent-orchestrierbar (Muster von Runde 3).

## Wiedereinstiegs-Prompt (nächste Session)
> „Designbridge: Lies RESUME.md. Testrunde 3 ist durch (4 Fixes live auf `c14a5a0`, Interpretations-Diagnose liegt vor). Heute ist Robs Test-Session: führe mich Schritt für Schritt durch die Aufgaben unter ‚ROBS AUFGABEN' (DEMO_FALLBACK-Check → Figma-Rundlauf → Export-Verifikation in rk-landing → Interpretations-Urteil), mit Anleitung je Schritt."

**Separater Research-Task angelegt (15.07. spät):** „KI-Modell-Research für Designbridge-Interpretationen" — vergleicht Gemini-Tiers/Claude/Alternativen nach Treffsicherheit, Kosten und Payment-Hürde (Robs Anthropic-Payment scheitert an der Bank-Verifizierung; Ausweg prüfen, z. B. bezahlter Gemini-Tier). Deliverable: Entscheidungs-Doc unter docs/. Letzte Fixes Runde 2 (`443d6c2`): gleichnamige Bausteine werden verschmolzen (3× „button" → 1 mit Varianten) + Icon-Regel im Interpret-Prompt (keine grauen Platzhalter-Kästchen mehr). Robs Vergleichs-Import des Contact-Screenshots steht noch aus.
