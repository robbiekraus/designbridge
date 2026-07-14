# Designbridge — Schnellstart-Spickzettel

Stand: **14.07.2026** — **✅ REPO-DECOMPOSE v1 + beide Fast-Follows FERTIG, GEPUSHT** (`origin/main` = `b391705`). Working Tree sauber, `main` == `origin/main`. Zweig A ist bis auf reine Kosmetik (Donut) abgearbeitet.

> ## 🔀 WEGGABELUNG — hier startet die nächste Session (Rob wählt EINEN Zweig)
> Die letzte *funktionale* Lücke ist zu (alle 3 Quellen Bild/URL/Repo haben die interpretierte Referenz). Ab hier zwei mögliche Richtungen — Rob entscheidet zu Beginn:
>
> **Zweig A — App verbessern (Code).** ✅ Beide dokumentierten Fast-Follows sind erledigt & gepusht (14.07., `2c18530`): FF1 `deepenRepoWithAi`/`path` (neue `applyBaselinePaths`, per Name aus Baseline zurückgemappt, dann geliftet — server 136/136) und FF2 Template-Namens-Kollision (`lifted` überspringt `matchTemplate` → kein generisches Template, Interpret-Knopf sichtbar, echter Code maßgeblich — web 301/301, im Browser an `CardSkeleton`/taxonomy bestätigt). Auch erledigt: Plugin-„Sprint 2"-Branding entfernt (`b391705`). **Noch offen (reine Kosmetik):**
> - Donut-Feinschliff (Fixture-Kosmetik): Ring gestreift statt drei sauberer Bögen 55/25/20 — Segment-SVG in `demo-interpretations.json`. Braucht Robs visuelles OK.
> - Robs html.to.design-Zielbild fürs Fidelity-Fazit (Robs Beitrag).
>
> **Zweig B — Markt-Vergleich & Naming (Strategie, kein Code).** Positionierung, bevor irgendwas veröffentlicht wird:
> - **Naming-Konflikt (WICHTIG):** auf Figma existiert schon ein Plugin **„Design-bridge"** („Stop rebuilding design systems by hand", 72 Nutzer) — quasi identischer Name + Versprechen; dazu „BI Bridge - Design to Data". → evtl. neuer App-Name, um nicht in Querelen zu geraten.
> - **Tool-Vergleich:** html.to.design + das „Design-bridge"-Plugin — was tun sie, was übernehmen wir, wo sind wir besser/schlechter, wie grenzen wir uns ab?
> - Startet mit Recherche/Brainstorm (Visual Companion anbieten), Output = ein Positionierungs-/Naming-Dokument, kein Code.
>
> Beide Zweige sind unabhängig; Reihenfolge ist Robs Wahl. Meine Tendenz: **B zuerst** (ein Name-Konflikt wird teurer, je später man ihn anfasst; die App ist funktional fertig genug, um sie zu positionieren) — aber A ist genauso legitim, wenn Rob lieber am Produkt weiterbaut.

## Repo-Decompose v1 — GEMERGT & GEPUSHT (`origin/main` = `760d32b`, 17 Commits + 3 Doku-Commits)

