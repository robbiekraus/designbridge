import React, { useMemo, useState } from 'react';
import { buildExports, EXPORT_FORMATS, buildLibraryZip } from '../lib/emit/index.js';
import { downloadFile, downloadBlob } from '../lib/download.js';

export default function Export({ result }) {
  const exports = useMemo(() => buildExports(result), [result]);
  const [activeId, setActiveId] = useState('css');
  const [copied, setCopied] = useState(null);
  const [sent, setSent] = useState(null);

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

  const handleSendToFigma = async () => {
    try {
      const res = await fetch('/api/figma-export', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: exports.figma,
      });
      setSent(res.ok ? 'ok' : 'fail');
    } catch {
      setSent('fail');
    }
    setTimeout(() => setSent(null), 3000);
  };

  const handleExportLibrary = async () => {
    try {
      const blob = await buildLibraryZip(result);
      downloadBlob('designbridge-library.zip', blob);
    } catch (err) {
      console.error('Library-Export fehlgeschlagen:', err);
    }
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
        <button
          onClick={handleExportLibrary}
          className="mt-2 w-full text-xs px-2.5 py-1.5 rounded bg-zinc-900 text-white font-medium hover:bg-zinc-700 transition-colors"
        >
          Ganze Library exportieren
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
        {activeId === 'figma' && (
          <div className="mt-3 space-y-2">
            <div className="flex items-center gap-2">
              <button
                onClick={handleSendToFigma}
                className="text-xs px-2.5 py-1.5 rounded bg-zinc-900 text-white font-medium hover:bg-zinc-700 transition-colors"
              >
                An Figma senden
              </button>
              {sent === 'ok' && <span className="text-[11px] text-emerald-600">bereit — jetzt im Plugin „Aus DesignBridge übernehmen"</span>}
              {sent === 'fail' && <span className="text-[11px] text-red-600">fehlgeschlagen — läuft der Server?</span>}
            </div>
            <p className="text-xs text-zinc-500 leading-relaxed">
              Schnellster Weg: <strong>An Figma senden</strong> → in Figma das DesignBridge-Plugin öffnen →
              <strong> Aus DesignBridge übernehmen</strong>. Alternativ JSON <strong>Kopieren</strong> und im
              Plugin unter „Code → Figma" einfügen. Legt Paint- und Text-Styles an (Gruppe „DesignBridge/…").
              v1: Farben + Typografie.
            </p>
          </div>
        )}
      </section>
    </div>
  );
}
