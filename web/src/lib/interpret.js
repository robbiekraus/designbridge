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
      if (matchTemplate(item.name)) continue;
      if (have[item.name]) continue;
      out.push({
        name: item.name,
        kind,
        variants: item.variants ?? [],
        notes: item.notes ?? '',
        bbox: item.bbox ?? null,
        selector: item.selector ?? null,
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
  if (!['image', 'url'].includes(result?.source) || !importId || todo.length === 0) return null;
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
