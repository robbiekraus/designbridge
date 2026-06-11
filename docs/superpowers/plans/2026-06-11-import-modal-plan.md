# Initial Import Modal — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the Initial Import Modal as defined in `docs/superpowers/specs/2026-06-11-import-modal-design.md`. Replace the standalone `SourceScanner` page with a modal that auto-opens on first load, offers Image (functional) / URL / Repo (mocked) / Figma (disabled) tabs, and shows a rich success state with per-category counts and confidence.

**Architecture:** All work in `web/`. Pure additive React components under `web/src/components/ImportModal/`, a small client-side state machine in `web/src/lib/useImportSession.js`, mock fixtures in `web/src/lib/importMocks.js`, an adapter that normalises the `/api/scan/image` response into a `ScanResult`. Auto-open driven by `localStorage`. `SourceScanner.jsx` and its nav entry are deleted at the end so the modal becomes the only entry point.

**Tech Stack:** React 18 + Vite + Tailwind (existing). Vitest + @testing-library/react + jsdom added for unit tests.

**Scope check:** Spec covers one feature in one app surface. Single plan is appropriate.

**File map:**
```
web/
├── package.json                                 [modify — add vitest deps + scripts]
├── vitest.config.js                             [create]
├── src/
│   ├── App.jsx                                  [modify — auto-open, button, drop "Source Scanner"]
│   ├── pages/SourceScanner.jsx                  [delete in final task]
│   ├── lib/
│   │   ├── scanResultAdapter.js                 [create]
│   │   ├── scanResultAdapter.test.js            [create]
│   │   ├── importMocks.js                       [create]
│   │   ├── useImportSession.js                  [create]
│   │   └── useImportSession.test.js             [create]
│   └── components/ImportModal/
│       ├── ImportModalShell.jsx                 [create]
│       ├── ImportProgress.jsx                   [create]
│       ├── ImportSuccess.jsx                    [create]
│       ├── ImportSuccess.test.jsx               [create]
│       ├── ImportModal.jsx                      [create]
│       ├── ImportModal.test.jsx                 [create]
│       └── tabs/
│           ├── ImageTab.jsx                     [create]
│           ├── UrlTab.jsx                       [create]
│           ├── RepoTab.jsx                      [create]
│           └── FigmaTab.jsx                     [create]
└── tests/setup.js                               [create]
```

---

## Task 1 — Bootstrap test runner

**Files:**
- Modify: `web/package.json`
- Create: `web/vitest.config.js`
- Create: `web/tests/setup.js`

- [ ] **Step 1: Add dev dependencies and scripts**

In `web/`, run:
```bash
npm install --save-dev vitest @testing-library/react @testing-library/jest-dom @testing-library/user-event jsdom
```

Then edit `web/package.json` so the `scripts` block reads:
```json
"scripts": {
  "dev": "vite",
  "build": "vite build",
  "preview": "vite preview",
  "test": "vitest run",
  "test:watch": "vitest"
}
```

- [ ] **Step 2: Create `web/vitest.config.js`**

```js
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./tests/setup.js'],
    css: false,
  },
});
```

- [ ] **Step 3: Create `web/tests/setup.js`**

```js
import '@testing-library/jest-dom/vitest';
```

- [ ] **Step 4: Verify the runner boots**

Run: `cd web && npm test`
Expected: Vitest exits with "No test files found" (exit 0). If it errors on plugin or jsdom resolution, fix those before continuing.

- [ ] **Step 5: Commit**

```bash
git add web/package.json web/package-lock.json web/vitest.config.js web/tests/setup.js
git commit -m "chore(web): add vitest + testing-library setup"
```

---

## Task 2 — `scanResultAdapter` normalises `/api/scan/image` response

**Files:**
- Create: `web/src/lib/scanResultAdapter.js`
- Create: `web/src/lib/scanResultAdapter.test.js`

Background: the existing `/api/scan/image` returns a payload shaped like `{ tokens: { colors, typography, spacing, border_radius, shadows }, atomics, components, patterns, warnings, summary, meta }`. The modal needs a flat `categories` list with `count` and `confidence` per category. Confidence per category is the *worst* confidence among that category's items (so a single `low` token surfaces as `low`). Inventory has no single confidence and uses `extra` for the per-bucket counts.

- [ ] **Step 1: Write the failing test**

