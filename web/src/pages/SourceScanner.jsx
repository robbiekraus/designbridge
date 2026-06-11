import React, { useState, useRef, useCallback } from 'react';

// ── Extraction config ────────────────────────────────────────────────────────
const LEVELS = [
  {
    id: 'tokens', label: 'Tokens', desc: 'Primitive design values',
    color: 'bg-yellow-50', textColor: 'text-yellow-800',
    items: [
      { id: 'color', name: 'Color', hint: 'Background, text, border, brand' },
      { id: 'typography', name: 'Typography', hint: 'Font families, sizes, weights' },
      { id: 'spacing', name: 'Spacing', hint: 'Padding, margin, gap rhythm' },
      { id: 'radius', name: 'Border radius', hint: 'Corner radii across UI elements' },
      { id: 'shadow', name: 'Shadow & elevation', hint: 'Box shadows, depth levels' },
    ]
  },
  {
    id: 'atomics', label: 'Atomics', desc: 'Smallest UI elements',
    color: 'bg-blue-50', textColor: 'text-blue-800',
    items: [
      { id: 'button', name: 'Button', hint: 'All variants and sizes' },
      { id: 'input', name: 'Input / Textarea', hint: 'Text fields, search, selects' },
      { id: 'icon', name: 'Icon', hint: 'SVG icons and usage context' },
      { id: 'badge', name: 'Badge / Tag', hint: 'Status indicators, labels' },
      { id: 'checkbox', name: 'Checkbox / Toggle', hint: 'Form controls' },
      { id: 'avatar', name: 'Avatar', hint: 'User images, initials' },
    ]
  },
  {
    id: 'components', label: 'Components', desc: 'Composed UI blocks',
    color: 'bg-purple-50', textColor: 'text-purple-800',
    items: [
      { id: 'card', name: 'Card', hint: 'Content containers' },
      { id: 'modal', name: 'Modal / Dialog', hint: 'Overlays and sheets' },
      { id: 'dropdown', name: 'Dropdown / Menu', hint: 'Context menus, selects' },
      { id: 'table', name: 'Table', hint: 'Data grids and list views' },
      { id: 'alert', name: 'Alert / Toast', hint: 'Notifications and feedback' },
      { id: 'tabs', name: 'Tabs', hint: 'Navigation within a view' },
    ]
  },
  {
    id: 'patterns', label: 'Patterns', desc: 'Full page sections',
    color: 'bg-green-50', textColor: 'text-green-800',
    items: [
      { id: 'nav', name: 'Navigation', hint: 'Topbar, sidebar, mobile nav' },
      { id: 'form', name: 'Form layout', hint: 'Login, signup, settings' },
      { id: 'datatable', name: 'Data table', hint: 'Full table with filters, pagination' },
      { id: 'dashboard', name: 'Dashboard', hint: 'KPI cards, charts, overview' },
    ]
  }
];

const DEFAULT_STATE = () => {
  const s = {};
  LEVELS.forEach(l => {
    s[l.id] = {};
    l.items.forEach(i => {
      s[l.id][i.id] = l.id === 'tokens' ? true : ['button', 'input', 'icon'].includes(i.id);
    });
  });
  return s;
};

// ── Confidence badge ─────────────────────────────────────────────────────────
function Conf({ level }) {
  const cls = level === 'high' ? 'conf-high' : level === 'medium' ? 'conf-med' : 'conf-low';
  return <span className={cls}>{level}</span>;
}

