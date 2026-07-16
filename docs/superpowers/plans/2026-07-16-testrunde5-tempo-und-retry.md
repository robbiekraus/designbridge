# Testrunde 5: Tempo, Backoff & Retry-Feedback — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Robs Test-Befunde vom 16.07. nachmittags beheben: (1) Interpretations-Chunks sterben bei 429/503-Bursts sofort (kein Backoff), (2) alles läuft unsichtbar in EINEM Request (Minuten Blindflug), (3) Einzel-Retry gibt null Feedback.

**Architecture:** Backoff-Retry im `geminiClient` (Server); Client-seitiges Chunk-für-Chunk-Senden mit progressivem UI-Update + Abort bei neuem Import (`web/src/lib/interpret.js` + `App.jsx`); Retry-Zeilen-Feedback (`App.jsx` + Pages + `LibraryObjectList`). Server-Route und Server-Chunking bleiben unverändert (ein 4er-Client-Request = genau 1 Server-Chunk).

**Tech Stack:** Server-Tests **node:test** (`npm run test:server`, Stand 189 grün). Web-Tests **Vitest** (`cd web && npx vitest run`, Stand 330 grün). NIEMALS Watch-Modus.

**Betriebsregeln:** Push auf `main` = Railway-Auto-Deploy → nur am Ende. Nach Writes `find . -name '._*' -delete`. Arbeit direkt auf `main`, Commits pro Task.

---

### Task 1: Backoff-Retry im Gemini-Adapter

**Files:**
- Modify: `server/lib/geminiClient.js`
- Test: `server/lib/geminiClient.test.js`

**Warum:** Die Kette probiert bei 429/503 beide Modelle innerhalb ~1s und wirft dann endgültig. Free-Tier-Bursts (Scan + 3 Chunks + Retries) drosseln beide Modelle gleichzeitig → Chunks sterben, obwohl 10s später alles frei wäre. Gemini-429-Antworten enthalten sogar die empfohlene Wartezeit (`RetryInfo.retryDelay`, z. B. `"12s"`).

**Design:**
- Bis zu 3 Runden über die Kandidaten-Kette. Runde 1 sofort (wie bisher), vor Runde 2/3 warten.
- Wartezeit = max(Schedule `[2000, 8000]` ms, von Gemini gemeldetes `retryDelay` der letzten 429-Antwort, gedeckelt bei 15s).
- `sleepImpl` injizierbar (Tests laufen ohne echte Wartezeit).
- Nicht-retrybare Fehler (z. B. 400) werfen weiterhin sofort. Kettenerschöpfungs-Log bleibt (jetzt nach der letzten Runde).

- [ ] **Step 1: Failing Tests** (node:test-Stil der Datei, Fake-fetch + Fake-sleep):

```js
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
```

- [ ] **Step 2: FAIL bestätigen** — `node --test server/lib/geminiClient.test.js`
- [ ] **Step 3: Implementierung.** Signatur: `makeGeminiClient({ apiKey, model, fetchImpl, sleepImpl } = {})` mit Default `sleepImpl = (ms) => new Promise((r) => setTimeout(r, ms))`. Kern:

```js
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
```

Im `create`: die bestehende Kandidaten-Schleife in `for (let round = 0; ; round++)` wrappen. Struktur:

```js
        const candidates = [model, ...FALLBACK_MODELS.filter((m) => m !== model)];
        let lastError;
        let lastRetryDelay = 0;
        for (let round = 0; round <= RETRY_SCHEDULE_MS.length; round++) {
          if (round > 0) await sleepImpl(Math.min(Math.max(RETRY_SCHEDULE_MS[round - 1], lastRetryDelay), MAX_RETRY_DELAY_MS));
          for (const m of candidates) {
            const res = await fetchImpl(/* wie bisher */);
            const data = await res.json().catch(() => ({}));
            if (!res.ok) {
              /* 400-Bild-Sonderfall wie bisher */
              lastError = new Error(`Gemini-API-Fehler (HTTP ${res.status}): ${msg}`);
              if (RETRYABLE.has(res.status)) { lastRetryDelay = Math.max(lastRetryDelay, retryDelayMs(data)); continue; }
              throw lastError;
            }
            /* Erfolgs-Return wie bisher */
          }
        }
        console.warn(`[gemini] Fallback-Kette erschöpft nach ${RETRY_SCHEDULE_MS.length + 1} Runden (${candidates.join(' → ')}): ${lastError?.message}`);
        throw lastError;
```

