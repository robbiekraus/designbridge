# ADR-001: Quelle und Extraktionsweg des Repo-Ingesters

**Status:** Accepted
**Datum:** 2026-07-02
**Entscheider:** Rob (Product) + Claude (Engineering)
**Betrifft:** Phase 4 der Roadmap — „Repo als Quelle" für Token- und Komponenten-Erkennung

## Kontext

Nach Bild- und URL-Import soll Designbridge Code-Repositories als dritte Quelle einlesen: Design-Tokens (Farben, Spacing, Radius, Schatten, Schriften) und ein UI-Inventar (Atomics/Components/Patterns) direkt aus dem Code eines Projekts. Zielgruppe sind Designer, die den Code nicht lokal ausgecheckt haben — sie kennen nur die GitHub-URL des Projekts.

Randbedingungen aus dem Projekt:

- Die bestehende Pipeline (Server-Shape → `adaptScanResponse` → Library-UI mit `SourcePill`, `AiDeepenBanner`, Emitter, Export) soll **unverändert** weiterverwendet werden — der Repo-Ingester liefert dieselbe kanonische Antwortform wie `/api/scan/url`.
- Der Credit-Ausfall bei der Demo am 24.06.2026 hat gezeigt: **Kernfunktionen dürfen nicht von API-Credits abhängen.** KI ist Veredelung auf Knopfdruck, nie Grundvoraussetzung.
- Kein `git`-Binary und keine Tokens auf dem Server voraussetzen; die App läuft lokal bei Designern.

Zu entscheiden: **Woher kommt der Repo-Inhalt, und wie werden Tokens/Komponenten extrahiert?**

## Optionen

### Option A — GitHub-URL + Tarball-Download, deterministisches Parsen, KI-Knopf (gewählt)

Der Nutzer fügt eine **öffentliche GitHub-Repo-URL** ein. Der Server lädt das Repo als **Tarball über `codeload.github.com`** (kein `git`-Binary, kein Token), entpackt mit Größenlimit (~50 MB) in ein Temp-Verzeichnis und **parst ausgewählte Dateien deterministisch**:

- `tailwind.config.{js,ts,cjs,mjs}` → Theme-Tokens (Farben, Spacing, Radius, Schatten, Schriften)
- CSS-Dateien mit `:root`-Variablen → Wiederverwendung des vorhandenen `server/lib/cssIngest.js`
- shadcn-Erkennung: `components/ui/`-Ordner + Dateinamen → UI-Inventar in der kanonischen Shape `{name, variants, confidence, source:'rules', notes}`
- **„Mit KI vertiefen"** wie beim URL-Import: neuer Endpoint nach dem Muster `POST /api/scan/url/ai`, injizierbarer Anthropic-Client (Fake-Client in Tests = 0 Credits)

Kernprinzip: Die Parser-Schicht ist **quellen-agnostisch** — eine Kernfunktion wie `ingestRepoFiles(files)` nimmt eine Dateiliste (Pfad + Inhalt). Eine Lokaler-Pfad-Quelle kann in v2 ergänzt werden, ohne Parser umzuschreiben.

### Option B — Lokaler Dateipfad als Quelle (abgelehnt)

Der Nutzer gibt einen Pfad auf seiner Platte an; der Server liest das Verzeichnis direkt.

### Option C — KI-first-Extraktion (abgelehnt)

Repo-Inhalt (egal woher) wird direkt an Claude geschickt; das Modell extrahiert Tokens und Inventar in einem Rutsch.

## Bewertung

