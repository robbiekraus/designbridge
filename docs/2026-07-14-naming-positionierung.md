# Naming & Positionierung — Entscheidung: **Refracta** (VORLÄUFIG)

Stand: 14.07.2026 · Von Rob nach Recherche + Verifikation gewählt (Session „Zweig B") —
**Rob schläft noch eine Nacht darüber; Umbenennung NICHT starten, bevor er bestätigt.**

---

## 1. Entscheidung

Das Produkt heißt künftig **Refracta** (bisher „Designbridge").

**Die Namens-Story:** Eine Quelle (Screenshot, URL, Code-Repo) fällt wie weißes
Licht in ein Prisma und wird in ihr Spektrum zerlegt — Tokens, Atomics,
Components, Patterns. Newtons zweites Prisma fügt das Spektrum wieder zu
weißem Licht zusammen: **zerlegen UND rekombinieren = unsere Bidirektionalität**
(Quelle → Library → Figma *und* Code). Im Wortklang schwingt zusätzlich
*fractal* mit — Design-Systeme sind selbstähnlich (Atomics → Components →
Patterns, dasselbe Prinzip auf jeder Ebene).

## 2. Warum weg von „Designbridge"

Drei unabhängige Konflikte, jeder für sich schon Grund genug:

1. **Design Bridge and Partners** (designbridge.com) — WPP-Tochter, globale
   Brand-Design-Agentur (~900 Leute, seit 1986, Kunden: Coca-Cola, Unilever,
   NASA). Reales Trademark-Risiko genau in der Design-Branche; besitzt die .com.
2. **„DesignBridge"** (Kemal Salih Carfi) — Figma-Plugin, **968 Nutzer**, aktiv
   (v2.1, April 2026): „AI-Agent Context Engine", Figma → `DESIGN.md`. Exakt
   dasselbe Kompositum, gleiche Plattform, funktional benachbart.
3. **„Design-bridge"** (Adeola) — Figma-Plugin, 72 Nutzer: Website → Chrome-
   Extension → Tokens/Komponenten als Figma-Seiten. Direkt unser
   URL→Figma-Versprechen.

Dazu: npm `design-bridge` = MCP-Server „AI→Figma", und die „bridge"-Metapher
ist im Figma-Ökosystem gesättigt (20+ Plugins nennen sich „bridge") — kein
Unterscheidungswert mehr.

## 3. Wettbewerbslandschaft & Abgrenzung

| Tool | Richtung | Stärke | Was es NICHT kann |
|---|---|---|---|
| **html.to.design** (‹div›RIOTS) | URL/HTML → Figma | Messlatte für Fidelity: Auto-Layout, Komponenten mit Hover-Varianten, Multi-Viewport/Theme, Chrome-Extension, MCP. Free: 10 Imports/30 Tage | Einbahnstraße nach Figma. Keine Code-Seite, keine Library, kein Repo-Import |
| **DesignBridge** (Kemal, 968 Nutzer) | Figma → AI-Kontext (`DESIGN.md`) | Variable-Alias-Auflösung, Komponenten-Anatomie | Nur Lese-Richtung, kein Import in Figma, kein Code-Output |
| **Design-bridge** (Adeola, 72 Nutzer) | URL → Figma-Token-Seiten | Chrome-Extension-Extraktion | Klein, Einbahnstraße, keine Code-Seite |
| **Figma to shadcn/ui** (14,6k Nutzer) | Figma → shadcn-Code | Populär | Gegenrichtung fehlt, keine Quellen außer Figma |

**Unsere Lücke (real und unbesetzt):** Keiner macht
**drei Quellen (Bild / URL / Repo) → kanonische technische Library → beide
Richtungen (Figma UND shadcn/Tailwind-Code)**. Dazu einzigartig:
Repo-Import **hebt echten Quellcode** statt zu interpretieren
(„erkennbares Design-System → heben, nicht raten"), KI ist Veredelung auf
Knopfdruck statt Grundvoraussetzung (0-Credit-Kern), Library = editierbare
technische Artefakte statt toter Pixel.

**Positionierungssatz (Arbeitsstand):**
> Refracta zerlegt jede Design-Quelle — Screenshot, Website oder Code-Repo —
> in ihr technisches Spektrum und hält Figma und Code aus einer Wahrheit
> synchron.

## 4. Namensfindung — Prozess & Verworfene

Erkundete Familien: Musik (Einklang, Unisono, Kammerton — von Rob verworfen:
„Musikkram"), Blaupause, Licht/Optik/Frequenz (Robs Wahl), Brücken-Synonyme
(Backup), Kunstwörter.

| Kandidat | Warum verworfen |
|---|---|
| **Refractal** (Robs Erstwahl) | Aktives KI-Startup **refractal-ai.com** („Security Layer for AI Agents", Crunchbase/PitchBook), hält .com/.app/.dev; npm-Squat ist ausgerechnet eine React-Komponenten-Library → absehbare zweite Umbenennung |
| **Refract** (pur) | **Recraft.ai** phonetisch fast identisch im KI-Design-Markt; Refract Software Ltd (Sales-SaaS); „Refract Skill" (KI-Agenten-Tool); alle Kern-Domains vergeben |
| **Refractor** (mit C) | npm `refractor` = bekannte Syntax-Highlighting-Lib (in `react-syntax-highlighter`; basiert auf Prism) — im Dev-Ökosystem verbrannt |
| **Refraktor** | Rob: zu deutsch, zu hart |
| **Refraction** | npm vergeben; refraction.dev war KI-Code-Tool; .app vergeben |
| **Spectry / Spectio** | Voll verfügbar, aber Rob nicht überzeugt |
| **Spektra / Prisma / Atomize / Distill / Chromatik-Familie** | npm/Domains vergeben; Prisma-Stamm doppelt verbrannt (Prisma ORM, PrismJS); Chroma-Stamm kollidiert mit Chromatic (Storybook) |
| **Viaduct** (Brücken-Backup) | npm vergeben; bleibt in gesättigter Brücken-Metapher |

## 5. Verfügbarkeit Refracta (Stand 14.07.2026)

| Kanal | Status |
|---|---|
| npm `refracta` | ✅ frei |
| npm-Scope `@refracta/*` | ✅ frei (nicht angelegt) |
| `refracta.design` | ✅ kein DNS-Eintrag |
| `refracta.dev` | ✅ kein DNS-Eintrag |
| Figma Community | ✅ kein Plugin/Widget/Creator „Refracta" |
| Web/Firmen | Nur „Refracta Linux" (Devuan-Nischen-Tools, SourceForge, quasi inaktiv, andere Kategorie) — unkritisch |

**Vorbehalte:** (a) DNS-Check ≠ Registrar-Check — registrierte Domains ohne
Webauftritt sehen „frei" aus; vor Verlass Registrar prüfen. (b) Formale
Markenrecherche (DPMA/EUIPO/USPTO) steht aus — für das jetzige
Open-Source-/Portfolio-Stadium unkritisch, **vor Kommerzialisierung Pflicht**.

## 6. Marken-Architektur (Subline-System, Robs Ansatz)

- **Refracta** = die Marke / das Gesamtprodukt
- **Refracta App** (Web-UI) · **Refracta CLI** (`@refracta/cli`) ·
  **Refracta for Figma** (Plugin)
- CLI-Verben bleiben natürlich: `refracta import`, `refracta sync`
- Schreibweise: „Refracta" (Eigenname), Code/Package klein `refracta`

## 7. Nächste Schritte

1. **[Rob]** Domains registrieren: `refracta.design` + `refracta.dev`
   (Registrar-Check = gleichzeitig der echte Verfügbarkeitsbeweis).
2. **[Rob]** npm: Scope-Namen `@refracta` beim ersten echten Publish sichern
   (kein Platzhalter-Squat nötig, solange nichts veröffentlicht wird).
3. **[Arbeitspaket, eigene Session]** Technische Umbenennung: Repo-Name,
   README, `package.json`-Namen, UI-Branding („Designbridge"-Logo/Titel in
   `web/` + Plugin-Panel), CLAUDE.md, RESUME.md. Bewusst NICHT in dieser
   Session (Zweig B = Strategie, kein Code).
4. **[Später, vor Kommerzialisierung]** Markenrecherche + ggf. Anmeldung;
   Figma-Community-Publisher-Name sichern (erst bei Plugin-Veröffentlichung
   möglich).
