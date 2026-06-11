import React, { useState, useEffect } from 'react';
import SourceScanner from './pages/SourceScanner.jsx';

const NAV = ['Dashboard', 'Source Scanner', 'Tokens', 'Atomics', 'Components', 'Patterns'];

export default function App() {
  const [page, setPage] = useState('Source Scanner');
  const [serverOk, setServerOk] = useState(null);

  useEffect(() => {
    fetch('/api/health')
      .then(r => r.json())
      .then(d => setServerOk(d.anthropic_key_configured))
      .catch(() => setServerOk(false));
  }, []);

  return (
    <div className="min-h-screen flex flex-col">
      {/* Topbar */}
      <header className="h-12 border-b border-zinc-200 flex items-center px-5 gap-0 flex-shrink-0">
        <a href="#" className="flex items-center gap-2 text-sm font-semibold tracking-tight mr-6">
          <div className="w-5 h-5 bg-zinc-900 rounded flex items-center justify-center">
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="m9 11-6 6v3h9l3-3"/><path d="m22 12-4.6 4.6a2 2 0 0 1-2.8 0l-5.2-5.2a2 2 0 0 1 0-2.8L14 4"/>
            </svg>
          </div>
          Designbridge
        </a>
        <nav className="flex items-center gap-0.5 flex-1">
          {NAV.map(n => (
            <button key={n} onClick={() => setPage(n)}
              className={`text-sm px-2.5 py-1 rounded transition-colors ${page === n ? 'text-zinc-900 bg-zinc-100 font-medium' : 'text-zinc-500 hover:text-zinc-900 hover:bg-zinc-50'}`}>
              {n}
            </button>
          ))}
        </nav>
        <div className="flex items-center gap-2">
          {serverOk === false && (
            <span className="text-xs text-red-600 font-medium">⚠ API key missing</span>
          )}
          <button className="btn-ghost text-xs">Settings</button>
          <button className="btn-outline text-xs">Connect Figma</button>
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden">
        {/* Sidebar */}
        <aside className="w-48 border-r border-zinc-200 p-2 flex flex-col gap-0.5 flex-shrink-0">
          <div className="text-xs font-semibold uppercase tracking-wider text-zinc-400 px-2 pt-2 pb-1">Library</div>
          {[
            { label: 'Tokens', badge: null },
            { label: 'Atomics', badge: null },
            { label: 'Components', badge: null },
            { label: 'Patterns', badge: null },
          ].map(({ label, badge }) => (
            <button key={label}
              className="flex items-center gap-2 px-2 py-1.5 rounded text-sm text-zinc-500 hover:bg-zinc-100 hover:text-zinc-900 transition-colors w-full text-left">
              {label}
              {badge && <span className="ml-auto text-xs bg-zinc-900 text-white rounded-full min-w-4 h-4 flex items-center justify-center px-1">{badge}</span>}
            </button>
          ))}
        </aside>

        {/* Main content */}
        <main className="flex-1 overflow-y-auto">
          {page === 'Source Scanner' ? <SourceScanner /> : (
            <div className="p-8 text-zinc-400 text-sm">{page} — coming soon</div>
          )}
        </main>
      </div>
    </div>
  );
}