**Was & warum:** Die letzte offene Quelle — das Code-Repository — bekommt dieselbe „interpretierte Referenz je Baustein" wie Bild/URL, aber nach dem Prinzip **„erkennbares Design-System → echten Code heben, nicht interpretieren"**. Beim Repo-Import wird der echte Quellcode der Komponenten gehoben (Pille „aus Repo gehoben", echter Code + echter Dateiname sichtbar). KI-Interpretation läuft **nur auf Knopfdruck** (pro Baustein „Mit KI interpretieren" + Batch „Alle interpretieren"), nie automatisch. Spec `docs/superpowers/specs/2026-07-14-repo-decompose-v1-design.md`, Plan `docs/superpowers/plans/2026-07-14-repo-decompose-v1.md`. Subagent-getrieben (Sonnet-Implementer + Reviews, Opus-Koordination/Smoke/Abnahme).

**Architektur (Wiederverwendung war der Hebel):** `repoStore` (ephemer, Muster pageStore) · `repoDecomposer` + `liftRepoInventory` (hängt `structure.code` an, capped 8k) · `repoInventory` trägt `path` · `interpretComponents` versteht `structure.code` · Scan `/repo` + `/repo/ai` heben Code + `import_id` · Interpret-Route dritter Zweig `repo` · Web: `emitComponents` (`lifted`-Flag/echter Code/Dateiname), `SourcePill` (`lifted`), `LibraryObjectList` (Pille + Per-Baustein-Knopf), neu `InterpretAllBar` (Batch), `App.jsx` (Auto-Interpret bleibt auf image/url). `htmlToPlan` (Scheibe ③ v2) trägt interpretierte Bausteine automatisch nach Figma.

**Stand grün:** Server **133/133** · Web **300/300** · `vite build` sauber. **Browser-Smoke bestanden** (echtes `shadcn-ui/taxonomy`): 30/30 Components + 37/37 Atomics mit echtem Code gehoben, „aus Repo gehoben"-Pillen + echte Dateinamen (`callout.tsx`…), Per-Baustein-„Mit KI interpretieren" rendert die iframe-Vorschau live (Callout), Batch „Alle interpretieren" feuert (Demo-Fixture deckt 5–6 ab, Rest sauber „failed", kein Crash), kein „generischer Stub"-Chip bei gehobenen Bausteinen. Demo-Fixture `server/fixtures/demo-repo-interpretations.json` (Alert/Avatar/Callout/EmptyPlaceholder/CardSkeleton/BillingForm).

**Smoke-Bugfix (echter, plan-vererbter Bug):** `extractRepoFiles` gab für `isComponentFile` (Kategorie Components) `content:''` zurück — nur `components/ui/*` (Atomics) bekamen Inhalt. Gefixt (`1614161`): Komponenten-Dateien werden jetzt mitgelesen, Seiten/Layouts bleiben pfad-only.

**Final-Review (frische Augen) → mergefähig.** Ein Hang-Blocker gefunden & gefixt (`ea5466b`): „Mit KI vertiefen" bei Repo verlor `import_id` → Batch hing in „wird interpretiert …"; Fix (A) `/repo/ai` hebt Code + `import_id` wie `/repo`, Fix (B) Batch-Handler setzt `interpretPending` zurück wenn `runInterpretation`→null.

