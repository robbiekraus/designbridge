import React, { useMemo, useState } from 'react';
import { buildExports, EXPORT_FORMATS } from '../lib/emit/index.js';

function downloadFile(filename, content, mime) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export default function Export({ result }) {
  const exports = useMemo(() => buildExports(result), [result]);
  const [activeId, setActiveId] = useState('css');
  const [copied, setCopied] = useState(null);

  if (!exports) {
    return (
      <div className="text-sm text-zinc-500">
        Importiere ein Bild, um Tokens zu exportieren. Preview-Importe (URL/Repo) enthalten keine Detaildaten.
      </div>
    );
  }

  const current = EXPORT_FORMATS.find(f => f.id === activeId) ?? EXPORT_FORMATS[0];
  const code = exports[activeId];

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied('ok');
    } catch {
      setCopied('fail');
    }
    setTimeout(() => setCopied(null), 1500);
  };

  const handleDownloadAll = () => {
    EXPORT_FORMATS.forEach(f => downloadFile(f.filename, exports[f.id], f.mime));
  };

  return (
    <div className="flex gap-6 max-w-5xl">
      <aside className="w-48 flex-shrink-0">
        <div className="text-xs font-semibold uppercase tracking-wider text-zinc-400 mb-3">Format</div>
        <div className="flex flex-col gap-0.5">
          {EXPORT_FORMATS.map(f => (
            <button
              key={f.id}
              onClick={() => setActiveId(f.id)}
              className={`px-2 py-1.5 rounded text-sm text-left transition-colors ${
                activeId === f.id
                  ? 'bg-zinc-100 text-zinc-900 font-medium'
                  : 'text-zinc-500 hover:bg-zinc-100 hover:text-zinc-900'
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
        <button
          onClick={handleDownloadAll}
          className="mt-4 w-full text-xs px-2.5 py-1.5 rounded border border-zinc-200 text-zinc-700 hover:bg-zinc-50 transition-colors"
        >
          Alle herunterladen
        </button>
      </aside>

      <section className="flex-1 min-w-0">
        <div className="flex items-center justify-between mb-3">
          <span className="text-xs font-mono text-zinc-500">{current.filename}</span>
          <div className="flex items-center gap-2">
            {copied === 'ok' && <span className="text-[10px] text-emerald-600">kopiert</span>}
            {copied === 'fail' && <span className="text-[10px] text-red-600">nicht verfügbar</span>}
            <button
              onClick={handleCopy}
              className="text-xs px-2.5 py-1 rounded border border-zinc-200 text-zinc-700 hover:bg-zinc-50 transition-colors"
            >
              Kopieren
            </button>
            <button
              onClick={() => downloadFile(current.filename, code, current.mime)}
              className="text-xs px-2.5 py-1 rounded bg-zinc-900 text-white font-medium hover:bg-zinc-700 transition-colors"
            >
              Herunterladen
            </button>
          </div>
        </div>
        <pre
          data-testid="export-preview"
          className="text-xs font-mono bg-zinc-50 border border-zinc-200 rounded p-4 overflow-auto max-h-[70vh] whitespace-pre"
        >
          {code}
        </pre>
      </section>
    </div>
  );
}
