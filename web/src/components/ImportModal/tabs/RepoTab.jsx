import React, { useState } from 'react';

export default function RepoTab({ onSubmit, disabled }) {
  const [url, setUrl] = useState('');
  const [branch, setBranch] = useState('');
  const valid = /^https:\/\/github\.com\/[^/]+\/[^/]+/.test(url);

  return (
    <div className="flex flex-col gap-4">
      <label className="block">
        <span className="text-[10px] uppercase tracking-wider text-zinc-500 font-semibold">GitHub repository</span>
        <input type="url" value={url} onChange={e => setUrl(e.target.value)}
          placeholder="https://github.com/org/repo"
          className="mt-1 w-full px-3 py-2 text-sm border border-zinc-200 rounded text-zinc-900 placeholder:text-zinc-400 focus:outline-none focus:border-zinc-900" />
      </label>
      <label className="block">
        <span className="text-[10px] uppercase tracking-wider text-zinc-500 font-semibold">Branch</span>
        <input type="text" value={branch} onChange={e => setBranch(e.target.value)}
          placeholder="Default-Branch (automatisch)"
          className="mt-1 w-full px-3 py-2 text-sm border border-zinc-200 rounded text-zinc-900 placeholder:text-zinc-400 focus:outline-none focus:border-zinc-900" />
      </label>
      <div className="text-[10px] text-zinc-500">
        Liest tailwind.config, CSS-Variablen und components/ui aus einem öffentlichen GitHub-Repo.
      </div>
      <div className="flex justify-end">
        <button onClick={() => onSubmit({ source: 'repo', payload: { url, branch } })}
          disabled={!valid || disabled}
          className={`text-xs px-3 py-1.5 rounded text-white transition-colors
            ${!valid || disabled ? 'bg-zinc-300 cursor-not-allowed' : 'bg-primary hover:bg-primary-hover'}`}>
          Import
        </button>
      </div>
    </div>
  );
}
