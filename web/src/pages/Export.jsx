import React, { useMemo, useState } from 'react';
import { buildExports, EXPORT_FORMATS, buildLibraryZip, buildStorybookZip } from '../lib/emit/index.js';
import { downloadFile, downloadBlob } from '../lib/download.js';

// Figma is a "Ziel" (destination), not a code format — kept out of the token
// tabs but its data (exports.figma) stays reachable via the JSON preview.
const FORMAT_LIST = EXPORT_FORMATS.filter(f => f.id !== 'figma');
const FIGMA_FORMAT = EXPORT_FORMATS.find(f => f.id === 'figma');

// Kleiner ZIP-Marker an den Datei-Zielen (Figma ist Live-Ziel, kein Download).
function ZipTag() {
  return (
    <span className="align-middle text-[10px] px-1.5 py-0.5 rounded bg-zinc-100 text-zinc-500 font-medium">
      ZIP
    </span>
  );
}

export default function Export({ result }) {
  const exports = useMemo(() => buildExports(result), [result]);
  // Export-Ehrlichkeit (Testrunde 8, Fix 2): Bausteine ohne Template-Treffer und ohne
  // KI-Interpretation laufen als placeholder:true in exports.figma mit — in Figma werden
  // sie nur als leere Platzhalter-Karte angelegt. Rob soll das VOR dem Senden sehen.
  const placeholderComponents = useMemo(() => {
    if (!exports?.figma) return [];
    try {
      const parsed = JSON.parse(exports.figma);
      return Array.isArray(parsed.components) ? parsed.components.filter((c) => c.placeholder === true) : [];
    } catch {
      return [];
    }
  }, [exports]);
  const [activeId, setActiveId] = useState('css');
  const [copied, setCopied] = useState(null);
  const [sent, setSent] = useState(null);
  const [figmaJsonOpen, setFigmaJsonOpen] = useState(false);
  const [figmaCopied, setFigmaCopied] = useState(null);

  if (!exports) {
    return (
      <div className="text-sm text-zinc-500">
        Importiere ein Bild, um Tokens zu exportieren. Preview-Importe (URL/Repo) enthalten keine Detaildaten.
      </div>
    );
  }

  const current = FORMAT_LIST.find(f => f.id === activeId) ?? FORMAT_LIST[0];
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

  const handleDownloadAllTokens = () => {
    // Nur die Token-Formate (css/tailwind/json) — bewusst OHNE das Figma-JSON,
    // damit "Alle Token-Formate" genau das ist, was der Name sagt.
    FORMAT_LIST.forEach(f => downloadFile(f.filename, exports[f.id], f.mime));
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

  const handleExportStorybook = async () => {
    try {
      const blob = await buildStorybookZip(result);
      downloadBlob('designbridge-storybook.zip', blob);
    } catch (err) {
      console.error('Storybook-Export fehlgeschlagen:', err);
    }
  };

  const handleCopyFigmaJson = async () => {
    try {
      await navigator.clipboard.writeText(exports.figma);
      setFigmaCopied('ok');
    } catch {
      setFigmaCopied('fail');
    }
    setTimeout(() => setFigmaCopied(null), 1500);
  };

  return (
    <div className="max-w-4xl">
      {/* ── Tokens: Formate als Tabs über dem Code (statt separater Format-Liste) ── */}
      <div className="text-xs font-semibold uppercase tracking-wider text-zinc-400 mb-1">Tokens</div>
      <p className="text-xs text-zinc-500 mb-3">
        Design-Tokens aus dem Import — Farben, Schrift, Spacing, Radius, Shadows.
      </p>

      <div className="border border-zinc-200 rounded-lg overflow-hidden">
        <div className="flex gap-1 px-3 border-b border-zinc-200">
          {FORMAT_LIST.map(f => (
            <button
              key={f.id}
              onClick={() => setActiveId(f.id)}
              className={`text-sm px-3 py-2 -mb-px border-b-2 transition-colors ${
                activeId === f.id
                  ? 'border-primary text-zinc-900 font-medium'
                  : 'border-transparent text-zinc-500 hover:text-zinc-900'
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
        <pre
          data-testid="export-preview"
          className="text-xs font-mono bg-zinc-50 p-4 overflow-auto max-h-[60vh] whitespace-pre"
        >
          {code}
        </pre>
        <div className="flex items-center gap-2 px-3 py-2.5 border-t border-zinc-100">
          <span className="text-[11px] font-mono text-zinc-400">{current.filename}</span>
          {copied === 'ok' && <span className="text-[10px] text-emerald-600">kopiert</span>}
          {copied === 'fail' && <span className="text-[10px] text-red-600">nicht verfügbar</span>}
          <span className="ml-auto" />
          <button
            onClick={handleCopy}
            className="text-xs px-2.5 py-1 rounded border border-zinc-200 text-zinc-700 hover:bg-zinc-50 transition-colors"
          >
            Kopieren
          </button>
          <button
            onClick={() => downloadFile(current.filename, code, current.mime)}
            className="text-xs px-2.5 py-1 rounded bg-primary text-white font-medium hover:bg-primary-hover transition-colors"
          >
            Herunterladen
          </button>
        </div>
      </div>

      <button
        onClick={handleDownloadAllTokens}
        className="mt-3 text-xs px-2.5 py-1.5 rounded border border-zinc-200 text-zinc-700 hover:bg-zinc-50 transition-colors"
      >
        Alle Token-Formate herunterladen
      </button>

      {/* ── Ziele: Figma · Storybook · Ganze Library gleichwertig nebeneinander ── */}
      <div className="text-xs font-semibold uppercase tracking-wider text-zinc-400 mt-8 mb-1">Ziele</div>
      <p className="text-xs text-zinc-500 mb-3">Wohin mit der Extraktion?</p>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="border border-zinc-200 rounded-lg p-4 flex flex-col gap-3">
          <h4 className="text-sm font-medium text-zinc-900">An Figma senden</h4>
          <p className="text-xs text-zinc-500 leading-relaxed flex-1">
            Legt Paint- und Text-Styles sowie erkannte Komponenten direkt im Figma-Plugin an.
          </p>
          <button
            onClick={handleSendToFigma}
            className="w-full text-xs px-2.5 py-1.5 rounded bg-primary text-white font-medium hover:bg-primary-hover transition-colors"
          >
            An Figma senden
          </button>
          {sent === 'ok' && <span className="text-[11px] text-emerald-600">bereit — jetzt im Plugin „Aus DesignBridge übernehmen"</span>}
          {sent === 'fail' && <span className="text-[11px] text-red-600">fehlgeschlagen — läuft der Server?</span>}
        </div>

        <div className="border border-zinc-200 rounded-lg p-4 flex flex-col gap-3">
          <h4 className="text-sm font-medium text-zinc-900">Nach Storybook <ZipTag /></h4>
          <p className="text-xs text-zinc-500 leading-relaxed flex-1">
            Komponenten + <code className="text-[11px]">*.stories.jsx</code> + <code className="text-[11px]">.storybook/main.js</code> — das Developer-Paket zum Reinlegen.
          </p>
          <button
            onClick={handleExportStorybook}
            title="Komponenten + Stories + .storybook/main.js als Handoff-Paket"
            className="w-full text-xs px-2.5 py-1.5 rounded bg-primary text-white font-medium hover:bg-primary-hover transition-colors"
          >
            Nach Storybook exportieren
          </button>
        </div>

        <div className="border border-zinc-200 rounded-lg p-4 flex flex-col gap-3">
          <h4 className="text-sm font-medium text-zinc-900">Ganze Library <ZipTag /></h4>
          <p className="text-xs text-zinc-500 leading-relaxed flex-1">
            <strong>Alles zusammen:</strong> Tokens + Komponenten-Code + Stories + README — das komplette Paket für eine Codebase.
          </p>
          <button
            onClick={handleExportLibrary}
            className="w-full text-xs px-2.5 py-1.5 rounded bg-primary text-white font-medium hover:bg-primary-hover transition-colors"
          >
            Ganze Library exportieren
          </button>
        </div>
      </div>

      {/* ── Figma-Details: Warnung, Geltungsbereich, JSON-Vorschau (volle Breite) ── */}
      <div className="mt-4 flex flex-col gap-2">
        {placeholderComponents.length > 0 && (
          <div
            data-testid="export-figma-placeholder-warning"
            className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2"
          >
            <p className="text-xs text-amber-800 leading-relaxed">
              {placeholderComponents.length} Baustein{placeholderComponents.length === 1 ? '' : 'e'} ohne
              Interpretation ({placeholderComponents.map((c) => c.name).join(', ')}) — {placeholderComponents.length === 1 ? 'wird' : 'werden'} in
              Figma nur als Platzhalter-Karte angelegt. Vorher unter Atoms/Molecules/Organisms/Templates erneut interpretieren.
            </p>
          </div>
        )}
        <p className="text-[11px] text-zinc-400 leading-relaxed">
          Nach Figma gehen Farben & Textstile; Spacing, Radius und Schatten stecken in den Code-Formaten.
        </p>
        <button
          onClick={() => setFigmaJsonOpen(o => !o)}
          className="text-xs text-zinc-500 hover:text-zinc-900 underline underline-offset-2 text-left transition-colors self-start"
        >
          {figmaJsonOpen ? 'Figma-JSON ausblenden' : 'JSON anzeigen'}
        </button>
        {figmaJsonOpen && (
          <div className="space-y-1.5">
            <div className="flex items-center justify-between gap-1">
              <span className="text-[10px] font-mono text-zinc-500 truncate">{FIGMA_FORMAT.filename}</span>
              <div className="flex items-center gap-1.5 flex-shrink-0">
                {figmaCopied === 'ok' && <span className="text-[10px] text-emerald-600">kopiert</span>}
                {figmaCopied === 'fail' && <span className="text-[10px] text-red-600">n/v</span>}
                <button
                  onClick={handleCopyFigmaJson}
                  className="text-[10px] px-1.5 py-0.5 rounded border border-zinc-200 text-zinc-700 hover:bg-zinc-50 transition-colors"
                >
                  Kopieren
                </button>
                <button
                  onClick={() => downloadFile(FIGMA_FORMAT.filename, exports.figma, FIGMA_FORMAT.mime)}
                  className="text-[10px] px-1.5 py-0.5 rounded bg-primary text-white font-medium hover:bg-primary-hover transition-colors"
                >
                  Herunterladen
                </button>
              </div>
            </div>
            <pre
              data-testid="export-figma-json-preview"
              className="text-[10px] font-mono bg-zinc-50 border border-zinc-200 rounded p-2 overflow-auto max-h-64 whitespace-pre"
            >
              {exports.figma}
            </pre>
          </div>
        )}
      </div>
    </div>
  );
}
