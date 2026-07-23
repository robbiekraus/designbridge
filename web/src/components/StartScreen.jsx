import React from 'react';

// Monochrome Line-Icons (Lucide-Stil, wie shadcn/ui) — currentColor, dünner
// Strich, passen zum zink/weiß-Look statt bunter Emoji.
function Svg({ children, className = 'w-4 h-4' }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {children}
    </svg>
  );
}
const ImageIcon = (p) => <Svg {...p}><rect x="3" y="3" width="18" height="18" rx="2" /><circle cx="9" cy="9" r="2" /><path d="m21 15-3.1-3.1a2 2 0 0 0-2.8 0L6 21" /></Svg>;
const LinkIcon = (p) => <Svg {...p}><path d="M10 13a5 5 0 0 0 7.5.5l3-3a5 5 0 0 0-7-7l-1.7 1.7" /><path d="M14 11a5 5 0 0 0-7.5-.5l-3 3a5 5 0 0 0 7 7l1.7-1.7" /></Svg>;
const PackageIcon = (p) => <Svg {...p}><path d="M21 8a2 2 0 0 0-1-1.7l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.7l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z" /><path d="m3.3 7 8.7 5 8.7-5" /><path d="M12 22V12" /></Svg>;
const FigmaIcon = (p) => <Svg {...p}><path d="M8.5 2H12v7H8.5A3.5 3.5 0 0 1 8.5 2z" /><path d="M12 2h3.5a3.5 3.5 0 1 1 0 7H12z" /><path d="M12 12.5a3.5 3.5 0 1 1 7 0 3.5 3.5 0 0 1-7 0z" /><path d="M8.5 16H12v3.5A3.5 3.5 0 1 1 8.5 16z" /><path d="M8.5 9H12v7H8.5a3.5 3.5 0 0 1 0-7z" /></Svg>;
const DashboardIcon = (p) => <Svg {...p}><rect width="7" height="9" x="3" y="3" rx="1" /><rect width="7" height="5" x="14" y="3" rx="1" /><rect width="7" height="9" x="14" y="12" rx="1" /><rect width="7" height="5" x="3" y="16" rx="1" /></Svg>;

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
  { tab: 'image', Icon: ImageIcon, label: 'Bild', hint: 'Screenshot einer Oberfläche hochladen.' },
  { tab: 'url', Icon: LinkIcon, label: 'URL', hint: 'Eine Website live scannen.', badge: 'Preview' },
  { tab: 'repo', Icon: PackageIcon, label: 'Repo', hint: 'Tokens & Komponenten aus einem Repo heben.', badge: 'Preview' },
  { tab: 'figma', Icon: FigmaIcon, label: 'Figma', hint: 'Läuft über das Figma-Plugin.', disabled: true },
];

// Start-Screen: erscheint beim (Neu-)Laden, solange kein Import aktiv ist. Ein im
// Zwischenspeicher liegender letzter Import wird als „fortsetzen"-Karte angeboten,
// statt automatisch geladen zu werden (kein Stale-Data beim Reload).
export default function StartScreen({ onNewImport, cachedImport, onResume, onDiscard }) {
  const resume = cachedImport ? summarize(cachedImport) : null;

  return (
    <div className="min-h-full flex flex-col items-center justify-center text-center px-6 py-16">
      <div className="flex items-center gap-2 mb-5">
        <img src="/uiprism-appicon.svg" className="h-6 w-6" alt="" aria-hidden="true" />
        <span className="text-xl font-semibold tracking-wide">
          <span className="text-ink">UI</span><span className="text-primary">Prism</span>
        </span>
      </div>
      <h1 className="text-2xl font-semibold tracking-tight text-zinc-900 text-balance">Bring deine UI in Code &amp; Figma</h1>
      <p className="text-sm text-zinc-500 mt-1.5 mb-7 max-w-md text-balance">
        Screenshot, URL, Repo oder Figma rein — Design-Tokens, Komponenten und Storybook raus.
      </p>

      {resume && (
        <div className="w-full max-w-xl flex items-center gap-3 text-left border border-primary-soft bg-primary-soft/40 rounded-xl px-4 py-3 mb-6">
          <span className="w-9 h-9 rounded-lg bg-white border border-zinc-200 flex items-center justify-center text-zinc-500 flex-shrink-0"><DashboardIcon className="w-4 h-4" /></span>
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
        {SOURCES.map(({ tab, Icon, label, hint, badge, disabled }) => (
          <button
            key={tab}
            onClick={() => !disabled && onNewImport(tab)}
            disabled={disabled}
            className={`border border-zinc-200 rounded-xl p-4 text-left flex flex-col gap-1.5 transition-colors ${
              disabled ? 'opacity-55 cursor-not-allowed' : 'hover:border-zinc-400 hover:bg-zinc-50'
            }`}
          >
            <div className="flex items-center gap-2">
              <Icon className="w-4 h-4 text-zinc-500 flex-shrink-0" />
              <h4 className="text-sm font-medium text-zinc-900">{label}</h4>
              {badge && (
                <span className="ml-auto text-[9px] uppercase tracking-wide px-1.5 py-0.5 rounded-full bg-zinc-100 text-zinc-400">
                  {badge}
                </span>
              )}
            </div>
            <p className={`text-xs ${disabled ? 'text-zinc-400' : 'text-zinc-500'}`}>{hint}</p>
          </button>
        ))}
      </div>
    </div>
  );
}
