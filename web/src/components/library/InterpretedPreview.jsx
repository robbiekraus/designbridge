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
import React, { useEffect, useId, useLayoutEffect, useRef, useState } from 'react';

const THUMB_VIRTUAL_WIDTH = 1024;
const THUMB_VIRTUAL_HEIGHT = 640;
const THUMB_FALLBACK_WIDTH = 672; // jsdom / erster Render ohne Layout: Fallback statt scale(0)
const THUMB_MAX_HEIGHT = 800;
const THUMB_MIN_HEIGHT = 40;
const HEIGHT_MESSAGE_TYPE = 'designbridge-preview-height';

// buildSrcdoc(html, instanceId?) — instanceId ist optional. Wird sie
// mitgegeben (Thumbnail), bekommt das Dokument ein Mini-Script, das die
// Inhaltshöhe per postMessage an den Parent meldet (nach load + bei
// Größenänderung über ResizeObserver, mit setTimeout-Fallback ohne RO).
// Ohne instanceId (Vollbild-Modal) bleibt das Dokument wie bisher —
// html bleibt der erste Parameter, bestehende Aufrufe/Exporte bleiben kompatibel.
export function buildSrcdoc(html, instanceId) {
  const heightScript = instanceId == null ? '' : [
    '<script>',
    '(function () {',
    `  var id = ${JSON.stringify(String(instanceId))};`,
    '  function reportHeight() {',
    '    try {',
    // body.scrollHeight, NICHT documentElement.scrollHeight: letzterer ist in
    // einem iframe nie kleiner als die iframe-Höhe selbst (Viewport) — er
    // meldete konstant 640 und der Weißraum blieb (Live-Fund 17.07.).
    `      parent.postMessage({ type: ${JSON.stringify(HEIGHT_MESSAGE_TYPE)}, id: id, height: document.body.scrollHeight }, '*');`,
    '    } catch (e) {}',
    '  }',
    '  window.addEventListener("load", reportHeight);',
    '  if (typeof ResizeObserver !== "undefined") {',
    '    var ro = new ResizeObserver(reportHeight);',
    '    ro.observe(document.body);',
    '  } else {',
    '    setTimeout(reportHeight, 300);',
    '  }',
    '  setTimeout(reportHeight, 0);',
    '})();',
    '</script>',
  ].join('\n');

  return [
    '<!doctype html><html><head><meta charset="utf-8">',
    '<script src="https://cdn.tailwindcss.com"></script>',
    '</head><body style="margin:0;padding:12px;background:#ffffff">',
    html,
    heightScript,
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
  const [contentHeight, setContentHeight] = useState(null);
  const instanceId = useId();
  const thumbFrameRef = useRef(null);
  const scale = containerWidth / THUMB_VIRTUAL_WIDTH;
  const thumbSrcDoc = buildSrcdoc(html, instanceId);
  const modalSrcDoc = buildSrcdoc(html);

  // Höre auf die Height-Reports des Thumbnail-iframes (siehe buildSrcdoc).
  // Gefiltert auf type + passende instanceId; der source-Check ist defensiv
  // (in jsdom ist contentWindow ggf. nicht simulierbar, dann greift der
  // id-Filter allein).
  useEffect(() => {
    const onMessage = e => {
      if (e.data?.type !== HEIGHT_MESSAGE_TYPE) return;
      if (e.data?.id !== instanceId) return;
      if (e.source && e.source !== thumbFrameRef.current?.contentWindow) return;
      setContentHeight(e.data.height);
    };
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, [instanceId]);

  const frameHeight = contentHeight == null
    ? THUMB_VIRTUAL_HEIGHT
    : Math.max(THUMB_MIN_HEIGHT, Math.min(contentHeight, THUMB_MAX_HEIGHT));

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
        data-instance-id={instanceId}
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
        style={{ height: frameHeight * scale }}
      >
        <iframe
          ref={thumbFrameRef}
          sandbox="allow-scripts"
          srcDoc={thumbSrcDoc}
          title={`Vorschau: ${title}`}
          className="border-0"
          style={{
            width: THUMB_VIRTUAL_WIDTH,
            height: frameHeight,
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
              srcDoc={modalSrcDoc}
              title={`Vorschau: ${title}`}
              className="w-full flex-1 border-0"
            />
          </div>
        </div>
      )}
    </div>
  );
}
