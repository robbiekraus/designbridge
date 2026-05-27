'use client';

import { useState, useEffect } from 'react';

interface SyncStats {
  components: number;
  colors: number;
  typography: number;
  new: number;
  modified: number;
  synced: number;
}

interface SyncResult {
  success: boolean;
  stats?: SyncStats;
  error?: string;
  generated?: string[];
}

const FILE_KEY_STORAGE_KEY = 'designbridge_figma_file_key';
const GENERATED_FILES_KEY = 'designbridge_generated_files';
const FIGMA_URL_REGEX = /figma\.com\/(?:design|file)\/([A-Za-z0-9]+)/;

const DEFAULT_GENERATED_FILES = ['tokens.css', 'tailwind.config.tokens.js', 'tokens.ts'];

function extractFileKey(input: string): string | null {
  const match = input.match(FIGMA_URL_REGEX);
  if (match) return match[1];
  // If it's already a bare key (no slashes, reasonable length)
  if (/^[A-Za-z0-9]{10,}$/.test(input.trim())) return input.trim();
  return null;
}

export default function SyncPanel() {
  const [inputValue, setInputValue] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<SyncResult | null>(null);
  const [persistedFiles, setPersistedFiles] = useState<string[]>([]);

  useEffect(() => {
    const saved = localStorage.getItem(FILE_KEY_STORAGE_KEY);
    if (saved) setInputValue(saved);
    const savedFiles = localStorage.getItem(GENERATED_FILES_KEY);
    if (savedFiles) {
      try { setPersistedFiles(JSON.parse(savedFiles)); } catch { setPersistedFiles(DEFAULT_GENERATED_FILES); }
    } else if (localStorage.getItem('designbridge_has_synced')) {
      // Synced before but list got cleared — use defaults
      setPersistedFiles(DEFAULT_GENERATED_FILES);
    }
  }, []);

  async function handleSync() {
    const fileKey = extractFileKey(inputValue);
    if (!fileKey) {
      setResult({ success: false, error: 'Could not extract a Figma file key from the input. Paste a full Figma URL or a bare file key.' });
      return;
    }

    // Persist the input value
    localStorage.setItem(FILE_KEY_STORAGE_KEY, inputValue);

    setLoading(true);
    setResult(null);

    try {
      const res = await fetch('/api/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fileKey }),
      });

      const data: SyncResult = await res.json();
      setResult(data);

      if (data.success) {
        // Persist generated file list so download links survive the reload
        const files = data.generated ?? DEFAULT_GENERATED_FILES;
        localStorage.setItem(GENERATED_FILES_KEY, JSON.stringify(files));
        localStorage.setItem('designbridge_has_synced', '1');
        setPersistedFiles(files);
        // Reload the page so server-rendered stat cards reflect new data
        setTimeout(() => window.location.reload(), 4000);
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Network error';
      setResult({ success: false, error: message });
    } finally {
      setLoading(false);
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter' && !loading) handleSync();
  }

  return (
    <section className="bg-gray-900 border border-gray-800 rounded-xl p-5">
      <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-4">
        Sync from Figma
      </h2>

      <div className="flex gap-3 flex-wrap">
        <input
          type="text"
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="https://www.figma.com/design/..."
          disabled={loading}
          className="flex-1 min-w-0 bg-gray-800 border border-gray-700 rounded-lg px-4 py-2.5 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-violet-500 disabled:opacity-50"
        />
        <button
          onClick={handleSync}
          disabled={loading || !inputValue.trim()}
          className="flex items-center gap-2 bg-violet-600 hover:bg-violet-500 disabled:bg-gray-700 disabled:text-gray-500 text-white text-sm font-medium px-5 py-2.5 rounded-lg transition-colors"
        >
          {loading ? (
            <>
              <svg
                className="animate-spin w-4 h-4 text-white"
                xmlns="http://www.w3.org/2000/svg"
                fill="none"
                viewBox="0 0 24 24"
              >
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path
                  className="opacity-75"
                  fill="currentColor"
                  d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
                />
              </svg>
              Syncing…
            </>
          ) : (
            'Sync from Figma'
          )}
        </button>
      </div>

      {result && !result.success && (
        <div className="mt-4">
          <p className="text-sm text-red-400">
            {result.error === 'FIGMA_TOKEN_MISSING'
              ? 'Figma token not configured. Add FIGMA_TOKEN to designbridge-web/.env.local'
              : `Error: ${result.error}`}
          </p>
        </div>
      )}

      {result?.success && result.stats && (
        <p className="mt-4 text-sm text-emerald-400">
          Synced — {result.stats.components} components, {result.stats.colors} colors,{' '}
          {result.stats.typography} typography tokens. Refreshing in 4s…
        </p>
      )}

      {persistedFiles.length > 0 && (
        <div className="mt-4">
          <p className="text-xs text-gray-400 uppercase tracking-wider mb-2">Generated Files</p>
          <div className="flex flex-wrap gap-2">
            {persistedFiles.map((filename) => (
              <a
                key={filename}
                href={`/data/generated/${filename}`}
                download={filename}
                className="inline-flex items-center gap-1.5 text-xs font-medium text-gray-300 border border-gray-600 hover:border-gray-400 hover:text-white bg-gray-800 hover:bg-gray-700 rounded-md px-3 py-1.5 transition-colors"
              >
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v2a2 2 0 002 2h12a2 2 0 002-2v-2M7 10l5 5 5-5M12 15V3" />
                </svg>
                {filename}
              </a>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}
