import React, { useState } from 'react';

// Dev: Vite (5173) proxyt nur /api, die Demo-Seite liegt beim Server (3047).
// Prod: Server liefert Web + /demo same-origin aus → eigene Domain verwenden.
const DEMO_URL = import.meta.env.DEV
  ? 'http://localhost:3047/demo'
  : `${window.location.origin}/demo/`;

const GITHUB_URL_RE = /^https?:\/\/(www\.)?github\.com\//i;

export default function UrlTab({ onSubmit, disabled, onSwitchToRepo }) {
  const [url, setUrl] = useState('');
  const valid = /^https?:\/\/\S+/.test(url);
  const isGithubUrl = GITHUB_URL_RE.test(url);

  return (
    <div className="flex flex-col gap-4">
      <label className="block">
        <span className="text-[10px] uppercase tracking-wider text-zinc-500 font-semibold">Website URL</span>
        <input type="url" value={url} onChange={e => setUrl(e.target.value)}
          placeholder="https://example.com"
          className="mt-1 w-full px-3 py-2 text-sm border border-zinc-200 rounded text-zinc-900 placeholder:text-zinc-400 focus:outline-none focus:border-zinc-900" />
      </label>
      {isGithubUrl && (
        <div className="flex items-center justify-between gap-2 px-3 py-2 rounded border border-amber-200 bg-amber-50 text-xs text-amber-800">
          <span>
            Das sieht nach einem GitHub-Repo aus — für Repos liefert der Repo-Tab bessere Ergebnisse
            (echter Code statt der GitHub-Website selbst). Scannen ist trotzdem möglich.
          </span>
          {onSwitchToRepo && (
            <button
              type="button"
              onClick={onSwitchToRepo}
              className="shrink-0 text-[10px] px-2 py-1 rounded border border-amber-300 text-amber-900 hover:bg-amber-100 whitespace-nowrap"
            >
              Zum Repo-Tab
            </button>
          )}
        </div>
      )}
      <div className="flex items-center gap-2 text-[10px] text-zinc-500">
        <button
          type="button"
          onClick={() => setUrl(DEMO_URL)}
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
            ${!valid || disabled ? 'bg-zinc-300 cursor-not-allowed' : 'bg-primary hover:bg-primary-hover'}`}>
          Import
        </button>
      </div>
    </div>
  );
}
