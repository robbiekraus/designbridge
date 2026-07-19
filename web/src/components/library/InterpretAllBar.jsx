import React from 'react';
import { componentsNeedingInterpretation } from '../../lib/interpret.js';

// Zeigt bei einem Repo-Import mit noch nicht interpretierten (template-losen)
// Bausteinen einen Batch-Knopf. Repo interpretiert bewusst nur auf Knopfdruck.
// Deutsche Meldung 1:1 wie server/lib/geminiClient.js (Quota-Bremse) — der
// Server ist die Quota-Wahrheit, hier nur zur Anzeige dupliziert.
const QUOTA_MESSAGE = 'Gemini-Tages-Kontingent erschöpft — Reset um Mitternacht kalifornischer Zeit (ca. 09:00 deutscher Zeit). Bitte später erneut versuchen.';

export default function InterpretAllBar({ result, onInterpretAll, retryBusy }) {
  if (result?.source !== 'repo') return null;
  const todo = componentsNeedingInterpretation(result);
  const pending = Boolean(result?.interpretPending);
  const quotaExhausted = Boolean(result?.interpretQuotaExhausted);
  if (todo.length === 0 && !pending) return null;
  return (
    <div className="mb-4 flex items-center gap-3 rounded border border-zinc-200 bg-zinc-50 px-3 py-2 text-sm">
      <span className="text-zinc-600">
        {quotaExhausted
          ? QUOTA_MESSAGE
          : pending
            ? 'Bausteine werden interpretiert …'
            : retryBusy
              ? 'Einzel-Interpretation läuft — gleich wieder verfügbar …'
              : `${todo.length} gehobene Bausteine ohne Vorschau — optional per KI interpretieren.`}
      </span>
      <button
        onClick={onInterpretAll}
        // retryBusy: solange ein Einzel-Retry läuft, würde ein Batch denselben
        // Baustein nochmal anfragen — konkurrierende Writes, letzter gewinnt.
        // quotaExhausted: ein Klick würde sofort denselben Fehler wiederholen
        // (Fail-Fast kostet zwar nur 1 Call statt 6, aber 0 ist besser).
        disabled={pending || retryBusy || quotaExhausted}
        title={quotaExhausted ? QUOTA_MESSAGE : undefined}
        className="ml-auto text-xs px-2.5 py-1 rounded bg-primary text-white font-medium hover:bg-primary-hover disabled:opacity-50"
      >
        Alle interpretieren
      </button>
    </div>
  );
}
