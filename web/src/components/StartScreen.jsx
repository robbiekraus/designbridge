import React from 'react';

// Zusammenfassung des zwischengespeicherten Imports für die „fortsetzen"-Karte.
function summarize(result) {
  const cats = result?.categories ?? [];
  const count = (k) => cats.find((c) => c.key === k)?.count ?? 0;
  const inv = cats.find((c) => c.key === 'inventory')?.extra ?? {};
  const tokens =
    count('colors') + count('typography') + count('spacing') + count('radius') + count('shadows');
  const parts = [
    tokens > 0 && `${tokens} Tokens`,
    inv.atoms && `${inv.atoms} Atoms`,
    inv.molecules && `${inv.molecules} Molecules`,
    inv.organisms && `${inv.organisms} Organisms`,
    inv.templates && `${inv.templates} Templates`,
  ].filter(Boolean);
  const title = result?.raw?.meta?.image_filename || result?.raw?.meta?.description || 'Letzter Import';
  return { title, line: parts.join(' · ') };
}

const SOURCES = [
  { tab: 'image', emoji: '🖼️', label: 'Bild', hint: 'Screenshot einer Oberfläche hochladen.' },
  { tab: 'url', emoji: '🔗', label: 'URL', hint: 'Eine Website live scannen.', badge: 'Preview' },
  { tab: 'repo', emoji: '📦', label: 'Repo', hint: 'Tokens & Komponenten aus einem Repo heben.', badge: 'Preview' },
  { tab: 'figma', emoji: '🎨', label: 'Figma', hint: 'Läuft über das Figma-Plugin.', disabled: true },
];

// Start-Screen: erscheint beim (Neu-)Laden, solange kein Import aktiv ist. Ein im
// Zwischenspeicher liegender letzter Import wird als „fortsetzen"-Karte angeboten,
// statt automatisch geladen zu werden (kein Stale-Data beim Reload).
export default function StartScreen({ onNewImport, cachedImport, onResume, onDiscard }) {
  const resume = cachedImport ? summarize(cachedImport) : null;

  return (
    <div className="min-h-full flex flex-col items-center justify-center text-center px-6 py-16">
      <img src="/uiprism-appicon.svg" className="h-11 w-11 mb-4" alt="" aria-hidden="true" />
      <h1 className="text-2xl font-semibold tracking-tight text-zinc-900 text-balance">Bring deine UI in Code &amp; Figma</h1>
      <p className="text-sm text-zinc-500 mt-1.5 mb-7 max-w-md text-balance">
        Screenshot, URL, Repo oder Figma rein — Design-Tokens, Komponenten und Storybook raus.
      </p>

      {resume && (
        <div className="w-full max-w-xl flex items-center gap-3 text-left border border-primary-soft bg-primary-soft/40 rounded-xl px-4 py-3 mb-6">
          <span className="w-9 h-9 rounded-lg bg-white flex items-center justify-center text-base flex-shrink-0">📊</span>
          <div className="flex-1 min-w-0">
            <div className="text-[13px] font-medium text-primary-ink truncate">Letzten Import fortsetzen — {resume.title}</div>
            {resume.line && <p className="text-[11px] text-zinc-500 mt-0.5 tabular-nums">{resume.line}</p>}
          </div>
          <button
            onClick={onResume}
            className="text-xs px-3 py-1.5 rounded bg-primary text-white font-medium hover:bg-primary-hover transition-colors flex-shrink-0"
          >
            Öffnen
          </button>
          <button
            onClick={onDiscard}
            title="Aus dem Zwischenspeicher entfernen"
            className="text-[11px] text-zinc-400 hover:text-zinc-700 underline underline-offset-2 flex-shrink-0"
          >
            verwerfen
          </button>
        </div>
      )}

      <button
        onClick={() => onNewImport()}
        className="text-sm px-5 py-2.5 rounded-lg bg-primary text-white font-medium hover:bg-primary-hover transition-colors mb-8"
      >
        Neuer Import
      </button>

      <div className="text-[11px] uppercase tracking-widest text-zinc-400 mb-4">oder direkt eine Quelle wählen</div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 w-full max-w-xl">
        {SOURCES.map((s) => (
          <button
            key={s.tab}
            onClick={() => !s.disabled && onNewImport(s.tab)}
            disabled={s.disabled}
            className={`border border-zinc-200 rounded-xl p-4 text-left flex flex-col gap-1.5 transition-colors ${
              s.disabled ? 'opacity-55 cursor-not-allowed' : 'hover:border-zinc-400 hover:bg-zinc-50'
            }`}
          >
            <div className="flex items-center gap-2">
              <span className="text-lg" aria-hidden="true">{s.emoji}</span>
              <h4 className="text-sm font-medium text-zinc-900">{s.label}</h4>
              {s.badge && (
                <span className="ml-auto text-[9px] uppercase tracking-wide px-1.5 py-0.5 rounded-full bg-zinc-100 text-zinc-400">
                  {s.badge}
                </span>
              )}
            </div>
            <p className={`text-xs ${s.disabled ? 'text-zinc-400' : 'text-zinc-500'}`}>{s.hint}</p>
          </button>
        ))}
      </div>
    </div>
  );
}
