# Designbridge — Schnellstart-Spickzettel

Stand: **08.07.2026 (spät)** — **Kurskorrektur: NICHT Figma-Export, sondern Interpretations-QUALITÄT.** Rob hat gesehen, dass die KI-Interpretation „fahrig" ist (Stat Card ≈ Line Chart Card, beide nicht getroffen; Donut näher dran). Ursache am Code verifiziert = **zwei Lecks**: (1) **Routing** — Template-Gate `/card|tile|panel/` kapert inhaltstragende Karten auf ein generisches Card-Template, bevor die KI sie sieht; (2) **Grounding** — Interpret bekommt nur das GANZE Bild + Namen, keinen Ausschnitt. Robs Kern-Einsicht: **erst die Quelle in abgegrenzte Einzelteile zerlegen, dann interpretieren.**

**Neuer Plan (im Brainstorm 08.07. mit Rob freigegeben, Option C „saubere Architektur"):** quellen-agnostische **Decompose-Stufe** (ein `Segment`-Contract + `Decomposer`-Interface; Bild jetzt, URL später), 3 Scheiben: ① Bild-Zerlegung (diese Session) → ② URL/DOM → ③ Figma-Export + Design-System heben.

**✅ SCHEIBE ① FERTIG GEBAUT (autark, subagent-getrieben) — wartet auf Robs Review + Merge-Entscheidung.** Branch `feat/source-decomposition-slice1`, **NICHT gepusht, NICHT gemergt** (kein Push ohne Robs OK, CLAUDE-Regel 5). Spec `346f41a`, Plan `b352938` auf `main`.
- **Tasks 0–9 alle erledigt**, je einzeln committet. **Server 104/104 + Web 156/156 grün, Plugin typecheck+build sauber.**
- **Finaler Gesamt-Review (frische Augen, Sonnet): „ship-ready"** — keine bestätigten Bugs, Spec-treu, keine entkernten Tests. Ein low-severity Edge-Case gefixt (`cropVisual` warf bei bbox exakt am Bildrand → jetzt geclampt; `bounds` auf 0..1 normiert). Commit `feat/source-decomposition-slice1` ~12 Commits.
- **Browser-Smoke (DEMO) bestanden & per Screenshot belegt:** Stat Card rendert jetzt eine echte Metrik-Kachel, Line Chart Card ein echtes Liniendiagramm — zwei **distinct** interpretierte iframe-Vorschauen (`sandbox="allow-scripts"`) statt der früher identischen leeren Karte. Leck 1 sichtbar behoben. Echte Backend-Kette Scan→Interpret (durch die neue Decompose-Route) end-to-end über den Proxy verifiziert.
- **Was gebaut wurde:** `Segment`-Contract + `getDecomposer()`-Fabrik (`server/lib/decompose/`), `ImageDecomposer` (jimp-Crop), Scan liefert `bbox` (+ injizierbarer Client), `interpretComponents` = Multi-Image-Call (Crop je Segment + Vollbild-Fallback), Route decompose→interpret, Web reicht bbox durch, Routing-Fix (inhaltstragende Karten → Interpretation), Demo-Fixtures (bbox + Stat/Line-Chart-Card). Test-Glob → `server/**` (Fix für decompose-Subdir).
- `jimp@0.22.12` gepinnt (reines JS, kein native Build).

⚠️ **CREDITS-VORBEHALT (weiterhin offen — Account-Problem):** Alles gebaut + unit-getestet + Demo grün, aber die **reale Live-Treffsicherheit an einem echten Screenshot ist erst mit aufgefüllten Credits verifizierbar.** Im Demo-Modus wirft der Live-Vision-Call → Fixture-Fallback; die echte Decompose→Crop→Multi-Image-Kette läuft zwar (jimp lokal), das Crop-Ergebnis wird demo-seitig aber verworfen. → Erster Live-Test, sobald Credits da sind.

**Nachtrag 09.07. (credit-freie Politur nach Robs Feedback beim Testen, alles auf demselben Branch):**
- **Betriebsfehler geklärt:** „Import failed / Unexpected end of JSON input" bei Bild+URL+Testseite = **Backend lief nicht** (nur Web auf 5173, nichts auf 3047). Fix = Backend starten; Faustregel bis Credits: **immer `npm run dev:demo`** (startet beide), nie nur `npm run web`.
- **Template-Bugs gefixt** (Hand-Templates, nicht KI): Icon Button hat jetzt ein Icon (Vorschau **und** generierter Code = `IconButton` mit svg/aria-label); button `secondary`≠`ghost` (ghost = Akzentfarbe randlos, secondary = Rahmen+neutral), synchron in Vorschau/Code/Figma-Plan.
- **Interpret-Prompt gehärtet** für Robs Chart-Klagen (Zahlen/Achsen/Legende/Tooltip/aktive Zustände verbatim aus dem Crop) — **wirkt erst mit Credits**, per Prompt-Test gesichert, bewusst KEINE Fixture-Aufhübschung (kein Vortäuschen).
- Stand grün: **Server 105/105 · Web 161/161**. Branch ~19 Commits vor origin, weiterhin LOKAL/ungepusht.
- ⚠️ Rob kommt an die **Credits weiterhin nicht ran (Account-Problem)** → der echte Chart-/Interpretations-Test bleibt offen bis dahin.

**Nächste Schritte für Rob:** (1) Spec+Plan+Diff reviewen; (2) entscheiden: Branch mergen/pushen? (3) sobald Credits: Live-Import eines echten Screenshots gegen die neue Kette prüfen (Chart-Fidelity!). Danach ggf. Scheibe ② (URL/DOM-Decompose, `node-html-parser` liegt bereit) oder ③ (Figma-Export).

---
## Alter Stand (Referenz): „Visuelle Interpretation Slice 1" KOMPLETT, GEMERGT & GEPUSHT auf `origin/main` (`abfcc5f`). Server 93/93 + Web 152/152 grün. Feature-Branch `feat/visual-interpretation-v1` lokal (redundant).

## ⏱️ ERSTER PUNKT NÄCHSTE SESSION: Richtung mit Rob bestätigen, dann bauen
- **Slice 1 ist live.** `npm run dev:demo` starten (Backend mit `DEMO_FALLBACK=1` + Web), http://localhost:5173, Bild importieren → KI-Vorschauen in der Library. ⚠️ Ohne laufendes Backend schlägt der Import fehl (das war der „Try again geht nicht"-Fehler am 08.07.).
- **EMPFEHLUNG = Slice 2: KI-interpretierte Bausteine nach Figma exportieren** (vollendet die Brücke Quelle→Library→**Figma**; Slice 1 hatte das bewusst weggelassen, iframe-Rendering war das Fundament dafür). **Startet mit Brainstorm** (Regel: erst Richtung/Referenzen), dann Spec+Plan, dann subagent-getrieben (Sonnet-Implementer+Reviews, Opus-Koordination+Browser-Verify — Muster hat 08.07. real Bugs gefangen). **Architektur-Kernfrage fürs Brainstorm:** Phase-5.2-Emitter rendert Figma aus `plan` (box+text), KI liefert aber `html/jsx` → drei Optionen: (a) html/jsx → plan konvertieren, (b) gerenderte Komponente als Bild/Image-Fill nach Figma, (c) KI direkt box+text-plan generieren lassen.
- **Leichtere Alternativen (falls kleinere Session gewünscht):** (A) **Feinschliff Slice 1** — die 3 Fast-Follows unten wegräumen (schnell, risikoarm); (B) **weitere Quellen** URL/Repo interpretieren (inkl. „erkennbares Design-System → echte Komponenten heben"-Logik, mehr Umfang).
- **Rob-Interaktion:** in Prosa fragen, kein Multiple-Choice-Widget; Modellwahl je Aufgabe nennen ([[feedback-model-choice-transparency]]); nicht ohne Briefing designen ([[feedback-design-direction]]).
- **Was live ist:** Bild-Import → Bausteine ohne Template bekommen automatisch eine KI-interpretierte shadcn/Tailwind-Vorschau in der Library, gerendert im sandboxed `<iframe sandbox="allow-scripts">` (kein same-origin), gelbe Pille „von KI interpretiert", Code-Bereich zeigt das `jsx`, Retry bei Fehler. Ein Vision-Call pro Import. Alles mit `DEMO_FALLBACK=1` (Credits LEER).
- **Subagent-Muster hat sich bezahlt gemacht** — die Reviews + der Browser-Smoke fingen **3 echte Bugs** (alle plan-vererbt): Bild-Leak/Hang im scan DEMO-Fallback (`35d18de`), Prozess-Crash im interpret DEMO-Fallback (`b4ad5f1`), und — nur end-to-end sichtbar — eine **Interpret-Endlosschleife** durch instabile `onImported`-Referenz im ImportModal-useEffect (`a57f0d4`). Plus StrictMode-Doppel-POST beim Retry (`d2e6812`) und XSS-Sanitizer-Härtung (`a377219`).
- **Offene Feinschliff-Kandidaten (NICHT blockierend, bewusst nicht im Slice gefixt):** (1) Retry ist Batch-weit statt pro-Baustein (Slice-1-Absicht); (2) „generischer Stub"-Chip zeigt sich gleichzeitig mit „Wird interpretiert …"/Fehlerzeile (optisch doppelt); (3) Stale-Closure-Race bei überlappenden Importen (schmales Fenster). Alle drei als Fast-Follow dokumentiert.
- **Browser-Smoke Step 7 (Fehler+Retry) nur unit-getestet**, nicht voll im Browser durchgespielt — ohne `DEMO_FALLBACK` scheitert schon der Scan (500), sodass man gar nicht in die Library kommt; der Failed/Retry-Zustand ist über die Vitest-Tests (Task 9 + `d2e6812`) abgedeckt.

**Referenz — Umsetzungsmuster (falls weitere Slices):** `superpowers:subagent-driven-development`, Implementer + Reviewer auf **Sonnet** (mechanisch, Code steht im Plan), Koordination + Browser-Verify + finale Abnahme auf Opus/Fable. Plan/Spec: `docs/superpowers/{plans,specs}/2026-07-08-visual-interpretation-slice1*`.

## Was Slice 1 baut (in kurz)
Nach einem **Bild-Import** bekommen alle Bausteine **ohne Hand-Template** automatisch eine **KI-interpretierte shadcn/Tailwind-Vorschau in der Library** — gerendert in einem sandboxed `<iframe>`, markiert mit gelber Pille „von KI interpretiert". Ein **einziger** Claude-Vision-Call pro Import (Bild + Liste aller offenen Bausteine). Fehler fallen weich auf den heutigen Platzhalter zurück („Erneut versuchen"). Figma-Export der KI-Bausteine ist bewusst NICHT in Slice 1 (nächste Scheibe; das iframe-Rendering ist deren Fundament).

Task-Bögen: **1–5 Server** (`imageStore` → Scan gibt `meta.import_id` → `interpretComponents` (der Vision-Call) → Demo-Fixture `demo-interpretations.json` → Route `POST /api/interpret/components`). **6–10 Web** (`interpret.js` Orchestrierung → `InterpretedPreview` iframe + `SourcePill`-Variante → `emitComponents` merged html/jsx → `LibraryObjectList` Vorschau/Laden/Retry → `App.jsx`+3 Seiten verdrahten). **11** Full-Verify + Browser-Smoke (Erwartung: Server 90/90, Web >140).

## Grundprinzipien (Robs Vision — im Brainstorm 08.07. bestätigt, in Spec §„Grundprinzipien")
- **Invarianter Weg:** Quelle → **technisches Repository (Library)** → Figma. Nie direkt Quelle→Figma. Library = echte, editierbare technische Artefakte, keine toten Pixel.
- **„Visuelle Referenz" = technisches Abbild sichtbar gemacht**, KEIN Screenshot-Crop.
- **Auslöser für Interpretation = KEIN erkennbares Design-System/Komponenten-Bibliothek in der Quelle** (nicht die Medienart). Erkennbar → echte Komponenten heben (spätere Scheibe). Nicht erkennbar → interpretieren, so nah wie möglich am Original, in echte technische Form.
- **Ziel-System gephast:** jetzt fix **shadcn+Tailwind** → später wählbar pro Import → Fernziel erkannt/gematcht.
- **Motor: Hybrid** (Hand-Templates + KI-für-Rest); ausdrücklich die Auffahrt zu „KI für alles" (Regler hochdrehbar, gute KI-Ergebnisse können als Templates „einrasten").

