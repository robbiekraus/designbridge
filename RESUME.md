# Designbridge — Schnellstart-Spickzettel

Stand: **03.07.2026 (Session 2)** — **Figma lesen ist gebrainstormt + gespec't, ABER offene Richtungsfrage.** Rob hat mitten drin gemerkt: Was er als Designer eigentlich will, ist die **Schreib-Richtung** (URL/Bild/Repo → **nach Figma portieren**), nicht das Lesen aus Figma. Session aus Zeitgründen beendet, **Entscheidung offen**.

## ⏱️ ERSTER PUNKT NÄCHSTE SESSION: Richtungsentscheidung
Rob fragte „welche Abfolge ist sinnvoller?". **Meine Empfehlung steht: A.**
- **A (empfohlen) — Phase 5 „nach Figma schreiben" zuerst.** Das ist Robs eigentliches Ziel. Die beiden Richtungen sind unabhängig: Schreiben braucht „Figma lesen" NICHT. Wert vor Bequemlichkeit. Vorbehalt: Phase 5 ist das größte/unsicherste Stück (neues Emitter-Konzept, das bisher unangetastete `designbridge-plugin/`, andere UX) → **enge erste Scheibe**: nur Tokens (Farben/Schriften) → Figma-Styles/Variables via Plugin, end-to-end beweisen; danach Components/Patterns; Sync (Phase 6) später — DAFÜR kommt „Figma lesen" wieder rein.
- **B — „Figma lesen" (Phase 4) erst fertigbauen**, dann Phase 5. Nur sinnvoll, wenn nächstes Ziel eine Demo „Import aus allem inkl. Figma" ist.

**Rob hat A/B noch NICHT bestätigt** — er ging aus Zeitgründen. Nächste Session: kurz A/B klären, dann entsprechend Brainstorm. Bei A zuerst `designbridge-plugin/` anschauen (der Hebel).

## Was diese Session entstand (NICHT gebaut, nur Design)
**Figma-Ingester v1 (LESEN) — Brainstorm fertig, Spec committet.** Alle Entscheidungen getroffen:
1. Mechanismus = **REST-API** (Server ruft api.figma.com, wie URL/Repo). Verworfen: MCP (hängt an Claude-Session), Plugin-Push.
2. Umfang = **Tokens + volles Inventar**.
3. **Pro-Plan** (kein Enterprise): Tokens aus **Styles**; Variables Enterprise-only → best-effort/403-skip.
4. **Radius** heuristisch aus `cornerRadius` (low); **Spacing** v1 leer + Warnung.
5. **Auth** = `FIGMA_TOKEN`-Env-Default + Tab-Feld-Fallback (in-memory); Tab-Zustand via `GET /api/figma/status`.
6. **Keine KI-Vertiefung** in v1.
- **Spec:** `docs/superpowers/specs/2026-07-03-figma-ingester-v1-design.md` — **committet auf `main` als `97ecb91`, NICHT gepusht.** Diese Spec bleibt gültig (spätestens für Phase-6-Sync gebraucht), egal wie die Richtungsfrage ausgeht.
- **Kein Plan geschrieben, kein Code.** (Brainstorm→Spec fertig; writing-plans war der nächste Schritt, wurde nicht mehr gemacht.)

## Wo wir im Gesamtbild stehen (die Brücke)
- **REIN/lesen (Ingester):** Bild ✅ · URL ✅ · Repo ✅ · **Figma lesen ⏳ (nur gespec't)**
- **RAUS/schreiben (Emitter):** Code CSS/Tailwind ✅ · shadcn-Components ✅ · **nach Figma ❌ (Phase 5, NICHT gebaut = Robs Wunsch)**
- Nebenbei: „von Claude aus nach Figma" geht heute via Figma-MCP (Claude-Aktion), ist aber KEIN App-Feature.

## Letzter FERTIGER Stand (Session 1, 03.07.)
**Repo-Ingester v1 gemergt & gepusht.** Merge `1bd977b` auf `main`, `origin/main` in sync. Server **73/73** · Web **100/100** · Browser-Smoke bestanden. Details siehe Memory `project_designbridge_roadmap.md`.

## App starten (Server + Web)
```
npm run dev
```
→ Backend http://localhost:3047, Frontend http://localhost:5173 (Inkognito). Nur EINE Instanz; vorher `lsof -ti:3047` / `:5173` prüfen.

## Tests
```
npm run test:server        # 73/73
cd web && npx vitest run   # 100/100
```

## Offene Folge-Punkte aus Repo-Ingester (nicht blockierend)
Entpack-Größen-Kappe (OOM-Risiko bei Riesen-CSS), stille Datei-Kappung (Spec §4 nie implementiert), 400-vs-502-Feinheiten, `postScan`-Helper-Dedup, `pages/_app.tsx`-Rauschen. Vollständig in der vorigen RESUME-Version / im Repo-Ingester-Final-Review.

## Wichtige Dateien
- Ingester-Muster (Vorlage für alles Neue): Server `server/lib/{repoUrl,fetchRepoTarball,ingestRepoFiles,cssIngest}.js` + `server/routes/scan.js`; Web `web/src/lib/useImportSession.js`, `web/src/components/ImportModal/tabs/*`
- Figma-Plugin (Hebel für Phase 5): `designbridge-plugin/`
- Figma-Spec: `docs/superpowers/specs/2026-07-03-figma-ingester-v1-design.md`
- Arbeitsregeln: `CLAUDE.md`
