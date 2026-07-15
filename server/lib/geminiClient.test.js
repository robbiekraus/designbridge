import test from 'node:test';
import assert from 'node:assert/strict';
import { makeGeminiClient } from './geminiClient.js';

// Fake-fetch: zeichnet den Request auf und liefert eine kanonische Gemini-Antwort.
function fakeFetch(response = {}) {
  const calls = [];
  const impl = async (url, opts) => {
    calls.push({ url, opts, body: JSON.parse(opts.body) });
    return {
      ok: response.status ? response.status < 400 : true,
      status: response.status ?? 200,
      json: async () =>
        response.body ?? {
          candidates: [{ content: { parts: [{ text: '{"ok":true}' }] } }],
          modelVersion: 'gemini-2.5-flash',
        },
    };
  };
  return { impl, calls };
}

const IMAGE_MSG = [{
  role: 'user',
  content: [
    { type: 'image', source: { type: 'base64', media_type: 'image/png', data: 'QUJD' } },
    { type: 'text', text: 'Analysiere das Bild.' },
  ],
}];

test('makeGeminiClient mappt Anthropic-Params auf einen Gemini-Request', async () => {
  const { impl, calls } = fakeFetch();
  const client = makeGeminiClient({ apiKey: 'g-key', model: 'gemini-2.5-flash', fetchImpl: impl });

  await client.messages.create({ model: 'claude-sonnet-4-5', max_tokens: 4096, messages: IMAGE_MSG });

  assert.equal(calls.length, 1);
  const { url, opts, body } = calls[0];
  assert.match(url, /generativelanguage\.googleapis\.com\/v1beta\/models\/gemini-2\.5-flash:generateContent/);
  assert.equal(opts.headers['x-goog-api-key'], 'g-key');
  // Bild-Block → inline_data, Text-Block → text, Reihenfolge erhalten
  assert.deepEqual(body.contents[0].parts[0], { inline_data: { mime_type: 'image/png', data: 'QUJD' } });
  assert.deepEqual(body.contents[0].parts[1], { text: 'Analysiere das Bild.' });
  // max_tokens → maxOutputTokens; JSON-Antwort erzwungen (alle Callsites parsen JSON)
  assert.equal(body.generationConfig.maxOutputTokens, 4096);
  assert.equal(body.generationConfig.responseMimeType, 'application/json');
});

test('makeGeminiClient mappt die Gemini-Antwort auf die Anthropic-Shape', async () => {
  const { impl } = fakeFetch({
    body: {
      candidates: [{ content: { parts: [{ text: '{"colors":' }, { text: '[]}' }] } }],
      modelVersion: 'gemini-2.5-flash',
    },
  });
  const client = makeGeminiClient({ apiKey: 'g-key', fetchImpl: impl });

  const res = await client.messages.create({ max_tokens: 100, messages: IMAGE_MSG });

  // Callsites machen: response.content.map(b => b.text || '').join('')
  assert.equal(res.content.map(b => b.text || '').join(''), '{"colors":[]}');
  assert.equal(res.content[0].type, 'text');
  assert.equal(res.model, 'gemini-2.5-flash');
});

test('makeGeminiClient meldet abgeschnittene Antworten als stop_reason max_tokens', async () => {
  const { impl } = fakeFetch({
    body: {
      candidates: [{ content: { parts: [{ text: '{"colors": [{' }] }, finishReason: 'MAX_TOKENS' }],
      modelVersion: 'gemini-2.5-flash',
    },
  });
  const client = makeGeminiClient({ apiKey: 'g-key', fetchImpl: impl });

  const res = await client.messages.create({ max_tokens: 100, messages: IMAGE_MSG });

  assert.equal(res.stop_reason, 'max_tokens');
});

test('makeGeminiClient meldet vollständige Antworten als stop_reason end_turn', async () => {
  const { impl } = fakeFetch({
    body: {
      candidates: [{ content: { parts: [{ text: '{"ok":true}' }] }, finishReason: 'STOP' }],
      modelVersion: 'gemini-2.5-flash',
    },
  });
  const client = makeGeminiClient({ apiKey: 'g-key', fetchImpl: impl });

  const res = await client.messages.create({ max_tokens: 100, messages: IMAGE_MSG });

  assert.equal(res.stop_reason, 'end_turn');
});

test('makeGeminiClient übersetzt »Unable to process input image« in eine deutsche Meldung', async () => {
  const { impl } = fakeFetch({
    status: 400,
    body: { error: { message: 'Unable to process input image. Please retry or report in https://developers.generativeai.google/guide/troubleshooting' } },
  });
  const client = makeGeminiClient({ apiKey: 'g-key', fetchImpl: impl });

  await assert.rejects(
    () => client.messages.create({ max_tokens: 100, messages: IMAGE_MSG }),
    /Bild konnte nicht verarbeitet werden/
  );
});

test('makeGeminiClient wirft bei HTTP-Fehler mit Googles Meldung', async () => {
  const { impl } = fakeFetch({
    status: 429,
    body: { error: { message: 'Resource has been exhausted (e.g. check quota).' } },
  });
  const client = makeGeminiClient({ apiKey: 'g-key', fetchImpl: impl });

  await assert.rejects(
    () => client.messages.create({ max_tokens: 100, messages: IMAGE_MSG }),
    /Gemini.*429.*quota/s
  );
});

test('makeGeminiClient weicht bei 503/404 automatisch auf Fallback-Modelle aus', async () => {
  const calls = [];
  const impl = async (url, opts) => {
    calls.push(url);
    if (calls.length === 1) {
      return { ok: false, status: 503, json: async () => ({ error: { message: 'high demand' } }) };
    }
    return {
      ok: true, status: 200,
      json: async () => ({ candidates: [{ content: { parts: [{ text: '{"ok":1}' }] } }], modelVersion: 'fallback-modell' }),
    };
  };
  const client = makeGeminiClient({ apiKey: 'g-key', model: 'gemini-flash-latest', fetchImpl: impl });

  const res = await client.messages.create({ max_tokens: 10, messages: IMAGE_MSG });

  assert.equal(calls.length, 2);
  assert.match(calls[0], /gemini-flash-latest:generateContent/);
  assert.doesNotMatch(calls[1], /gemini-flash-latest/); // zweiter Versuch = anderes Modell
  assert.equal(res.content[0].text, '{"ok":1}');
});

test('makeGeminiClient: wenn alle Modelle scheitern, kommt der letzte Fehler', async () => {
  const impl = async () => ({ ok: false, status: 503, json: async () => ({ error: { message: 'high demand' } }) });
  const client = makeGeminiClient({ apiKey: 'g-key', fetchImpl: impl });

  await assert.rejects(
    () => client.messages.create({ max_tokens: 10, messages: IMAGE_MSG }),
    /Gemini.*503/s
  );
});

test('makeGeminiClient: reiner Text-Content (String) wird als Text-Part gesendet', async () => {
  const { impl, calls } = fakeFetch();
  const client = makeGeminiClient({ apiKey: 'g-key', fetchImpl: impl });

  await client.messages.create({
    max_tokens: 10,
    messages: [{ role: 'user', content: 'nur Text' }],
  });

  assert.deepEqual(calls[0].body.contents[0].parts, [{ text: 'nur Text' }]);
});
