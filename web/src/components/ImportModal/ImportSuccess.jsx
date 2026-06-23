import React from 'react';
import ConfidencePill from '../library/ConfidencePill.jsx';

function InventoryDetail({ extra }) {
  if (!extra) return null;
  return (
    <span className="text-[10px] text-zinc-500 ml-2">
      {extra.atomics} atomics · {extra.components} components · {extra.patterns} patterns
    </span>
  );
}

export default function ImportSuccess({ result, onNewImport }) {
  return (
    <div className="flex flex-col gap-4">
      <div className="text-center">
        <div className="w-10 h-10 rounded-full bg-green-100 text-green-700 flex items-center justify-center text-lg font-bold mx-auto mb-2">✓</div>
        <div className="text-sm font-semibold text-zinc-900">
          Import complete
          {result.mocked && (
            <span className="ml-2 text-[9px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded bg-amber-100 text-amber-800 align-middle">
              PREVIEW
            </span>
          )}
        </div>
        <div className="text-xs text-zinc-500 mt-0.5">Extracted from {result.source}</div>
      </div>

      <ul className="border border-zinc-200 rounded-lg overflow-hidden">
        {result.categories.map(cat => (
          <li key={cat.key} className="flex items-center justify-between px-3 py-2 border-b border-zinc-100 last:border-b-0 text-sm">
            <span className="text-zinc-900">{cat.label}</span>
            <span className="flex items-center gap-2">
              <span className="font-semibold tabular-nums">{cat.count}</span>
              {cat.key === 'inventory'
                ? <InventoryDetail extra={cat.extra} />
                : <ConfidencePill value={cat.confidence} />}
            </span>
          </li>
        ))}
      </ul>

      <div className="flex justify-end gap-2 pt-1">
        <button onClick={onNewImport}
          className="text-xs px-3 py-1.5 border border-zinc-200 rounded text-zinc-900 hover:bg-zinc-50 transition-colors">
          New import
        </button>
        <button disabled title="Coming soon"
          className="text-xs px-3 py-1.5 bg-zinc-900 text-white rounded opacity-60 cursor-not-allowed">
          Open library
        </button>
      </div>
    </div>
  );
}
