import React from 'react';

export default function ImportProgress({ source }) {
  const label = source === 'image' ? 'screenshot'
    : source === 'url' ? 'URL'
    : source === 'repo' ? 'repository'
    : source === 'figma' ? 'Figma file'
    : 'source';

  return (
    <div className="flex flex-col items-center text-center py-8">
      <div className="w-8 h-8 rounded-full border-2 border-zinc-200 border-t-zinc-900 spinner mb-4" />
      <div className="text-sm font-semibold text-zinc-900">Extracting tokens…</div>
      <div className="text-xs text-zinc-500 mt-1">Analyzing {label}</div>
    </div>
  );
}