(`lastRetryDelay` pro Runde zurücksetzen ist ok, aber nicht nötig — max() reicht. Bestehende Semantik für Erfolg/400 unangetastet.)

- [ ] **Step 4: Bestehende Tests anpassen** — der Degradierungs-Stopp-Test (`erwartete 2 Calls bei 503`) erwartet jetzt 6 Calls über 3 Runden (Assertion aktualisieren, Kommentar dazu; die Kern-Assertion „kein flash-lite" bleibt). Alle grün: `npm run test:server`
- [ ] **Step 5: Commit** — `Fix: Gemini-Backoff-Retry — 3 Runden mit Wartezeit statt Sofort-Aufgabe bei 429/503`

---

### Task 2: Progressive Interpretation im Client + Abort bei neuem Import

**Files:**
- Modify: `web/src/lib/interpret.js` (`requestInterpretations`, `runInterpretation`)
- Modify: `web/src/App.jsx` (`handleImported`, `handleRetryInterpret` Batch-Zweig)
- Test: bestehende Testdateien zu `interpret.js` (Vitest; finden via `grep -rln "runInterpretation" web/src --include="*.test.*"`)

**Warum:** Bisher schickt der Client ALLE Bausteine in einem Request; der Server chunkt intern, aber der Nutzer sieht Minuten lang nichts. Neu: Client schickt 4er-Chunks einzeln (sequenziell — schont das Free-Tier-RPM zusammen mit Task-1-Backoff) und merged jede Antwort sofort ins UI. Ein neuer Import bricht laufende Interpretations-Requests des alten ab.

**Design `runInterpretation(result, { onProgress, signal } = {})`:**

```js
const CLIENT_CHUNK_SIZE = 4; // == Server-CHUNK_SIZE: 1 Request = genau 1 KI-Call

export async function requestInterpretations(importId, components, { signal } = {}) {
  const res = await fetch('/api/interpret/components', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ import_id: importId, components }),
    signal,
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Interpretation fehlgeschlagen');
  return data;
}

export async function runInterpretation(result, { onProgress, signal } = {}) {
  const todo = componentsNeedingInterpretation(result);
  const importId = result?.raw?.meta?.import_id;
  if (!['image', 'url', 'repo'].includes(result?.source) || !importId || todo.length === 0) return null;

  const chunks = [];
  for (let i = 0; i < todo.length; i += CLIENT_CHUNK_SIZE) chunks.push(todo.slice(i, i + CLIENT_CHUNK_SIZE));

  let acc = { ...result, interpretPending: true, interpretError: null };
  const failed = [];
  let lastError = null;
  let anySuccess = false;

  // Sequenziell, nicht parallel: Free-Tier-RPM. Der Server-Backoff (Task 1)
  // fängt Drosselungen; hier zusätzlich zu parallelisieren würde sie provozieren.
  for (const chunk of chunks) {
    if (signal?.aborted) return null; // neuer Import übernimmt — Ergebnis verwerfen
    try {
      const data = await requestInterpretations(importId, chunk, { signal });
      anySuccess = true;
      acc = attachInterpretations(acc, data);
      failed.push(...(data.failed ?? []));
      // Zwischenstand zeigen: pending bleibt true bis zum letzten Chunk
      acc = { ...acc, interpretPending: true, interpretFailed: [...failed] };
      onProgress?.(acc);
    } catch (e) {
      if (signal?.aborted || e?.name === 'AbortError') return null;
      lastError = e;
      failed.push(...chunk.map((c) => c.name));
      acc = { ...acc, interpretPending: true, interpretFailed: [...failed] };
      onProgress?.(acc);
    }
  }
  return {
    ...acc,
    interpretPending: false,
    interpretFailed: failed,
    interpretError: !anySuccess && lastError ? (lastError.message || String(lastError)) : null,
  };
}
```

Hinweis: `attachInterpretations` setzt `interpretPending:false`/`interpretFailed` aus der Einzel-Antwort — deshalb überschreiben wir direkt danach mit dem akkumulierten Stand. `attachInterpretations` selbst NICHT ändern (Einzel-Retry-Pfad nutzt es unverändert).

**`App.jsx`:** Ein `useRef` für den laufenden Interpretations-Abort:

```js
  const interpretAbortRef = useRef(null);

  const startInterpretation = (base) => {
    interpretAbortRef.current?.abort();
    const controller = new AbortController();
    interpretAbortRef.current = controller;
    const apply = (next) => {
      setLastImport((cur) => {
        const applied = applyIfSameImport(cur, next);
        if (applied !== cur) saveLastImport(applied);
        return applied;
      });
    };
    runInterpretation(base, { onProgress: apply, signal: controller.signal }).then((next) => {
      if (next) apply(next);
    });
  };
```

`handleImported` und der Batch-Zweig von `handleRetryInterpret` rufen `startInterpretation(initial)` bzw. `startInterpretation(pending)` statt der bisherigen `runInterpretation(...).then(...)`-Blöcke. (Der `next === null`-Pending-Reset-Fall aus dem Batch-Zweig: bei `null` durch Abort NICHTS tun — der neue Import hat übernommen; bei `null` durch „nichts zu tun" pending zurücksetzen. Unterscheidung: prüfe `controller.signal.aborted`.)

- [ ] **Step 1: Failing Tests** (Vitest, fetch mocken wie in bestehenden Tests):
  - 9 todo-Komponenten → 3 fetch-Aufrufe mit je ≤4 components im Body; `onProgress` wurde nach jedem Chunk mit gemergtem Zwischenstand (interpretPending true) aufgerufen; Endergebnis `interpretPending:false`, alle 9 in `interpretations`.
  - Chunk 2 von 3 rejected (fetch wirft) → Endergebnis enthält Chunk-1+3-Interpretationen, `interpretFailed` = Namen aus Chunk 2, `interpretError` null (anySuccess).
  - ALLE Chunks rejecten → `interpretError` gesetzt, alle Namen failed.
  - `signal` bereits aborted vor Chunk 2 → Rückgabe null, kein weiterer fetch.
- [ ] **Step 2: FAIL bestätigen** — `cd web && npx vitest run -- interpret`
- [ ] **Step 3: Implementierung** wie oben (interpret.js + App.jsx).
- [ ] **Step 4: Bestehende Tests anpassen** — `runInterpretation`-Tests, die die alte Ein-Request-Semantik erwarten (z. B. genau 1 fetch für n Komponenten, oder Options-loses Signature-Verhalten). Prüfabsicht erhalten. Volle Web-Suite grün.
- [ ] **Step 5: Commit** — `Fix: Interpretation progressiv — Client sendet 4er-Chunks einzeln, UI füllt sich sofort, Abort bei neuem Import`

---

### Task 3: Retry-Feedback pro Zeile

**Files:**
- Modify: `web/src/App.jsx` (retryingNames-State)
- Modify: `web/src/pages/Atomics.jsx`, `Components.jsx`, `Patterns.jsx` (Prop durchreichen — Signatur prüfen, sie rendern `LibraryObjectList`)
- Modify: `web/src/components/library/LibraryObjectList.jsx`
- Test: bestehende `LibraryObjectList.test.jsx` erweitern

**Warum:** Einzel-Retry zeigt heute keinerlei Zustand — Zeile bleibt auf „fehlgeschlagen" + aktivem Button, während der Request 30–90s läuft. Rob hielt den Button für kaputt und klickte mehrfach (= zusätzliche Burst-Requests).

**`App.jsx`:**

```js
  const [retryingNames, setRetryingNames] = useState(() => new Set());

  const handleRetryInterpret = (name) => {
    if (name) {
      if (retryingNames.has(name)) return; // Doppelklick-Schutz
      setRetryingNames((s) => new Set(s).add(name));
      retryInterpretation(lastImport, name)
        .then((next) => {
          setLastImport((cur) => {
            const applied = applyIfSameImport(cur, next);
            if (applied !== cur) saveLastImport(applied);
            return applied;
          });
        })
        .finally(() => {
          setRetryingNames((s) => { const n = new Set(s); n.delete(name); return n; });
        });
      return;
    }
    // Batch-Zweig wie in Task 2 (startInterpretation)
  };
```

`retryingNames` an Atomics/Components/Patterns durchreichen → weiter an `LibraryObjectList`.

**`LibraryObjectList.jsx`:** `Row` bekommt `retrying` (bool, `retryingNames?.has(item.name)`):
- Im `interpretFailed`-Block: wenn `retrying` → statt „Interpretation fehlgeschlagen. [Erneut versuchen]" den Hinweis `Wird erneut interpretiert …` (gleicher Stil wie PreviewPlaceholder-Text) und den Button mit `disabled` + `opacity-50`.
- Beim „Mit KI interpretieren"-Button (lifted-Zweig) dieselbe Behandlung.

```jsx
          {item.interpretFailed && (
            <div className="flex items-center gap-2 pt-2 text-[11px] text-zinc-500">
              <span>{retrying ? 'Wird erneut interpretiert …' : 'Interpretation fehlgeschlagen.'}</span>
              {onRetryInterpret && (
                <button
                  onClick={() => onRetryInterpret(item.name)}
                  disabled={retrying}
                  className="text-[11px] px-2 py-0.5 rounded border border-zinc-200 text-zinc-700 hover:bg-zinc-50 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Erneut versuchen
                </button>
              )}
            </div>
          )}
```

- [ ] **Step 1: Failing Tests** — LibraryObjectList: (a) `retryingNames` mit item-Name → Button disabled + Text „Wird erneut interpretiert …"; (b) ohne → wie bisher. App-Ebene (falls App-Tests existieren, sonst weglassen): Doppelklick feuert nur einen Request.
- [ ] **Step 2: FAIL bestätigen** → **Step 3: Implementierung** → **Step 4: Volle Web-Suite grün**
- [ ] **Step 5: Commit** — `UX: Einzel-Retry zeigt Ladezustand und sperrt den Button während des Laufs`

---

### Task 4: Abschluss — Voll-Suiten, RESUME.md, Push (= Live-Deploy)

- [ ] **Step 1:** `npm run test:server` UND `cd web && npx vitest run` — beide komplett grün, Zahlen notieren (vorher 189/330).
- [ ] **Step 2:** `find . -name '._*' -delete`
- [ ] **Step 3:** RESUME.md: Session-Eintrag Testrunde 5 (Robs Befunde → 3 Fixes), Hinweis für Robs nächsten Test: **leere Figma-Datei** verwenden (alte Demo-Komponenten in der Testdatei vermischen sich per Namens-Match). Commit.
- [ ] **Step 4:** `git push` (⚠️ Auto-Deploy), danach Live-Smoke: `curl -s https://designbridge-production.up.railway.app/api/health`.

---

## Bewusst NICHT in dieser Runde
- Parallelität der Chunks (Free-Tier-RPM; erst Backoff beweisen lassen — wenn Rob dann noch Tempo braucht: Concurrency 2 als Folge-Task)
- Figma-Seiten-Namespacing pro Import (gegen Alt-Komponenten-Vermischung) — Folge-Kandidat
- Gemini-Pro-A/B (nach Robs Flash-Urteil, via `GEMINI_MODEL`)
