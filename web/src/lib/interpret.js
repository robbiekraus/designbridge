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

export async function requestInterpretations(importId, components) {
  const res = await fetch('/api/interpret/components', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ import_id: importId, components }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Interpretation fehlgeschlagen');
  return data;
}

/** Antwort in das Result mergen (immutable) — beendet den pending-Zustand. */
export function attachInterpretations(result, data) {
  const map = { ...(result.interpretations ?? {}) };
  for (const it of data.interpretations ?? []) {
    map[it.name] = { html: it.html, jsx: it.jsx };
  }
  return {
    ...result,
    interpretations: map,
    interpretFailed: data.failed ?? [],
    interpretPending: false,
    interpretError: null,
  };
}

/**
 * Orchestrierung: prüft ob etwas zu tun ist, ruft den Endpoint, merged.
 * Gibt das nächste Result zurück — oder null, wenn nichts zu tun war.
 * Wirft nie: Fehler landen als interpretError/interpretFailed im Result.
 */
export async function runInterpretation(result) {
  const todo = componentsNeedingInterpretation(result);
  const importId = result?.raw?.meta?.import_id;
  if (!['image', 'url', 'repo'].includes(result?.source) || !importId || todo.length === 0) return null;
  try {
    const data = await requestInterpretations(importId, todo);
    return attachInterpretations(result, data);
  } catch (e) {
    return {
      ...result,
      interpretPending: false,
      interpretError: e.message || String(e),
      interpretFailed: todo.map((t) => t.name),
    };
  }
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
    };
  }
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
