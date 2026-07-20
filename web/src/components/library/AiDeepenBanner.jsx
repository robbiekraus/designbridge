import React, { useState } from 'react';
import { deepenWithAi } from '../../lib/aiDeepen.js';

export function shouldShowDeepenBanner(result) {
  return (result?.source === 'url' || result?.source === 'repo') && !result?.raw?.meta?.ai_deepened;
}

export default function AiDeepenBanner({ result, onDeepened }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  if (!shouldShowDeepenBanner(result)) return null;

  const run = async () => {
    setBusy(true);
    setError(null);
    try {
      const next = await deepenWithAi(result);
      onDeepened(next);
    } catch (e) {
      setError(e.message || String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mb-6 flex items-center gap-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3">
      <div className="flex-1">
        <div className="text-sm font-medium text-amber-900">Atoms, Molecules, Organisms &amp; Templates noch nicht analysiert</div>
        {error ? (
          <div className="text-xs text-amber-700">KI-Analyse gerade nicht möglich — die Regel-Funde bleiben erhalten.</div>
        ) : (
          <div className="text-xs text-amber-700">Die festen Regeln haben eine erste Liste erstellt. Die Komponenten-Erkennung lässt sich per KI verfeinern (Design-Tokens bleiben unverändert).</div>
        )}
      </div>
      <button
        onClick={run}
        disabled={busy}
        className="text-xs px-3 py-1.5 rounded bg-[#c2553d] text-white font-medium hover:bg-[#a94a35] disabled:opacity-50"
      >
        {busy ? 'Analysiere…' : 'Komponenten-Erkennung verfeinern'}
      </button>
    </div>
  );
}