Create `web/src/lib/scanResultAdapter.test.js`:
```js
import { describe, it, expect } from 'vitest';
import { adaptImageScanResponse } from './scanResultAdapter.js';

const fixture = {
  tokens: {
    colors: [{ hex: '#fff', role: 'bg', confidence: 'high' }, { hex: '#000', role: 'text', confidence: 'high' }],
    typography: [{ size: '14px', weight: 500, role: 'body', confidence: 'med' }],
    spacing: [{ value: '8px', confidence: 'high' }],
    border_radius: [{ value: '6px', confidence: 'high' }],
    shadows: [],
  },
  atomics: [{ name: 'Button', confidence: 'high' }],
  components: [{ name: 'Card', confidence: 'med' }, { name: 'Modal', confidence: 'low' }],
  patterns: [],
  warnings: [],
};

describe('adaptImageScanResponse', () => {
  it('produces one row per category with counts and worst-case confidence', () => {
    const result = adaptImageScanResponse(fixture);
    expect(result.source).toBe('image');
    expect(result.mocked).toBe(false);
    const byKey = Object.fromEntries(result.categories.map(c => [c.key, c]));
    expect(byKey.colors).toMatchObject({ label: 'Colors', count: 2, confidence: 'high' });
    expect(byKey.typography).toMatchObject({ count: 1, confidence: 'med' });
    expect(byKey.spacing).toMatchObject({ count: 1, confidence: 'high' });
    expect(byKey.radius).toMatchObject({ count: 1, confidence: 'high' });
    expect(byKey.shadows).toMatchObject({ count: 0, confidence: null });
    expect(byKey.inventory).toMatchObject({
      count: 3,
      confidence: 'low',
      extra: { atomics: 1, components: 2, patterns: 0 },
    });
  });

  it('returns count 0 / confidence null when a category is missing', () => {
    const result = adaptImageScanResponse({ tokens: {}, atomics: [], components: [], patterns: [] });
    const colors = result.categories.find(c => c.key === 'colors');
    expect(colors.count).toBe(0);
    expect(colors.confidence).toBeNull();
  });
});
```

- [ ] **Step 2: Run the test and confirm it fails**

Run: `cd web && npm test -- scanResultAdapter`
Expected: FAIL with "Cannot find module './scanResultAdapter.js'".

- [ ] **Step 3: Implement `scanResultAdapter.js`**

Create `web/src/lib/scanResultAdapter.js`:
```js
const CONFIDENCE_RANK = { high: 3, med: 2, medium: 2, low: 1 };

function worstConfidence(items) {
  const ranked = items
    .map(i => i?.confidence)
    .filter(Boolean)
    .map(c => CONFIDENCE_RANK[c] ?? null)
    .filter(v => v !== null);
  if (ranked.length === 0) return null;
  const min = Math.min(...ranked);
  return min === 3 ? 'high' : min === 2 ? 'med' : 'low';
}

function categoryRow(key, label, items) {
  const arr = Array.isArray(items) ? items : [];
  return { key, label, count: arr.length, confidence: arr.length ? worstConfidence(arr) : null };
}

export function adaptImageScanResponse(raw) {
  const tokens = raw?.tokens ?? {};
  const atomics = raw?.atomics ?? [];
  const components = raw?.components ?? [];
  const patterns = raw?.patterns ?? [];
  const inventoryItems = [...atomics, ...components, ...patterns];

  return {
    source: 'image',
    mocked: false,
    categories: [
      categoryRow('colors', 'Colors', tokens.colors),
      categoryRow('typography', 'Typography', tokens.typography),
      categoryRow('spacing', 'Spacing', tokens.spacing),
      categoryRow('radius', 'Border radius', tokens.border_radius),
      categoryRow('shadows', 'Shadows', tokens.shadows),
      {
        key: 'inventory',
        label: 'UI inventory',
        count: inventoryItems.length,
        confidence: worstConfidence(inventoryItems),
        extra: {
          atomics: atomics.length,
          components: components.length,
          patterns: patterns.length,
        },
      },
    ],
    raw,
  };
}
```

- [ ] **Step 4: Run the test and confirm it passes**

Run: `cd web && npm test -- scanResultAdapter`
Expected: PASS, 2 tests green.

- [ ] **Step 5: Commit**

```bash
git add web/src/lib/scanResultAdapter.js web/src/lib/scanResultAdapter.test.js
git commit -m "feat(web): add scan result adapter for image source"
```

---

## Task 3 — Mock fixtures for URL / Repo / Figma

**Files:**
- Create: `web/src/lib/importMocks.js`

These return data already in the normalised `ScanResult` shape so the hook can resolve immediately into the success view.

- [ ] **Step 1: Create `web/src/lib/importMocks.js`**

