import React from 'react';

// Ehrlichkeits-Signal (Scheibe 1 Schritt 5, Spec 2026-07-23 §Q4): markiert Bausteine, die gegen
// echte shadcn/ui-Komponenten aufgelöst wurden (statt Freihand-Nachbau). Namen im Tooltip.
export default function GroundedPill({ names }) {
  if (!Array.isArray(names) || names.length === 0) return null;
  const label = names.length > 1 ? `shadcn/ui · ${names.length}` : 'shadcn/ui';
  return (
    <span
      title={`Gegen shadcn/ui aufgelöst: ${names.join(', ')}`}
      className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-zinc-900 text-white"
    >
      {label}
    </span>
  );
}
