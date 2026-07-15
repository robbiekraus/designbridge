# Gemini-Provider-Swap — KI-Aufrufe wahlweise über Google Gemini (Gratis-Tier)

**Datum:** 2026-07-15 · **Status:** BESCHLOSSEN (Rob: „mach mal den gemini umbau")

## Warum

Das Anthropic-API-Konto hinter dem `.env`-Key hat kein Guthaben (getrennter Topf
vom claude.ai-Abo). Alle KI-Features (Bild-Scan, Interpretation, KI-Vertiefen)
liefen deshalb live nur als Demo/Fehlerpfad. Google Gemini hat ein echtes
Gratis-Kontingent inkl. Vision → KI-Features laufen dauerhaft kostenlos.

## Kernidee: Adapter statt Umbau

Alle 4 KI-Aufrufstellen nutzen dasselbe injizierbare Muster
(`client ?? new Anthropic(...)` + `c.messages.create({model, max_tokens, messages})`
→ `response.content[].text` → JSON). Der Swap tauscht NUR den Client:

- **`server/lib/geminiClient.js`** — `makeGeminiClient({apiKey, model, fetchImpl})`
  gibt ein Objekt mit Anthropic-kompatiblem `messages.create` zurück:
  - Request-Mapping: `{type:'image', source:{base64…}}` → `inline_data`,
    `{type:'text'}` → `{text}`, `max_tokens` → `generationConfig.maxOutputTokens`,
    `responseMimeType: 'application/json'` (alle 4 Stellen erwarten JSON —
    eliminiert Gemini-Preamble-Probleme).
  - Response-Mapping: `candidates[0].content.parts[].text` →
    `{content:[{type:'text', text}], model}`.
  - REST via nativem `fetch` (`v1beta/models/<model>:generateContent`,
    Header `x-goog-api-key`) — **keine neue Dependency**.
  - Fehler ≠ 200 → `Error` mit Status + Google-Meldung.
- **`server/lib/aiClient.js`** — zentraler Umschalter:
  - `getAiClient()`: `AI_PROVIDER=gemini|anthropic` erzwingt; sonst
    Gemini gdw. `GEMINI_API_KEY` gesetzt und kein brauchbarer Anthropic-Key;
    Default bleibt Anthropic (bestehendes Verhalten unverändert).
  - `aiKeyConfigured()`: ein Provider-Key vorhanden? (ersetzt den reinen
    Anthropic-Check im 503-Guard von `scan.js` und in `/api/health`).
  - `aiProviderName()` für Health/Logs.
- **Callsites** (`claude.js`, `interpretComponents.js`, `recognizeWithAi.js`,
  `deepenRepoWithAi.js`): einzige Änderung `client ?? getAiClient()`;
  `meta.model` nutzt `response.model ?? <bisheriger Name>`.

## Nicht-Ziele / Garantien

- Prompts, Pipeline, UI, Tests der Fachlogik: **unangetastet**.
- Anthropic-Weg bleibt voll funktionsfähig (Fallback, `AI_PROVIDER=anthropic`).
- Kein SDK-Install (Hard Rule 6) — reines fetch.

## Modell & Env

- `GEMINI_API_KEY` (aistudio.google.com, gratis, ohne Karte)
- `GEMINI_MODEL` optional, Default `gemini-2.5-flash` (multimodal, Gratis-Tier)
- `AI_PROVIDER` optional (`gemini` | `anthropic`)

## Verifikation

Unit-Tests (Fake-fetch, 0 Kosten): Request-/Response-Mapping, Fehlerpfad,
Provider-Wahl-Matrix. Live-Test erst nach Robs Key (Railway-Variable).