```js
function makeMockResult(source) {
  return {
    source,
    mocked: true,
    categories: [
      { key: 'colors', label: 'Colors', count: 11, confidence: 'med' },
      { key: 'typography', label: 'Typography', count: 5, confidence: 'med' },
      { key: 'spacing', label: 'Spacing', count: 7, confidence: 'med' },
      { key: 'radius', label: 'Border radius', count: 3, confidence: 'med' },
      { key: 'shadows', label: 'Shadows', count: 2, confidence: 'low' },
      {
        key: 'inventory',
        label: 'UI inventory',
        count: 9,
        confidence: 'med',
        extra: { atomics: 4, components: 3, patterns: 2 },
      },
    ],
    raw: null,
  };
}

export function mockUrlImport(url) {
  return new Promise(resolve => setTimeout(() => resolve(makeMockResult('url')), 1500));
}

export function mockRepoImport({ url, branch }) {
  return new Promise(resolve => setTimeout(() => resolve(makeMockResult('repo')), 1500));
}
```

- [ ] **Step 2: Commit**

```bash
git add web/src/lib/importMocks.js
git commit -m "feat(web): add mock fixtures for url/repo imports"
```

---

## Task 4 — `useImportSession` state machine

**Files:**
- Create: `web/src/lib/useImportSession.js`
- Create: `web/src/lib/useImportSession.test.js`

States: `idle` → `submitting` → `success | error`. `reset()` returns to `idle` and clears `result`/`error`.

- [ ] **Step 1: Write the failing test**

Create `web/src/lib/useImportSession.test.js`:
```js
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { useImportSession } from './useImportSession.js';

beforeEach(() => {
  global.fetch = vi.fn();
});

describe('useImportSession', () => {
  it('starts in idle stage', () => {
    const { result } = renderHook(() => useImportSession());
    expect(result.current.stage).toBe('idle');
    expect(result.current.result).toBeNull();
    expect(result.current.error).toBeNull();
  });

  it('transitions to success on image submit', async () => {
    global.fetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        tokens: { colors: [{ hex: '#fff', confidence: 'high' }] },
        atomics: [], components: [], patterns: [],
      }),
    });

    const { result } = renderHook(() => useImportSession());
    await act(async () => {
      await result.current.submit({ source: 'image', payload: { file: new File(['x'], 'a.png') } });
    });

    expect(result.current.stage).toBe('success');
    expect(result.current.result.source).toBe('image');
    expect(result.current.result.categories.find(c => c.key === 'colors').count).toBe(1);
  });

  it('transitions to error on image submit failure', async () => {
    global.fetch.mockResolvedValue({ ok: false, json: async () => ({ error: 'boom' }) });

    const { result } = renderHook(() => useImportSession());
    await act(async () => {
      await result.current.submit({ source: 'image', payload: { file: new File(['x'], 'a.png') } });
    });

    expect(result.current.stage).toBe('error');
    expect(result.current.error).toBe('boom');
  });

  it('resolves mocked url import to success', async () => {
    vi.useFakeTimers();
    const { result } = renderHook(() => useImportSession());
    let pending;
    act(() => {
      pending = result.current.submit({ source: 'url', payload: { url: 'https://x' } });
    });
    expect(result.current.stage).toBe('submitting');
    await act(async () => {
      vi.advanceTimersByTime(1600);
      await pending;
    });
    expect(result.current.stage).toBe('success');
    expect(result.current.result.mocked).toBe(true);
    vi.useRealTimers();
  });

  it('reset returns to idle', async () => {
    global.fetch.mockResolvedValue({
      ok: true,
      json: async () => ({ tokens: {}, atomics: [], components: [], patterns: [] }),
    });
    const { result } = renderHook(() => useImportSession());
    await act(async () => {
      await result.current.submit({ source: 'image', payload: { file: new File(['x'], 'a.png') } });
    });
    act(() => result.current.reset());
    expect(result.current.stage).toBe('idle');
    expect(result.current.result).toBeNull();
  });
});
```

- [ ] **Step 2: Run the test and confirm it fails**

Run: `cd web && npm test -- useImportSession`
Expected: FAIL with "Cannot find module './useImportSession.js'".

- [ ] **Step 3: Implement the hook**

Create `web/src/lib/useImportSession.js`:
```js
import { useCallback, useState } from 'react';
import { adaptImageScanResponse } from './scanResultAdapter.js';
import { mockUrlImport, mockRepoImport } from './importMocks.js';

async function submitImage(file) {
  const formData = new FormData();
  formData.append('image', file);
  const res = await fetch('/api/scan/image', { method: 'POST', body: formData });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Scan failed');
  return adaptImageScanResponse(data);
}

export function useImportSession() {
  const [stage, setStage] = useState('idle');
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);

  const submit = useCallback(async ({ source, payload }) => {
    setStage('submitting');
    setError(null);
    setResult(null);
    try {
      let next;
      if (source === 'image') next = await submitImage(payload.file);
      else if (source === 'url') next = await mockUrlImport(payload.url);
      else if (source === 'repo') next = await mockRepoImport(payload);
      else throw new Error(`Unsupported source: ${source}`);
      setResult(next);
      setStage('success');
    } catch (e) {
      setError(e.message || String(e));
      setStage('error');
    }
  }, []);

  const reset = useCallback(() => {
    setStage('idle');
    setResult(null);
    setError(null);
  }, []);

  return { stage, result, error, submit, reset };
}
```

