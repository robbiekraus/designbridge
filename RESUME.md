# Designbridge — Schnellstart-Spickzettel

Volle Session-Historie (chronologisch, alle „✅ …"-Einträge/Testrunden/Scheiben) liegt in `RESUME-ARCHIVE.md`. Diese Datei ist der schlanke Ist-Zustand.

## Stand

- **20.07.2026 abends:** UI-Feinschliff live gepusht (`e5d893e`, Web **598/598**): (a) Footer volle Breite / fixe App-Shell (`h-screen`, Header+Footer fixe Leisten, `main` scrollt intern); (b) Content-Seiten **Preview-First**: Atoms/Molecules/Organisms = volle-Breite-Zeilen, Vorschau immer offen, Code (+Kopieren/Herunterladen) hinter „Code anzeigen"-Toggle, Organism-Herkunft/Landmarke neben dem Toggle, Templates unverändert Akkordeon; Raster + Höhen-Deckel-Maschinerie entfernt; React-key-Warnung gefixt, Konsole sauber. Spec/Plan: `docs/superpowers/{specs,plans}/2026-07-20-content-pages-preview-first.md`. Nächster offener Kandidat war „T-propagate" — mit diesem Umbau erledigt.
- Davor am selben Tag: Brand-Rollback auf zink (`c63114c`) + orchestrierter Presentation-Ready-Test 6/6 grün; UIPrism-Rebrand-Skin + Bild-Zuverlässigkeit (`628d3ca`/`eb5ecbf`); Breiten-Test Eingabetypen fertig; Architektur-Pivot Scheibe 1–3 (kanonisches `plan`-Modell) komplett; Figma-Reverse-Import v1.
- **App LIVE:** https://designbridge-production.up.railway.app mit **Gemini PAID**. Name/Favicon: UIPrism; Look: zurück auf zink/weiß (kein Indigo/Flieder).
- **Tests:** Server **289/289** · Web **598/598** · Plugin **98/98**.

## Aktives Ziel / Nächste Schritte

- Presentation-Ready-Gate ist erfüllt (6/6 orchestrierter Test grün, 20.07.). Nächster Schritt: sauberer Recording-Fallback-Take (Proben 24.–27.07.), Deck/One-Pager-Screenshots auf zink-Stand erneuern.
- ~~T-propagate (Kachel-/Listen-Muster von Tokens auf Atoms/Molecules/Organisms/Templates übertragen)~~ — ERLEDIGT 20.07. abends im Preview-First-Umbau.
- Offen, klein/Polish: (F) gelber Info-Kasten-Ton (bewusst gelassen); (G) „Quelle: url"-Platzierung (Rob hinterfragt noch); Farb-Spaltenzahl (6) + Farbname-Größe evtl. nachjustieren.
- Dokumentierte, nicht-blockierende Rest-Punkte aus dem Presentation-Test: (a) „Suche"-Component-Ref löst beim Figma-Import nicht auf → 2 leere Fallback-Kästchen; (b) Export-Code-Header + URL/Repo heißen noch „DesignBridge" (Umbenennung bewusst zuletzt); (c) Bild-Test lief über den Server-Endpoint, nicht den vollen UI-Upload+Interpret-Klickweg — Rob kann das bei Bedarf selbst eyeballen.
- Post-Präsentation-Kandidaten (Roadmap, priorisiert nach Rob):
  1. Rekursive Zerlegung („Kleinteile aus Organismen ziehen") — Organismen in wiederverwendbare Sub-Bausteine zerlegen (Sidebar Nav Item, KPI-Card-Muster). Bewusst NICHT vor der Präsentation gebaut; erprobt auf Branch `experiment/rekursive-zerlegung`.
  2. Developer-Empfangsseite (Storybook/shadcn) — braucht eigenen Brainstorm/Spec mit Rob.
  3. Chart-Trend-Linie Breiten-Determinismus: Ursache belegt (verschachtelter Flex-Body mit `overflow:clip` huggt statt zu stretchen, kein SVG-Sizing-Problem) — eigene delikate Scheibe, sauber speccen+TDD+Figma-verifizieren.
  4. UI-Layout-Redesign — bleibt Post-Präsentation.
  5. Umbenennung (URL/Repo/Ordner) — ganz zuletzt, da URL im Plugin hartkodiert ist.
  6. Kleinere offene Nebenthreads: Margins vom Konverter ignoriert (#2); `<hr>`-Trenner/Storage-Progress-Höhe (Status von `task_9b25b9de` beim Wiedereinstieg prüfen); Tabellen-Spaltenraster; Figma-Seiten-Namespacing pro Import; Export-Zahl-Diskrepanz kommunizieren (Tokens vs. Figma-Styles).

## Architektur-Invarianten

- **Kanonisches Modell:** der `plan`-Baum (nicht `interp.html` oder `interp.jsx`) ist DAS kanonische Datenmodell. Figma-Emitter UND Tailwind-Emitter (`planToJsx`) emittieren beide daraus. Skalieren ist eine **Emit-Zeit-Transformation** (`scalePlan`), nicht Teil des Modells — Figma skaliert 1:1 auf Bildmaße, Tailwind bleibt aufs Token-Raster gesnappt.
- **Atomic-Taxonomie:** 5 Ebenen, englisch — **Tokens · Atoms · Molecules · Organisms · Templates** (oberste Ebene „Templates", nicht „Page"). Ganzer Screen = 1 Template; Card/Chart/Table = Organism; Button/Input = Atom; Suchfeld = Molecule.
- **Naming ruht:** „Refracta" NICHT bestätigt (vermutlich besetzt), aktueller Produktname **UIPrism** (Skin/Favicon/Title), aber Code/Repo/URL heißen weiterhin „Designbridge"/`designbridge-production`. Thema NICHT proaktiv wieder aufbringen — Rob entscheidet.
- **Zwei-Stränge-Workflow:** `main` = Präsentations-Strang (Proben, Deck, kleine Bugs), Live-App hängt NUR an main, jeder Push = Auto-Deploy. `experiment/rekursive-zerlegung` = Sandbox für Option B (rekursive Zerlegung), Branch-Push löst KEIN Deploy aus. Idealerweise eigene Claude-Session je Strang, damit sie sich nie in die Quere kommen.

## Account-Fallback (Privat-Account als Ersatz bei Schul-Account-Token-Burn)

- **`.claude/skills/` ist jetzt getrackt** (vorher komplett gitignored — `figma-e2e-test` & Co. existierten nur lokal auf dem Schul-Account, nie im Repo). `.gitignore` ignoriert weiterhin `.claude/*` außer `skills/`, `commands/`, `agents/`, `settings.json` (lokale `settings.local.json`/Caches bleiben draußen).
- **Superpowers-Skills (v6.1.1, alle 14) vendored** unter `.claude/skills/` (brainstorming, writing-plans, executing-plans, systematic-debugging, test-driven-development, verification-before-completion, using-git-worktrees, subagent-driven-development, requesting/receiving-code-review, dispatching-parallel-agents, writing-skills, finishing-a-development-branch, using-superpowers). Kein SessionStart-Hook mitgezogen (bewusst — Hooks laufen bei jedem Sessionstart automatisch, nicht ohne Rücksprache aktiviert). Skills greifen, wenn die Aufgabe passt, nicht automatisch wie mit Hook.
- **Präzedenz bei Widerspruch:** `CLAUDE.md`/`RESUME.md`-Projektregeln schlagen generische Skill-Defaults — v.a. „keine PRs, direkt auf main pushen" (Superpowers' `finishing-a-development-branch` geht eher von PR-Flow aus).
- **Lücke, die NUR Rob schließen kann:** Alles, was rein lokal im `.claude/` des Schul-Accounts liegt (z. B. `figma-e2e-test/SKILL.md`), sieht dieser Account nie von selbst — kein Zugriff auf fremde Accounts/Filesysteme. Muss manuell rübergezogen und committed werden, dann ist es für beide Accounts da.
- **Eigentlicher Cross-Account-Sync-Mechanismus bleibt Git:** Code + `CLAUDE.md` + `docs/superpowers/{specs,plans}` + dieses `RESUME.md` sind der geteilte Zustand. Chat-Verlauf selbst ist NIE zwischen Accounts übertragbar — Disziplin: vor Account-Wechsel committen+pushen, `RESUME.md`-Stand aktuell halten.

## Betriebs-Fallen

- **Ports:** Express-Server `3047`; lokaler reiner UI-Vite-Preview `5199` (`npx vite --port 5199`, kein Express/API, nur für UI-Vorschau — URL-/Bild-Import geht dort nicht, Daten per `window.name`-Trick injizieren); `launch.json` injiziert `PORT=5173` → kollidiert mit Express/Vite — Fix: eigener Startbefehl mit `PORT=3047 npm run dev:demo` bzw. explizit anderen Port setzen.
- **`.env`/exFAT-Falle:** `.env` ist versteckt (Finder Cmd+Shift+. oder `open -e`). TextEdit meldet auf dem exFAT-Volume fälschlich „beschädigt" wegen AppleDouble-Begleitdateien (`._.env`) — NICHT in den Papierkorb legen, sondern `find . -name '._*' -delete`. `.env` nie mit TextEdit öffnen (VS Code o. ä. nutzen). Repo-Regel: nach Datei-Writes in servierte Verzeichnisse immer `find . -name '._*' -delete`.
- **Lokaler `ANTHROPIC_API_KEY` ist leer** („credit balance too low"). Für echte KI-Tests: entweder `GEMINI_API_KEY` in lokale `.env` + `AI_PROVIDER=gemini`, oder einfacher — alles auf **Prod** testen (Railway, Gemini Paid; Prod serviert auch `demo-site/` selbst unter `…/demo/report.html` für URL-Scans).
- **Gemini-Quota:** RPD (Requests-per-Day) ist der scharfe Deckel, nicht RPM. Quota-Bremse erkennt RPD-429 und gibt sofort auf (1 Call statt bis zu 6 über Modell-Fallback+Backoff). Freier Tages-Topf war zeitweise nur 20 Calls (`gemini-3-flash`) — seit Gemini Paid (Google Cloud Billing, separater Zahlungsabwickler ≠ Stripe) kein 429 mehr im Alltag.
- **Push auf `main` = automatischer Railway-Re-Deploy.** Was auf main landet, geht live — bei Experimenten den Branch nicht versehentlich mergen.
- **Figma-E2E-Verifikation:** `.claude/skills/figma-e2e-test/SKILL.md` — autonomer Testlauf (Payload auf Prod, Figma Desktop per AppleScript fernsteuern, Plugin-Klick, Ergebnis per Figma-MCP verifizieren). Rob muss dafür nichts mehr klicken; Skill-Name zum Aufrufen: `figma-e2e-test`.
- Keine Railway-CLI lokal installiert.

## Arbeitsmodus

- **Lokal bauen → interne Browser-Vorschau zeigen → am Schluss gebündelt pushen** (nicht mehr zwischendrin einzeln deployen), außer wenn ein Live-Beweis (z. B. Figma-E2E) zwingend Prod braucht.
- **Modell bewusst wählen** je nach Aufgabenkomplexität und Rob kurz sagen welches + warum (mechanisch/spec-fertig → Sonnet; Architektur/Debugging/Reviews → Opus/Fable; trivial → Haiku).
- **Keine PRs — direkt auf main mergen und pushen** (Robs ausdrückliche Vorgabe).
- **Screenshots/RESUME-Einträge sparsam** wegen Tokens — nicht jede Kleinigkeit dokumentieren, auf das Wesentliche verdichten.
- Plan first, implement second: Spec unter `docs/superpowers/specs/`, Plan unter `docs/superpowers/plans/`, dann Code — kleine verifizierbare Schritte, jeder endet mit etwas Sicht-/Lauffähigem.
- Nie ohne Briefing/Referenzen designen — bei „design X" ohne Richtung erst nachfragen (stehende Regel).