// ── Main component ────────────────────────────────────────────────────────────
export default function SourceScanner() {
  const [tab, setTab] = useState('image');
  const [file, setFile] = useState(null);
  const [preview, setPreview] = useState(null);
  const [dragOver, setDragOver] = useState(false);
  const [checkState, setCheckState] = useState(DEFAULT_STATE());
  const [openGroups, setOpenGroups] = useState({ tokens: true, atomics: false, components: false, patterns: false });
  const [phase, setPhase] = useState('idle'); // idle | scanning | done | error
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const [steps, setSteps] = useState([]);
  const fileRef = useRef();

  const SCAN_STEPS = [
    'Reading image',
    'Sending to Claude Vision',
    'Extracting color palette',
    'Detecting typography scale',
    'Classifying UI components',
    'Building token map',
  ];

  // File handling
  const acceptFile = useCallback((f) => {
    if (!f) return;
    setFile(f);
    const reader = new FileReader();
    reader.onload = e => setPreview(e.target.result);
    reader.readAsDataURL(f);
  }, []);

  const handleDrop = useCallback((e) => {
    e.preventDefault(); setDragOver(false);
    acceptFile(e.dataTransfer.files[0]);
  }, [acceptFile]);

  const resetFile = () => { setFile(null); setPreview(null); };

  // Checkbox state
  const toggleItem = (levelId, itemId) => {
    setCheckState(s => ({ ...s, [levelId]: { ...s[levelId], [itemId]: !s[levelId][itemId] } }));
  };
  const toggleAll = (levelId) => {
    const items = LEVELS.find(l => l.id === levelId).items;
    const allOn = items.every(i => checkState[levelId][i.id]);
    setCheckState(s => ({ ...s, [levelId]: Object.fromEntries(items.map(i => [i.id, !allOn])) }));
  };

  const selectedTargets = () => {
    const out = {};
    LEVELS.forEach(l => {
      const selected = l.items.filter(i => checkState[l.id][i.id]).map(i => i.name);
      if (selected.length) out[l.id] = selected;
    });
    return out;
  };

  // Scan
  const startScan = async () => {
    if (!file) return;
    setPhase('scanning');
    setError(null);
    setResult(null);

    // Animate steps
    const stepState = SCAN_STEPS.map(() => 'waiting');
    setSteps([...stepState]);
    let i = 0;
    const tick = setInterval(() => {
      if (i < SCAN_STEPS.length - 1) {
        setSteps(s => s.map((v, idx) => idx < i ? 'done' : idx === i ? 'active' : 'waiting'));
        i++;
      }
    }, 800);

    try {
      const formData = new FormData();
      formData.append('image', file);
      formData.append('extract', JSON.stringify(selectedTargets()));

      const res = await fetch('/api/scan/image', { method: 'POST', body: formData });
      const data = await res.json();
      clearInterval(tick);

      if (!res.ok) throw new Error(data.error || 'Scan failed');

      setSteps(SCAN_STEPS.map(() => 'done'));
      setTimeout(() => { setResult(data); setPhase('done'); }, 400);
    } catch (err) {
      clearInterval(tick);
      setError(err.message);
      setPhase('error');
    }
  };

  const exportJSON = () => {
    if (!result) return;
    const blob = new Blob([JSON.stringify(result, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = 'designbridge-scan.json'; a.click();
    URL.revokeObjectURL(url);
  };

  const reset = () => { setPhase('idle'); setResult(null); setError(null); resetFile(); };

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="flex flex-col">
      <div className="border-b border-zinc-200 px-7 py-4">
        <div className="text-base font-semibold tracking-tight">Source Scanner</div>
        <div className="text-sm text-zinc-500 mt-0.5">Import a source and extract design system elements — tokens, atomics, components, and patterns.</div>
      </div>

      <div className="p-7 max-w-3xl">

        {/* ── Scanning phase ── */}
        {phase === 'scanning' && (
          <div className="flex flex-col gap-5">
            <div className="w-8 h-8 rounded-full border-2 border-zinc-200 border-t-zinc-900 spinner" />
            <div>
              <div className="text-base font-semibold">Analyzing screenshot with AI…</div>
              <div className="text-sm text-zinc-500 mt-0.5">Claude is reading your UI — this takes 10–20 seconds</div>
            </div>
            <div className="flex flex-col gap-2">
              {SCAN_STEPS.map((s, idx) => (
                <div key={s} className={`flex items-center gap-3 text-sm transition-colors ${steps[idx] === 'active' ? 'text-zinc-900' : steps[idx] === 'done' ? 'text-zinc-400' : 'text-zinc-300'}`}>
                  <div className={`w-1.5 h-1.5 rounded-full flex-shrink-0 transition-colors ${steps[idx] === 'active' ? 'bg-zinc-900' : steps[idx] === 'done' ? 'bg-green-500' : 'bg-zinc-200'}`} />
                  {s}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── Error phase ── */}
        {phase === 'error' && (
          <div className="flex flex-col gap-4">
            <div className="flex gap-3 p-4 rounded-lg border border-red-200 bg-red-50 text-red-800 text-sm">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="flex-shrink-0 mt-0.5"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
              <div><strong>Scan failed:</strong> {error}</div>
            </div>
            <button onClick={reset} className="btn-outline w-fit">Try again</button>
          </div>
        )}

        {/* ── Results phase ── */}
        {phase === 'done' && result && (
          <Results result={result} preview={preview} onReset={reset} onExport={exportJSON} />
        )}

        {/* ── Idle / form phase ── */}
        {(phase === 'idle' || phase === 'error') && phase !== 'error' && (
          <>
            {/* Tab bar */}
            <div className="flex border border-zinc-200 rounded-md bg-zinc-100 p-0.5 w-fit mb-7">
              {['image', 'url', 'repo'].map(t => (
                <button key={t} onClick={() => setTab(t)}
                  className={`flex items-center gap-1.5 text-sm font-medium px-3.5 py-1.5 rounded transition-all ${tab === t ? 'bg-white text-zinc-900 shadow-sm' : 'text-zinc-500 hover:text-zinc-900'}`}>
                  {t === 'image' ? 'Image' : t === 'url' ? 'URL' : 'Figma / Repo'}
                </button>
              ))}
            </div>

            {/* Image tab */}
            {tab === 'image' && (
              <div className="flex flex-col gap-5">
                <div>
                  <div className="text-sm font-medium mb-1">Upload screenshot</div>
                  <div className="text-sm text-zinc-500">Any app or website screenshot. Designbridge uses Claude Vision to extract design tokens from the rendered UI.</div>
                </div>

                {/* Drop zone */}
                {!file ? (
                  <div
                    onDragOver={e => { e.preventDefault(); setDragOver(true); }}
                    onDragLeave={() => setDragOver(false)}
                    onDrop={handleDrop}
                    onClick={() => fileRef.current?.click()}
                    className={`border-2 border-dashed rounded-xl p-11 flex flex-col items-center gap-3 text-center cursor-pointer transition-colors
                      ${dragOver ? 'border-zinc-900 bg-zinc-50' : 'border-zinc-200 bg-zinc-50 hover:border-zinc-400'}`}>
                    <input ref={fileRef} type="file" accept=".png,.jpg,.jpeg,.webp" className="hidden"
                      onChange={e => acceptFile(e.target.files[0])} />
                    <div className="w-10 h-10 bg-white border border-zinc-200 rounded-lg flex items-center justify-center shadow-sm">
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" x2="12" y1="3" y2="15"/></svg>
                    </div>
                    <div className="text-sm font-medium">Drop screenshot here or click to upload</div>
                    <div className="text-xs text-zinc-400">Works with any browser screenshot, Figma export, or Loom frame</div>
                    <div className="flex gap-1.5 mt-1">
                      {['PNG', 'JPG', 'WebP'].map(f => (
                        <span key={f} className="text-xs font-medium px-2 py-0.5 rounded-full border border-zinc-200 bg-white text-zinc-500">{f}</span>
                      ))}
                    </div>
                  </div>
                ) : (
                  <div className="flex items-center gap-4 p-4 border border-zinc-900 rounded-xl bg-zinc-50">
                    <div className="w-16 h-12 rounded overflow-hidden flex-shrink-0">
                      <img src={preview} alt="preview" className="w-full h-full object-cover" />
                    </div>
                    <div className="flex-1">
                      <div className="text-sm font-medium">{file.name}</div>
                      <div className="text-xs text-zinc-500">{(file.size / 1024).toFixed(0)} KB · ready</div>
                    </div>
                    <button onClick={resetFile} className="text-xs text-zinc-400 hover:text-zinc-700 px-2 py-1 rounded hover:bg-zinc-200 transition-colors">✕</button>
                  </div>
                )}

                {/* Extraction config */}
                <ExtractionConfig checkState={checkState} openGroups={openGroups}
                  onToggleItem={toggleItem} onToggleAll={toggleAll}
                  onToggleGroup={id => setOpenGroups(s => ({ ...s, [id]: !s[id] }))} />

                {/* CTA */}
                <div className="flex items-center gap-3">
                  <button className="btn-primary" disabled={!file} onClick={startScan}>
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M5 3a2 2 0 0 0-2 2"/><path d="M19 3a2 2 0 0 1 2 2"/><path d="M21 19a2 2 0 0 1-2 2"/><path d="M5 21a2 2 0 0 1-2-2"/><path d="M9 3h1"/><path d="M9 21h1"/><path d="M14 3h1"/><path d="M14 21h1"/><path d="M3 9v1"/><path d="M21 9v1"/><path d="M3 14v1"/><path d="M21 14v1"/></svg>
                    Start scan
                  </button>
                  <span className="text-xs text-zinc-400">{file ? 'Ready — click to start scan' : 'Upload an image to begin'}</span>
                </div>
              </div>
            )}

            {/* URL / Repo placeholders */}
            {(tab === 'url' || tab === 'repo') && (
              <div className="flex flex-col gap-4">
                <div className="p-4 rounded-lg border border-zinc-200 bg-zinc-50 text-sm text-zinc-500">
                  {tab === 'url' ? 'URL scanning' : 'Figma / Repo scanning'} is coming in the next sprint. Use the Image tab to scan any screenshot today.
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

// ── Extraction config component ───────────────────────────────────────────────
function ExtractionConfig({ checkState, openGroups, onToggleItem, onToggleAll, onToggleGroup }) {
  const total = LEVELS.reduce((acc, l) => acc + l.items.filter(i => checkState[l.id][i.id]).length, 0);

  return (
    <div className="border border-zinc-200 rounded-xl overflow-hidden">
      <div className="flex items-center gap-2 px-4 py-3 bg-zinc-50 border-b border-zinc-200 text-sm font-medium">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m12.83 2.18a2 2 0 0 0-1.66 0L2.6 6.08a1 1 0 0 0 0 1.83l8.58 3.91a2 2 0 0 0 1.66 0l8.58-3.9a1 1 0 0 0 0-1.83Z"/><path d="m22 17.65-9.17 4.16a2 2 0 0 1-1.66 0L2 17.65"/><path d="m22 12.65-9.17 4.16a2 2 0 0 1-1.66 0L2 12.65"/></svg>
        What to extract
        <span className="ml-auto text-xs font-normal text-zinc-400">{total} selected</span>
      </div>
      {LEVELS.map(level => {
        const items = level.items;
        const checked = items.filter(i => checkState[level.id][i.id]).length;
        const allOn = checked === items.length;
        const partial = checked > 0 && !allOn;
        const open = openGroups[level.id];

        return (
          <div key={level.id} className="border-b border-zinc-200 last:border-b-0">
            <div className="flex items-center gap-2 px-4 py-2.5 cursor-pointer hover:bg-zinc-50 transition-colors"
              onClick={() => onToggleGroup(level.id)}>
              <span className={`transition-transform ${open ? 'rotate-90' : ''} text-zinc-400`}>
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6"/></svg>
              </span>
              <span className={`w-5 h-5 rounded flex items-center justify-center text-xs ${level.color}`}>
                <span className={`text-xs font-bold ${level.textColor}`}>{level.label[0]}</span>
              </span>
              <span className="text-sm font-medium">{level.label}</span>
              <span className="text-xs text-zinc-400">— {level.desc}</span>
              <span className="ml-auto flex items-center gap-2" onClick={e => { e.stopPropagation(); onToggleAll(level.id); }}>
                <div className={`w-4 h-4 rounded border flex items-center justify-center transition-colors
                  ${allOn || partial ? 'bg-zinc-900 border-zinc-900' : 'border-zinc-300'}`}>
                  {allOn && <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>}
                  {partial && <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round"><line x1="5" y1="12" x2="19" y2="12"/></svg>}
                </div>
                <span className="text-xs text-zinc-400">{checked}/{items.length}</span>
              </span>
            </div>
            {open && (
              <div className="px-4 pb-3 pt-1 border-t border-zinc-100 bg-white">
                <div className="grid grid-cols-2 gap-1.5">
                  {items.map(item => {
                    const on = checkState[level.id][item.id];
                    return (
                      <div key={item.id} onClick={() => onToggleItem(level.id, item.id)}
                        className={`flex items-start gap-2 p-2 rounded-md border cursor-pointer transition-colors
                          ${on ? 'border-zinc-300 bg-zinc-50' : 'border-zinc-200 bg-white hover:bg-zinc-50'}`}>
                        <div className={`w-3.5 h-3.5 rounded border flex-shrink-0 mt-0.5 flex items-center justify-center
                          ${on ? 'bg-zinc-900 border-zinc-900' : 'border-zinc-300'}`}>
                          {on && <svg width="7" height="7" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>}
                        </div>
                        <div>
                          <div className="text-xs font-medium">{item.name}</div>
                          <div className="text-xs text-zinc-400 leading-tight">{item.hint}</div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ── Results component ─────────────────────────────────────────────────────────
function Results({ result, preview, onReset, onExport }) {
  const tokens = result.tokens || {};
  const colors = tokens.colors || [];
  const typo = tokens.typography || [];
  const spacing = tokens.spacing || [];
  const radii = tokens.border_radius || [];
  const shadows = tokens.shadows || [];
  const atomics = result.atomics || [];
  const components = result.components || [];
  const patterns = result.patterns || [];
  const warnings = result.warnings || [];

  const totalTokens = colors.length + typo.length + spacing.length + radii.length + shadows.length;

  return (
    <div className="flex flex-col gap-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <div className="text-base font-semibold flex items-center gap-2">
            Scan complete
            <span className="text-xs font-semibold px-1.5 py-0.5 rounded-full bg-purple-100 text-purple-700">✦ AI</span>
          </div>
          <div className="text-xs text-zinc-400 mt-0.5">
            {result.summary?.source_description} · {result.meta?.elapsed_ms ? `${(result.meta.elapsed_ms / 1000).toFixed(1)}s` : ''}
          </div>
        </div>
        <button onClick={onReset} className="btn-outline text-xs">New scan</button>
      </div>

      {/* Screenshot preview */}
      {preview && (
        <div className="border border-zinc-200 rounded-xl overflow-hidden">
          <div className="px-4 py-2 text-xs font-medium text-zinc-400 border-b border-zinc-100 bg-zinc-50">Scanned screenshot</div>
          <img src={preview} alt="Uploaded screenshot" className="w-full max-h-52 object-contain bg-zinc-50" />
        </div>
      )}

      {/* Summary cards */}
      <div className="grid grid-cols-4 gap-3">
        {[
          { label: 'Tokens', val: totalTokens, color: '#eab308', sub: 'Color · Type · Spacing · Radius · Shadow' },
          { label: 'Atomics', val: atomics.length, color: '#3b82f6', sub: atomics.map(a => a.name).join(', ') || '—' },
          { label: 'Components', val: components.length, color: '#8b5cf6', sub: components.map(c => c.name).join(', ') || '—' },
          { label: 'Patterns', val: patterns.length, color: '#22c55e', sub: patterns.map(p => p.name).join(', ') || '—' },
        ].map(card => (
          <div key={card.label} className="border border-zinc-200 rounded-xl p-4">
            <div className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-zinc-400 mb-2">
              <div className="w-1.5 h-1.5 rounded-full" style={{ background: card.color }} />
              {card.label}
            </div>
            <div className="text-3xl font-bold tracking-tight leading-none">{card.val}</div>
            <div className="text-xs text-zinc-400 mt-1.5 leading-snug line-clamp-2">{card.sub}</div>
          </div>
        ))}
      </div>

      {/* Color palette */}
      {colors.length > 0 && (
        <TokenGroup title="Color palette" count={`${colors.length} values`}>
          <div className="flex flex-wrap gap-4 p-4">
            {colors.map((c, i) => (
              <div key={i} className="flex flex-col items-center gap-1.5">
                <div className="w-9 h-9 rounded-full border border-black/8 shadow-sm" style={{ background: c.hex }} title={c.hex} />
                <div className="text-xs font-mono text-zinc-500 max-w-14 text-center truncate">{c.hex}</div>
                <div className="text-xs text-zinc-400 max-w-14 text-center truncate leading-tight" style={{ fontSize: 10 }}>{c.role}</div>
              </div>
            ))}
          </div>
        </TokenGroup>
      )}

      {/* Typography */}
      {typo.length > 0 && (
        <TokenGroup title="Typography scale" count={`${typo.length} styles`}>
          {typo.map((t, i) => (
            <div key={i} className="flex items-baseline gap-3 px-4 py-2.5 border-b border-zinc-100 last:border-0">
              <div className="flex-1 truncate" style={{ fontSize: `min(${t.size}, 22px)`, fontWeight: t.weight || 400 }}>
                {t.sample || t.role}
              </div>
              <div className="text-xs font-mono text-zinc-400 whitespace-nowrap">{t.size} / {t.weight || 400}</div>
              <div className="text-xs text-zinc-400 whitespace-nowrap">{t.role}</div>
              <Conf level={t.confidence} />
            </div>
          ))}
        </TokenGroup>
      )}

      {/* Spacing */}
      {spacing.length > 0 && (
        <TokenGroup title="Spacing scale" count={`${spacing.length} values`}>
          <div className="flex flex-wrap items-end gap-4 p-4">
            {spacing.map((s, i) => {
              const px = Math.min(Math.max(parseInt(s.value) || 8, 4), 80);
              return (
                <div key={i} className="flex flex-col items-center gap-1" title={s.usage}>
                  <div className="w-2 rounded-sm bg-zinc-900" style={{ height: px }} />
                  <div className="text-xs font-mono text-zinc-500">{s.value}</div>
                </div>
              );
            })}
          </div>
        </TokenGroup>
      )}

      {/* Border radius */}
      {radii.length > 0 && (
        <TokenGroup title="Border radius" count={`${radii.length} values`}>
          <div className="flex flex-wrap gap-4 p-4 items-end">
            {radii.map((r, i) => (
              <div key={i} className="flex flex-col items-center gap-1.5">
                <div className="w-10 h-10 border-2 border-zinc-900 bg-zinc-100" style={{ borderRadius: r.value }} title={r.usage} />
                <div className="text-xs font-mono text-zinc-500">{r.value}</div>
              </div>
            ))}
          </div>
        </TokenGroup>
      )}

      {/* UI Inventory */}
      {(atomics.length + components.length + patterns.length) > 0 && (
        <TokenGroup title="UI inventory" count={`${atomics.length + components.length + patterns.length} elements`}>
          <div className="flex flex-wrap gap-1.5 p-4">
            {atomics.map((a, i) => (
              <span key={i} className="inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full border border-zinc-200 bg-white">
                <span className="w-1.5 h-1.5 rounded-full bg-blue-500 flex-shrink-0" />
                {a.name}
                <Conf level={a.confidence} />
              </span>
            ))}
            {components.map((c, i) => (
              <span key={i} className="inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full border border-zinc-200 bg-white">
                <span className="w-1.5 h-1.5 rounded-full bg-purple-500 flex-shrink-0" />
                {c.name}
                <Conf level={c.confidence} />
              </span>
            ))}
            {patterns.map((p, i) => (
              <span key={i} className="inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full border border-zinc-200 bg-white">
                <span className="w-1.5 h-1.5 rounded-full bg-green-500 flex-shrink-0" />
                {p.name}
                <Conf level={p.confidence} />
              </span>
            ))}
          </div>
        </TokenGroup>
      )}

      {/* Warnings */}
      {warnings.length > 0 && (
        <div className="flex gap-3 p-4 rounded-xl border border-yellow-200 bg-yellow-50 text-yellow-800 text-sm">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="flex-shrink-0 mt-0.5"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4"/><path d="M12 8h.01"/></svg>
          <ul className="flex flex-col gap-1">
            {warnings.map((w, i) => <li key={i}>{w}</li>)}
          </ul>
        </div>
      )}

      {/* Actions */}
      <div className="flex items-center gap-2 pt-1">
        <button className="btn-primary" onClick={() => alert('Diff view coming soon')}>
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m9 11-6 6v3h9l3-3"/><path d="m22 12-4.6 4.6a2 2 0 0 1-2.8 0l-5.2-5.2a2 2 0 0 1 0-2.8L14 4"/></svg>
          Review in Diff view
        </button>
        <button className="btn-outline" onClick={onExport}>Export JSON</button>
        <button className="btn-outline" onClick={() => alert('Figma push coming soon')}>Push to Figma</button>
      </div>
    </div>
  );
}

function TokenGroup({ title, count, children }) {
  return (
    <div className="border border-zinc-200 rounded-xl overflow-hidden">
      <div className="flex items-center justify-between px-4 py-2.5 bg-zinc-50 border-b border-zinc-200">
        <span className="text-xs font-semibold uppercase tracking-wider text-zinc-500">{title}</span>
        <span className="text-xs text-zinc-400">{count}</span>
      </div>
      {children}
    </div>
  );
}