| Kriterium | A: GitHub-URL + Tarball + Regeln | B: Lokaler Pfad | C: KI-first |
|---|---|---|---|
| UX für Designer (Zielgruppe) | ✅ URL einfügen — kennt jeder | ❌ Pfad-Eingabe = Entwickler-UX-Bruch | ✅ URL einfügen |
| Kosten pro Import | ✅ 0 Credits (KI optional) | ✅ 0 Credits | ❌ Credits bei **jedem** Import |
| Determinismus / Testbarkeit | ✅ gleicher Input → gleicher Output | ✅ deterministisch | ❌ nicht deterministisch, schwer testbar |
| Ausfallsicherheit | ✅ läuft ohne API (Demo-Lehre 24.06.) | ✅ läuft ohne API | ❌ Credit-Ausfall = Totalausfall |
| Sicherheitsfläche | ✅ nur Lesen entpackter Dateien, kein Codeausführen | ❌ Server liest beliebige lokale Pfade (Traversal-Risiko) | ⚠️ Repo-Inhalt geht an externe API |
| Gehostete Zukunft (Server nicht auf Nutzer-Maschine) | ✅ funktioniert remote | ❌ blockiert gehostetes Deployment | ✅ funktioniert remote |
| Setup-Voraussetzungen | ✅ kein git, kein Token | ✅ keine | ✅ keine |
| Erweiterbarkeit | ✅ Parser quellen-agnostisch → B als v2 billig nachrüstbar | — | — |

| Aufwand | A | B | C |
|---|---|---|---|
| Implementierung v1 | mittel (Download + Parser) | klein | klein (Prompt) |
| Wartung / Regressionen | klein (Unit-Tests fixieren Verhalten) | klein | groß (Prompt-Drift, Modellwechsel) |

## Entscheidung

**Option A.** Öffentliche GitHub-URL als einzige v1-Quelle, Tarball-Download über `codeload.github.com`, deterministische Extraktion aus `tailwind.config`, CSS-Variablen und `components/ui/`-Konvention; Claude ausschließlich als optionale Veredelung hinter dem bestehenden „Mit KI vertiefen"-Muster.

**Begründungen im Einzelnen:**

- **B abgelehnt:** Pfad-Eingabe ist ein UX-Bruch für die Designer-Zielgruppe, öffnet eine unnötige Sicherheitsfläche (Server liest beliebige lokale Verzeichnisse) und blockiert eine spätere gehostete Variante. Da die Parser-Schicht quellen-agnostisch geschnitten wird (`ingestRepoFiles(files)`), ist B als **v2-Ergänzung billig** — nur eine zweite Dateilisten-Quelle, kein Parser-Umbau.
- **C abgelehnt:** Credits bei jedem Import widersprechen dem Gratis-zuerst-Prinzip des Produkts; die Extraktion wäre nicht deterministisch (gleiches Repo, andere Antwort) und damit kaum testbar; ein Credit-Ausfall wäre ein Totalausfall — exakt das Szenario der Demo vom 24.06.2026, das wir nie wieder haben wollen.

## Konsequenzen

**Positiv:**

- Gleiche Server-Shape wie `/api/scan/url` → Library-UI, `SourcePill` (grau „nur Regeln" / grün „Regeln + KI" / gelb „von KI"), `AiDeepenBanner`, Emitter und Export „leuchten ohne Umbau auf".
- Vollständig ohne Netz testbar: injizierbares `fetch` liefert einen vorgebauten Tarball-Buffer; Kern-Parser bekommen Dateilisten direkt.
- v2-Pfade (lokaler Pfad, Monorepo-Unterpfade, private Repos via Token) bauen auf derselben Parser-Schicht auf.

**Negativ / akzeptierte Trade-offs:**

- Nur **öffentliche** GitHub-Repos in v1 (kein Token-Handling).
- GitHub-API ohne Token für Default-Branch-Ermittlung ist auf **60 Requests/Stunde** limitiert → Fallback-Strategie nötig (siehe Spec).
- `tailwind.config.js` wird **statisch** geparst, nicht ausgeführt (kein Remote-Code-Execution-Risiko) → berechnete Configs (Funktionen, `require()`) werden nur teilweise oder gar nicht gelesen; dafür gibt es Warnungen und die KI-Vertiefung.
- Tarball-Download lädt das ganze Repo (bis zum Größenlimit), obwohl nur wenige Dateien gebraucht werden — akzeptiert für v1 (einfach, ein Request); gezielter Datei-Abruf via API wäre eine spätere Optimierung.

## Referenzen

- Spec: `docs/superpowers/specs/2026-07-02-repo-ingester-v1-design.md`
- Vorbild-Muster: `docs/superpowers/specs/2026-06-25-url-ingester-v1-design.md`, `docs/superpowers/specs/2026-06-29-url-component-recognition-v1-design.md`
- Demo-Vorfall Credits: Memory `project_designbridge_demo_2026-06-24`
