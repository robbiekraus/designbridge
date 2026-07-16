import React from 'react';
import { componentsNeedingInterpretation } from '../../lib/interpret.js';

// Zeigt bei einem Repo-Import mit noch nicht interpretierten (template-losen)
// Bausteinen einen Batch-Knopf. Repo interpretiert bewusst nur auf Knopfdruck.
export default function InterpretAllBar({ result, onInterpretAll, retryBusy }) {
  if (result?.source !== 'repo') return null;
  const todo = componentsNeedingInterpretation(result);
  const pending = Boolean(result?.interpretPending);
  if (todo.length === 0 && !pending) return null;
  return (
    <div className="mb-4 flex items-center gap-3 rounded border border-zinc-200 bg-zinc-50 px-3 py-2 text-sm">
      <span className="text-zinc-600">
        {pending
          ? 'Bausteine werden interpretiert …'
          : retryBusy
            ? 'Einzel-Interpretation läuft — gleich wieder verfügbar …'
            : `${todo.length} gehobene Bausteine ohne Vorschau — optional per KI interpretieren.`}
      </span>
      <button
        onClick={onInterpretAll}
        // retryBusy: solange ein Einzel-Retry läuft, würde ein Batch denselben
        // Baustein nochmal anfragen — konkurrierende Writes, letzter gewinnt.
        disabled={pending || retryBusy}
        className="ml-auto text-xs px-2.5 py-1 rounded bg-zinc-900 text-white font-medium hover:bg-zinc-700 disabled:opacity-50"
      >
        Alle interpretieren
      </button>
    </div>
  );
}
