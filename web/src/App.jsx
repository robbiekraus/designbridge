import React, { useState, useEffect, useRef } from 'react';
import ImportModal from './components/ImportModal/ImportModal.jsx';
import { loadLastImport, saveLastImport, clearLastImport } from './lib/libraryStore.js';
import Dashboard from './pages/Dashboard.jsx';
import Tokens from './pages/Tokens.jsx';
import LibraryLevel from './pages/LibraryLevel.jsx';
import Export from './pages/Export.jsx';
import StartScreen from './components/StartScreen.jsx';
import AiDeepenBanner from './components/library/AiDeepenBanner.jsx';
import InterpretAllBar from './components/library/InterpretAllBar.jsx';
import { componentsNeedingInterpretation, runInterpretation, retryInterpretation, applyRetryOutcome, carryInterpretations, applyIfSameImport, normalizeStalePending } from './lib/interpret.js';

// Nav-Label → kind-Filter für die generische LibraryLevel-Seite. Reihenfolge
// überall atom → molecule → organism → template (PINNED CONTRACT).
const LIBRARY_LEVELS = {
  Atoms: 'atom',
  Molecules: 'molecule',
  Organisms: 'organism',
  Templates: 'template',
};

export default function App() {
  const [page, setPage] = useState('Dashboard');
  const [serverOk, setServerOk] = useState(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [modalTab, setModalTab] = useState('image');
  const [lastImport, setLastImport] = useState(null);
  // Zwischengespeicherter letzter Import — NICHT automatisch geladen, sondern auf
  // dem Start-Screen zum Fortsetzen angeboten (kein Stale-Data beim Reload).
  const [cachedImport, setCachedImport] = useState(null);
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

    // Beim (Neu-)Laden NICHT automatisch die alten Daten anzeigen — stattdessen den
    // Start-Screen zeigen und den letzten Import (falls vorhanden) zum Fortsetzen
    // anbieten. Reload-Limbo-Fix: ein beim letzten Reload noch laufender Batch hat
    // keinen Request mehr, der ihn fortführt — persistiertes interpretPending:true
    // auf failed normalisieren, damit nach dem Fortsetzen der Retry-Knopf erscheint.
    const loaded = loadLastImport();
    const normalized = normalizeStalePending(loaded);
    if (normalized && normalized !== loaded) saveLastImport(normalized);
    setCachedImport(normalized);
  }, []);

  const handleImported = (result) => {
    const todo = componentsNeedingInterpretation(result);
    const initial = ['image', 'url'].includes(result.source) && todo.length > 0
      ? { ...result, interpretPending: true }
      : result;
    saveLastImport(initial);
    setLastImport(initial);
    setCachedImport(null); // neuer Import ersetzt den zwischengespeicherten
    if (initial.interpretPending) {
      startInterpretation(initial);
    }
  };

  // Start-Screen-Aktionen.
  const openImport = (tab = 'image') => {
    setModalTab(tab);
    setModalOpen(true);
  };
  const handleResume = () => {
    if (cachedImport) setLastImport(cachedImport);
    setCachedImport(null);
  };
  const handleDiscard = () => {
    clearLastImport();
    setCachedImport(null);
  };

  const handleDeepened = (result) => {
    // Fix Verfeinern-Schwund: adaptScanResponse liefert ein frisches Result —
    // ohne carryInterpretations gingen interpretations/interpretFailed/
    // interpretQuotaExhausted verloren (Pillen verschwinden).
    const merged = carryInterpretations(lastImport, result);
    saveLastImport(merged);
    setLastImport(merged);
  };

  // Ohne `name`: Batch-Retry aller fehlgeschlagenen Bausteine.
  // Mit `name`: Retry nur für diesen einen Baustein (per-row retry aus LibraryObjectList).
  const handleRetryInterpret = (name) => {
    if (name) {
      if (retryingNames.has(name)) return; // Doppelklick-Schutz: nur ein Request pro Name
      setRetryingNames((s) => new Set(s).add(name));
      // Fix Race paralleler Einzel-Retries: import_id beim Start merken und
      // das Outcome als DELTA auf den zum Antwortzeitpunkt AKTUELLEN State
      // mergen (applyRetryOutcome) — nicht auf die veraltete Render-Closure
      // `lastImport` ersetzen. Zwei parallele Retries verschiedener Namen
      // überschreiben sich so nicht mehr gegenseitig.
      const importId = lastImport?.raw?.meta?.import_id;
      retryInterpretation(lastImport, name)
        .then((outcome) => {
          setLastImport((cur) => {
            if (cur?.raw?.meta?.import_id !== importId) return cur; // neuer Import hat übernommen
            const applied = applyRetryOutcome(cur, name, outcome);
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
    if (!lastImport) return null; // Start-Screen wird direkt im Main gerendert
    const kind = LIBRARY_LEVELS[page];
    if (kind) {
      return (
        <LibraryLevel
          result={lastImport}
          kind={kind}
          title={page}
          onRetryInterpret={handleRetryInterpret}
          retryingNames={retryingNames}
        />
      );
    }
    switch (page) {
      case 'Tokens': return <Tokens result={lastImport} />;
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
    Atoms: invExtra.atoms ?? 0,
    Molecules: invExtra.molecules ?? 0,
    Organisms: invExtra.organisms ?? 0,
    Templates: invExtra.templates ?? 0,
  };

  return (
    <div className="h-screen overflow-hidden flex flex-col">
      <header className="h-12 border-b border-zinc-200 flex items-center px-5 gap-0 flex-shrink-0 relative">
        <a href="#" className="flex items-center gap-1.5 text-sm font-semibold mr-6">
          <img src="/uiprism-appicon.svg" className="h-[18px] w-[18px]" alt="UIPrism" />
          <span className="flex items-baseline gap-1.5">
            <span className="tracking-wide"><span className="text-ink">UI</span><span className="text-primary">Prism</span></span>
            <span className="text-[10px] font-medium text-zinc-400 tabular-nums">v0.1.1</span>
          </span>
        </a>
        {serverOk === false && (
          <span className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 text-xs font-medium text-red-600 bg-red-50 border border-red-100 rounded-full px-2.5 py-0.5">⚠ API key missing</span>
        )}
        <div className="flex-1" />
        <div className="flex items-center gap-2">
          {lastImport && (
            <button onClick={() => openImport()}
              className="text-xs px-2.5 py-1 rounded bg-primary text-white font-medium hover:bg-primary-hover transition-colors">
              Neuer Import
            </button>
          )}
          <button disabled title="Folgt in einer späteren Version"
            className="text-xs px-2.5 py-1 rounded border border-zinc-200 text-zinc-400 cursor-not-allowed">Verlauf</button>
          <button disabled title="Folgt in einer späteren Version"
            className="text-xs px-2.5 py-1 rounded border border-zinc-200 text-zinc-400 cursor-not-allowed">Einstellungen</button>
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden">
        {lastImport && (
        <aside className="w-48 border-r border-zinc-200 p-2 flex flex-col gap-0.5 flex-shrink-0">
          <button onClick={() => setPage('Dashboard')}
            className={`flex items-center gap-2 px-2 py-1.5 rounded text-sm transition-colors w-full text-left ${page === 'Dashboard' ? 'bg-primary-soft text-primary-ink font-medium' : 'text-zinc-500 hover:bg-zinc-100 hover:text-zinc-900'}`}>
            Dashboard
          </button>
          <div className="my-3 mx-1 border-t border-zinc-200" />
          {['Tokens', 'Atoms', 'Molecules', 'Organisms', 'Templates'].map((label) => (
            <button key={label} onClick={() => setPage(label)}
              className={`flex items-center gap-2 px-2 py-1.5 rounded text-sm transition-colors w-full text-left ${page === label ? 'bg-primary-soft text-primary-ink font-medium' : 'text-zinc-500 hover:bg-zinc-100 hover:text-zinc-900'}`}>
              <span>{label}</span>
              {navCounts[label] > 0 && (
                <span className="ml-auto text-[10px] tabular-nums text-zinc-400">{navCounts[label]}</span>
              )}
            </button>
          ))}
          <div className="my-3 mx-1 border-t border-zinc-200" />
          <button onClick={() => setPage('Export')}
            className={`flex items-center gap-2 px-2 py-1.5 rounded text-sm transition-colors w-full text-left ${page === 'Export' ? 'bg-primary-soft text-primary-ink font-medium' : 'text-zinc-500 hover:bg-zinc-100 hover:text-zinc-900'}`}>
            Export
          </button>
        </aside>
        )}

        <main className="flex-1 overflow-y-auto db-scroll">
          {lastImport ? (
            <div className="p-8">
              <AiDeepenBanner result={lastImport} onDeepened={handleDeepened} />
              {Boolean(LIBRARY_LEVELS[page]) && (
                <InterpretAllBar result={lastImport} onInterpretAll={() => handleRetryInterpret()} retryBusy={retryingNames.size > 0} />
              )}
              {renderPage()}
            </div>
          ) : (
            <StartScreen
              onNewImport={openImport}
              cachedImport={cachedImport}
              onResume={handleResume}
              onDiscard={handleDiscard}
            />
          )}
        </main>
      </div>

      <footer className="h-9 border-t border-zinc-200 flex items-center px-5 gap-2 flex-shrink-0 text-[11px] text-zinc-400">
        <span className="font-medium text-zinc-500">UIPrism</span>
        <span>v0.1.1</span>
        <span className="ml-auto">Map your UI, automatically.</span>
      </footer>

      <ImportModal
        open={modalOpen}
        initialTab={modalTab}
        onClose={() => setModalOpen(false)}
        onImported={handleImported}
        onOpenLibrary={() => { setModalOpen(false); setPage('Dashboard'); }}
      />
    </div>
  );
}
