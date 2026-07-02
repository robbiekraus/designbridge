# Repo-Ingester v1 — Design-Spec

**Datum:** 2026-07-02
**Phase:** 4 (echte Ingester) — Repo als Quelle, Fortsetzung nach URL-Komponenten-Erkennung
**Status:** Entwurf zur Review
**ADR:** `docs/superpowers/adr/ADR-001-repo-ingester-quelle.md` (Option A: GitHub-URL + Tarball + deterministisch + KI-Knopf)

## Ziel & Scope

Der Repo-Mock im Import-Dialog wird durch einen **echten Repo-Ingester** ersetzt: Der Nutzer fügt eine **öffentliche GitHub-Repo-URL** ein, der Server lädt das Repo als Tarball, parst ausgewählte Dateien **deterministisch** (0 Credits) und liefert Tokens + UI-Inventar in **exakt der Server-Shape von `/api/scan/url`**. Damit greifen `adaptScanResponse`, Library-UI, `SourcePill`, `AiDeepenBanner`, Emitter und Export unverändert.

Gelesen werden in v1:

1. **`tailwind.config.{js,ts,cjs,mjs}`** → Theme-Tokens (Farben, Spacing, Radius, Schatten, Schriftgrößen)
2. **CSS-Dateien** (v. a. `:root`-Variablen) → Wiederverwendung von `server/lib/cssIngest.js` (Variablen-zuerst + Deklarations-Fallback, Confidence inklusive). Tailwind-v4-Projekte (`@theme { --color-…: … }`) funktionieren darüber automatisch, da postcss Deklarationen auch in At-Rules liefert.
3. **shadcn-Konvention**: `components/ui/`-Dateinamen → Atomics; `pages/`- bzw. `app/`-Seiten und Layouts → Patterns

**Leitstern:** *Der Designer sieht, was er bekommt — und woher es stammt.* Jeder Token trägt eine Herkunft (`↳ aus tailwind.config.js → theme.colors.primary` / `↳ aus src/styles.css → --color-primary`), jeder Inventar-Eintrag eine Herkunfts-Pille.

## Nicht-Ziele (v1)

