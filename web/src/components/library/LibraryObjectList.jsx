import React, { useState } from 'react';
import ConfidencePill from './ConfidencePill.jsx';
import SourcePill from './SourcePill.jsx';
import PreviewPlaceholder from './PreviewPlaceholder.jsx';
import InterpretedPreview from './InterpretedPreview.jsx';
import { PREVIEWS } from '../../lib/components/templates/Previews.jsx';
import { downloadFile } from '../../lib/download.js';

function Row({ item, picks, onRetryInterpret }) {
  const [open, setOpen] = useState(false);
  const [variant, setVariant] = useState(item.variants[0] ?? null);
  const [copied, setCopied] = useState(false);
  const Preview = item.hasPreview ? PREVIEWS[item.templateKey] : null;

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(item.code);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      setCopied(false);
    }
  };

  return (
    <div className="border-b border-zinc-200">
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-2 w-full text-left px-3 py-2 text-sm hover:bg-zinc-50"
      >
        <span className={`text-zinc-400 transition-transform ${open ? 'rotate-90' : ''}`}>›</span>
        <span className="font-medium text-zinc-900">{item.name}</span>
        <ConfidencePill value={item.confidence} />
        <SourcePill value={item.source} />
        {item.interpretedHtml && <SourcePill value="interpreted" />}
        {!item.hasPreview && !item.interpretedHtml && (
          <span className="text-[10px] px-1.5 py-0.5 rounded bg-zinc-100 text-zinc-500">
            generischer Stub
          </span>
        )}
        <span className="ml-auto text-[10px] font-mono text-zinc-400">{item.filename}</span>
      </button>

      {open && (
        <div className="bg-zinc-50 px-3 pb-3">
          {item.variants.length > 0 && (
            <div className="flex gap-1 py-2">
              {item.variants.map((v) => (
                <button
                  key={v}
                  onClick={() => setVariant(v)}
                  className={`text-[11px] px-2 py-0.5 rounded ${
                    variant === v ? 'bg-zinc-900 text-white' : 'bg-zinc-100 text-zinc-600'
                  }`}
                >
                  {v}
                </button>
              ))}
            </div>
          )}
          {item.notes && (
            <div className="flex items-start gap-1 text-[11px] italic text-zinc-500 pt-1">
              <span aria-hidden="true">✎</span>
              <span>{item.notes}</span>
            </div>
          )}

          <div className="text-[9px] uppercase tracking-wider text-zinc-400 pt-1 pb-1.5">Vorschau</div>
          <div className="flex items-center gap-2 flex-wrap p-3 bg-white border border-zinc-200 rounded">
            {Preview ? (
              <Preview variant={variant} picks={picks} />
            ) : item.interpretedHtml ? (
              <div className="w-full">
                <InterpretedPreview html={item.interpretedHtml} title={item.name} />
              </div>
            ) : item.interpretPending ? (
              <PreviewPlaceholder label="Wird interpretiert …" />
            ) : (
              <PreviewPlaceholder label="keine Vorschau" />
            )}
          </div>
          {item.interpretFailed && (
            <div className="flex items-center gap-2 pt-2 text-[11px] text-zinc-500">
              <span>Interpretation fehlgeschlagen.</span>
              {onRetryInterpret && (
                <button
                  onClick={onRetryInterpret}
                  className="text-[11px] px-2 py-0.5 rounded border border-zinc-200 text-zinc-700 hover:bg-zinc-50"
                >
                  Erneut versuchen
                </button>
              )}
            </div>
          )}

          <div className="text-[9px] uppercase tracking-wider text-zinc-400 pt-3 pb-1.5">Code</div>
          <pre className="text-xs font-mono bg-white border border-zinc-200 rounded p-3 overflow-auto max-h-72 whitespace-pre">
            {item.code}
          </pre>

          <div className="flex items-center gap-2 mt-2">
            <span className="text-[10px] font-mono text-zinc-400">{item.filename}</span>
            {copied && <span className="text-[10px] text-emerald-600">kopiert</span>}
            <span className="ml-auto" />
            <button
              onClick={copy}
              className="text-xs px-2.5 py-1 rounded border border-zinc-200 text-zinc-700 hover:bg-zinc-50"
            >
              Kopieren
            </button>
            <button
              onClick={() => downloadFile(item.filename, item.code, 'text/javascript')}
              className="text-xs px-2.5 py-1 rounded bg-zinc-900 text-white font-medium hover:bg-zinc-700"
            >
              Herunterladen
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default function LibraryObjectList({ items, picks, onRetryInterpret }) {
  if (!items || items.length === 0) {
    return <div className="text-sm text-zinc-500">Keine Objekte erkannt.</div>;
  }
  return (
    <div className="max-w-3xl border-t border-zinc-200">
      {items.map((item) => (
        <Row key={item.slug + item.kind} item={item} picks={picks} onRetryInterpret={onRetryInterpret} />
      ))}
    </div>
  );
}