- [ ] **Step 4: Run the tests and confirm they pass**

Run: `cd web && npm test -- useImportSession`
Expected: PASS, 5 tests green.

- [ ] **Step 5: Commit**

```bash
git add web/src/lib/useImportSession.js web/src/lib/useImportSession.test.js
git commit -m "feat(web): add useImportSession hook with image + mocked sources"
```

---

## Task 5 — `ImportModalShell` (presentational layout)

**Files:**
- Create: `web/src/components/ImportModal/ImportModalShell.jsx`

Renders only the chrome. Tabs are rendered if `tabs` is provided. Title and footer are slots.

- [ ] **Step 1: Implement the shell**

Create `web/src/components/ImportModal/ImportModalShell.jsx`:
```jsx
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
```

- [ ] **Step 2: Commit**

```bash
git add web/src/components/ImportModal/ImportModalShell.jsx
git commit -m "feat(web): add ImportModalShell layout component"
```

---

## Task 6 — `ImportProgress` component

**Files:**
- Create: `web/src/components/ImportModal/ImportProgress.jsx`

- [ ] **Step 1: Implement**

Create `web/src/components/ImportModal/ImportProgress.jsx`:
```jsx
import React from 'react';

export default function ImportProgress({ source }) {
  const label = source === 'image' ? 'screenshot'
    : source === 'url' ? 'URL'
    : source === 'repo' ? 'repository'
    : 'source';

  return (
    <div className="flex flex-col items-center text-center py-8">
      <div className="w-8 h-8 rounded-full border-2 border-zinc-200 border-t-zinc-900 spinner mb-4" />
      <div className="text-sm font-semibold text-zinc-900">Extracting tokens…</div>
      <div className="text-xs text-zinc-500 mt-1">Analyzing {label}</div>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add web/src/components/ImportModal/ImportProgress.jsx
git commit -m "feat(web): add ImportProgress component"
```

---

## Task 7 — `ImportSuccess` component (counts + confidence per category)

**Files:**
- Create: `web/src/components/ImportModal/ImportSuccess.jsx`
- Create: `web/src/components/ImportModal/ImportSuccess.test.jsx`

- [ ] **Step 1: Write the failing test**

Create `web/src/components/ImportModal/ImportSuccess.test.jsx`:
```jsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import ImportSuccess from './ImportSuccess.jsx';

const sampleResult = {
  source: 'image',
  mocked: false,
  categories: [
    { key: 'colors', label: 'Colors', count: 14, confidence: 'high' },
    { key: 'typography', label: 'Typography', count: 6, confidence: 'high' },
    { key: 'spacing', label: 'Spacing', count: 8, confidence: 'med' },
    { key: 'radius', label: 'Border radius', count: 4, confidence: 'high' },
    { key: 'shadows', label: 'Shadows', count: 3, confidence: 'med' },
    {
      key: 'inventory', label: 'UI inventory', count: 12, confidence: 'med',
      extra: { atomics: 4, components: 5, patterns: 3 },
    },
  ],
  raw: null,
};

describe('ImportSuccess', () => {
  it('renders a row per category with count and confidence', () => {
    render(<ImportSuccess result={sampleResult} onNewImport={() => {}} />);
    expect(screen.getByText('Colors')).toBeInTheDocument();
    expect(screen.getByText('14')).toBeInTheDocument();
    expect(screen.getByText('Typography')).toBeInTheDocument();
    expect(screen.getByText('UI inventory')).toBeInTheDocument();
    expect(screen.getByText('12')).toBeInTheDocument();
    expect(screen.getByText(/4 atomics/)).toBeInTheDocument();
    expect(screen.getByText(/5 components/)).toBeInTheDocument();
    expect(screen.getByText(/3 patterns/)).toBeInTheDocument();
  });

  it('shows the mocked badge only when mocked is true', () => {
    const { rerender } = render(<ImportSuccess result={sampleResult} onNewImport={() => {}} />);
    expect(screen.queryByText(/PREVIEW/i)).toBeNull();
    rerender(<ImportSuccess result={{ ...sampleResult, mocked: true }} onNewImport={() => {}} />);
    expect(screen.getByText(/PREVIEW/i)).toBeInTheDocument();
  });

  it('fires onNewImport when the button is clicked', async () => {
    const fn = vi.fn();
    render(<ImportSuccess result={sampleResult} onNewImport={fn} />);
    await userEvent.click(screen.getByRole('button', { name: /new import/i }));
    expect(fn).toHaveBeenCalledTimes(1);
  });
});
```

