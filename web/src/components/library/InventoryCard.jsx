import React from 'react';
import ConfidencePill from './ConfidencePill.jsx';
import PreviewPlaceholder from './PreviewPlaceholder.jsx';

export default function InventoryCard({ item }) {
  return (
    <div className="border border-zinc-200 rounded-lg p-3 flex flex-col gap-2">
      <PreviewPlaceholder />
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium text-zinc-900">{item.name}</span>
        <ConfidencePill value={item.confidence} />
      </div>
      {item.variants?.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {item.variants.map((v, i) => (
            <span key={i} className="text-[10px] px-1.5 py-0.5 rounded bg-zinc-100 text-zinc-700">{v}</span>
          ))}
        </div>
      )}
      {item.notes && <p className="text-[11px] text-zinc-500">{item.notes}</p>}
    </div>
  );
}
