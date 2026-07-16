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
  // 429 ist jetzt retrybar (Backoff-Retry, Testrunde 5) — sleepImpl fake
  // halten, sonst wartet der Test über echte Timer (2s + 8s).
  const client = makeGeminiClient({ apiKey: 'g-key', fetchImpl: impl, sleepImpl: async () => {} });

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
  // Einziger Ausweich = gemini-3-flash-preview. flash-lite ist seit dem
  // Degradierungs-Stopp (16.07.) komplett aus der Kette — es erfand bei
  // Interpretationen generische Inhalte (Qualitäts-Fund Testphase 15.07.).
  assert.match(calls[1], /gemini-3-flash-preview:generateContent/);
  assert.equal(res.content[0].text, '{"ok":1}');
});

test('makeGeminiClient: wenn alle Modelle scheitern, kommt der letzte Fehler', async () => {
  const impl = async () => ({ ok: false, status: 503, json: async () => ({ error: { message: 'high demand' } }) });
  // sleepImpl fake halten (3 Retry-Runden würden sonst über echte Timer laufen).
  const client = makeGeminiClient({ apiKey: 'g-key', fetchImpl: impl, sleepImpl: async () => {} });

  await assert.rejects(
    () => client.messages.create({ max_tokens: 10, messages: IMAGE_MSG }),
    /Gemini.*503/s
  );
});