- [ ] **Step 2: Run the test and confirm it fails**

Run: `cd web && npm test -- ImportSuccess`
Expected: FAIL with "Cannot find module './ImportSuccess.jsx'".

- [ ] **Step 3: Implement `ImportSuccess.jsx`**

Create `web/src/components/ImportModal/ImportSuccess.jsx`:
```jsx
import React from 'react';

function ConfidencePill({ value }) {
  if (!value) return null;
  const styles = {
    high: 'bg-green-100 text-green-800',
    med: 'bg-amber-100 text-amber-800',
    low: 'bg-red-100 text-red-800',
  };
  return (
    <span className={`text-[10px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded ${styles[value] ?? 'bg-zinc-100 text-zinc-700'}`}>
      {value}
    </span>
  );
}

function InventoryDetail({ extra }) {
  if (!extra) return null;
  return (
    <span className="text-[10px] text-zinc-500 ml-2">
      {extra.atomics} atomics · {extra.components} components · {extra.patterns} patterns
    </span>
  );
}

export default function ImportSuccess({ result, onNewImport }) {
  return (
    <div className="flex flex-col gap-4">
      <div className="text-center">
        <div className="w-10 h-10 rounded-full bg-green-100 text-green-700 flex items-center justify-center text-lg font-bold mx-auto mb-2">✓</div>
        <div className="text-sm font-semibold text-zinc-900">
          Import complete
          {result.mocked && (
            <span className="ml-2 text-[9px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded bg-amber-100 text-amber-800 align-middle">
              PREVIEW
            </span>
          )}
        </div>
        <div className="text-xs text-zinc-500 mt-0.5">Extracted from {result.source}</div>
      </div>

      <ul className="border border-zinc-200 rounded-lg overflow-hidden">
        {result.categories.map(cat => (
          <li key={cat.key} className="flex items-center justify-between px-3 py-2 border-b border-zinc-100 last:border-b-0 text-sm">
            <span className="text-zinc-900">{cat.label}</span>
            <span className="flex items-center gap-2">
              <span className="font-semibold tabular-nums">{cat.count}</span>
              {cat.key === 'inventory'
                ? <InventoryDetail extra={cat.extra} />
                : <ConfidencePill value={cat.confidence} />}
            </span>
          </li>
        ))}
      </ul>

      <div className="flex justify-end gap-2 pt-1">
        <button onClick={onNewImport}
          className="text-xs px-3 py-1.5 border border-zinc-200 rounded text-zinc-900 hover:bg-zinc-50 transition-colors">
          New import
        </button>
        <button disabled title="Coming soon"
          className="text-xs px-3 py-1.5 bg-zinc-900 text-white rounded opacity-60 cursor-not-allowed">
          Open library
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Run the tests and confirm they pass**

Run: `cd web && npm test -- ImportSuccess`
Expected: PASS, 3 tests green.

- [ ] **Step 5: Commit**

```bash
git add web/src/components/ImportModal/ImportSuccess.jsx web/src/components/ImportModal/ImportSuccess.test.jsx
git commit -m "feat(web): add ImportSuccess view with per-category counts"
```

---

## Task 8 — Tab components

**Files:**
- Create: `web/src/components/ImportModal/tabs/ImageTab.jsx`
- Create: `web/src/components/ImportModal/tabs/UrlTab.jsx`
- Create: `web/src/components/ImportModal/tabs/RepoTab.jsx`
- Create: `web/src/components/ImportModal/tabs/FigmaTab.jsx`

Each tab takes `{ onSubmit, disabled }` and renders its own form + a primary submit button. The button label is `Import`. Each calls `onSubmit({ source, payload })`.

- [ ] **Step 1: Implement `ImageTab.jsx`**

```jsx
import React, { useRef, useState } from 'react';

export default function ImageTab({ onSubmit, disabled }) {
  const [file, setFile] = useState(null);
  const [dragOver, setDragOver] = useState(false);
  const fileRef = useRef();

  const handleSubmit = () => {
    if (!file) return;
    onSubmit({ source: 'image', payload: { file } });
  };

  return (
    <div className="flex flex-col gap-4">
      {!file ? (
        <div
          onDragOver={e => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={e => { e.preventDefault(); setDragOver(false); setFile(e.dataTransfer.files[0]); }}
          onClick={() => fileRef.current?.click()}
          className={`border-2 border-dashed rounded-lg p-8 flex flex-col items-center gap-2 text-center cursor-pointer transition-colors
            ${dragOver ? 'border-zinc-900 bg-zinc-50' : 'border-zinc-200 bg-zinc-50 hover:border-zinc-400'}`}>
          <input ref={fileRef} type="file" accept=".png,.jpg,.jpeg,.webp" className="hidden"
            onChange={e => setFile(e.target.files[0] ?? null)} />
          <div className="text-sm font-medium text-zinc-900">Drop a screenshot here or click to browse</div>
          <div className="text-[10px] text-zinc-400">PNG, JPG, WebP up to 10 MB</div>
        </div>
      ) : (
        <div className="flex items-center gap-3 p-3 border border-zinc-200 rounded-lg bg-zinc-50">
          <div className="text-sm font-medium text-zinc-900 truncate flex-1">{file.name}</div>
          <button onClick={() => setFile(null)} className="text-xs text-zinc-500 hover:text-zinc-900">remove</button>
        </div>
      )}
      <div className="flex justify-end">
        <button onClick={handleSubmit} disabled={!file || disabled}
          className={`text-xs px-3 py-1.5 rounded text-white transition-colors
            ${!file || disabled ? 'bg-zinc-300 cursor-not-allowed' : 'bg-zinc-900 hover:bg-zinc-700'}`}>
          Import
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Implement `UrlTab.jsx`**

```jsx
import React, { useState } from 'react';

export default function UrlTab({ onSubmit, disabled }) {
  const [url, setUrl] = useState('');
  const valid = /^https?:\/\/\S+\.\S+/.test(url);

  return (
    <div className="flex flex-col gap-4">
      <label className="block">
        <span className="text-[10px] uppercase tracking-wider text-zinc-500 font-semibold">Website URL</span>
        <input type="url" value={url} onChange={e => setUrl(e.target.value)}
          placeholder="https://example.com"
          className="mt-1 w-full px-3 py-2 text-sm border border-zinc-200 rounded text-zinc-900 placeholder:text-zinc-400 focus:outline-none focus:border-zinc-900" />
      </label>
      <div className="text-[10px] text-zinc-500">
        URL scanning is mocked in this preview — submitting returns a sample token set after ~1.5 s.
      </div>
      <div className="flex justify-end">
        <button onClick={() => onSubmit({ source: 'url', payload: { url } })}
          disabled={!valid || disabled}
          className={`text-xs px-3 py-1.5 rounded text-white transition-colors
            ${!valid || disabled ? 'bg-zinc-300 cursor-not-allowed' : 'bg-zinc-900 hover:bg-zinc-700'}`}>
          Import
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Implement `RepoTab.jsx`**

```jsx
import React, { useState } from 'react';

export default function RepoTab({ onSubmit, disabled }) {
  const [url, setUrl] = useState('');
  const [branch, setBranch] = useState('main');
  const valid = /^https:\/\/github\.com\/[^/]+\/[^/]+/.test(url);

  return (
    <div className="flex flex-col gap-4">
      <label className="block">
        <span className="text-[10px] uppercase tracking-wider text-zinc-500 font-semibold">GitHub repository</span>
        <input type="url" value={url} onChange={e => setUrl(e.target.value)}
          placeholder="https://github.com/org/repo"
          className="mt-1 w-full px-3 py-2 text-sm border border-zinc-200 rounded text-zinc-900 placeholder:text-zinc-400 focus:outline-none focus:border-zinc-900" />
      </label>
      <label className="block">
        <span className="text-[10px] uppercase tracking-wider text-zinc-500 font-semibold">Branch</span>
        <input type="text" value={branch} onChange={e => setBranch(e.target.value)}
          className="mt-1 w-full px-3 py-2 text-sm border border-zinc-200 rounded text-zinc-900 focus:outline-none focus:border-zinc-900" />
      </label>
      <div className="text-[10px] text-zinc-500">
        Repository scanning is mocked in this preview — submitting returns a sample token set after ~1.5 s.
      </div>
      <div className="flex justify-end">
        <button onClick={() => onSubmit({ source: 'repo', payload: { url, branch } })}
          disabled={!valid || disabled}
          className={`text-xs px-3 py-1.5 rounded text-white transition-colors
            ${!valid || disabled ? 'bg-zinc-300 cursor-not-allowed' : 'bg-zinc-900 hover:bg-zinc-700'}`}>
          Import
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Implement `FigmaTab.jsx`**

```jsx
import React from 'react';

export default function FigmaTab() {
  return (
    <div className="flex flex-col items-center text-center py-8 gap-2">
      <div className="text-sm font-semibold text-zinc-900">Figma import via plugin flow</div>
      <div className="text-xs text-zinc-500 max-w-xs">
        Figma imports happen through the Designbridge Figma plugin. Connect it from the topbar “Connect Figma” button. This tab will activate once the plugin is installed.
      </div>
    </div>
  );
}
```

- [ ] **Step 5: Commit**

```bash
git add web/src/components/ImportModal/tabs/
git commit -m "feat(web): add Image/Url/Repo/Figma tab components"
```

---

## Task 9 — `ImportModal` container

**Files:**
- Create: `web/src/components/ImportModal/ImportModal.jsx`
- Create: `web/src/components/ImportModal/ImportModal.test.jsx`

Wires the shell, the tabs, the hook, the progress view, and the success view together.

- [ ] **Step 1: Write the failing test**

Create `web/src/components/ImportModal/ImportModal.test.jsx`:
```jsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import ImportModal from './ImportModal.jsx';

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('ImportModal', () => {
  it('does not render when closed', () => {
    render(<ImportModal open={false} onClose={() => {}} />);
    expect(screen.queryByText('Start a new import')).toBeNull();
  });

  it('renders all four tabs when open', () => {
    render(<ImportModal open={true} onClose={() => {}} />);
    expect(screen.getByText('Start a new import')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^Image/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^URL/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^Repo/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^Figma/ })).toBeInTheDocument();
  });

  it('disables the Figma tab', () => {
    render(<ImportModal open={true} onClose={() => {}} />);
    const figma = screen.getByRole('button', { name: /^Figma/ });
    expect(figma).toBeDisabled();
  });

  it('runs the URL mock import end to end', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    render(<ImportModal open={true} onClose={() => {}} />);
    await user.click(screen.getByRole('button', { name: /^URL/ }));
    await user.type(screen.getByPlaceholderText('https://example.com'), 'https://acme.com');
    await user.click(screen.getByRole('button', { name: /^Import$/ }));
    expect(screen.getByText(/Extracting tokens/i)).toBeInTheDocument();
    await vi.advanceTimersByTimeAsync(1700);
    expect(await screen.findByText(/Import complete/i)).toBeInTheDocument();
    expect(screen.getByText(/PREVIEW/i)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run the test and confirm it fails**

Run: `cd web && npm test -- ImportModal`
Expected: FAIL with "Cannot find module './ImportModal.jsx'".

- [ ] **Step 3: Implement `ImportModal.jsx`**

```jsx
import React, { useState, useEffect } from 'react';
import ImportModalShell from './ImportModalShell.jsx';
import ImportProgress from './ImportProgress.jsx';
import ImportSuccess from './ImportSuccess.jsx';
import ImageTab from './tabs/ImageTab.jsx';
import UrlTab from './tabs/UrlTab.jsx';
import RepoTab from './tabs/RepoTab.jsx';
import FigmaTab from './tabs/FigmaTab.jsx';
import { useImportSession } from '../../lib/useImportSession.js';

const TABS = [
  { id: 'image', label: 'Image' },
  { id: 'url', label: 'URL', badge: 'Preview' },
  { id: 'repo', label: 'Repo', badge: 'Preview' },
  { id: 'figma', label: 'Figma', disabled: true },
];

export default function ImportModal({ open, onClose }) {
  const [activeTab, setActiveTab] = useState('image');
  const { stage, result, error, submit, reset } = useImportSession();

  useEffect(() => {
    if (stage === 'success') {
      try { localStorage.setItem('designbridge.hasImported', '1'); } catch {}
    }
  }, [stage]);

  const handleClose = () => {
    reset();
    onClose?.();
  };

  let body;
  let title = 'Start a new import';
  let footer = null;

  if (stage === 'submitting') {
    body = <ImportProgress source={activeTab} />;
    title = 'Importing…';
  } else if (stage === 'success' && result) {
    body = <ImportSuccess result={result} onNewImport={reset} />;
    title = 'Import complete';
  } else if (stage === 'error') {
    body = (
      <div className="flex flex-col gap-3 p-3 rounded-lg border border-red-200 bg-red-50 text-sm text-red-800">
        <div><strong>Import failed:</strong> {error}</div>
        <button onClick={reset}
          className="text-xs px-3 py-1.5 border border-red-300 rounded text-red-800 hover:bg-red-100 w-fit">
          Try again
        </button>
      </div>
    );
    title = 'Something went wrong';
  } else if (activeTab === 'image') {
    body = <ImageTab onSubmit={submit} />;
  } else if (activeTab === 'url') {
    body = <UrlTab onSubmit={submit} />;
  } else if (activeTab === 'repo') {
    body = <RepoTab onSubmit={submit} />;
  } else {
    body = <FigmaTab />;
  }

  const showTabs = stage !== 'submitting' && stage !== 'success' && stage !== 'error';

  return (
    <ImportModalShell
      open={open}
      title={title}
      tabs={showTabs ? TABS : null}
      activeTab={activeTab}
      onTabChange={setActiveTab}
      onClose={handleClose}
      footer={footer}
    >
      {body}
    </ImportModalShell>
  );
}
```

- [ ] **Step 4: Run the tests and confirm they pass**

Run: `cd web && npm test -- ImportModal`
Expected: PASS, 4 tests green.

- [ ] **Step 5: Commit**

```bash
git add web/src/components/ImportModal/ImportModal.jsx web/src/components/ImportModal/ImportModal.test.jsx
git commit -m "feat(web): wire ImportModal container"
```

---

## Task 10 — Wire the modal into `App.jsx`, drop Source Scanner

**Files:**
- Modify: `web/src/App.jsx`
- Delete: `web/src/pages/SourceScanner.jsx`

- [ ] **Step 1: Update `App.jsx`**

Replace the full content of `web/src/App.jsx` with:

```jsx
import React, { useState, useEffect } from 'react';
import ImportModal from './components/ImportModal/ImportModal.jsx';

const NAV = ['Dashboard', 'Tokens', 'Atomics', 'Components', 'Patterns'];

export default function App() {
  const [page, setPage] = useState('Dashboard');
  const [serverOk, setServerOk] = useState(null);
  const [modalOpen, setModalOpen] = useState(false);

  useEffect(() => {
    fetch('/api/health')
      .then(r => r.json())
      .then(d => setServerOk(d.anthropic_key_configured))
      .catch(() => setServerOk(false));

    try {
      if (localStorage.getItem('designbridge.hasImported') !== '1') {
        setModalOpen(true);
      }
    } catch {}
  }, []);

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
          <button onClick={() => setModalOpen(true)}
            className="text-xs px-2.5 py-1 rounded bg-zinc-900 text-white font-medium hover:bg-zinc-700 transition-colors">
            New Import
          </button>
          <button className="btn-ghost text-xs">Settings</button>
          <button className="btn-outline text-xs">Connect Figma</button>
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden">
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

        <main className="flex-1 overflow-y-auto">
          <div className="p-8 text-zinc-400 text-sm">{page} — coming soon</div>
        </main>
      </div>

      <ImportModal open={modalOpen} onClose={() => setModalOpen(false)} />
    </div>
  );
}
```

- [ ] **Step 2: Delete the old page**

Run: `rm "web/src/pages/SourceScanner.jsx"` and (if the directory becomes empty) `rmdir "web/src/pages"`.

- [ ] **Step 3: Run the full test suite**

Run: `cd web && npm test`
Expected: All tests pass (adapter, hook, success, modal).

- [ ] **Step 4: Manual smoke test**

In one terminal: `npm run dev` from the repo root (starts both server and web per `package.json`). Open http://localhost:5173.

Verify in browser:
1. Modal opens automatically because `designbridge.hasImported` is unset.
2. Tab order: Image · URL (preview badge) · Repo (preview badge) · Figma (disabled).
3. Image upload → Import → Progress → Success view with one row per category and counts.
4. Close modal → click `New Import` in topbar → reopens with Image tab active.
5. URL tab: enter `https://acme.com` → Import → mocked progress → Success view shows the PREVIEW badge.
6. Reload: modal does NOT auto-open anymore (flag in localStorage).
7. To reset for testing, run `localStorage.removeItem('designbridge.hasImported')` in DevTools.

If anything visually breaks, fix inline before the commit. Do not start a new task.

- [ ] **Step 5: Commit**

```bash
git add web/src/App.jsx web/src/pages/SourceScanner.jsx
git commit -m "feat(web): replace Source Scanner page with Import modal"
```

---

## Self-review checklist (run before handoff)

- Every spec requirement maps to a task: auto-open (Task 10), New Import button (Task 10), four tabs (Task 9), image functional (Tasks 2/4/8), URL/Repo mocked with PREVIEW badge (Tasks 3/4/8/9), Figma disabled (Tasks 8/9), inline progress (Tasks 6/9), success with counts and confidence (Task 7), error retry (Task 9), removal of Source Scanner page + nav (Task 10), Tailwind zinc/white look throughout.
- No placeholders: every code step contains the full code.
- Type/name consistency: `ScanResult.categories[].{key,label,count,confidence,extra}` used identically in adapter, mocks, hook, and success view. `onSubmit({source, payload})` signature consistent across tabs and modal.
- Test-runner setup happens before any test step.
- Commits are small and per-task.
