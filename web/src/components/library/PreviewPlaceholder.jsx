import React from 'react';

// Reserved slot for the Phase-3 visual reconstruction. Renders an empty framed area.
// Fix 2 (Testrunde 6): `spinner` zeigt einen CSS-only Ladeindikator neben dem Label,
// damit ein laufender Retry auch im Vorschau-Bereich sichtbar ist (statt "keine Vorschau").
export default function PreviewPlaceholder({ label = 'Vorschau folgt', spinner = false }) {
  return (
    <div className="h-24 rounded border border-dashed border-zinc-300 bg-zinc-50 flex items-center justify-center gap-2 text-[10px] uppercase tracking-wider text-zinc-400">
      {spinner && (
        <span
          role="status"
          aria-label="lädt"
          className="inline-block h-3 w-3 rounded-full border-2 border-zinc-300 border-t-zinc-500 animate-spin"
        />
      )}
      {label}
    </div>
  );
}
