# Plan: Quota-Bremse (RPD-Fail-Fast) — Nachtschicht 16./17.07.2026

Spec: `docs/superpowers/specs/2026-07-16-quota-bremse-design.md`
Arbeitsweise: test-first, jeder Task ein Commit, KEIN Push durch Implementer
(Push = Auto-Deploy, macht die Koordination nach Review + Full-Suite).

## Task 1 — geminiClient: Tages-Quota erkennen + Fail-Fast (server)

- `server/lib/geminiClient.js`: Helper `isDailyQuotaError(data)` (QuotaFailure-
  Detail, `violations[].quotaId` matcht `/perday/i`).
- Im 429-Zweig VOR dem `continue`: bei Treffer Error mit `isDailyQuota=true`
  und Meldung `Gemini-Tages-Kontingent erschöpft — Reset um Mitternacht
  kalifornischer Zeit (ca. 09:00 deutscher Zeit). Bitte später erneut versuchen.`
  werfen; einmaliges `console.warn('[gemini] Tages-Quota erschöpft (…quotaId…)')`.
- Tests in `geminiClient.test.js`: (a) 429+PerDay → genau 1 fetch-Call,
  isDailyQuota, Meldung; (b) 429 ohne QuotaFailure → Kette läuft wie bisher
  (bestehende Tests bleiben grün).

## Task 2 — Routes: 429 + daily_quota (server)

- `server/routes/interpret.js`: im catch (nach DEMO_FALLBACK-Zweig unverändert,
  im Nicht-Demo-Pfad zuerst) `if (err.isDailyQuota) return res.status(429)
  .json({ error: err.message, daily_quota: true })`.
- `server/routes/scan.js`: dieselbe Mapping-Zeile in den catch-Blöcken von
  `/image`, `/url/ai`, `/repo/ai`.
- Tests in `interpret.test.js` + `scan.test.js` (Fake-Client wirft
  isDailyQuota-Fehler → 429 + Flag + Meldung im Body).

## Task 3 — Web: Chunk-Schleife stoppen + Flag (web)

- `web/src/lib/interpret.js`:
  - `requestInterpretations`: Error bekommt `dailyQuota = Boolean(data.daily_quota)`.
  - `runInterpretation`: im catch bei `e.dailyQuota` → restliche (noch nicht
    gesendete) Chunk-Namen zu failed, Schleife `break`, Ergebnis trägt
    `interpretQuotaExhausted: true` + `interpretError` = e.message.
  - `retryInterpretation`: bei `e.dailyQuota` → `interpretQuotaExhausted: true`.
  - `attachInterpretations`: setzt `interpretQuotaExhausted: false` (Erfolg räumt).
- `web/src/components/library/InterpretAllBar.jsx`: bei
  `result.interpretQuotaExhausted` Button disabled + title-Tooltip mit der
  Quota-Meldung (nur falls trivial einpassbar — sonst weglassen und notieren).
- Tests in `web/src/lib/interpret.test.js`: Stop-der-Schleife (fetch-Mock zählt
  Calls), Flag gesetzt/geräumt, retry-Pfad.

## Task 4 (parallel, kein Code) — KI-Modell-Research-Doc

- `docs/2026-07-17-ki-modell-research.md`: Gemini-Free-Tier-Quotas je Modell
  (welche teilen Töpfe?), Paid-Tier-Preise, Claude sonnet-5 (Preis, Payment-
  Hürde support.claude.com), Alternativen (z. B. OpenRouter als Payment-Umweg).
  Deliverable = Entscheidungsvorlage mit Empfehlung, KEINE Code-Änderung.

## Abschluss (Koordination)

1. Review-Pass über den Diff (Spec-Treue + Qualität).
2. Full-Suite: `npm run test:server` + `cd web && npx vitest run` + Build.
3. AppleDouble-Cleanup (`find . -name '._*' -delete`).
4. Push auf main (= Auto-Deploy), Live-Health-Check.
5. RESUME.md + Memory aktualisieren.
