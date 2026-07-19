import React from 'react';
import ConfidencePill from '../library/ConfidencePill.jsx';

function InventoryDetail({ extra }) {
  if (!extra) return null;
  return (
    <span className="text-[10px] text-zinc-500 ml-2">
      {extra.atoms} atoms · {extra.molecules} molecules · {extra.organisms} organisms · {extra.templates} templates
    </span>
  );
}

const TOKEN_CATEGORY_KEYS = ['colors', 'typography', 'spacing', 'radius', 'shadows'];

export default function ImportSuccess({ result, onNewImport, onOpenLibrary }) {
  const tokenCount = result.categories
    .filter(cat => TOKEN_CATEGORY_KEYS.includes(cat.key))
    .reduce((sum, cat) => sum + (cat.count || 0), 0);
  const hasNoTokens = tokenCount === 0;
  const warnings = Array.isArray(result.warnings) ? result.warnings : [];

  return (
    <div className="flex flex-col gap-4">
      <div className="text-center">
        {hasNoTokens ? (
          <div className="w-10 h-10 rounded-full bg-amber-100 text-amber-700 flex items-center justify-center text-lg font-bold mx-auto mb-2">!</div>
        ) : (
          <div className="w-10 h-10 rounded-full bg-green-100 text-green-700 flex items-center justify-center text-lg font-bold mx-auto mb-2">✓</div>
        )}
        <div className="text-sm font-semibold text-zinc-900">
          {hasNoTokens ? 'Import ohne Tokens' : 'Import complete'}
          {result.mocked && (
            <span className="ml-2 text-[9px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded bg-amber-100 text-amber-800 align-middle">
              PREVIEW
            </span>
          )}
        </div>
        <div className="text-xs text-zinc-500 mt-0.5">Extracted from {result.source}</div>
        {hasNoTokens && (
          <div className="text-xs text-amber-700 mt-1">
            Es wurden keine Design-Tokens gefunden — die Quelle enthielt keine auswertbaren Farben,
            Schriften oder Abstände. Details unten.
          </div>
        )}
      </div>

      {warnings.length > 0 && (
        <ul aria-label="Hinweise" className="flex flex-col gap-1.5 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2">
          {warnings.map((warning, i) => (
            <li key={i} className="text-xs text-amber-800 flex gap-1.5">
              <span aria-hidden="true">⚠</span>
              <span>{warning}</span>
            </li>
          ))}
        </ul>
      )}

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
        <button onClick={onOpenLibrary}
          className="text-xs px-3 py-1.5 bg-primary text-white rounded hover:bg-primary-hover transition-colors">
          Open library
        </button>
      </div>
    </div>
  );
}