test('makeGeminiClient: flash-lite steht NICHT mehr in der Fallback-Kette (Degradierungs-Stopp)', async () => {
  const calls = [];
  const impl = async (url) => {
    calls.push(url);
    return { ok: false, status: 503, json: async () => ({ error: { message: 'overloaded' } }) };
  };
  // sleepImpl fake halten (Backoff-Retry, Testrunde 5) — sonst wartet der
  // Test über echte Timer (2s + 8s) auf die 3 Runden.
  const client = makeGeminiClient({ apiKey: 'g-key', fetchImpl: impl, sleepImpl: async () => {} });

  await assert.rejects(
    () => client.messages.create({ max_tokens: 10, messages: IMAGE_MSG }),
    /503/
  );

  // Default-Modell + genau ein Fallback (gemini-3-flash-preview), jetzt über
  // 3 Retry-Runden (Backoff-Retry, Testrunde 5) = 6 Calls statt 2 — aber
  // weiterhin kein stilles Abgleiten auf flash-lite, das nachweislich
  // generische Inhalte erfand statt des echten Bildausschnitts (Testrunden 2+3).
  assert.equal(calls.length, 6);
  assert.match(calls[0], /gemini-flash-latest:generateContent/);
  assert.match(calls[1], /gemini-3-flash-preview:generateContent/);
  assert.ok(calls.every((url) => !/flash-lite/.test(url)));
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

test('makeGeminiClient setzt temperature standardmäßig auf 0.2 (originalgetreue Rekonstruktion statt kreativ)', async () => {
  const { impl, calls } = fakeFetch();
  const client = makeGeminiClient({ apiKey: 'g-key', fetchImpl: impl });

  await client.messages.create({ max_tokens: 100, messages: IMAGE_MSG });

  assert.equal(calls[0].body.generationConfig.temperature, 0.2);
});

test('makeGeminiClient reicht eine explizit übergebene temperature durch', async () => {
  const { impl, calls } = fakeFetch();
  const client = makeGeminiClient({ apiKey: 'g-key', fetchImpl: impl });

  await client.messages.create({ max_tokens: 100, temperature: 0.7, messages: IMAGE_MSG });

  assert.equal(calls[0].body.generationConfig.temperature, 0.7);
});

// --- Backoff-Retry (Testrunde 5, Task 1) ---

test('429 in Runde 1 auf beiden Modellen, Erfolg in Runde 2 → kein Wurf', async () => {
  let n = 0;
  const sleeps = [];
  const fetchImpl = async () => {
    n++;
    if (n <= 2) return { ok: false, status: 429, json: async () => ({ error: { message: 'quota', details: [{ '@type': 'type.googleapis.com/google.rpc.RetryInfo', retryDelay: '3s' }] } }) };
    return { ok: true, json: async () => ({ candidates: [{ content: { parts: [{ text: '{}' }] } }] }) };
  };
  const client = makeGeminiClient({ apiKey: 'k', fetchImpl, sleepImpl: async (ms) => { sleeps.push(ms); } });
  const res = await client.messages.create({ max_tokens: 100, messages: [{ role: 'user', content: 'hi' }] });
  assert.equal(res.stop_reason, 'end_turn');
  assert.equal(n, 3); // 2 Fehlversuche Runde 1 + 1 Erfolg Runde 2
  assert.equal(sleeps.length, 1);
  assert.equal(sleeps[0], 3000); // retryDelay "3s" > Schedule 2000
});

test('dauerhaft 503 → nach 3 Runden über 2 Modelle = 6 Calls, 2 sleeps, wirft', async () => {
  let n = 0;
  const sleeps = [];
  const fetchImpl = async () => { n++; return { ok: false, status: 503, json: async () => ({ error: { message: 'overloaded' } }) }; };
  const client = makeGeminiClient({ apiKey: 'k', fetchImpl, sleepImpl: async (ms) => { sleeps.push(ms); } });
  await assert.rejects(() => client.messages.create({ max_tokens: 100, messages: [{ role: 'user', content: 'hi' }] }), /503/);
  assert.equal(n, 6);
  assert.deepEqual(sleeps, [2000, 8000]); // kein retryDelay in 503 → Schedule
});

test('400 wirft sofort ohne Retry-Runden', async () => {
  let n = 0;
  const fetchImpl = async () => { n++; return { ok: false, status: 400, json: async () => ({ error: { message: 'bad' } }) }; };
  const client = makeGeminiClient({ apiKey: 'k', fetchImpl, sleepImpl: async () => {} });
  await assert.rejects(() => client.messages.create({ max_tokens: 100, messages: [{ role: 'user', content: 'hi' }] }));
  assert.equal(n, 1);
});

// --- Per-Fetch-Timeout (Reload-Limbo-Folgefix: ein hängender Request darf
// nicht den ganzen Chunk blockieren) ---

// Simuliert echtes fetch-Verhalten: hängt für immer, respektiert aber das
// AbortSignal aus opts und wirft dann einen echten AbortError.
function hangingFetchImpl() {
  return async (url, opts) => new Promise((resolve, reject) => {
    opts.signal?.addEventListener('abort', () => {
      const err = new Error('The operation was aborted');
      err.name = 'AbortError';
      reject(err);
    });
  });
}

test('jeder fetch-Call bekommt ein AbortSignal (Voraussetzung fürs Timeout)', async () => {
  const { impl, calls } = fakeFetch();
  const client = makeGeminiClient({ apiKey: 'k', fetchImpl: impl });
  await client.messages.create({ max_tokens: 10, messages: [{ role: 'user', content: 'hi' }] });
  assert.ok(calls[0].opts.signal instanceof AbortSignal);
});

test('hängender Request wird nach timeoutMs abgebrochen und wie 503 behandelt — Fallback-Modell greift', async () => {
  const calls = [];
  const fetchImpl = async (url, opts) => {
    calls.push(url);
    if (calls.length === 1) return hangingFetchImpl()(url, opts); // erster Call hängt → muss timeouten
    return { ok: true, json: async () => ({ candidates: [{ content: { parts: [{ text: '{"ok":1}' }] } }], modelVersion: 'fallback' }) };
  };
  const client = makeGeminiClient({ apiKey: 'k', fetchImpl, timeoutMs: 20, sleepImpl: async () => {} });

  const res = await client.messages.create({ max_tokens: 10, messages: [{ role: 'user', content: 'hi' }] });

  assert.equal(calls.length, 2); // Call 1 timeoutet → Fallback-Modell (Call 2) übernimmt
  assert.equal(res.content[0].text, '{"ok":1}');
});

test('Timeout auf allen Modellen/Runden → wirft nach Kettenende mit Timeout-Meldung (wie erschöpfte 503-Kette)', async () => {
  let n = 0;
  const fetchImpl = async (url, opts) => { n++; return hangingFetchImpl()(url, opts); };
  const client = makeGeminiClient({ apiKey: 'k', fetchImpl, timeoutMs: 10, sleepImpl: async () => {} });

  await assert.rejects(
    () => client.messages.create({ max_tokens: 10, messages: [{ role: 'user', content: 'hi' }] }),
    /Timeout/
  );
  assert.equal(n, 6); // 2 Modelle x 3 Runden, exakt wie die erschöpfte 503-Kette
});

test('GEMINI_TIMEOUT_MS überschreibt den Default (60000ms)', async () => {
  const original = process.env.GEMINI_TIMEOUT_MS;
  process.env.GEMINI_TIMEOUT_MS = '15';
  try {
    let n = 0;
    const fetchImpl = async (url, opts) => { n++; return hangingFetchImpl()(url, opts); };
    const client = makeGeminiClient({ apiKey: 'k', fetchImpl, sleepImpl: async () => {} });
    await assert.rejects(
      () => client.messages.create({ max_tokens: 10, messages: [{ role: 'user', content: 'hi' }] }),
      /Timeout/
    );
    assert.equal(n, 6);
  } finally {
    if (original === undefined) delete process.env.GEMINI_TIMEOUT_MS;
    else process.env.GEMINI_TIMEOUT_MS = original;
  }
});

test('schnelle Antwort innerhalb des Timeouts wirft nicht (kein falsch-positiver Abort)', async () => {
  const { impl } = fakeFetch();
  const client = makeGeminiClient({ apiKey: 'k', fetchImpl: impl, timeoutMs: 5000 });
  const res = await client.messages.create({ max_tokens: 10, messages: [{ role: 'user', content: 'hi' }] });
  assert.equal(res.content[0].text, '{"ok":true}');
});

// --- Tages-Quota (RPD) Fail-Fast (Quota-Bremse, Task 1) ---
// Kernbefund 16.07.: beide Ketten-Modelle teilen sich denselben Free-Tier-Topf.
// Bei Tages-Quota-Erschöpfung bringt weder Modell-Fallback noch Backoff etwas —
// im Gegensatz zu gewöhnlichem RPM-429 (Minuten-Fenster), das weiterhin die
// volle Kette + Backoff durchläuft (Regressionstests oben bleiben unverändert grün).

test('429 mit QuotaFailure/PerDay-Violation → sofortiger Fail-Fast: isDailyQuota, deutsche Meldung, genau 1 Fetch-Call', async () => {
  const calls = [];
  const fetchImpl = async (url) => {
    calls.push(url);
    return {
      ok: false,
      status: 429,
      json: async () => ({
        error: {
          message: 'Resource has been exhausted (e.g. check quota).',
          details: [{
            '@type': 'type.googleapis.com/google.rpc.QuotaFailure',
            violations: [{ quotaId: 'GenerateRequestsPerDayPerProjectPerModel-FreeTier', quotaMetric: 'x' }],
          }],
        },
      }),
    };
  };
  // sleepImpl fake halten — bei Tages-Quota darf es aber ohnehin nie zum
  // Backoff-Sleep kommen (das wäre genau der Bug, den wir fixen).
  const client = makeGeminiClient({ apiKey: 'k', fetchImpl, sleepImpl: async () => { throw new Error('sollte nicht schlafen — Fail-Fast!'); } });

  await assert.rejects(
    () => client.messages.create({ max_tokens: 100, messages: [{ role: 'user', content: 'hi' }] }),
    (err) => {
      assert.equal(err.isDailyQuota, true);
      assert.match(err.message, /Gemini-Tages-Kontingent erschöpft/);
      assert.match(err.message, /09:00/);
      return true;
    }
  );
  // Kein Fallback-Modell, keine Retry-Runde — genau 1 Call (nicht 2 oder 6).
  assert.equal(calls.length, 1);
});

test('429 ohne QuotaFailure/PerDay bleibt reguläres RPM-429 → volle Fallback-/Backoff-Kette wie bisher', async () => {
  let n = 0;
  const fetchImpl = async () => { n++; return { ok: false, status: 429, json: async () => ({ error: { message: 'quota' } }) }; };
  const client = makeGeminiClient({ apiKey: 'k', fetchImpl, sleepImpl: async () => {} });
  await assert.rejects(
    () => client.messages.create({ max_tokens: 100, messages: [{ role: 'user', content: 'hi' }] }),
    (err) => {
      assert.notEqual(err.isDailyQuota, true);
      return true;
    }
  );
  assert.equal(n, 6); // 2 Modelle × 3 Runden — unverändertes RPM-Verhalten
});