**Fast-Follows — Stand:**
1. ✅ **ERLEDIGT (`2c18530`) — `deepenRepoWithAi` droppt `path`:** neue `applyBaselinePaths(items, baseline)` in `repoDecomposer.js` mappt `path` per Name aus der Rule-Baseline auf die merged Items zurück, `/repo/ai` ruft sie vor `liftRepoInventory`. Grenze: KI-*umbenannte* Bausteine (Name ≠ Baseline-Name) matchen nicht und verlieren ihren Code — akzeptiert (credit-gated & optional). Test-first (server 136/136).
2. ✅ **ERLEDIGT (`2c18530`) — Template-Namens-Kollision:** `emitComponents` überspringt `matchTemplate` bei `lifted` (`tpl = lifted ? null : matchTemplate(name)`) → `hasPreview=false`, Interpret-Pfad offen, echter Code + Dateiname maßgeblich. Test-first (web 301/301) + im Browser an `CardSkeleton`/taxonomy bestätigt.
3. **NOCH OFFEN, kleinere:** leerer Datei-Inhalt (`''`) → `lifted=false` (Boolean-Falle in `emitComponents`); Interpret-Route ruft `decompose` ohne `cap` (effektiv durch extractRepoFiles ~8k begrenzt); Patterns landen ohne Material im Batch-Todo (→ „failed", kein Crash).

**Wiedereinstieg: siehe die 🔀 WEGGABELUNG oben** — Rob wählt Zweig A (App verbessern / Fast-Follows) oder Zweig B (Markt-Vergleich & Naming). Beides ist gepusht-unabhängig; nichts hängt mehr.

---

## Vorgänger-Referenz — Scheibe ③ v2 (am 14.07. zu Session-Beginn gemergt & gepusht)
Scheibe ③ v1 wurde am 13.07. gemergt/gepusht. Scheibe ③ v2 (HTML→Figma über berechnete Stile) + der scan-upload-Fix wurden zu Beginn dieser Session per ff-Merge auf `main` gebracht & gepusht (`origin/main` = `c98fcff`). Details unten (historisch).

## Scheibe ③ v2 — Konverter über computed styles (Branch `feat/scheibe3-v2-computed-style`, LOKAL, ungepusht, 5 Commits)

**Warum überhaupt v2:** Nach dem v1-Merge machte Rob den Figma-Rundlauf — Ergebnis „miserabel" (Charts leer, Tooltip = schwarzes Quadrat, Balken alle gleich hoch, Buttons/Segmented flach). Ursache am Code + empirisch im Browser verifiziert: v1-`htmlToPlan` las via `DOMParser` (abgekoppeltes Doc, **kein Layout/kein computed style**) nur ein Tailwind-Klassen-Subset. Und: Tailwind-**arbitrary-Werte** (`bg-[#4263EB]`) resolven in der Haupt-App gar nicht (nur die Library-**Vorschau** stimmte, weil sie im iframe die Tailwind-Play-CDN lädt). **Entscheidung Rob (13.07.):** Austauschformat = **Inline-Styles**; Konverter liest echte `getComputedStyle`-Werte. html.to.design als Ziel-/Messlatte (Rob liefert Vergleichsbild — noch offen).

**Was gebaut wurde (Spec `docs/superpowers/specs/2026-07-13-scheibe3-v2-computed-style-design.md`; Sonnet-Implementer parallel Web/Plugin, Opus-Koordination+Review, E2E-Verifikation im echten Browser durch Opus):**
- **Web-Konverter** `htmlToPlan.js`: Offscreen-Mount in echten DOM + `getComputedStyle`; emittiert width/height/gap/strokeWeight/primaryAlign/counterAlign/align/lineHeight; externe SVG-Refs vor dem Mount gestrippt; wirft nie (try/finally-Cleanup).
- **Plugin** `parsePayload.ts`+`renderPlan.ts`: Plan-Vertrag um o.g. Felder erweitert (optional, tolerant validiert, rückwärtskompatibel); Renderer setzt Sizing (FIXED+resize nach Kindern), itemSpacing, Alignment, text-align, lineHeight. Statuszeile zeigt jetzt Skip-**Gründe** (vorher nur Anzahl).
- **Format-Umstellung** `interpretComponents.js`-Prompt (`html`=Inline-Styles, `jsx` bleibt Tailwind) + alle **14 Demo-Fixtures** neu geschrieben & angereichert (Achsen, Wert-Labels, Legenden, Zustände).
- **E2E-Fund gefixt:** Payload ~150 kb > `express.json`-100kb-Default → 413; Limit auf 2 mb.

**Rob-Rundlauf-Fixes (14.07., je test-first + payload-verifiziert):**
- `1ca54d5` **semantische Slot-Wahl** (`pickTokens`/`pickTokenRefs`): surfaceMuted griff `foreground-muted` (Textfarbe → dunkler „disabled"-Search-Input); Font-Slot nahm das erste (Display-)Token → 32px-Riesen-Labels. Jetzt Flächen-Rollen bzw. Body-Font.
- `9070c95` **Icon Button** bekommt echtes Plus-Icon-SVG statt Text-Kopie (planFor kannte den Icon-Fall nicht, emit längst).
- `90b7e11` **Tooltip-Schwanz** als Inline-SVG-Dreieck statt `transform:rotate`-Quadrat (Konverter kennt kein transform); Regel auch im Live-Prompt.

**Stand grün:** Server **120/120** · Web **291/291** · Plugin **34/34** + typecheck/build. **Von Rob in Figma bestätigt (14.07.):** Tooltip mit echter Sprechblasen-Spitze, Segmented Control mit aktivem Segment, Category-List mit farbigen Fortschrittsbalken, Balkenhöhen individuell, Search-Input hell, Button-Text weiß, Icon Button ≠ Button. Plugin-`dist/` neu gebaut (14.07. 09:57).

**Wichtige Betriebsnotiz (Figma-Rundlauf):** Nach API-Neuaufbau der Komponenten zeigt die Seiten-**Canvas** manchmal einen veralteten Raster-Stand, während das **Assets-Panel** korrekt rendert — kein Bug, Canvas mit `Cmd+0`/`Cmd+2` (zoom) oder Datei neu öffnen „wecken". Dev-Plugin nur in **Figma-Desktop**, Start via Rechtsklick-Canvas → Plugins → Entwicklung (Suche zeigt Dev-Plugins unzuverlässig). Bei „Fehlendes Manifest": `manifest.json` neu importieren.

**Offen / nächste Schritte für Rob:**
1. **Merge/Push-Entscheidung für ZWEI Branches** (Regel 5 — bewusst nicht gepusht): `feat/scheibe3-v2-computed-style` (5 Commits, diese Arbeit) **und** `fix/scan-upload-error-handling` (`95f529a`, Nicht-Bild-Upload → lesbarer 400-Fehler statt Safari-„string did not match"). Reihenfolge egal, beide sauber von `main`.
2. **Donut-Feinschliff** (Fixture-Kosmetik): Ring ist noch gestreift statt drei sauberer Bögen 55/25/20 — Segment-SVG in `demo-interpretations.json` überarbeiten. Rein optisch, kein Code-Bug.
3. **html.to.design-Zielbild** danebenlegen für das ehrliche Fidelity-Fazit (Robs Beitrag).
4. Danach LETZTE Scheibe: **Repo-Decompose**.
5. Kosmetik-Kleinkram: Plugin-Panel sagt noch „Sprint 2 — Codegen + Sync" (altes Branding).

---
## Alter Stand (Referenz)

### Scheibe ③ v1 (13.07., gemergt/gepusht auf `origin/main`) — Branch war `feat/figma-export-slice3`
Deterministischer html→plan-Konverter (Klassen-Raten, DOMParser) + Plugin-PlanNodes `svg`/`component-ref`. Von v2 (computed styles) abgelöst, weil das Klassen-Raten in Figma zu dünn war. Details im Git-Log / Spec `2026-07-13-scheibe3-figma-export-design.md`.

### Noch älter

Stand: **10.07.2026 (spät)** — Scheibe ② fertig (siehe unten, inzwischen gemergt).

## Scheibe ② — URL-Import bekommt KI-Interpretation (Branch `feat/url-decompose-slice2`, LOKAL, ungepusht)
Rob hat im Brainstorm 10.07. entschieden: Scheibe ② vor Scheibe ③ (Figma-Export), Repo-Decompose kommt als LETZTE Scheibe. Spec `docs/superpowers/specs/2026-07-10-url-decompose-slice2-design.md` + Plan (8 Tasks) liegen auf `main` (mit gepusht). Slice 1 wurde vorher mit Robs OK auf `main` gemergt UND gepusht (`origin/main` = `146c33a`ff).

**Was gebaut wurde (subagent-getrieben, Sonnet-Implementer + Reviews, Fable-Koordination):** `pageStore` (HTML+CSS ephemer, TTL 15 min, Muster imageStore) · `recognizeComponents` instanzbasiert (`selector`-Pfade `tag:nth-of-type(n) > …` je Baustein + „unerkannte Baustein-Kandidaten" aus wiederholten Klassen-Clustern, max 5) · `UrlDecomposer` in der Fabrik (`structure = {html≤8k, css-Digest≤4k}`, Vollseiten-Fallback bei Selector-Miss) · `interpretComponents` versteht structure-Segmente als Textblöcke (ein Call, gemischt visual+structure, imagePath darf null sein) · Route mit Store-/kind-Weiche + `demo-url-interpretations.json` (deckt die 6 template-losen demo-site-Bausteine: Suche, Formular, Liste, Navbar, Hero, Footer) · Web-Gates in `interpret.js` UND `App.jsx` lassen `source:'url'` durch.

**Stand grün:** Server **117/117** · Web **162/162** · Plugin typecheck+build sauber. **Browser-Smoke bestanden** (URL-Import der demo-site → 6 Bausteine mit gelber Pille „von KI interpretiert", iframe-Vorschau + jsx sichtbar, keine Konsolenfehler; Screenshots in der Session vom 10.07.). Der Smoke fing einen echten Bug: `App.jsx` hatte ein ZWEITES source-Gate, das der Plan übersehen hatte (`0566cc8`).

**Finaler Gesamt-Review (frische Augen, Sonnet): „ship-ready"** — keine Correctness-Bugs, keine neue XSS-Fläche (structure.html geht nur in den Prompt, Ausgabe weiter durch sanitizeHtml + sandbox-iframe), kein Bild-Pfad-Regress, Tests ehrlich. **Bekannte Limitierungen (akzeptiert, Fast-Follow-Kandidaten):** (1) **Kandidaten-Erkennung flutet bei Tailwind/Utility-Klassen** (`items-center` etc. werden Kandidaten und verbrauchen das 5er-Limit — demo-site nutzt semantische Klassen, echte Tailwind-Seiten treffen das; Filter für Utility-Muster nachrüsten); (2) Compound-Klassen doppelt (user-card → Card + Kandidat); (3) cssDigest-Heuristik lossy bei @media/nested braces; (4) Vollseiten-Fallback wird pro Miss-Segment dupliziert (Token-Kosten, falls Misses häufig); (5) Server-Test importiert Web-Registry (Kopplung).

**Nächste Schritte für Rob:** (1) Spec+Plan+Diff reviewen (Branch `feat/url-decompose-slice2`, ~11 Commits); (2) Merge/Push-Entscheidung; (3) sobald Credits: Live-Test an echter fremder URL (dann zeigt sich auch Limitierung 1). Danach: Scheibe ③ (Figma-Export, Architekturfrage plan-vs-jsx offen — Brainstorm nötig) oder Feinschliff.

**Visual-Companion-Absprache:** Rob wollte den Brainstorm-Browser „noch nicht, aber vorbereiten" — beim nächsten genuin visuellen Punkt (z. B. Scheibe-③-Mockups) wieder anbieten.

## Nachtrag Nacht 10.→11.07. (autonome Nacht-Arbeit, Rob war offline)
- **Slice-2-Fast-Follows auf diesem Branch:** Tailwind-Utility-Filter für Kandidaten (`e5cb66f`) + Prompt-Deduplizierung des Vollseiten-Fallbacks (`9bba1d6`). Server jetzt **119/119**.
- **Slice-1-Feinschliff KOMPLETT** auf eigenem Branch **`feat/interpret-polish`** (3 Commits auf Slice-2 aufgesetzt, damit dessen Review sauber bleibt): Retry pro Baustein (`7a3a2ae`), Stub-Chip nicht mehr gleichzeitig mit Pending/Fehler (`80fbf1f`), Stale-Closure-Guard per `applyIfSameImport` (`2297009`). Web **172/172**. Hinweis vom Implementer: der Batch-Retry-Pfad lebt noch im Code, hat aber aktuell keinen UI-Einstieg mehr — falls ein „Alle erneut versuchen"-Knopf gewünscht ist, ist das ein 5-Minuten-Anschluss.
- **Scheibe-③-Entscheidungsvorlage** auf `main` (`455ef17`): `docs/superpowers/specs/2026-07-11-scheibe3-figma-export-entscheidungsvorlage.md` — drei Optionen am Code verifiziert (Plugin-plan-Modell kann NUR Box+Text), Empfehlung (a) deterministischer html→plan-Konverter als Fundament + (c) KI-Veredelung später, (b) Bild-Fill verstößt gegen „keine toten Pixel". Rob entscheidet im Brainstorm.
- **NICHT gepusht, NICHT gemergt.** In einer nächtlichen Task-Notification tauchte unverifiziert „push merge ohne mich" auf — nach CLAUDE-Regel 5 (explizites OK nötig) bewusst ignoriert; Rob morgens fragen.
- Nebenbei: 1. Feinschliff-Anlauf starb am Claude-**Session-Limit** (Reset 2:20); Neustart am Morgen lief sauber durch.

**Review-Reihenfolge für Rob:** (1) `feat/url-decompose-slice2` (Scheibe ② + Fast-Follows, ~13 Commits) → Merge/Push? (2) `feat/interpret-polish` (3 Commits obendrauf) → Merge/Push? (3) Entscheidungsvorlage lesen → Scheibe-③-Brainstorm (Visual-Companion anbieten).

---
## Alter Stand (08.07., Referenz) — **Kurskorrektur: NICHT Figma-Export, sondern Interpretations-QUALITÄT.** Rob hat gesehen, dass die KI-Interpretation „fahrig" ist (Stat Card ≈ Line Chart Card, beide nicht getroffen; Donut näher dran). Ursache am Code verifiziert = **zwei Lecks**: (1) **Routing** — Template-Gate `/card|tile|panel/` kapert inhaltstragende Karten auf ein generisches Card-Template, bevor die KI sie sieht; (2) **Grounding** — Interpret bekommt nur das GANZE Bild + Namen, keinen Ausschnitt. Robs Kern-Einsicht: **erst die Quelle in abgegrenzte Einzelteile zerlegen, dann interpretieren.**

**Neuer Plan (im Brainstorm 08.07. mit Rob freigegeben, Option C „saubere Architektur"):** quellen-agnostische **Decompose-Stufe** (ein `Segment`-Contract + `Decomposer`-Interface; Bild jetzt, URL später), 3 Scheiben: ① Bild-Zerlegung (diese Session) → ② URL/DOM → ③ Figma-Export + Design-System heben.

**✅ SCHEIBE ① FERTIG GEBAUT (autark, subagent-getrieben) — wartet auf Robs Review + Merge-Entscheidung.** Branch `feat/source-decomposition-slice1`, **NICHT gepusht, NICHT gemergt** (kein Push ohne Robs OK, CLAUDE-Regel 5). Spec `346f41a`, Plan `b352938` auf `main`.
- **Tasks 0–9 alle erledigt**, je einzeln committet. **Server 104/104 + Web 156/156 grün, Plugin typecheck+build sauber.**
- **Finaler Gesamt-Review (frische Augen, Sonnet): „ship-ready"** — keine bestätigten Bugs, Spec-treu, keine entkernten Tests. Ein low-severity Edge-Case gefixt (`cropVisual` warf bei bbox exakt am Bildrand → jetzt geclampt; `bounds` auf 0..1 normiert). Commit `feat/source-decomposition-slice1` ~12 Commits.
- **Browser-Smoke (DEMO) bestanden & per Screenshot belegt:** Stat Card rendert jetzt eine echte Metrik-Kachel, Line Chart Card ein echtes Liniendiagramm — zwei **distinct** interpretierte iframe-Vorschauen (`sandbox="allow-scripts"`) statt der früher identischen leeren Karte. Leck 1 sichtbar behoben. Echte Backend-Kette Scan→Interpret (durch die neue Decompose-Route) end-to-end über den Proxy verifiziert.
- **Was gebaut wurde:** `Segment`-Contract + `getDecomposer()`-Fabrik (`server/lib/decompose/`), `ImageDecomposer` (jimp-Crop), Scan liefert `bbox` (+ injizierbarer Client), `interpretComponents` = Multi-Image-Call (Crop je Segment + Vollbild-Fallback), Route decompose→interpret, Web reicht bbox durch, Routing-Fix (inhaltstragende Karten → Interpretation), Demo-Fixtures (bbox + Stat/Line-Chart-Card). Test-Glob → `server/**` (Fix für decompose-Subdir).
- `jimp@0.22.12` gepinnt (reines JS, kein native Build).

ℹ️ **Credits: offener Nice-to-have, KEIN Blocker** (siehe Nachtrag 10.07. unten). Alles gebaut + unit-getestet + Demo grün. Was ohne Credits offen bleibt: die **reale Live-Treffsicherheit an einem echten Screenshot** — die kann erst mit aufgefülltem Guthaben verifiziert werden. Im Demo-Modus wirft der Live-Vision-Call → Fixture-Fallback; die echte Decompose→Crop→Multi-Image-Kette läuft zwar (jimp lokal), das Crop-Ergebnis wird demo-seitig aber verworfen. → Live-Test folgt, sobald Credits da sind — blockiert aber nicht den weiteren Bau.

**Nachtrag 09.07. (credit-freie Politur nach Robs Feedback beim Testen, alles auf demselben Branch):**
- **Betriebsfehler geklärt:** „Import failed / Unexpected end of JSON input" bei Bild+URL+Testseite = **Backend lief nicht** (nur Web auf 5173, nichts auf 3047). Fix = Backend starten; Faustregel bis Credits: **immer `npm run dev:demo`** (startet beide), nie nur `npm run web`.
- **Template-Bugs gefixt** (Hand-Templates, nicht KI): Icon Button hat jetzt ein Icon (Vorschau **und** generierter Code = `IconButton` mit svg/aria-label); button `secondary`≠`ghost` (ghost = Akzentfarbe randlos, secondary = Rahmen+neutral), synchron in Vorschau/Code/Figma-Plan.
- **Interpret-Prompt gehärtet** für Robs Chart-Klagen (Zahlen/Achsen/Legende/Tooltip/aktive Zustände verbatim aus dem Crop) — **wirkt erst mit Credits**, per Prompt-Test gesichert, bewusst KEINE Fixture-Aufhübschung (kein Vortäuschen).
- Stand grün: **Server 105/105 · Web 161/161**. Branch ~19 Commits vor origin, weiterhin LOKAL/ungepusht.
- ℹ️ Rob kommt an die **Credits weiterhin nicht ran (Account-Problem, ungeklärt ob Zahlung/Zugriff/Sperre)** → der echte Chart-/Interpretations-Live-Test bleibt bis dahin offen. Das blockiert laut Nachtrag 10.07. aber NICHT den weiteren Bau (Kernfunktionen sind 0-Credit-fähig).

**Nächste Schritte für Rob:** (1) Spec+Plan+Diff reviewen; (2) entscheiden: Branch mergen/pushen? (3) unabhängig davon: Scheibe ② (URL/DOM-Decompose, `node-html-parser` liegt bereit) oder ③ (Figma-Export) angehen — muss NICHT auf Credits warten. (4) Sobald Credits da sind: Live-Import eines echten Screenshots gegen die neue Kette prüfen (Chart-Fidelity) — als Nachtrag, kein Gate.

## Nachtrag 10.07. — Credit-Status gecheckt: kein Blocker, sondern Architektur-Prinzip
Rob hat Rückmeldung von der Schule: der aktuelle Stand braucht die API-Credits eigentlich gar nicht. **Live gegen die Anthropic-API geprüft (minimaler Call): Guthaben ist weiterhin leer** (`credit balance is too low`), Key selbst funktioniert. Aber die Schule hat recht — Analyse der Routen bestätigt: **Kernfunktionen sind by design 0-Credit-fähig**, das ist keine Ausnahme sondern die bewusste Architektur-Entscheidung aus [ADR-001](docs/superpowers/adr/ADR-001-repo-ingester-quelle.md) (Lehre aus dem Credit-Ausfall bei der Demo am 24.06.2026 — Memory `project_designbridge_demo_2026-06-24`): „KI ist Veredelung auf Knopfdruck, nie Grundvoraussetzung."

Route-für-Route-Bild:
- **0 Credits, immer:** `/api/scan/url`, `/api/scan/repo` (beide rein deterministisch), Figma-Export/Emitter (kein Claude-Call im ganzen Modul).
- **Braucht Credits, hat aber Fixture-Fallback mit `DEMO_FALLBACK=1`:** `/api/scan/image`, `/api/interpret/components` — mit `npm run dev:demo` läuft die komplette App durch, nur eben mit Fixture- statt Live-Vision-Daten.
- **Braucht Credits, ist aber explizit optional/on-demand:** `/api/scan/url/ai`, `/api/scan/repo/ai` („Mit KI vertiefen"-Knopf).

**Konsequenz:** Der einzige tatsächlich credit-abhängige Rest ist die Live-Fidelity-Verifikation der Bild-Interpretation (s.o.) — das war schon immer als Nice-to-have gedacht, nie als Gate. Der Branch-Review/Merge, Scheibe ②/③ und jede weitere Arbeit können unabhängig von Credits weiterlaufen.

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
