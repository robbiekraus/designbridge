import React, { useState } from 'react';

export default function UrlTab({ onSubmit, disabled }) {
  const [url, setUrl] = useState('');
  const valid = /^https?:\/\/\S+/.test(url);

  return (
    <div className="flex flex-col gap-4">
      <label className="block">
        <span className="text-[10px] uppercase tracking-wider text-zinc-500 font-semibold">Website URL</span>
        <input type="url" value={url} onChange={e => setUrl(e.target.value)}
          placeholder="https://example.com"
          className="mt-1 w-full px-3 py-2 text-sm border border-zinc-200 rounded text-zinc-900 placeholder:text-zinc-400 focus:outline-none focus:border-zinc-900" />
      </label>
      <div className="flex items-center gap-2 text-[10px] text-zinc-500">
        <button
          type="button"
          onClick={() => setUrl('http://localhost:3047/demo')}
          className="px-2 py-1 rounded border border-zinc-200 text-zinc-700 hover:bg-zinc-50"
        >
          Demo-Seite verwenden
        </button>
        <span>Liest Farben, Schriften, Abstände, Radius & Schatten aus dem CSS der Seite.</span>
      </div>
      <div className="flex justify-end">
        <button onClick={() => onSubmit({ source: 'url', payload: { url } })}
          disabled={!valid || disabled}
          className={`text-xs px-3 py-1.5 rounded text-white transition-colors
            ${!valid || disabled ? 'bg-zinc-300 cursor-not-allowed' : 'bg-zinc-900 hover:bg-zinc-700'}`}>
          Import
        </button>
      </div>
    </div>
  );
}
