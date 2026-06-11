import React, { useState } from 'react';

export default function UrlTab({ onSubmit, disabled }) {
  const [url, setUrl] = useState('');
  const valid = /^https?:\/\/\S+\.\S+/.test(url);

  return (
    <div className="flex flex-col gap-4">
      <label className="block">
        <span className="text-[10px] uppercase tracking-wider text-zinc-500 font-semibold">Website URL</span>
        <input type="url" value={url} onChange={e => setUrl(e.target.value)}
          placeholder="https://example.com"
          className="mt-1 w-full px-3 py-2 text-sm border border-zinc-200 rounded text-zinc-900 placeholder:text-zinc-400 focus:outline-none focus:border-zinc-900" />
      </label>
      <div className="text-[10px] text-zinc-500">
        URL scanning is mocked in this preview — submitting returns a sample token set after ~1.5 s.
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
