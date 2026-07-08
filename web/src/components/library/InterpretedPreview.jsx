// web/src/components/library/InterpretedPreview.jsx
// Rendert KI-interpretiertes HTML in einem abgeschotteten iframe.
// sandbox="allow-scripts" OHNE allow-same-origin: die Tailwind-Laufzeit darf
// laufen, aber der Inhalt hat keinen Zugriff auf App, localStorage, Cookies.
// Feste Max-Höhe mit iframe-eigenem Scroll (bewusst kein postMessage-Resize).
import React from 'react';

export function buildSrcdoc(html) {
  return [
    '<!doctype html><html><head><meta charset="utf-8">',
    '<script src="https://cdn.tailwindcss.com"></script>',
    '</head><body style="margin:0;padding:12px;background:#ffffff">',
    html,
    '</body></html>',
  ].join('');
}

export default function InterpretedPreview({ html, title }) {
  return (
    <iframe
      sandbox="allow-scripts"
      srcDoc={buildSrcdoc(html)}
      title={`Vorschau: ${title}`}
      className="w-full border-0 rounded"
      style={{ height: 240 }}
    />
  );
}
