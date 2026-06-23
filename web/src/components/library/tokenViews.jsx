// web/src/components/library/tokenViews.jsx
import React from 'react';
import ConfidencePill from './ConfidencePill.jsx';

export function ColorSwatch({ color }) {
  return (
    <div className="flex flex-col gap-1">
      <div className="h-12 rounded border border-zinc-200" style={{ background: color.hex }} />
      <div className="flex items-center justify-between">
        <span className="text-xs font-mono text-zinc-900">{color.hex}</span>
        <ConfidencePill value={color.confidence} />
      </div>
      <span className="text-[10px] text-zinc-500">{color.role}</span>
    </div>
  );
}

export function TypographyRow({ item }) {
  return (
    <li className="flex items-baseline justify-between gap-4 py-2 border-b border-zinc-100 last:border-b-0">
      <span
        className="text-zinc-900 truncate"
        style={{ fontSize: `${item.size}px`, fontWeight: Number(item.weight) || undefined }}>
        {item.sample || 'Ag'}
      </span>
      <span className="flex items-center gap-2 flex-shrink-0">
        <span className="text-[10px] text-zinc-500">{item.role} · {item.size}px · {item.weight}</span>
        <ConfidencePill value={item.confidence} />
      </span>
    </li>
  );
}

export function SpacingRow({ item }) {
  return (
    <li className="flex items-center gap-3 py-2 border-b border-zinc-100 last:border-b-0 text-sm">
      <span className="bg-zinc-800 h-3 rounded-sm" style={{ width: `${Math.min(Number(item.value) || 0, 96)}px` }} />
      <span className="font-mono text-zinc-900">{item.value}px</span>
      <span className="text-[10px] text-zinc-500 flex-1">{item.usage}</span>
      <ConfidencePill value={item.confidence} />
    </li>
  );
}

export function RadiusRow({ item }) {
  return (
    <li className="flex items-center gap-3 py-2 border-b border-zinc-100 last:border-b-0 text-sm">
      <span className="w-10 h-10 bg-zinc-100 border border-zinc-300" style={{ borderRadius: item.value?.toString().includes('%') ? item.value : `${parseInt(item.value, 10) || 0}px` }} />
      <span className="font-mono text-zinc-900">{item.value}</span>
      <span className="text-[10px] text-zinc-500 flex-1">{item.usage}</span>
      <ConfidencePill value={item.confidence} />
    </li>
  );
}

export function ShadowRow({ item }) {
  return (
    <li className="flex items-center gap-3 py-3 border-b border-zinc-100 last:border-b-0 text-sm">
      <span className="w-12 h-12 bg-white rounded" style={{ boxShadow: item.css }} />
      <span className="text-zinc-900 flex-1">{item.description}</span>
      <ConfidencePill value={item.confidence} />
    </li>
  );
}
