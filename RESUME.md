# Designbridge — Schnellstart-Spickzettel

Stand: **17.07.2026 Nachtschicht (Quota-Bremse + Modell-Research)** — **🚀 APP IST LIVE: https://designbridge-production.up.railway.app** mit **echter, dauerhaft kostenloser KI** (Google Gemini Free-Tier). Server **208/208** · Web **355/355** · Plugin-Tests 39/39.

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
- Tests: `npm run test:server` (150) · `cd web && npx vitest run` (303) · Plugin: `cd designbridge-plugin && npm run typecheck && npm run build`
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
> „Designbridge: Lies RESUME.md. Nachtschicht 17.07. ist durch (Quota-Bremse live, Stand `d308cc7`, Modell-Research-Doc liegt). Heute ist Robs Wiederholungstest ab ~09:00 (Quota-Reset): führe mich Schritt für Schritt durch ‚ROBS AUFGABEN' (Figma-Rundlauf in LEERE Datei → Interpretations-Urteil mit Modell-Badge → Modell-Entscheidung aus dem Research-Doc), mit Anleitung je Schritt. Danach optional: Gemini-Pro-A/B-Test via GEMINI_MODEL."

**Separater Research-Task angelegt (15.07. spät):** „KI-Modell-Research für Designbridge-Interpretationen" — vergleicht Gemini-Tiers/Claude/Alternativen nach Treffsicherheit, Kosten und Payment-Hürde (Robs Anthropic-Payment scheitert an der Bank-Verifizierung; Ausweg prüfen, z. B. bezahlter Gemini-Tier). Deliverable: Entscheidungs-Doc unter docs/. Letzte Fixes Runde 2 (`443d6c2`): gleichnamige Bausteine werden verschmolzen (3× „button" → 1 mit Varianten) + Icon-Regel im Interpret-Prompt (keine grauen Platzhalter-Kästchen mehr). Robs Vergleichs-Import des Contact-Screenshots steht noch aus.
