import React, { useEffect, useState } from 'react';

const FIGMA_URL_RE = /figma\.com\/(design|file)\/[^/]+/;

export default function FigmaTab({ onSubmit, disabled }) {
  const [url, setUrl] = useState('');
  const [token, setToken] = useState('');
  const [tokenConfigured, setTokenConfigured] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/figma/status');
        const data = await res.json();
        if (!cancelled) setTokenConfigured(!!data?.tokenConfigured);
      } catch {
        // Status not reachable — fall back to showing the token field (safe default).
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const urlValid = FIGMA_URL_RE.test(url);
  const tokenMissing = !tokenConfigured && token.trim() === '';
  const canSubmit = urlValid && !tokenMissing && !disabled;

  const handleSubmit = () => {
    if (!canSubmit) return;
    onSubmit({ source: 'figma', payload: { url, token: tokenConfigured ? '' : token } });
  };

  return (
    <div className="flex flex-col gap-4">
      <label className="block">
        <span className="text-[10px] uppercase tracking-wider text-zinc-500 font-semibold">Figma-Datei-URL</span>
        <input type="url" value={url} onChange={e => setUrl(e.target.value)}
          placeholder="https://www.figma.com/design/..."
          className="mt-1 w-full px-3 py-2 text-sm border border-zinc-200 rounded text-zinc-900 placeholder:text-zinc-400 focus:outline-none focus:border-zinc-900" />
      </label>

      {tokenConfigured ? (
        <div className="text-xs text-green-700">Figma-Token gesetzt ✓</div>
      ) : (
        <div className="flex flex-col gap-1.5">
          <label className="block">
            <span className="text-[10px] uppercase tracking-wider text-zinc-500 font-semibold">Figma-Token</span>
            <input type="password" value={token} onChange={e => setToken(e.target.value)}
              placeholder="figd_..."
              className="mt-1 w-full px-3 py-2 text-sm border border-zinc-200 rounded text-zinc-900 placeholder:text-zinc-400 focus:outline-none focus:border-zinc-900" />
          </label>
          <a href="https://www.figma.com/developers/api#access-tokens" target="_blank" rel="noreferrer"
            className="text-[10px] text-zinc-500 underline hover:text-zinc-900 w-fit">
            Token hier erstellen →
          </a>
          <div className="text-[10px] text-zinc-500">
            Wird nur für diesen Import genutzt, nicht gespeichert.
          </div>
        </div>
      )}

      <div className="text-[10px] text-zinc-500">
        Liest Styles → Tokens und Components/Frames → Inventar. Variables nur bei Enterprise.
      </div>

      <div className="flex justify-end">
        <button onClick={handleSubmit} disabled={!canSubmit}
          className={`text-xs px-3 py-1.5 rounded text-white transition-colors
            ${!canSubmit ? 'bg-zinc-300 cursor-not-allowed' : 'bg-primary hover:bg-primary-hover'}`}>
          Import
        </button>
      </div>
    </div>
  );
}
