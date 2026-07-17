// web/src/components/library/InterpretedPreview.jsx
// Rendert KI-interpretiertes HTML in einem abgeschotteten iframe.
// sandbox="allow-scripts" OHNE allow-same-origin: die Tailwind-Laufzeit darf
// laufen, aber der Inhalt hat keinen Zugriff auf App, localStorage, Cookies.
//
// Zwei Darstellungen:
// - Thumbnail (Default in der Zeile): das iframe rendert mit fester virtueller
//   Breite (1024px) und wird per CSS transform:scale() auf die Container-
//   Breite runterskaliert. So bleibt Interpretations-HTML mit festen Breiten
//   (w-[960px], Charts) vollständig sichtbar statt abgeschnitten/verschoben.
// - Vollbild-Modal: Klick auf das Thumbnail oder den „Vollbild"-Button öffnet
//   ein Overlay mit einem zweiten, groß skalierten iframe (scrollbar, normale
//   pointer-events).
import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';

const THUMB_VIRTUAL_WIDTH = 1024;
const THUMB_VIRTUAL_HEIGHT = 640;
const THUMB_FALLBACK_WIDTH = 672; // jsdom / erster Render ohne Layout: Fallback statt scale(0)

export function buildSrcdoc(html) {
  return [
    '<!doctype html><html><head><meta charset="utf-8">',
    '<script src="https://cdn.tailwindcss.com"></script>',
    '</head><body style="margin:0;padding:12px;background:#ffffff">',
    html,
    '</body></html>',
  ].join('');
}

function useContainerWidth(fallback) {
  const ref = useRef(null);
  const [width, setWidth] = useState(fallback);

  useLayoutEffect(() => {
    const measure = () => {
      const w = ref.current?.offsetWidth;
      setWidth(w && w > 0 ? w : fallback);
    };
    measure();

    let observer;
    if (typeof ResizeObserver !== 'undefined' && ref.current) {
      observer = new ResizeObserver(measure);
      observer.observe(ref.current);
    }
    window.addEventListener('resize', measure);
    return () => {
      observer?.disconnect();
      window.removeEventListener('resize', measure);
    };
  }, [fallback]);

  return [ref, width];
}

export default function InterpretedPreview({ html, title }) {
  const [open, setOpen] = useState(false);
  const [wrapperRef, containerWidth] = useContainerWidth(THUMB_FALLBACK_WIDTH);
  const scale = containerWidth / THUMB_VIRTUAL_WIDTH;
  const srcDoc = buildSrcdoc(html);

  useEffect(() => {
    if (!open) return;
    const onKey = e => {
      if (e.key === 'Escape') setOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  return (
    <div>
      <div
        ref={wrapperRef}
        data-testid="preview-thumb-wrapper"
        role="button"
        tabIndex={0}
        aria-label="Vorschau in Vollbild öffnen"
        onClick={() => setOpen(true)}
        onKeyDown={e => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            setOpen(true);
          }
        }}
        className="w-full overflow-hidden rounded border border-zinc-200 bg-white cursor-zoom-in hover:border-zinc-300"
        style={{ height: THUMB_VIRTUAL_HEIGHT * scale }}
      >
        <iframe
          sandbox="allow-scripts"
          srcDoc={srcDoc}
          title={`Vorschau: ${title}`}
          className="border-0"
          style={{
            width: THUMB_VIRTUAL_WIDTH,
            height: THUMB_VIRTUAL_HEIGHT,
            transform: `scale(${scale})`,
            transformOrigin: 'top left',
            pointerEvents: 'none',
          }}
        />
      </div>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="mt-1 text-[11px] px-2 py-0.5 rounded border border-zinc-200 text-zinc-700 hover:bg-zinc-50"
      >
        Vollbild
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div
            data-testid="preview-modal-backdrop"
            className="absolute inset-0 bg-black/40"
            onClick={() => setOpen(false)}
            aria-hidden
          />
          <div
            role="dialog"
            aria-modal="true"
            aria-label={title}
            onClick={e => e.stopPropagation()}
            className="relative bg-white rounded-xl shadow-2xl flex flex-col overflow-hidden"
            style={{ width: '90vw', height: '85vh' }}
          >
            <header className="flex items-center justify-between px-4 py-2 border-b border-zinc-100">
              <div className="text-sm font-semibold text-zinc-900">{title}</div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="text-zinc-400 hover:text-zinc-900 transition-colors text-sm"
                aria-label="Schließen"
              >
                ✕
              </button>
            </header>
            <iframe
              sandbox="allow-scripts"
              srcDoc={srcDoc}
              title={`Vorschau: ${title}`}
              className="w-full flex-1 border-0"
            />
          </div>
        </div>
      )}
    </div>
  );
}
