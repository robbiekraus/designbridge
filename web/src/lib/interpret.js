// web/src/lib/interpret.js
// Automatische KI-Interpretation der Bausteine ohne Hand-Template nach einem
// Bild-Import. Ergebnis wird ins lastImport-Result gemerged (localStorage-Cache).
import { matchTemplate } from './components/templates/registry.js';

const KINDS = [
  ['atoms', 'atom'],
  ['molecules', 'molecule'],
  ['organisms', 'organism'],
  ['templates', 'template'],
];

/** Bausteine ohne Template, die noch keine Interpretation im Cache haben. */
export function componentsNeedingInterpretation(result) {
  const raw = result?.raw;
  if (!raw) return [];
  const have = result?.interpretations ?? {};
  const out = [];
  for (const [rawKey, kind] of KINDS) {
    for (const item of raw[rawKey] ?? []) {
      const lifted = Boolean(item.sourceCode);
      // FF2-Konsistenz: bei gehobenem Code zählt der echte Code, nicht ein
      // zufälliger Template-Namenstreffer (CardSkeleton → card).
      if (!lifted && matchTemplate(item.name)) continue;
      // Repo-Bausteine ohne gehobenen Code (Patterns, pfad-only Dateien) haben
      // kein Material — sie würden im Batch nur als "failed" enden.
      if (result?.source === 'repo' && !lifted) continue;
      if (have[item.name]) continue;
      out.push({
        name: item.name,
        kind,
        variants: item.variants ?? [],
        notes: item.notes ?? '',
        bbox: item.bbox ?? null,
        selector: item.selector ?? null,
        path: item.path ?? null,
      });
    }
  }
  return out;
}

// 1 Baustein pro Request (Live-Befund 17.07., Paid-Tier): 4 komplexe
// Bausteine in EINEM Gemini-Call dauerten zusammen >60s und liefen reihenweise
// in den Server-Timeout (502), während Einzel-Calls in 14–54s durchgehen.
// Einzeln = kein Timeout-Stapeln, feinster Fortschritt in der UI. Jeder
// Pool-Worker sendet daher weiterhin genau EIN Item pro Request.
//
// Testrunde 7 Fix A: 13 Bausteine sequenziell = 5–12 Minuten Batch. Statt
// dessen ein Worker-Pool mit Konkurrenz 3 (Paid-Tier: 15–55s/Call, 3 parallel
// bleibt unter 10 RPM) + eine automatische zweite Runde für alles, was in
// Runde 1 gescheitert ist — nur ein echter Doppel-Fehlschlag verlangt noch
// den manuellen Retry-Knopf.
// 6 statt 3 (Robs Feedback 17.07. abends: „mehrere Minuten"): auf dem Paid-
// Tier problemlos, und selbst im Free-Tier bleiben 6 parallele Calls à
// 15–55s unter 10 RPM (Requests starten versetzt, nicht im Sekundentakt).
const POOL_CONCURRENCY = 6;

export async function requestInterpretations(importId, components, { signal } = {}) {
  const res = await fetch('/api/interpret/components', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ import_id: importId, components }),
    signal,
  });
  const data = await res.json();
  if (!res.ok) {
    const err = new Error(data.error || 'Interpretation fehlgeschlagen');
    // Quota-Bremse: Server markiert Tages-Quota-Erschöpfung (RPD) mit
    // daily_quota:true — runInterpretation bricht die Chunk-Schleife darauf
    // sofort ab, statt denselben Fehler pro weiterem Chunk zu wiederholen.
    err.dailyQuota = Boolean(data.daily_quota);
    throw err;
  }
  return data;
}

/** Antwort in das Result mergen (immutable) — beendet den pending-Zustand. */
export function attachInterpretations(result, data) {
  const map = { ...(result.interpretations ?? {}) };
  for (const it of data.interpretations ?? []) {
    map[it.name] = { html: it.html, jsx: it.jsx, model: it.model ?? null, demo: Boolean(data.demo) };
  }
  return {
    ...result,
    interpretations: map,
    interpretFailed: data.failed ?? [],
    interpretPending: false,
    interpretError: null,
    // Jede erfolgreiche Server-Antwort (auch ein Einzel-Retry) räumt eine
    // vorherige Tages-Quota-Sperre — der Server ist die Quota-Wahrheit,
    // nicht der Client (Quota-Bremse).
    interpretQuotaExhausted: false,
  };
}