## Git-Stand
- Auf `main`, Working Tree sauber. **Phase 5.2 gepusht** (`origin/main` = `d688c69`).
- **3 lokale Doku-Commits auf `main`, UNGEPUSHT:** `b88e892` (Spec), `2da0d31` (CLAUDE-Regel Modellwahl), `69fdc48` (Plan). Push mit Robs OK (oder mit dem fertigen Feature zusammen).
- Neuer Feature-Branch entsteht in Task 0.

## App starten / Tests
- **Einfachster Weg (Rob): `npm run dev:demo`** — startet Backend (mit `DEMO_FALLBACK=1`, Port 3047) + Web (:5173) in einem Befehl, dann http://localhost:5173 öffnen. Credits LEER → der Demo-Modus ist zwingend, sonst scheitert schon der Scan. ⚠️ **Ohne laufendes Backend schlägt jeder Import fehl** („Fehler / Try again geht nicht" = Backend down).
- Manuell/getrennt (für Entwicklung): Backend `DEMO_FALLBACK=1 PORT=3047 node server/index.js` · Web `cd web && npm run dev`.
- `npm run test:server` (aktuell 77/77) · `cd web && npx vitest run` (aktuell 127/127) · Plugin: `cd designbridge-plugin && npm run typecheck && npm run build`.
- Repo-Regel 7: nach Datei-Writes `find . -name '._*' -delete` (AppleDouble).

