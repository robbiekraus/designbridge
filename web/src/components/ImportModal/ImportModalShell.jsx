import React, { useEffect } from 'react';

export default function ImportModalShell({
  open,
  title,
  tabs = null,
  activeTab,
  onTabChange,
  onClose,
  children,
  footer,
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = e => { if (e.key === 'Escape') onClose?.(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/30" onClick={onClose} aria-hidden />
      <div role="dialog" aria-modal="true" aria-label={title}
        className="relative bg-white rounded-xl shadow-2xl w-full max-w-xl mx-4 overflow-hidden flex flex-col">
        <header className="flex items-center justify-between px-5 py-3 border-b border-zinc-100">
          <div className="text-sm font-semibold text-zinc-900">{title}</div>
          <button onClick={onClose}
            className="text-zinc-400 hover:text-zinc-900 transition-colors text-sm"
            aria-label="Close">✕</button>
        </header>

        {tabs && (
          <div className="flex gap-0 px-3 border-b border-zinc-100">
            {tabs.map(t => (
              <button key={t.id} onClick={() => onTabChange(t.id)} disabled={t.disabled}
                className={`px-3 py-2 text-xs flex items-center gap-1.5 border-b-2 transition-colors
                  ${activeTab === t.id ? 'border-zinc-900 text-zinc-900 font-semibold' : 'border-transparent text-zinc-500 hover:text-zinc-900'}
                  ${t.disabled ? 'text-zinc-300 cursor-not-allowed hover:text-zinc-300' : ''}`}>
                {t.label}
                {t.badge && (
                  <span className="text-[9px] font-semibold uppercase tracking-wider px-1 py-0.5 rounded bg-amber-100 text-amber-800">
                    {t.badge}
                  </span>
                )}
              </button>
            ))}
          </div>
        )}

        <div className="px-5 py-5">{children}</div>

        {footer && (
          <footer className="px-5 py-3 border-t border-zinc-100 bg-zinc-50 flex justify-end gap-2">
            {footer}
          </footer>
        )}
      </div>
    </div>
  );
}
