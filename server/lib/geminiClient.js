// Gemini-Adapter mit Anthropic-kompatibler Oberfläche (messages.create).
// Zweck: die 4 KI-Callsites (claude.js, interpretComponents.js, recognizeWithAi.js,
// deepenRepoWithAi.js) unverändert lassen und nur den Client austauschen.
// Bewusst reines fetch statt SDK (Hard Rule 6: keine neuen Dependencies).
// Spec: docs/superpowers/specs/2026-07-15-gemini-provider-swap.md

// Alias statt Versions-Pin: zeigt immer aufs aktuelle stabile Flash-Modell.
// Hintergrund: gemini-2.5-flash ist für neue Konten abgeschaltet (404,
// Live-Fund 15.07.) — feste Versionen altern, der Alias nicht.
const DEFAULT_MODEL = 'gemini-flash-latest';

// Ausweich-Kette bei 404/429/503. flash-lite steht bewusst NICHT mehr drin:
// es erfand bei Interpretationen generische Inhalte statt des echten
// Bildausschnitts (Testrunden 2+3) — stille Degradierung dorthin verfälschte
// jedes Ergebnis unmarkiert. Lieber ehrlich scheitern; Retry trifft das gute
// Modell, sobald die Lastspitze vorbei ist (Diagnose 16.07.).
const FALLBACK_MODELS = ['gemini-3-flash-preview'];
const RETRYABLE = new Set([404, 429, 503]);
const BASE_URL = 'https://generativelanguage.googleapis.com/v1beta/models';

// Free-Tier-Bursts drosseln oft BEIDE Ketten-Modelle im selben Moment (429/503,
// Robs Test 16.07.: Scan + 3 Interpret-Chunks + Retries → alle Chunks tot).
// Statt sofort aufzugeben: bis zu 3 Runden über die Kette, mit Wartezeit —
// Gemini nennt sie bei 429 sogar selbst (RetryInfo.retryDelay).
const RETRY_SCHEDULE_MS = [2000, 8000];
const MAX_RETRY_DELAY_MS = 15000;

function retryDelayMs(errorData) {
  const detail = (errorData?.error?.details ?? []).find((d) => d?.retryDelay);
  if (!detail) return 0;
  const s = parseFloat(String(detail.retryDelay)); // "3s" | "12.5s"
  return Number.isFinite(s) ? Math.min(s * 1000, MAX_RETRY_DELAY_MS) : 0;
}

// Anthropic-Content-Blöcke → Gemini-Parts (Reihenfolge bleibt erhalten).
function toParts(content) {
  if (typeof content === 'string') return [{ text: content }];
  return content.map((block) => {
    if (block.type === 'image' && block.source?.type === 'base64') {
      return { inline_data: { mime_type: block.source.media_type, data: block.source.data } };
    }
    if (block.type === 'text') return { text: block.text };
    throw new Error(`Gemini-Adapter: nicht unterstützter Content-Block "${block.type}"`);
  });
}

export function makeGeminiClient({
  apiKey = process.env.GEMINI_API_KEY,
  model = process.env.GEMINI_MODEL || DEFAULT_MODEL,
  fetchImpl = fetch,
  sleepImpl = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
} = {}) {
  return {
    messages: {
      // Nimmt Anthropic-Params entgegen; `params.model` (claude-*) wird bewusst
      // ignoriert — welches Gemini-Modell läuft, entscheidet der Adapter/Env.
      async create(params) {
        const body = {
          contents: params.messages.map((m) => ({
            role: m.role === 'assistant' ? 'model' : 'user',
            parts: toParts(m.content),
          })),
          generationConfig: {
            maxOutputTokens: params.max_tokens,
            // Rekonstruktion soll originalgetreu sein, nicht kreativ: die
            // Default-Temperature (~1.0) war Mitursache der "generischen"
            // Interpretationen (Diagnose 16.07.). Gilt client-weit für alle
            // 4 Callsites — auch Scan/Recognize/Deepen sind konservative
            // JSON-Extraktion, niedrige Temperature ist dort ebenso richtig.
            temperature: params.temperature ?? 0.2,
            // Alle Callsites parsen JSON — erzwungenes JSON eliminiert
            // Gemini-Preambles ("Here is the JSON…"), die JSON.parse brechen.
            responseMimeType: 'application/json',
          },
        };
        if (params.system) body.systemInstruction = { parts: [{ text: params.system }] };

        const candidates = [model, ...FALLBACK_MODELS.filter((m) => m !== model)];
        let lastError;
        let lastRetryDelay = 0;
        // Runde 1 sofort (wie bisher); vor Runde 2/3 warten — die Wartezeit
        // ist das Schedule-Minimum ODER die von Gemini gemeldete retryDelay,
        // je nachdem was länger ist (gedeckelt bei MAX_RETRY_DELAY_MS).
        for (let round = 0; round <= RETRY_SCHEDULE_MS.length; round++) {
          if (round > 0) {
            await sleepImpl(Math.min(Math.max(RETRY_SCHEDULE_MS[round - 1], lastRetryDelay), MAX_RETRY_DELAY_MS));
          }
          for (const m of candidates) {
            const res = await fetchImpl(`${BASE_URL}/${m}:generateContent`, {
              method: 'POST',
              headers: { 'content-type': 'application/json', 'x-goog-api-key': apiKey },
              body: JSON.stringify(body),
            });

            const data = await res.json().catch(() => ({}));
            if (!res.ok) {
              const msg = data?.error?.message || 'unbekannter Fehler';
              // Kaputte/unlesbare Bilddatei: Googles englischer Fehler samt
              // Troubleshooting-Link hilft dem Nutzer nicht (Live-Fund 15.07.).
              if (res.status === 400 && /input image/i.test(msg)) {
                throw new Error('Das Bild konnte nicht verarbeitet werden — bitte eine gültige Bilddatei (PNG/JPG) hochladen.');
              }
              lastError = new Error(`Gemini-API-Fehler (HTTP ${res.status}): ${msg}`);
              if (RETRYABLE.has(res.status)) {
                lastRetryDelay = Math.max(lastRetryDelay, retryDelayMs(data));
                continue; // nächstes Modell probieren
              }
              throw lastError;
            }

            const candidate = data.candidates?.[0] ?? {};
            const parts = candidate.content?.parts ?? [];
            return {
              content: parts.map((p) => ({ type: 'text', text: p.text ?? '' })),
              model: data.modelVersion || m,
              // Anthropic-kompatibel: Abschneiden am Token-Limit muss für die
              // Callsites erkennbar sein, sonst parsen sie halbes JSON.
              stop_reason: candidate.finishReason === 'MAX_TOKENS' ? 'max_tokens' : 'end_turn',
            };
          }
        }
        // Kette über alle Runden erschöpft (alle Modelle 404/429/503):
        // sichtbar machen, damit gehäufte Ausfälle in den Logs auffallen statt
        // nur als Nutzer-Retries (seit dem Degradierungs-Stopp gibt es ein
        // Modell weniger in der Kette).
        console.warn(`[gemini] Fallback-Kette erschöpft nach ${RETRY_SCHEDULE_MS.length + 1} Runden (${candidates.join(' → ')}): ${lastError?.message}`);
        throw lastError;
      },
    },
  };
}
