import React, { useState, useEffect, useRef } from 'react';
import ImportModal from './components/ImportModal/ImportModal.jsx';
import { loadLastImport, saveLastImport } from './lib/libraryStore.js';
import Dashboard from './pages/Dashboard.jsx';
import Tokens from './pages/Tokens.jsx';
import Atomics from './pages/Atomics.jsx';
import Components from './pages/Components.jsx';
import Patterns from './pages/Patterns.jsx';
import Export from './pages/Export.jsx';
import EmptyState from './components/library/EmptyState.jsx';
import AiDeepenBanner from './components/library/AiDeepenBanner.jsx';
import InterpretAllBar from './components/library/InterpretAllBar.jsx';
import { componentsNeedingInterpretation, runInterpretation, retryInterpretation, applyIfSameImport, normalizeStalePending } from './lib/interpret.js';

export default function App() {
  const [page, setPage] = useState('Dashboard');
  const [serverOk, setServerOk] = useState(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [lastImport, setLastImport] = useState(null);
  const [retryingNames, setRetryingNames] = useState(() => new Set());
  const interpretAbortRef = useRef(null);

  // Startet (oder übernimmt) die Interpretation für `base`: bricht eine noch
  // laufende vorherige Interpretation ab (ein neuer Import gewinnt und spart
  // Free-Tier-Quota), füllt die UI chunkweise per onProgress, und setzt
  // interpretPending selbst nur dann zurück, wenn runInterpretation aus
  // "nichts zu tun" (nicht aus Abort) null liefert — bei Abort tut es nichts,
  // der neue Import hat den State schon übernommen.
  const startInterpretation = (base) => {
    interpretAbortRef.current?.abort();
    const controller = new AbortController();
    interpretAbortRef.current = controller;
    const apply = (next) => {
      setLastImport((cur) => {
        const applied = applyIfSameImport(cur, next);
        if (applied !== cur) saveLastImport(applied);
        return applied;
      });
    };
    runInterpretation(base, { onProgress: apply, signal: controller.signal }).then((next) => {
      if (next) {
        apply(next);
        return;
      }
      if (controller.signal.aborted) return; // neuer Import hat übernommen — nichts tun
      // "nichts zu tun" ohne Abort: pending zurücksetzen, sonst bliebe die Leiste hängen.
      setLastImport((cur) => {
        if (cur?.raw?.meta?.import_id !== base?.raw?.meta?.import_id) return cur;
        const applied = { ...cur, interpretPending: false };
        saveLastImport(applied);
        return applied;
      });
    });
  };

  useEffect(() => {
    fetch('/api/health')
      .then(r => r.json())
      .then(d => setServerOk(d.ai_key_configured ?? d.anthropic_key_configured))
      .catch(() => setServerOk(false));

    try {
      if (localStorage.getItem('designbridge.hasImported') !== '1') {
        setModalOpen(true);
      }
    } catch {}
    // Reload-Limbo-Fix: ein beim letzten Reload noch laufender Batch/Chunk
    // hat keinen Request mehr, der ihn fortführt — persistiertes
    // interpretPending:true würde Bausteine für immer auf "Wird
    // interpretiert …" hängen lassen. Auf failed normalisieren, damit der
    // bestehende Retry-Knopf erscheint.
    const loaded = loadLastImport();
    const normalized = normalizeStalePending(loaded);
    if (normalized !== loaded) saveLastImport(normalized);
    setLastImport(normalized);
  }, []);

  const handleImported = (result) => {
    const todo = componentsNeedingInterpretation(result);
    const initial = ['image', 'url'].includes(result.source) && todo.length > 0
      ? { ...result, interpretPending: true }
      : result;
    saveLastImport(initial);
    setLastImport(initial);
    if (initial.interpretPending) {
      startInterpretation(initial);
    }
  };

  const handleDeepened = (result) => {
    saveLastImport(result);
    setLastImport(result);
  };

  // Ohne `name`: Batch-Retry aller fehlgeschlagenen Bausteine.
  // Mit `name`: Retry nur für diesen einen Baustein (per-row retry aus LibraryObjectList).
  const handleRetryInterpret = (name) => {
    if (name) {
      if (retryingNames.has(name)) return; // Doppelklick-Schutz: nur ein Request pro Name
      setRetryingNames((s) => new Set(s).add(name));
      retryInterpretation(lastImport, name)
        .then((next) => {
          setLastImport((cur) => {
            const applied = applyIfSameImport(cur, next);
            if (applied !== cur) saveLastImport(applied);
            return applied;
          });
        })
        .finally(() => {
          setRetryingNames((s) => {
            const n = new Set(s);
            n.delete(name);
            return n;
          });
        });
      return;
    }
    // Guard (Gegenrichtung der Retry-Race): Batch-Start während laufendem
    // Einzel-Retry würde denselben Baustein doppelt anfragen — konkurrierende
    // Writes, letzter gewinnt, doppelte Quota-Kosten. UI-seitig ist der Knopf
    // via retryBusy schon gesperrt; das hier ist Defense in depth.
    if (retryingNames.size > 0) return;
    const pending = { ...lastImport, interpretPending: true, interpretError: null, interpretFailed: [] };
    saveLastImport(pending);
    setLastImport(pending);
    startInterpretation(pending);
  };

  const renderPage = () => {
    if (!lastImport) return <EmptyState onNewImport={() => setModalOpen(true)} />;
    switch (page) {
      case 'Tokens': return <Tokens result={lastImport} />;
      case 'Atomics': return <Atomics result={lastImport} onRetryInterpret={handleRetryInterpret} retryingNames={retryingNames} />;
      case 'Components': return <Components result={lastImport} onRetryInterpret={handleRetryInterpret} retryingNames={retryingNames} />;
      case 'Patterns': return <Patterns result={lastImport} onRetryInterpret={handleRetryInterpret} retryingNames={retryingNames} />;
      case 'Export': return <Export result={lastImport} />;
      case 'Dashboard':
      default: return <Dashboard result={lastImport} />;
    }
  };

  const navCategories = lastImport?.categories ?? [];
  const catCount = key => navCategories.find(c => c.key === key)?.count ?? 0;
  const invExtra = navCategories.find(c => c.key === 'inventory')?.extra ?? {};
  const navCounts = {
    Tokens: catCount('colors') + catCount('typography') + catCount('spacing') + catCount('radius') + catCount('shadows'),
    Atomics: invExtra.atomics ?? 0,
    Components: invExtra.components ?? 0,
    Patterns: invExtra.patterns ?? 0,
  };

  return (
    <div className="min-h-screen flex flex-col">
      <header className="h-12 border-b border-zinc-200 flex items-center px-5 gap-0 flex-shrink-0">
        <a href="#" className="flex items-center gap-2 text-sm font-semibold tracking-tight mr-6">
          <div className="w-5 h-5 bg-zinc-900 rounded flex items-center justify-center">
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="m9 11-6 6v3h9l3-3"/><path d="m22 12-4.6 4.6a2 2 0 0 1-2.8 0l-5.2-5.2a2 2 0 0 1 0-2.8L14 4"/>
            </svg>
          </div>
          Designbridge
        </a>
        <div className="flex-1" />
        <div className="flex items-center gap-2">
          {serverOk === false && (
            <span className="text-xs text-red-600 font-medium">⚠ API key missing</span>
          )}
          {lastImport && (
            <button onClick={() => setModalOpen(true)}
              className="text-xs px-2.5 py-1 rounded bg-zinc-900 text-white font-medium hover:bg-zinc-700 transition-colors">
              Neuer Import
            </button>
          )}
          <button disabled title="Folgt in einer späteren Version" className="btn-ghost text-xs opacity-40 cursor-not-allowed">Settings</button>
          <button disabled title="Folgt in einer späteren Version — Export nach Figma läuft über das Plugin" className="btn-outline text-xs opacity-40 cursor-not-allowed">Connect Figma</button>
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden">
        <aside className="w-48 border-r border-zinc-200 p-2 flex flex-col gap-0.5 flex-shrink-0">
          <button onClick={() => setPage('Dashboard')}
            className={`flex items-center gap-2 px-2 py-1.5 rounded text-sm transition-colors w-full text-left ${page === 'Dashboard' ? 'bg-zinc-100 text-zinc-900 font-medium' : 'text-zinc-500 hover:bg-zinc-100 hover:text-zinc-900'}`}>
            Dashboard
          </button>
          <div className="text-xs font-semibold uppercase tracking-wider text-zinc-400 px-2 pt-3 pb-1">Library</div>
          {['Tokens', 'Atomics', 'Components', 'Patterns', 'Export'].map((label) => (
            <button key={label} onClick={() => setPage(label)}
              className={`flex items-center gap-2 px-2 py-1.5 rounded text-sm transition-colors w-full text-left ${page === label ? 'bg-zinc-100 text-zinc-900 font-medium' : 'text-zinc-500 hover:bg-zinc-100 hover:text-zinc-900'}`}>
              <span>{label}</span>
              {navCounts[label] > 0 && (
                <span className="ml-auto text-[10px] tabular-nums text-zinc-400">{navCounts[label]}</span>
              )}
            </button>
          ))}
        </aside>

        <main className="flex-1 overflow-y-auto">
          <div className="p-8">
            {lastImport && <AiDeepenBanner result={lastImport} onDeepened={handleDeepened} />}
            {lastImport && ['Atomics', 'Components', 'Patterns'].includes(page) && (
              <InterpretAllBar result={lastImport} onInterpretAll={() => handleRetryInterpret()} retryBusy={retryingNames.size > 0} />
            )}
            {renderPage()}
          </div>
        </main>
      </div>

      <ImportModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        onImported={handleImported}
        onOpenLibrary={() => { setModalOpen(false); setPage('Dashboard'); }}
      />
    </div>
  );
}
