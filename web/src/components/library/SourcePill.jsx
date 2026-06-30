import React from 'react';

const MAP = {
  'rules+ai': { label: 'Regeln + KI', cls: 'bg-green-100 text-green-800' },
  ai: { label: 'von KI', cls: 'bg-amber-100 text-amber-800' },
  rules: { label: 'nur Regeln', cls: 'bg-zinc-100 text-zinc-600' },
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
