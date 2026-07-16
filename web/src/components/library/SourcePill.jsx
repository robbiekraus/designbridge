import React from 'react';

const MAP = {
  'rules+ai': { label: 'Regeln + KI', cls: 'bg-green-100 text-green-800' },
  ai: { label: 'von KI', cls: 'bg-amber-100 text-amber-800' },
  rules: { label: 'nur Regeln', cls: 'bg-zinc-100 text-zinc-600' },
  interpreted: { label: 'von KI interpretiert', cls: 'bg-amber-100 text-amber-800' },
  lifted: { label: 'aus Repo gehoben', cls: 'bg-blue-100 text-blue-700' },
  demo: { label: 'Demo-Daten', cls: 'bg-red-100 text-red-700' },
};

export function sourceLabel(source) {
  return MAP[source] ?? null;
}

export default function SourcePill({ value }) {
  const m = sourceLabel(value);
  if (!m) return null;
  return (
    <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded ${m.cls}`}>{m.label}</span>
  );
}