- **Private Repos** (kein Token-Handling, keine Auth).
- **Monorepo-Unterpfade** (kein „nur `packages/ui` scannen"); das ganze Repo wird nach den Heuristiken durchsucht.
- **Lokaler Pfad als Quelle** — v2; die Parser-Schicht ist dafür bereits quellen-agnostisch geschnitten.
- **CSS-in-JS** (styled-components, Emotion, vanilla-extract …).
- **cva-/Varianten-Extraktion** aus shadcn-Komponenten-Quelltext (v1: `variants: []`; die KI-Vertiefung darf Varianten ergänzen).
- **`fontFamily`-Anzeige** — die Typography-Token-Shape kennt kein Familien-Feld; `fontFamily` wird in v1 nicht extrahiert.
- Andere Git-Hoster (GitLab, Bitbucket), Submodule, Git-LFS-Inhalte.

## Architektur-Prinzip

**Quelle und Parser sind getrennt.** Die Quelle (v1: GitHub-Tarball) produziert eine Dateiliste `[{ path, content }]`; der Kern `ingestRepoFiles(files, { sourceUrl, branch })` ist eine **pure Funktion** ohne I/O und liefert die Server-Shape. Eine v2-Quelle „lokaler Pfad" ist nur eine zweite Dateilisten-Produktion.

```
                       ┌────────────── Quelle (I/O, injizierbar) ──────────────┐
  GitHub-URL → parseRepoUrl → downloadRepoTarball (codeload, injectable fetch)
             → extractRepoFiles (tar → Temp-Dir → Auswahl → Cleanup) → [{path, content}]
                       └───────────────────────────────────────────────────────┘
                                             │
                       ┌────────────── Parser (pur, 0 Credits) ────────────────┐
             → ingestRepoFiles(files) ── tailwindTheme (statisch)
                                      ── ingestCss (Reuse, pro CSS-Datei)
                                      ── recognizeRepoInventory (shadcn/pages)
             → ServerShape { summary, tokens, atomics, components, patterns, warnings, meta }
                       └───────────────────────────────────────────────────────┘

  [optional, Knopfdruck] → deepenRepoWithAi(files, regelListe, { client }) → gemergte Listen
```

Server-Shape identisch zu `/api/scan/url` (inkl. `source`-Feld pro Token und `{name, variants, confidence, source, notes}` pro Inventar-Eintrag), `meta`:

```json
{ "model": "repo-ingest", "source_url": "https://github.com/owner/repo", "branch": "main", "ai_deepened": false, "elapsed_ms": 0 }
```

Nach KI-Vertiefung: `"model": "repo-ingest+ai"`, `"ai_deepened": true`.

## Entscheidungen im Einzelnen

### 1. URL-Format & Validierung (`server/lib/repoUrl.js`)

`parseRepoUrl(input) → { owner, repo, branch|null }`. Akzeptiert:

- `https://github.com/OWNER/REPO` (auch mit `.git`-Suffix oder Slash am Ende)
- `https://github.com/OWNER/REPO/tree/BRANCH` (Branch mit `/` erlaubt, z. B. `feat/x`)

Alles andere (fremde Hosts, fehlender Repo-Teil, Sonderzeichen außerhalb `[\w.-]` in owner/repo) → Fehler mit deutscher Meldung → HTTP 400.

**Branch-Feld im RepoTab:** bleibt, aber **leer als Default** (Platzhalter „Default-Branch (automatisch)"). Explizite Eingabe gewinnt über `tree/…` in der URL.
*Begründung:* Leer = kein GitHub-API-Aufruf nötig, wenn der Default-Branch-Fallback greift; explizit = null API-Aufrufe. Reduziert die Rate-Limit-Exposition.

### 2. Tarball-Download (`server/lib/fetchRepoTarball.js`)

`downloadRepoTarball({ owner, repo, branch }, { fetchImpl = fetch, timeoutMs = 20000, maxBytes = 50 MB }) → { buffer, branch }`.

- **Codeload-URL:** `https://codeload.github.com/OWNER/REPO/tar.gz/refs/heads/BRANCH`.
- **Default-Branch-Ermittlung** (nur wenn kein Branch angegeben): `GET https://api.github.com/repos/OWNER/REPO` **ohne Token** (Limit **60 Requests/Stunde** pro IP).
  - `200` → `default_branch` verwenden.
  - `404` → „Repository nicht gefunden (oder privat)." → HTTP 404.
  - `403`/`429` (Rate-Limit) → **kein Abbruch**: Fallback probiert `main`, dann `master` direkt gegen codeload; erst wenn beide 404 liefern → Fehler mit Rate-Limit-Hinweis.
  - *Begründung:* Die API ist nur eine Bequemlichkeit; >95 % der Repos heißen `main`/`master`. Rate-Limit darf den Import nicht töten.
- **Größenlimit:** erst `Content-Length`-Header prüfen (falls vorhanden), nach dem Download zusätzlich `buffer.byteLength` — beides > `maxBytes` → „Repository ist zu groß (max. 50 MB)." → HTTP 413.
  *Begründung:* codeload sendet nicht immer `Content-Length`; die Nachprüfung ist der verlässliche Anker. Echtes Streaming-Abbrechen mid-download ist eine v2-Optimierung.
- **Timeout:** 20 s via `AbortController` (gleiches Muster wie `fetchSite`).
- **Injizierbares `fetch`** (`fetchImpl`) wie in `fetchSite.js` → Tests ohne Netz.

### 3. Entpacken + Temp-Verzeichnis (`server/lib/extractRepoFiles.js`)

`extractRepoFiles(tarballBuffer) → Promise<[{ path, content }]>`.

- `mkdtemp(os.tmpdir() + '/designbridge-repo-')` → `tar.x({ cwd, strip: 1, filter })` (Buffer in den Unpack-Stream).
- `strip: 1` entfernt den `REPO-SHA/`-Wurzelordner des GitHub-Tarballs.
- **Filter beim Entpacken** (nicht erst bei der Auswahl): Pfade mit Segmenten aus `SKIP_DIRS` = `node_modules, dist, build, out, .git, .next, coverage, vendor, .turbo, storybook-static` sowie AppleDouble-Dateien (`._*`) landen **gar nicht erst auf der Platte**.
  *Begründung:* Ein `node_modules` im Tarball würde sonst Entpack-Zeit und Platte fressen.
- **Zip-Slip:** node-tar neutralisiert `..`- und absolute Pfade standardmäßig — dokumentiert, kein eigener Code nötig.
- **Cleanup:** `rm(tmp, { recursive: true, force: true })` im `finally` — **auch im Fehlerfall**. Kein Temp-Verzeichnis überlebt einen Request.

### 4. Datei-Auswahl-Heuristik (in `extractRepoFiles.js`, Muster in `server/lib/repoFilePatterns.js`)

Rekursiver Walk (max. Tiefe 8), Dateien **flachere Pfade zuerst** sortiert. Ausgewählt und gelesen werden:

| Typ | Muster | Kappung | Inhalt |
|---|---|---|---|
| Tailwind-Config | `tailwind.config.{js,ts,cjs,mjs}` (beliebige Tiefe) | max. 3 Dateien | voll (max. 200 KB) |
| CSS | `*.css` | max. 20 Dateien à max. 200 KB | voll |
| shadcn-Atomics | `**/components/ui/*.{jsx,tsx,js,ts}` (ohne `index.*`) | max. 100 | gekappt auf 8 KB (nur für KI-Vertiefung gebraucht) |
| Komponenten | `**/components/*.{jsx,tsx}` (nicht `ui/`) | max. 50 | leer (`''`) — nur der Pfad zählt |
| Seiten/Layouts | `**/pages/**.{jsx,tsx,js,ts}`, `**/app/**/page.*`, `**/app/**/layout.*` | max. 50 | leer (`''`) |

Gesamtkappe: **max. 150 Dateien**. Überschreitungen → `warnings`-Hinweis („Dateiauswahl gekappt").
*Begründung:* Die Regeln brauchen von Komponenten-/Seiten-Dateien nur Pfade; Inhalte kosten Speicher und (bei KI) Prompt-Tokens. Die Zahlen sind pragmatisch und in Tests fixiert.

### 5. Tailwind-Config-Parsing — **statisch, ohne Codeausführung** (`server/lib/tailwindTheme.js`)

**Die wichtigste Sicherheitsentscheidung dieser Spec:** Die Config wird **niemals per `require()`/`import()` geladen** — das wäre Ausführung beliebigen fremden Codes auf dem Rechner des Nutzers (Remote Code Execution). Stattdessen **statische Extraktion** über dem Quelltext:

- `parseTailwindTheme(configSource) → { entries, warnings }`.
- **Balanced-Brace-Scan:** `theme`-Objektliteral finden (und darin `extend`), per Klammer-Zählung ausschneiden — kein voller JS-Parser, keine neue AST-Dependency.
- In den Sektionen `colors`, `spacing`, `borderRadius`, `boxShadow`, `fontSize` werden **nur Literale** gelesen:
  - String-/Zahl-Literale (`primary: '#022d2c'`, `4: '1rem'`) → Token.
  - **Eine** Verschachtelungsebene bei Farben (`blue: { 500: '#3b82f6' }` → `blue-500`).
  - Arrays (typisch `fontSize: ['1rem', {…}]`): erstes String-Literal wird genommen.
  - **Alles Berechnete wird übersprungen**: `require(…)`, Spreads (`...colors`), Funktionsaufrufe, Template-Strings mit `${…}` → einmalige Warnung „Berechnete Werte in tailwind.config konnten statisch nicht gelesen werden."
  - Nicht-Hex-Farbwerte wie `hsl(var(--border))` (shadcn-Standard) werden übersprungen — die echten Werte stehen in den CSS-Variablen, die `cssIngest` ohnehin liest. Verhindert Doppelungen und Pseudo-Tokens.
- TypeScript-Configs funktionieren mit demselben Scan (Typ-Annotationen stören die Klammer-Zählung nicht); `satisfies Config` wird ignoriert.
- Mapping in die Token-Shape: `confidence: 'high'` (benannter Theme-Eintrag), `source: "<pfad> → theme.colors.primary"` bzw. `→ theme.extend.…`. `rem`→`px` über die aus `cssIngest.js` exportierten Helfer (`remToPx`, `pxNumber`, `normalizeColor` bekommen dazu ein `export`).

*Begründung der Alternative-Abwägung:* Ein echter JS-Parser (Babel/acorn) wäre robuster, aber eine schwere neue Dependency für ein Feld, das die KI-Vertiefung ohnehin abdeckt. Ausführen in einem Sandbox-VM (`node:vm`) ist **keine** Sicherheitsgrenze (offiziell dokumentiert) und bleibt verboten. Scheitert der statische Scan (stark berechnete Config) → wenige/keine Tailwind-Tokens + Warnung; CSS-Variablen liefern dann meist trotzdem Substanz.

### 6. CSS-Extraktion — Reuse von `cssIngest` mit Datei-Herkunft

- Pro ausgewählter CSS-Datei: `ingestCss(content)` (unverändert).
- Jeder Token bekommt die Herkunft **mit Dateipfad präfixiert**: `source: "src/styles.css → --color-primary"` — die vorhandene `tokenViews`-Zeile `↳ aus …` zeigt das ohne Umbau an. Tailwind-Tokens analog `tailwind.config.js → theme.colors.primary`.
- **Merge & Dedupe** über alle Dateien (Reihenfolge: Tailwind zuerst, dann CSS flach→tief): Farben per Hex, Spacing/Radius per Wert, Schatten per CSS-String — erster Fund gewinnt (behält die „wichtigere" Herkunft).
- `cssIngest`-Warnung „Nur Tokens — Komponenten werden aus CSS nicht erkannt." wird im Repo-Kontext **nicht** übernommen (das Inventar kommt hier aus der Datei-Heuristik).

### 7. UI-Inventar-Heuristik (`server/lib/repoInventory.js`)

`recognizeRepoInventory(files) → { atomics, components, patterns }`, kanonische Shape `{ name, variants, confidence, source: 'rules', notes }`:

| Ebene | Regel | Confidence | Beispiel |
|---|---|---|---|
| Atomics | Dateiname unter `components/ui/` → PascalCase | `high` (shadcn-Konvention ist stark) | `dropdown-menu.tsx` → `DropdownMenu`, notes `aus components/ui/dropdown-menu.tsx` |
| Components | Datei direkt unter `components/` (nicht `ui/`) | `low` (Namenskonvention, keine Strukturprüfung) | `Header.tsx` → `Header`, notes `aus components/Header.tsx` |
| Patterns | `app/**/layout.*` → „Layout" | `med` | notes `aus app/layout.tsx` |
| Patterns | `pages/**.*` oder `app/**/page.*` → „Seite: <Name>" (Verzeichnisname bzw. Dateiname, `index`/Wurzel → „Start") | `low` | `app/dashboard/page.tsx` → `Seite: Dashboard` |

- Dedup je Ebene nach `name`; `variants: []` (cva-Extraktion = Nicht-Ziel, siehe oben).
- Kein Fund auf einer Ebene → leeres Array, kein Fehler.

### 8. Endpoints (`server/routes/scan.js`)

**`POST /api/scan/repo`** — Body `{ url, branch? }`.
`parseRepoUrl` → `downloadRepoTarball` → `extractRepoFiles` → `ingestRepoFiles(files, { sourceUrl, branch })` → Server-Shape, `meta.model = 'repo-ingest'`, `meta.ai_deepened = false`. **0 Credits.**

**`POST /api/scan/repo/ai`** — Body `{ url, branch? }`, spiegelt `POST /api/scan/url/ai`:
lädt das Repo **erneut** (stateless — der Server hält keinen Zustand, der Client bleibt dumm und darf keine eigene Liste einschleusen, exakt die `/url/ai`-Begründung), baut die Regel-Baseline und ruft `deepenRepoWithAi(files, baseline, { client })` — neues Lib nach dem `recognizeWithAi`-Muster: **injizierbarer Anthropic-Client** (Fake-Client in Tests = 0 Credits), Prompt = Datei-Digest (Pfadliste + gekappte `components/ui`-Quelltexte + Tailwind-Config) + Regel-Liste als JSON, Antwort JSON-only in der kanonischen Shape mit `source: 'rules+ai' | 'ai'` und Korrektur-`notes`. Gesamtkappung des Digests (~30.000 Zeichen) → Warnung bei Kürzung. `meta.model = 'repo-ingest+ai'`, `meta.ai_deepened = true`.

**Fehler-Mapping (deutsch, Klartext-`error`):**

| Fehlerbild | Status | Meldung (sinngemäß) |
|---|---|---|
| URL kein `github.com/owner/repo` | 400 | „Bitte eine öffentliche GitHub-URL angeben (github.com/owner/repo)." |
| Repo/Branch existiert nicht (oder privat) | 404 | „Repository nicht gefunden (oder privat)." |
| Tarball > 50 MB | 413 | „Repository ist zu groß (max. 50 MB)." |
| GitHub-Rate-Limit **und** main/master-Fallback erfolglos | 429 | „GitHub-Rate-Limit erreicht — bitte in ein paar Minuten erneut versuchen oder Branch angeben." |
| Netzwerk/Timeout/Sonstiges | 502 | „Repository konnte nicht geladen werden: …" |
| **Keine Tokens gefunden** | **200** | Leere Token-Arrays + Warnung „Keine Design-Tokens gefunden — weder tailwind.config noch CSS-Variablen." (Kein Fehler: das Inventar kann trotzdem gefüllt sein.) |

### 9. Client — RepoTab von Mock auf echt (wie beim UrlTab-Umbau)

- `web/src/lib/useImportSession.js`: neue `submitRepo({ url, branch })` → `POST /api/scan/repo` → `adaptScanResponse(data, 'repo')`; die `source === 'repo'`-Zeile ersetzt `mockRepoImport`. `importMocks.js` wird komplett gelöscht (letzter Nutzer).
- `web/src/components/ImportModal/tabs/RepoTab.jsx`: Mock-Hinweis („Repository scanning is mocked …") raus; Branch-Feld leer mit Platzhalter „Default-Branch (automatisch)"; deutscher Hinweistext „Liest tailwind.config, CSS-Variablen und components/ui aus einem öffentlichen GitHub-Repo."
- `web/src/components/ImportModal/ImportModal.jsx`: **`Preview`-Badge am Repo-Tab entfernen** — und den **veralteten `Preview`-Badge am URL-Tab gleich mit** (Leiche aus dem UrlTab-Umbau).
- Fehleranzeige: läuft über den bestehenden `stage === 'error'`-Pfad des Modals; die deutschen Server-Meldungen (400/404/413/429/502) erscheinen dort unverändert.
- `web/src/lib/aiDeepen.js`: `deepenWithAi(result)` routet nach `result.source` — `url` → `/api/scan/url/ai` `{url}` (wie heute), `repo` → `/api/scan/repo/ai` `{url, branch}` (aus `raw.meta`).
- `web/src/components/library/AiDeepenBanner.jsx`: `shouldShowDeepenBanner` zeigt das Banner auch für `source === 'repo'` (solange `ai_deepened !== true`). SourcePill/Notes-Anzeige: bereits generisch, kein Umbau.

### 10. Test-/Fixture-Strategie — **kein Netz in Tests**

- **`server/fixtures/repo-fixture/`** — ein eingechecktes Mini-Repo als echte Dateien: `tailwind.config.js` (Literale + ein `require`-Fall), `src/styles.css` (`:root`-Variablen), `components/ui/button.tsx` + `components/ui/card.tsx`, `components/Header.tsx`, `app/page.tsx`, `app/dashboard/page.tsx`, `app/layout.tsx`, plus Störer (`node_modules/x/index.js`, `dist/out.css`), die die Auswahl ignorieren muss.
- **Parser-Tests** (`ingestRepoFiles`, `tailwindTheme`, `repoInventory`): bekommen Dateilisten **direkt** (inline-Strings oder aus dem Fixture-Ordner gelesen) — die quellen-agnostische Schnittstelle macht genau das möglich.
- **Download-Tests** (`fetchRepoTarball`): injiziertes `fetchImpl` mit Fake-Responses (API-JSON, 404, 403, Content-Length-Überschreitung).
- **Extraktions-Tests** (`extractRepoFiles`): Tarball wird **zur Laufzeit mit `tar.c` aus dem Fixture-Ordner gebaut** (Round-Trip mit derselben Lib) und als Buffer hineingegeben — inkl. Cleanup-Nachweis (Temp-Verzeichnis existiert nach Erfolg **und** nach provoziertem Fehler nicht mehr).
- **KI-Tests** (`deepenRepoWithAi`): Fake-Client mit fester JSON-Antwort — **0 Credits**, wie bei `recognizeWithAi`.
- **Routen**: keine eigenen Route-Tests (Hausstil) — Verdrahtung wird im Browser-Smoke geprüft; die Lib-Logik ist vollständig unit-getestet.
- **Web-Tests** (Vitest): `submitRepo`-Pfad in `useImportSession`, `aiDeepen`-Routing nach Source, `shouldShowDeepenBanner` für `repo`.

## Datenfluss (Ende zu Ende)

```
RepoTab (GitHub-URL [+ Branch]) → submit({source:'repo', payload:{url, branch}})
  → POST /api/scan/repo
      → parseRepoUrl → downloadRepoTarball (codeload, 50-MB-Kappe, Timeout)
      → extractRepoFiles (tar → Temp → Auswahl → Cleanup)
      → ingestRepoFiles: tailwindTheme + ingestCss (Reuse) + recognizeRepoInventory
      → ServerShape (model:'repo-ingest', ai_deepened:false)
  → adaptScanResponse(data, 'repo') → Store
  → Library: Tokens mit „↳ aus …"-Herkunft, Inventar mit grauen „nur Regeln"-Pillen, Banner sichtbar

[optional] „Mit KI vertiefen"
  → POST /api/scan/repo/ai → Repo erneut laden → Baseline → deepenRepoWithAi (Claude)
  → gemergte Listen (grün „Regeln + KI" / gelb „von KI"), ai_deepened:true, Banner weg
  (Fehler/keine Credits → ruhige Fehlerzeile, Regel-Liste bleibt — bekanntes Muster)
```

## Neue Abhängigkeit

- **`tar`** (node-tar, Root-Dependency) — die **einzige** Neuinstallation. Begründung pro CLAUDE.md-Regel 6: ausgereift und extrem verbreitet (npm selbst entpackt Pakete damit), reines JavaScript ohne natives Build, eingebauter Schutz gegen Pfad-Traversal. Ohne Dep ginge nur `zlib.gunzip` (built-in) + **handgerolltes TAR-Parsen** (512-Byte-Header, PAX-Extensions, LongLink) — bewusst verworfen: fehleranfällige Neuimplementierung eines gelösten Problems.
- Kein weiterer Bedarf: `fetch` ist in Node eingebaut, Claude läuft über das vorhandene `@anthropic-ai/sdk`, CSS über vorhandenes `postcss`.

## Offene Punkte für die Review

- Kappungszahlen (50 MB, 20 CSS-Dateien, 150 Dateien gesamt, 8 KB Komponenten-Exzerpt) — pragmatisch gewählt, in Tests fixiert, leicht änderbar.
- `main`/`master`-Fallback-Reihenfolge bei Rate-Limit — bewusst simpel.
- Statisches Tailwind-Parsing scheitert an stark berechneten Configs — akzeptiert (Warnung + KI-Knopf); Babel-AST wäre die v2-Eskalation, falls es in der Praxis zu oft klemmt.