/**
 * Worker-Pool über eine Item-Queue: höchstens `POOL_CONCURRENCY` Requests
 * gleichzeitig in Flight. Jeder Worker holt sich synchron das nächste Item
 * (kein echtes Multithreading in JS — zwischen zwei Dequeues liegt kein
 * `await`, der Index-Zugriff ist damit atomar), schickt genau EIN Item pro
 * Request und meldet das Ergebnis über `onSettled`, bevor er sich das
 * nächste Item holt. `next()` prüft vor jedem Dequeue `signal.aborted` und
 * `stopFlagRef.stopped` (Quota-Fail-Fast) — sobald eines von beiden gilt,
 * startet kein Worker mehr etwas Neues; bereits laufende Requests werden
 * trotzdem noch eingesammelt. Gibt die NIE gestarteten Items zurück.
 */
async function runPool(items, { importId, signal, stopFlagRef, onSettled }) {
  let idx = 0;
  function next() {
    if (signal?.aborted || stopFlagRef.stopped) return undefined;
    if (idx >= items.length) return undefined;
    return items[idx++];
  }
  async function worker() {
    for (;;) {
      const item = next();
      if (!item) return;
      try {
        const data = await requestInterpretations(importId, [item], { signal });
        if (signal?.aborted) return; // zu spät — Result wird ohnehin verworfen
        onSettled(item, { ok: true, data });
      } catch (e) {
        if (signal?.aborted || e?.name === 'AbortError') return;
        onSettled(item, { ok: false, error: e });
      }
    }
  }
  const n = Math.min(POOL_CONCURRENCY, items.length);
  await Promise.all(Array.from({ length: n }, () => worker()));
  return items.slice(idx);
}

/**
 * Orchestrierung: prüft ob etwas zu tun ist, schickt die offenen Bausteine
 * durch einen Worker-Pool (Konkurrenz 3, ein Item pro Request) und merged
 * jede Antwort SOFORT bei Ankunft. `onProgress` bekommt nach JEDER Antwort
 * den akkumulierten Zwischenstand (interpretPending bleibt bis zum Ende der
 * Auto-Retry-Runde true). Ein `signal` bricht vor dem nächsten Dequeue ab —
 * z. B. weil ein neuer Import gestartet wurde — und verwirft das gesamte
 * Ergebnis (Rückgabe null).
 *
 * Nach Runde 1 bekommen alle gescheiterten Items (außer bei
 * Tages-Quota-Abbruch) genau EINE automatische zweite Runde über denselben
 * Pool — erst was danach noch scheitert, landet in interpretFailed und
 * verlangt den manuellen Retry-Knopf.
 *
 * Tages-Quota (daily_quota): Fail-Fast wie bisher — sobald ein Request das
 * meldet, startet der Pool nichts Neues mehr, bereits laufende Antworten
 * werden noch eingesammelt, alle danach noch nicht erfolgreichen Namen
 * gelten als failed, interpretQuotaExhausted wird true, und es gibt KEINE
 * Auto-Retry-Runde (derselbe Fehler träfe sie sofort wieder).
 *
 * Gibt das nächste Result zurück — oder null, wenn nichts zu tun war oder
 * abgebrochen wurde. Wirft nie: Fehler landen als interpretError/interpretFailed.
 */
