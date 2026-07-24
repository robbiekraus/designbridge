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
    // Neutraler zink-Ton statt amber (Polish 24.07.): das ist ein Angebot, keine Warnung —
    // amber blieb den Kästen mit echten Problemen vorbehalten (ImportSuccess/Export.jsx).
    // Der Orange-Button (#c2553d) bleibt bewusst unverändert als Handlungssignal.
    <div className="mb-6 max-w-3xl flex items-center gap-3 rounded-lg border border-zinc-200 bg-zinc-50 px-4 py-3">
      <div className="flex-1">
        <div className="text-sm font-medium text-zinc-900">Atoms, Molecules, Organisms &amp; Templates noch nicht analysiert</div>
        {error ? (
          <div className="text-xs text-zinc-600">KI-Analyse gerade nicht möglich — die Regel-Funde bleiben erhalten.</div>
        ) : (
          <div className="text-xs text-zinc-600">Die festen Regeln haben eine erste Liste erstellt. Die Komponenten-Erkennung lässt sich per KI verfeinern (Design-Tokens bleiben unverändert).</div>
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
