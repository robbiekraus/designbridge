import React from 'react';
import ConfidencePill from '../components/library/ConfidencePill.jsx';

function SummaryItem({ label, value }) {
  if (!value) return null;
  return (
    <div className="flex flex-col">
      <span className="text-[10px] uppercase tracking-wider text-zinc-400">{label}</span>
      <span className="text-sm text-zinc-900">{value}</span>
    </div>
  );
}

export default function Dashboard({ result }) {
  const summary = result?.raw?.summary;
  const warnings = result?.raw?.warnings ?? [];
  const categories = result?.categories ?? [];

  return (
    <div className="max-w-3xl flex flex-col gap-6">
      <div className="flex items-center gap-2">
        <h1 className="text-sm font-semibold text-zinc-900">Übersicht</h1>
        {result?.mocked && (
          <span className="text-[9px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded bg-amber-100 text-amber-800">PREVIEW</span>
        )}
        <span className="text-xs text-zinc-500 ml-auto">Quelle: {result?.source}</span>
      </div>

      {summary && (
        <div className="grid grid-cols-2 gap-3 border border-zinc-200 rounded-lg p-4">
          <SummaryItem label="Beschreibung" value={summary.source_description} />
          <SummaryItem label="App-Typ" value={summary.app_type} />
          <SummaryItem label="Modus" value={summary.color_mode} />
          <SummaryItem label="Stil" value={summary.design_style} />
        </div>
      )}

      <ul className="border border-zinc-200 rounded-lg overflow-hidden">
        {categories.map(cat => (
          <li key={cat.key} className="flex items-center justify-between px-3 py-2 border-b border-zinc-100 last:border-b-0 text-sm">
            <span className="text-zinc-900">{cat.label}</span>
            <span className="flex items-center gap-2">
              <span className="font-semibold tabular-nums">{cat.count}</span>
              <ConfidencePill value={cat.confidence} />
            </span>
          </li>
        ))}
      </ul>

      {warnings.length > 0 && (
        <div className="border border-amber-200 bg-amber-50 rounded-lg p-3">
          <div className="text-xs font-semibold text-amber-800 mb-1">Hinweise</div>
          <ul className="list-disc list-inside text-[11px] text-amber-800">
            {warnings.map((w, i) => <li key={i}>{w}</li>)}
          </ul>
        </div>
      )}
    </div>
  );
}
