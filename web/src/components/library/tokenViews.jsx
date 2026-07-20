// web/src/components/library/tokenViews.jsx
import React from 'react';
import ConfidencePill from './ConfidencePill.jsx';

function Source({ value }) {
  if (!value) return null;
  return <span className="block text-[11px] text-zinc-500 truncate" title={value}><span className="text-zinc-400">CSS</span> {String(value).replace(/^--/, '')}</span>;
}

export function ColorSwatch({ color }) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-xs font-medium text-zinc-900 truncate" title={color.role}>{color.role ? color.role.charAt(0).toUpperCase() + color.role.slice(1) : color.role}</span>
      <div className="h-12 rounded border border-zinc-200" style={{ background: color.hex }} />
      <div className="flex items-center justify-between gap-1">
        <span className="text-xs text-zinc-600">{color.hex}</span>
        <ConfidencePill value={color.confidence} />
      </div>
      <Source value={color.source} />
    </div>
  );
}

export function TypographyRow({ item, label }) {
  return (
    <li className="flex items-baseline justify-between gap-4 py-2 border-b border-zinc-100 last:border-b-0">
      <div className="flex items-baseline gap-3 min-w-0">
        <span className="text-sm font-medium text-zinc-900 w-16 flex-shrink-0">{label || item.role}</span>
        <span
          className="text-zinc-700 truncate"
          style={{ fontSize: `${item.size}px`, fontWeight: Number(item.weight) || undefined }}>
          {item.sample || 'Ag'}
        </span>
      </div>
      <span className="flex flex-col items-end gap-0.5 flex-shrink-0">
        <span className="flex items-center gap-2">
          <span className="text-[11px] text-zinc-500">{item.size}px · {item.weight}</span>
          <ConfidencePill value={item.confidence} />
        </span>
        <Source value={item.source} />
      </span>
    </li>
  );
}

export function SpacingRow({ item }) {
  return (
    <li className="flex items-start gap-3 py-2 border-b border-zinc-100 last:border-b-0 text-sm">
      <span className="bg-zinc-800 h-3 rounded-sm mt-1" style={{ width: `${Math.min(Number(item.value) || 0, 96)}px` }} />
      <div className="flex flex-col gap-1 flex-1">
        <div className="flex items-center justify-between gap-2">
          <span className="text-zinc-900">{item.value}px</span>
          <span className="text-[10px] text-zinc-500">{item.usage}</span>
          <ConfidencePill value={item.confidence} />
        </div>
        <Source value={item.source} />
      </div>
    </li>
  );
}

export function RadiusRow({ item }) {
  return (
    <li className="flex items-start gap-3 py-2 border-b border-zinc-100 last:border-b-0 text-sm">
      <span className="w-10 h-10 bg-zinc-100 border border-zinc-300 flex-shrink-0 mt-1" style={{ borderRadius: item.value?.toString().includes('%') ? item.value : `${parseInt(item.value, 10) || 0}px` }} />
      <div className="flex flex-col gap-1 flex-1">
        <div className="flex items-center justify-between gap-2">
          <span className="text-zinc-900">{item.value}</span>
          <span className="text-[10px] text-zinc-500">{item.usage}</span>
          <ConfidencePill value={item.confidence} />
        </div>
        <Source value={item.source} />
      </div>
    </li>
  );
}

export function ShadowRow({ item }) {
  return (
    <li className="flex items-start gap-3 py-3 border-b border-zinc-100 last:border-b-0 text-sm">
      <span className="w-12 h-12 bg-white rounded flex-shrink-0 mt-1" style={{ boxShadow: item.css }} />
      <div className="flex flex-col gap-1 flex-1">
        <div className="flex items-center justify-between gap-2">
          <span className="text-zinc-900">{item.description}</span>
          <ConfidencePill value={item.confidence} />
        </div>
        <Source value={item.source} />
      </div>
    </li>
  );
}