## Phase 5.2 (Vorgänger) — FERTIG, GEMERGT, GEPUSHT 08.07.
Components/Patterns → echte Figma-Komponenten (Component Sets, Platzhalter, Seite „🌉 DesignBridge"). Tasks 1–12, subagent-getrieben. Rob-Figma-Test: Tokens/Farben/Typo perfekt; Bausteine ohne Template = „Vorlage fehlt"-Platzhalter (= vereinbarter v2-Scope, GENAU das behebt Slice 1). Plugin = für Rob nur Übergangslösung. `origin/main` = `d688c69`.

## Wichtige Dateien
- Plan/Spec Slice 1: `docs/superpowers/plans/2026-07-08-visual-interpretation-slice1.md` · `docs/superpowers/specs/2026-07-08-visual-interpretation-slice1-design.md`
- Integrationspunkte (im Plan referenziert): `server/routes/scan.js`, `server/lib/{figmaExportStore,recognizeWithAi,claude}.js`, `server/index.js`, `web/src/lib/{useImportSession,libraryStore}.js`, `web/src/lib/emit/emitComponents.js`, `web/src/lib/components/templates/registry.js`, `web/src/components/library/{LibraryObjectList,SourcePill}.jsx`, `web/src/App.jsx`, `web/src/pages/{Atomics,Components,Patterns}.jsx`
- Arbeitsregeln: `CLAUDE.md` (NEU: Modellwahl je Aufgabe analysieren + Rob transparent nennen)
