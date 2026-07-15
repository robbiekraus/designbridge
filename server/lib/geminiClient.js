// Gemini-Adapter mit Anthropic-kompatibler Oberfläche (messages.create).
// Zweck: die 4 KI-Callsites (claude.js, interpretComponents.js, recognizeWithAi.js,
// deepenRepoWithAi.js) unverändert lassen und nur den Client austauschen.
// Bewusst reines fetch statt SDK (Hard Rule 6: keine neuen Dependencies).
// Spec: docs/superpowers/specs/2026-07-15-gemini-provider-swap.md

const DEFAULT_MODEL = 'gemini-2.5-flash';
const BASE_URL = 'https://generativelanguage.googleapis.com/v1beta/models';

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
            // Alle Callsites parsen JSON — erzwungenes JSON eliminiert
            // Gemini-Preambles ("Here is the JSON…"), die JSON.parse brechen.
            responseMimeType: 'application/json',
          },
        };
        if (params.system) body.systemInstruction = { parts: [{ text: params.system }] };

        const res = await fetchImpl(`${BASE_URL}/${model}:generateContent`, {
          method: 'POST',
          headers: { 'content-type': 'application/json', 'x-goog-api-key': apiKey },
          body: JSON.stringify(body),
        });

        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          const msg = data?.error?.message || 'unbekannter Fehler';
          throw new Error(`Gemini-API-Fehler (HTTP ${res.status}): ${msg}`);
        }

        const parts = data.candidates?.[0]?.content?.parts ?? [];
        return {
          content: parts.map((p) => ({ type: 'text', text: p.text ?? '' })),
          model: data.modelVersion || model,
        };
      },
    },
  };
}
