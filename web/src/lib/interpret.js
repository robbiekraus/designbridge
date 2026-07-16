// web/src/lib/interpret.js
// Automatische KI-Interpretation der Bausteine ohne Hand-Template nach einem
// Bild-Import. Ergebnis wird ins lastImport-Result gemerged (localStorage-Cache).
import { matchTemplate } from './components/templates/registry.js';

const KINDS = [
  ['atomics', 'atomic'],
  ['components', 'component'],
  ['patterns', 'pattern'],
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

// == Server-CHUNK_SIZE: 1 Client-Request = genau 1 KI-Call, damit der Nutzer
// nach jedem Chunk sofort einen Zwischenstand sieht statt Minuten Blindflug.
const CLIENT_CHUNK_SIZE = 4;

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
 * Orchestrierung: prüft ob etwas zu tun ist, sendet die offenen Bausteine in
 * 4er-Chunks (sequenziell — schont das Free-Tier-RPM zusammen mit dem
 * Server-Backoff) und merged jede Antwort sofort. `onProgress` bekommt nach
 * jedem Chunk den akkumulierten Zwischenstand (interpretPending bleibt bis
 * zum letzten Chunk true). Ein `signal` bricht vor dem nächsten Chunk ab —
 * z. B. weil ein neuer Import gestartet wurde.
 * Gibt das nächste Result zurück — oder null, wenn nichts zu tun war oder
 * abgebrochen wurde. Wirft nie: Fehler landen als interpretError/interpretFailed.
 */
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
  let quotaExhausted = false;

  // Sequenziell, nicht parallel: Free-Tier-RPM. Der Server-Backoff (Task 1)
  // fängt Drosselungen ab; hier zusätzlich zu parallelisieren würde sie provozieren.
  for (let i = 0; i < chunks.length; i++) {
    const chunk = chunks[i];
    if (signal?.aborted) return null; // neuer Import übernimmt — Ergebnis verwerfen
    try {
      const data = await requestInterpretations(importId, chunk, { signal });
      anySuccess = true;
      acc = attachInterpretations(acc, data);
      failed.push(...(data.failed ?? []));
      // Zwischenstand zeigen: pending bleibt true bis zum letzten Chunk.
      acc = { ...acc, interpretPending: true, interpretFailed: [...failed] };
      onProgress?.(acc);
    } catch (e) {
      if (signal?.aborted || e?.name === 'AbortError') return null;
      lastError = e;
      if (e.dailyQuota) {
        // Tages-Quota erschöpft (Quota-Bremse): derselbe Fehler träfe jeden
        // weiteren Chunk — sofort abbrechen statt sinnlos weiterzusenden.
        // Alle noch nicht gesendeten Chunk-Namen (inkl. des gerade
        // gescheiterten) zählen als failed.
        quotaExhausted = true;
        for (let j = i; j < chunks.length; j++) failed.push(...chunks[j].map((c) => c.name));
        acc = { ...acc, interpretPending: true, interpretFailed: [...failed] };
        onProgress?.(acc);
        break;
      }
      failed.push(...chunk.map((c) => c.name));
      acc = { ...acc, interpretPending: true, interpretFailed: [...failed] };
      onProgress?.(acc);
    }
  }
  return {
    ...acc,
    interpretPending: false,
    interpretFailed: failed,
    interpretQuotaExhausted: quotaExhausted,
    interpretError: quotaExhausted
      ? (lastError.message || String(lastError))
      : (!anySuccess && lastError ? (lastError.message || String(lastError)) : null),
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
 * Retry für genau EINEN Baustein (per-row retry) — anders als runInterpretation
 * rührt das nicht an den interpretFailed-Einträgen der anderen Bausteine: bei
 * Erfolg wird nur `name` aus interpretFailed entfernt, bei Fehler bleibt (bzw.
 * kommt wieder) nur `name` rein. Wirft nie.
 */
export async function retryInterpretation(result, name) {
  const raw = result?.raw;
  const importId = raw?.meta?.import_id;
  const comp = raw ? findRawComponent(raw, name) : null;
  const existingFailed = result?.interpretFailed ?? [];
  if (!importId || !comp) return result;
  try {
    const data = await requestInterpretations(importId, [comp]);
    const merged = attachInterpretations(result, data);
    const stillFailed = (data.failed ?? []).includes(name);
    const nextFailed = stillFailed
      ? (existingFailed.includes(name) ? existingFailed : [...existingFailed, name])
      : existingFailed.filter((n) => n !== name);
    return { ...merged, interpretFailed: nextFailed };
  } catch (e) {
    return {
      ...result,
      interpretPending: false,
      interpretError: e.message || String(e),
      interpretFailed: existingFailed.includes(name) ? existingFailed : [...existingFailed, name],
      // Quota-Bremse: ein Retry, der auf Tages-Quota trifft, sperrt auch den
      // Batch-Knopf (InterpretAllBar) — ein Klick würde sofort denselben
      // Fehler wiederholen.
      interpretQuotaExhausted: Boolean(e.dailyQuota),
    };
  }
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
