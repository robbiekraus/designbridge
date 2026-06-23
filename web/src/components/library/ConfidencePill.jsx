import React from 'react';

const STYLES = {
  high: 'bg-green-100 text-green-800',
  med: 'bg-amber-100 text-amber-800',
  low: 'bg-red-100 text-red-800',
};

export default function ConfidencePill({ value }) {
  if (!value) return null;
  const v = value === 'medium' ? 'med' : value;
  return (
    <span className={`text-[10px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded ${STYLES[v] ?? 'bg-zinc-100 text-zinc-700'}`}>
      {v}
    </span>
  );
}