export async function runInterpretation(result, { onProgress, signal } = {}) {
  const todo = componentsNeedingInterpretation(result);
  const importId = result?.raw?.meta?.import_id;
  if (!['image', 'url', 'repo'].includes(result?.source) || !importId || todo.length === 0) return null;
  if (signal?.aborted) return null; // neuer Import übernimmt — gar nicht erst starten

  let acc = { ...result, interpretPending: true, interpretError: null };
  let failed = [];
  let anySuccess = false;
  let lastError = null;
  let quotaError = null;
  const stopFlagRef = { stopped: false };

  // Merged eine einzelne Antwort (Erfolg oder Fehlschlag) in `acc`/`failed`
  // und meldet den akkumulierten Zwischenstand — egal ob Runde 1 oder die
  // Auto-Retry-Runde, egal welcher Pool-Worker gerade fertig wurde.
  function onSettled(item, outcome) {
    if (outcome.ok) {
      anySuccess = true;
      acc = attachInterpretations(acc, outcome.data);
      const serverFailed = outcome.data.failed ?? [];
      failed = failed.filter((n) => n !== item.name);
      for (const n of serverFailed) if (!failed.includes(n)) failed.push(n);
    } else {
      lastError = outcome.error;
      if (outcome.error?.dailyQuota) {
        stopFlagRef.stopped = true;
        quotaError = outcome.error;
      }
      if (!failed.includes(item.name)) failed.push(item.name);
    }
    acc = { ...acc, interpretPending: true, interpretFailed: [...failed] };
    onProgress?.(acc);
  }

  const neverStartedR1 = await runPool(todo, { importId, signal, stopFlagRef, onSettled });
  if (signal?.aborted) return null;

  if (stopFlagRef.stopped) {
    // Quota-Fail-Fast: Items, die wegen des Stopps nie gestartet wurden,
    // zählen ebenfalls als failed (sie kamen schlicht nie dran).
    const extra = neverStartedR1.map((c) => c.name).filter((n) => !failed.includes(n));
    if (extra.length) {
      failed = [...failed, ...extra];
      acc = { ...acc, interpretPending: true, interpretFailed: [...failed] };
      onProgress?.(acc);
    }
    return {
      ...acc,
      interpretPending: false,
      interpretFailed: failed,
      interpretQuotaExhausted: true,
      interpretError: quotaError.message || String(quotaError),
    };
  }

  // Auto-Retry-Runde: genau EIN weiterer Versuch für alles, was in Runde 1
  // gescheitert ist — über denselben Pool (Konkurrenz 3).
  if (failed.length > 0) {
    const byName = new Map(todo.map((c) => [c.name, c]));
    const retryItems = failed.map((n) => byName.get(n)).filter(Boolean);
    if (retryItems.length > 0) {
      await runPool(retryItems, { importId, signal, stopFlagRef, onSettled });
      if (signal?.aborted) return null;
      if (stopFlagRef.stopped) {
        // Quota-Fail-Fast mitten in der Auto-Retry-Runde: alle noch offenen
        // Namen stecken bereits in `failed` (retryItems kam ja aus `failed`).
        return {
          ...acc,
          interpretPending: false,
          interpretFailed: failed,
          interpretQuotaExhausted: true,
          interpretError: quotaError.message || String(quotaError),
        };
      }
    }
  }

  return {
    ...acc,
    interpretPending: false,
    interpretFailed: failed,
    interpretQuotaExhausted: false,
    interpretError: !anySuccess && lastError ? (lastError.message || String(lastError)) : null,
  };
}

/** Findet den rohen Baustein (gleiche Form wie componentsNeedingInterpretation) über alle Kinds hinweg. */
function findRawComponent(raw, name) {
  for (const [rawKey, kind] of KINDS) {
    for (const item of raw[rawKey] ?? []) {
      if (item.name === name) {
        return {
          name: item.name,
          kind,
          variants: item.variants ?? [],
          notes: item.notes ?? '',
          bbox: item.bbox ?? null,
          selector: item.selector ?? null,
          path: item.path ?? null,
        };
      }
    }
  }
  return null;
}

/**
 * Retry für genau EINEN Baustein (per-row retry). Führt NUR den Request aus
 * und liefert ein Outcome — mergt NICHT selbst in irgendeinen State (Fix
 * Race paralleler Einzel-Retries: der Aufrufer wendet das Outcome per
 * `applyRetryOutcome` auf den zum Antwortzeitpunkt AKTUELLEN State an, statt
 * ein komplettes, potenziell veraltetes Result zurückzugeben). Wirft nie:
 * - kein import_id / Baustein unbekannt → `{ name, skipped: true }` (kein
 *   Request wird gesendet, es gibt nichts zu mergen).
 * - Server-Antwort → `{ name, data }`.
 * - Exception → `{ name, error }`.
 */
export async function retryInterpretation(result, name) {
  const raw = result?.raw;
  const importId = raw?.meta?.import_id;
  const comp = raw ? findRawComponent(raw, name) : null;
  if (!importId || !comp) return { name, skipped: true };
  try {
    const data = await requestInterpretations(importId, [comp]);
    return { name, data };
  } catch (e) {
    return { name, error: e };
  }
}

/**
 * Wendet ein Retry-Outcome (aus `retryInterpretation`) auf einen BELIEBIGEN
 * aktuellen State `cur` an — nicht zwingend denselben, der den Request
 * ausgelöst hat. Damit überschreiben parallele Retries verschiedener Namen
 * einander nicht mehr: jeder Outcome wird als Delta auf den jeweils
 * aktuellen State gemergt statt ein komplettes Result zu ersetzen.
 * `skipped` (kein import_id / unbekannter Baustein) → `cur` unverändert.
 * `data` → attachInterpretations + `name` aus interpretFailed entfernen,
 * es sei denn der Server meldet `name` weiterhin in `data.failed`.
 * `error` → interpretError setzen, `name` in interpretFailed ergänzen,
 * interpretQuotaExhausted aus `error.dailyQuota`.
 */
