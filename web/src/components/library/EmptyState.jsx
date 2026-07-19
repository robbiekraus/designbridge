import React from 'react';

export default function EmptyState({ onNewImport }) {
  return (
    <div className="flex flex-col items-center justify-center text-center gap-3 py-20 text-zinc-500">
      <div className="text-sm font-medium text-zinc-900">Noch nichts importiert</div>
      <p className="text-xs max-w-xs">Starte einen Import, um Tokens und UI-Inventar hier in der Library zu sehen.</p>
      <button onClick={onNewImport}
        className="text-xs px-3 py-1.5 bg-primary text-white rounded font-medium hover:bg-primary-hover transition-colors">
        Neuer Import
      </button>
    </div>
  );
}
