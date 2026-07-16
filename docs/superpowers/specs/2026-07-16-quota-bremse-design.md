# Quota-Bremse: Tages-Quota (RPD) erkennen und nicht retryen

**Datum:** 2026-07-16 spät (Nachtschicht) · **Status:** ENTWURF → Bau
**Anlass:** Kernbefund der autonomen Session 16.07.: Gemini-Free-Tier-Tages-Quota
(`gemini-3-flash`-Topf, limit 20/Tag) ist das echte Limit. Beide Ketten-Modelle
teilen sich denselben Topf → der Testrunde-5-Backoff verbrennt bei erschöpfter
Tages-Quota bis zu **6 API-Calls pro Klick** für nichts, und der Nutzer sieht nur
generisches Scheitern.

## Ziel

1. Tages-Quota-429 (**RPD**) vom Minuten-429 (**RPM**) unterscheiden.
2. Bei RPD: **sofort aufgeben** — kein Modell-Fallback (gleicher Topf), keine
   Backoff-Runden, keine weiteren Chunks vom Client.
3. Ehrliche deutsche Meldung bis in die UI: „Gemini-Tages-Kontingent erschöpft —
   Reset um Mitternacht kalifornischer Zeit (ca. 09:00 deutscher Zeit)."

## Erkennung (Server, `server/lib/geminiClient.js`)

Googles 429-Body enthält `error.details[]` mit einem
`type.googleapis.com/google.rpc.QuotaFailure`-Eintrag; dessen
`violations[].quotaId` nennt das Fenster, z. B.
`GenerateRequestsPerDayPerProjectPerModel-FreeTier`. **Erkennungsregel:**
Status 429 **und** irgendein `violations[].quotaId` matcht `/perday/i`
(defensiv zusätzlich: `error.details[].metadata.quota_limit` o. ä. wird NICHT
benötigt — quotaId reicht, alles andere bleibt RPM-Verhalten).

Verhalten bei Treffer:
- Fehler werfen mit `isDailyQuota = true` und der deutschen Meldung (s. o.).
- **Keine** weiteren Kandidaten-Modelle, **keine** weiteren Runden, **kein**
  `console.warn`-Ketten-Erschöpfungs-Log (stattdessen ein eigenes
  `console.warn('[gemini] Tages-Quota erschöpft …')` genau einmal).
- RPM-429 (kein PerDay-Match) verhält sich **exakt wie bisher**
  (Kette + Backoff + retryDelay).

## Wire-Format (Routes)

Alle vier KI-Routen mappen `err.isDailyQuota` auf:

```
HTTP 429
{ "error": "<deutsche Meldung>", "daily_quota": true }
```

Betroffen: `POST /api/interpret/components` (interpret.js) ·
`POST /api/scan/image` · `POST /api/scan/url/ai` · `POST /api/scan/repo/ai`
(scan.js). `DEMO_FALLBACK=1`-Verhalten bleibt unverändert (Demo-Fixtures haben
Vorrang — betrifft nur Dev; auf Railway steht der Flag auf false).

## Client (Web)

- `requestInterpretations` (web/src/lib/interpret.js): bei `!res.ok` trägt der
  geworfene Error zusätzlich `dailyQuota: Boolean(data.daily_quota)`.
- `runInterpretation`: wirft ein Chunk-Fehler mit `dailyQuota` → **Schleife
  sofort beenden**, alle restlichen todo-Namen als failed markieren,
  `interpretError` = Server-Meldung, neues Feld `interpretQuotaExhausted: true`
  im Result (persistiert mit ins localStorage-Cache-Objekt, von
  `attachInterpretations`/Retry-Erfolg wieder auf false/weg).
- `retryInterpretation`: bei `dailyQuota`-Fehler ebenfalls
  `interpretQuotaExhausted: true` setzen.
- UI: wo `interpretError` heute angezeigt wird, reicht die Meldung selbst.
  Zusätzlich, wenn billig: bei `interpretQuotaExhausted` den
  „Alle interpretieren"-Button (InterpretAllBar) disabled + Tooltip. Retry-Knöpfe
  je Baustein bleiben aktiv (nach 09:00 funktionieren sie wieder; ein Klick
  kostet dank Fail-Fast jetzt genau 1 Call statt 6).

## Nicht-Ziele

- Kein Countdown/Timer bis 09:00 (Kosmetik).
- Keine Quota-Buchführung im Client (Server-Wahrheit reicht).
- Kein Provider-Wechsel (separates Research-Doc, gleiche Nacht).

## Tests (test-first, 0 echte API-Calls)

- geminiClient: Fake-fetch liefert 429 mit QuotaFailure/PerDay → genau 1
  Fetch-Call, Fehler mit `isDailyQuota`, deutsche Meldung; 429 ohne PerDay →
  bisheriges Ketten-Verhalten (Regressionstest existiert schon).
- Routes: isDailyQuota-Fehler → 429 + `daily_quota:true` (je Route 1 Test).
- Web interpret: dailyQuota-Fehler im 1. Chunk → keine weiteren fetches,
  Rest failed, `interpretQuotaExhausted:true`; Erfolg räumt Flag.