export function applyRetryOutcome(cur, name, outcome) {
  if (!cur || !outcome || outcome.skipped) return cur;
  const existingFailed = cur.interpretFailed ?? [];
  if (outcome.data) {
    const merged = attachInterpretations(cur, outcome.data);
    const stillFailed = (outcome.data.failed ?? []).includes(name);
    const nextFailed = stillFailed
      ? (existingFailed.includes(name) ? existingFailed : [...existingFailed, name])
      : existingFailed.filter((n) => n !== name);
    return { ...merged, interpretFailed: nextFailed };
  }
  const e = outcome.error;
  return {
    ...cur,
    interpretPending: false,
    interpretError: e?.message || String(e),
    interpretFailed: existingFailed.includes(name) ? existingFailed : [...existingFailed, name],
    // Quota-Bremse: ein Retry, der auf Tages-Quota trifft, sperrt auch den
    // Batch-Knopf (InterpretAllBar) — ein Klick würde sofort denselben
    // Fehler wiederholen.
    interpretQuotaExhausted: Boolean(e?.dailyQuota),
  };
}

/**
 * Verfeinern (deepenWithAi/handleDeepened) baut per adaptScanResponse ein
 * FRISCHES Result — ohne Fix gingen `interpretations`/`interpretFailed` etc.
 * verloren (die Pillen verschwinden). Trägt sie von `prev` nach `next`
 * weiter: Map bleibt wie sie ist (verwaiste Keys stören nicht,
 * componentsNeedingInterpretation prüft ohnehin per Name), `interpretFailed`
 * wird auf Namen gefiltert, die im neuen raw-Inventar (atomics/components/
 * patterns) noch existieren, `interpretQuotaExhausted` wird übernommen.
 */
export function carryInterpretations(prev, next) {
  if (!next || !prev) return next;
  const raw = next.raw ?? {};
  const namesInInventory = new Set();
  for (const [rawKey] of KINDS) {
    for (const item of raw[rawKey] ?? []) namesInInventory.add(item.name);
  }
  const carriedFailed = (prev.interpretFailed ?? []).filter((n) => namesInInventory.has(n));
  return {
    ...next,
    interpretations: { ...(prev.interpretations ?? {}), ...(next.interpretations ?? {}) },
    interpretFailed: carriedFailed,
    interpretQuotaExhausted: Boolean(prev.interpretQuotaExhausted),
  };
}

/**
 * Reload-Limbo-Fix: normalisiert einen aus localStorage geladenen Zustand mit
 * interpretPending:true (Reload während laufender Batch-/Chunk-Interpretation
 * — der zugehörige Request/Signal ist weg, niemand startet ihn neu) zu
 * "failed". Ohne das bleiben Bausteine für immer auf "Wird interpretiert …"
 * hängen, ohne Retry-Knopf. Bestehende interpretFailed-Einträge bleiben
 * erhalten (Union). Wirft nie, gibt bei sauberem/fehlendem Zustand dieselbe
 * Referenz zurück (keine unnötigen Re-Renders/Re-Persists).
 */
export function normalizeStalePending(result) {
  if (!result?.interpretPending) return result;
  const todoNames = componentsNeedingInterpretation(result).map((c) => c.name);
  const existingFailed = result.interpretFailed ?? [];
  const interpretFailed = [...existingFailed, ...todoNames.filter((n) => !existingFailed.includes(n))];
  return {
    ...result,
    interpretPending: false,
    interpretFailed,
    interpretError: 'Seite wurde neu geladen — Interpretation wurde unterbrochen. Bitte erneut versuchen.',
  };
}

/**
 * Schützt gegen die Stale-Closure-Race bei überlappenden Importen: wendet
 * `next` nur an, wenn `cur` noch zum selben Import gehört (gleiche
 * raw.meta.import_id). Sonst — oder wenn `next` null ist — bleibt `cur`.
 */
export function applyIfSameImport(cur, next) {
  if (!next) return cur;
  if (cur?.raw?.meta?.import_id !== next?.raw?.meta?.import_id) return cur;
  return next;
}
