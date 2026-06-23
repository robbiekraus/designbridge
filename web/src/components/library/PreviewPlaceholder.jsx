import React from 'react';

// Reserved slot for the Phase-3 visual reconstruction. Renders an empty framed area.
export default function PreviewPlaceholder({ label = 'Vorschau folgt' }) {
  return (
    <div className="h-24 rounded border border-dashed border-zinc-300 bg-zinc-50 flex items-center justify-center text-[10px] uppercase tracking-wider text-zinc-400">
      {label}
    </div>
  );
}
