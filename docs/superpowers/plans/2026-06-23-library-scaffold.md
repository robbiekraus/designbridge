# Library Scaffold (Phase 1) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the last import viewable in a Library — a Dashboard landing page, a fully visual Tokens page, and Atomics/Components/Patterns as text cards with a reserved preview area — persisted in localStorage.

**Architecture:** Lift the import result to `App` state and persist it under `localStorage["designbridge.lastImport"]`. `App` renders one page component per nav item, passing the result down. Small presentational components render the token/inventory pieces. The stored result is the existing `scanResultAdapter`/`importMocks` shape, kept source-neutral as the seed of the future canonical model.

**Tech Stack:** Vite + React (JSX), Tailwind, Vitest + React Testing Library (use **real timers** for async RTL — fake timers deadlock in this repo).

**Spec:** `docs/superpowers/specs/2026-06-23-library-scaffold-design.md`

**Data shape reference (image import):**
```js
{
  source: 'image', mocked: false,
  categories: [{ key, label, count, confidence, extra? }],
  raw: {
    summary: { source_description, app_type, color_mode, design_style },
    tokens: {
      colors: [{ hex, role, confidence }],
      typography: [{ size, weight, role, sample, confidence }],
      spacing: [{ value, usage, confidence }],
      border_radius: [{ value, usage, confidence }],
      shadows: [{ description, css, confidence }]
    },
    atomics: [{ name, variants, confidence, notes }],
    components: [{ name, confidence, notes }],
    patterns: [{ name, confidence }],
    warnings: [string],
    meta: { model }
  }
}
```
Mock import (url/repo): `mocked: true`, `raw: null`, only `categories` present.
Note: raw token `confidence` uses `high|medium|low`; category `confidence` uses `high|med|low`. The shared pill normalizes `medium → med`.

**Test command:** single file `cd web && npx vitest run <path>` · full suite `cd web && npm test`

---

### Task 1: libraryStore (persist last import)

**Files:**
- Create: `web/src/lib/libraryStore.js`
- Test: `web/src/lib/libraryStore.test.js`

- [ ] **Step 1: Write the failing test**

```js
// web/src/lib/libraryStore.test.js
import { describe, it, expect, beforeEach } from 'vitest';
import { saveLastImport, loadLastImport, clearLastImport } from './libraryStore.js';

describe('libraryStore', () => {
  beforeEach(() => localStorage.clear());

  it('returns null when nothing is stored', () => {
    expect(loadLastImport()).toBeNull();
  });

  it('round-trips a saved result', () => {
    const result = { source: 'image', mocked: false, categories: [], raw: { tokens: {} } };
    saveLastImport(result);
    expect(loadLastImport()).toEqual(result);
  });

  it('returns null for corrupt JSON', () => {
    localStorage.setItem('designbridge.lastImport', '{not valid json');
    expect(loadLastImport()).toBeNull();
  });

  it('clears the stored result', () => {
    saveLastImport({ source: 'url', mocked: true, categories: [], raw: null });
    clearLastImport();
    expect(loadLastImport()).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd web && npx vitest run src/lib/libraryStore.test.js`
Expected: FAIL — `libraryStore.js` does not exist / exports undefined.

- [ ] **Step 3: Write minimal implementation**

```js
// web/src/lib/libraryStore.js
const KEY = 'designbridge.lastImport';

export function saveLastImport(result) {
  try {
    localStorage.setItem(KEY, JSON.stringify(result));
  } catch {
    /* quota / unavailable — ignore, library is session-only this run */
  }
}

export function loadLastImport() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export function clearLastImport() {
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd web && npx vitest run src/lib/libraryStore.test.js`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add web/src/lib/libraryStore.js web/src/lib/libraryStore.test.js
git commit -m "feat(web): add libraryStore for persisting last import"
```

---

### Task 2: Shared ConfidencePill

Extract the inline pill from `ImportSuccess.jsx` into a shared component and normalize `medium → med`.

**Files:**
- Create: `web/src/components/library/ConfidencePill.jsx`
- Test: `web/src/components/library/ConfidencePill.test.jsx`
- Modify: `web/src/components/ImportModal/ImportSuccess.jsx` (import shared pill, delete local copy)

- [ ] **Step 1: Write the failing test**

```jsx
// web/src/components/library/ConfidencePill.test.jsx
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import ConfidencePill from './ConfidencePill.jsx';

describe('ConfidencePill', () => {
  it('renders nothing when value is missing', () => {
    const { container } = render(<ConfidencePill value={null} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('renders the confidence label', () => {
    render(<ConfidencePill value="high" />);
    expect(screen.getByText('high')).toBeInTheDocument();
  });

  it('normalizes "medium" to "med"', () => {
    render(<ConfidencePill value="medium" />);
    expect(screen.getByText('med')).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd web && npx vitest run src/components/library/ConfidencePill.test.jsx`
Expected: FAIL — file does not exist.

- [ ] **Step 3: Write minimal implementation**

```jsx
// web/src/components/library/ConfidencePill.jsx
import React from 'react';

const STYLES = {
  high: 'bg-green-100 text-green-800',
  med: 'bg-amber-100 text-amber-800',
  low: 'bg-red-100 text-red-800',
};

export default function ConfidencePill({ value }) {
  if (!value) return null;
  const v = value === 'medium' ? 'med' : value;
  return (
    <span className={`text-[10px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded ${STYLES[v] ?? 'bg-zinc-100 text-zinc-700'}`}>
      {v}
    </span>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd web && npx vitest run src/components/library/ConfidencePill.test.jsx`
Expected: PASS (3 tests).

- [ ] **Step 5: Use shared pill in ImportSuccess**

In `web/src/components/ImportModal/ImportSuccess.jsx`:
- Delete the local `function ConfidencePill({ value }) { ... }` (lines 3–15).
- Add at the top with the other imports: `import ConfidencePill from '../library/ConfidencePill.jsx';`

- [ ] **Step 6: Run the existing modal tests to verify nothing broke**

Run: `cd web && npx vitest run src/components/ImportModal/`
Expected: PASS (existing ImportModal + ImportSuccess tests still green).

- [ ] **Step 7: Commit**

```bash
git add web/src/components/library/ConfidencePill.jsx web/src/components/library/ConfidencePill.test.jsx web/src/components/ImportModal/ImportSuccess.jsx
git commit -m "refactor(web): extract shared ConfidencePill, normalize medium"
```

---

### Task 3: PreviewPlaceholder and EmptyState

**Files:**
- Create: `web/src/components/library/PreviewPlaceholder.jsx`
- Create: `web/src/components/library/EmptyState.jsx`
- Test: `web/src/components/library/EmptyState.test.jsx`

- [ ] **Step 1: Write the failing test**

```jsx
// web/src/components/library/EmptyState.test.jsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import EmptyState from './EmptyState.jsx';

describe('EmptyState', () => {
  it('shows the empty message', () => {
    render(<EmptyState onNewImport={() => {}} />);
    expect(screen.getByText(/noch nichts importiert/i)).toBeInTheDocument();
  });

  it('calls onNewImport when the button is clicked', async () => {
    const onNewImport = vi.fn();
    render(<EmptyState onNewImport={onNewImport} />);
    await userEvent.click(screen.getByRole('button', { name: /neuer import/i }));
    expect(onNewImport).toHaveBeenCalledOnce();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd web && npx vitest run src/components/library/EmptyState.test.jsx`
Expected: FAIL — file does not exist.

- [ ] **Step 3: Write minimal implementations**

```jsx
// web/src/components/library/EmptyState.jsx
import React from 'react';

export default function EmptyState({ onNewImport }) {
  return (
    <div className="flex flex-col items-center justify-center text-center gap-3 py-20 text-zinc-500">
      <div className="text-sm font-medium text-zinc-900">Noch nichts importiert</div>
      <p className="text-xs max-w-xs">Starte einen Import, um Tokens und UI-Inventar hier in der Library zu sehen.</p>
      <button onClick={onNewImport}
        className="text-xs px-3 py-1.5 bg-zinc-900 text-white rounded font-medium hover:bg-zinc-700 transition-colors">
        Neuer Import
      </button>
    </div>
  );
}
```

```jsx
// web/src/components/library/PreviewPlaceholder.jsx
import React from 'react';

// Reserved slot for the Phase-3 visual reconstruction. Renders an empty framed area.
export default function PreviewPlaceholder({ label = 'Vorschau folgt' }) {
  return (
    <div className="h-24 rounded border border-dashed border-zinc-300 bg-zinc-50 flex items-center justify-center text-[10px] uppercase tracking-wider text-zinc-400">
      {label}
    </div>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd web && npx vitest run src/components/library/EmptyState.test.jsx`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add web/src/components/library/PreviewPlaceholder.jsx web/src/components/library/EmptyState.jsx web/src/components/library/EmptyState.test.jsx
git commit -m "feat(web): add EmptyState and PreviewPlaceholder library components"
```

---

### Task 4: Token presentational pieces

One file with the five small token renderers. No standalone test (covered via the Tokens page test in Task 5).

**Files:**
- Create: `web/src/components/library/tokenViews.jsx`

- [ ] **Step 1: Write the implementation**

```jsx
// web/src/components/library/tokenViews.jsx
import React from 'react';
import ConfidencePill from './ConfidencePill.jsx';

export function ColorSwatch({ color }) {
  return (
    <div className="flex flex-col gap-1">
      <div className="h-12 rounded border border-zinc-200" style={{ background: color.hex }} />
      <div className="flex items-center justify-between">
        <span className="text-xs font-mono text-zinc-900">{color.hex}</span>
        <ConfidencePill value={color.confidence} />
      </div>
      <span className="text-[10px] text-zinc-500">{color.role}</span>
    </div>
  );
}

export function TypographyRow({ item }) {
  return (
    <li className="flex items-baseline justify-between gap-4 py-2 border-b border-zinc-100 last:border-b-0">
      <span
        className="text-zinc-900 truncate"
        style={{ fontSize: `${item.size}px`, fontWeight: Number(item.weight) || undefined }}>
        {item.sample || 'Ag'}
      </span>
      <span className="flex items-center gap-2 flex-shrink-0">
        <span className="text-[10px] text-zinc-500">{item.role} · {item.size}px · {item.weight}</span>
        <ConfidencePill value={item.confidence} />
      </span>
    </li>
  );
}

export function SpacingRow({ item }) {
  return (
    <li className="flex items-center gap-3 py-2 border-b border-zinc-100 last:border-b-0 text-sm">
      <span className="bg-zinc-800 h-3 rounded-sm" style={{ width: `${Math.min(Number(item.value) || 0, 96)}px` }} />
      <span className="font-mono text-zinc-900">{item.value}px</span>
      <span className="text-[10px] text-zinc-500 flex-1">{item.usage}</span>
      <ConfidencePill value={item.confidence} />
    </li>
  );
}

export function RadiusRow({ item }) {
  return (
    <li className="flex items-center gap-3 py-2 border-b border-zinc-100 last:border-b-0 text-sm">
      <span className="w-10 h-10 bg-zinc-100 border border-zinc-300" style={{ borderRadius: item.value?.toString().includes('%') ? item.value : `${parseInt(item.value, 10) || 0}px` }} />
      <span className="font-mono text-zinc-900">{item.value}</span>
      <span className="text-[10px] text-zinc-500 flex-1">{item.usage}</span>
      <ConfidencePill value={item.confidence} />
    </li>
  );
}

export function ShadowRow({ item }) {
  return (
    <li className="flex items-center gap-3 py-3 border-b border-zinc-100 last:border-b-0 text-sm">
      <span className="w-12 h-12 bg-white rounded" style={{ boxShadow: item.css }} />
      <span className="text-zinc-900 flex-1">{item.description}</span>
      <ConfidencePill value={item.confidence} />
    </li>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add web/src/components/library/tokenViews.jsx
git commit -m "feat(web): add token presentational views"
```

---

### Task 5: Tokens page

**Files:**
- Create: `web/src/pages/Tokens.jsx`
- Test: `web/src/pages/Tokens.test.jsx`

- [ ] **Step 1: Write the failing test**

```jsx
// web/src/pages/Tokens.test.jsx
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import Tokens from './Tokens.jsx';

const imageResult = {
  source: 'image', mocked: false, categories: [],
  raw: {
    tokens: {
      colors: [{ hex: '#2563eb', role: 'accent', confidence: 'high' }],
      typography: [{ size: '24', weight: '700', role: 'heading-xl', sample: 'Dashboard', confidence: 'high' }],
      spacing: [{ value: '16', usage: 'card padding', confidence: 'medium' }],
      border_radius: [{ value: '8', usage: 'cards', confidence: 'high' }],
      shadows: [{ description: 'card-shadow', css: '0 1px 3px rgba(0,0,0,.1)', confidence: 'medium' }],
    },
  },
};

const mockResult = { source: 'url', mocked: true, categories: [], raw: null };

describe('Tokens page', () => {
  it('renders real token values for an image import', () => {
    render(<Tokens result={imageResult} />);
    expect(screen.getByText('#2563eb')).toBeInTheDocument();
    expect(screen.getByText('Dashboard')).toBeInTheDocument();
    expect(screen.getByText('card-shadow')).toBeInTheDocument();
  });

  it('shows a preview notice for a mock import', () => {
    render(<Tokens result={mockResult} />);
    expect(screen.getByText(/preview-import/i)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd web && npx vitest run src/pages/Tokens.test.jsx`
Expected: FAIL — file does not exist.

- [ ] **Step 3: Write minimal implementation**

```jsx
// web/src/pages/Tokens.jsx
import React from 'react';
import { ColorSwatch, TypographyRow, SpacingRow, RadiusRow, ShadowRow } from '../components/library/tokenViews.jsx';

function Section({ title, children }) {
  return (
    <section className="mb-8">
      <h2 className="text-xs font-semibold uppercase tracking-wider text-zinc-400 mb-3">{title}</h2>
      {children}
    </section>
  );
}

export default function Tokens({ result }) {
  if (!result?.raw) {
    return <div className="text-sm text-zinc-500">Preview-Import — keine Detaildaten. Importiere ein Bild, um echte Tokens zu sehen.</div>;
  }
  const t = result.raw.tokens ?? {};
  const colors = t.colors ?? [];
  const typography = t.typography ?? [];
  const spacing = t.spacing ?? [];
  const radius = t.border_radius ?? [];
  const shadows = t.shadows ?? [];

  return (
    <div className="max-w-3xl">
      {colors.length > 0 && (
        <Section title="Colors">
          <div className="grid grid-cols-4 gap-3">
            {colors.map((c, i) => <ColorSwatch key={i} color={c} />)}
          </div>
        </Section>
      )}
      {typography.length > 0 && (
        <Section title="Typography">
          <ul>{typography.map((item, i) => <TypographyRow key={i} item={item} />)}</ul>
        </Section>
      )}
      {spacing.length > 0 && (
        <Section title="Spacing">
          <ul>{spacing.map((item, i) => <SpacingRow key={i} item={item} />)}</ul>
        </Section>
      )}
      {radius.length > 0 && (
        <Section title="Border radius">
          <ul>{radius.map((item, i) => <RadiusRow key={i} item={item} />)}</ul>
        </Section>
      )}
      {shadows.length > 0 && (
        <Section title="Shadows">
          <ul>{shadows.map((item, i) => <ShadowRow key={i} item={item} />)}</ul>
        </Section>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd web && npx vitest run src/pages/Tokens.test.jsx`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add web/src/pages/Tokens.jsx web/src/pages/Tokens.test.jsx
git commit -m "feat(web): add Tokens library page"
```

---

### Task 6: InventoryCard and the three inventory pages

**Files:**
- Create: `web/src/components/library/InventoryCard.jsx`
- Create: `web/src/pages/Atomics.jsx`
- Create: `web/src/pages/Components.jsx`
- Create: `web/src/pages/Patterns.jsx`
- Test: `web/src/pages/Atomics.test.jsx`

- [ ] **Step 1: Write the failing test**

```jsx
// web/src/pages/Atomics.test.jsx
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import Atomics from './Atomics.jsx';

const result = {
  source: 'image', mocked: false, categories: [],
  raw: { atomics: [{ name: 'Button', variants: ['primary', 'ghost'], confidence: 'high', notes: 'rounded' }] },
};

describe('Atomics page', () => {
  it('renders a card with name, variants and a reserved preview area', () => {
    render(<Atomics result={result} />);
    expect(screen.getByText('Button')).toBeInTheDocument();
    expect(screen.getByText('primary')).toBeInTheDocument();
    expect(screen.getByText('ghost')).toBeInTheDocument();
    expect(screen.getByText(/vorschau folgt/i)).toBeInTheDocument();
  });

  it('shows a preview notice for a mock import', () => {
    render(<Atomics result={{ source: 'url', mocked: true, categories: [], raw: null }} />);
    expect(screen.getByText(/preview-import/i)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd web && npx vitest run src/pages/Atomics.test.jsx`
Expected: FAIL — files do not exist.

- [ ] **Step 3: Write InventoryCard**

```jsx
// web/src/components/library/InventoryCard.jsx
import React from 'react';
import ConfidencePill from './ConfidencePill.jsx';
import PreviewPlaceholder from './PreviewPlaceholder.jsx';

export default function InventoryCard({ item }) {
  return (
    <div className="border border-zinc-200 rounded-lg p-3 flex flex-col gap-2">
      <PreviewPlaceholder />
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium text-zinc-900">{item.name}</span>
        <ConfidencePill value={item.confidence} />
      </div>
      {item.variants?.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {item.variants.map((v, i) => (
            <span key={i} className="text-[10px] px-1.5 py-0.5 rounded bg-zinc-100 text-zinc-700">{v}</span>
          ))}
        </div>
      )}
      {item.notes && <p className="text-[11px] text-zinc-500">{item.notes}</p>}
    </div>
  );
}
```

- [ ] **Step 4: Write the three pages**

```jsx
// web/src/pages/Atomics.jsx
import React from 'react';
import InventoryCard from '../components/library/InventoryCard.jsx';

export default function Atomics({ result }) {
  if (!result?.raw) {
    return <div className="text-sm text-zinc-500">Preview-Import — keine Detaildaten. Importiere ein Bild, um das UI-Inventar zu sehen.</div>;
  }
  const items = result.raw.atomics ?? [];
  return (
    <div className="max-w-3xl">
      <p className="text-xs text-zinc-400 mb-4">Visuelle Nachbauten folgen in einer späteren Phase.</p>
      <div className="grid grid-cols-3 gap-3">
        {items.map((item, i) => <InventoryCard key={i} item={item} />)}
      </div>
    </div>
  );
}
```

```jsx
// web/src/pages/Components.jsx
import React from 'react';
import InventoryCard from '../components/library/InventoryCard.jsx';

export default function Components({ result }) {
  if (!result?.raw) {
    return <div className="text-sm text-zinc-500">Preview-Import — keine Detaildaten. Importiere ein Bild, um das UI-Inventar zu sehen.</div>;
  }
  const items = result.raw.components ?? [];
  return (
    <div className="max-w-3xl">
      <p className="text-xs text-zinc-400 mb-4">Visuelle Nachbauten folgen in einer späteren Phase.</p>
      <div className="grid grid-cols-3 gap-3">
        {items.map((item, i) => <InventoryCard key={i} item={item} />)}
      </div>
    </div>
  );
}
```

```jsx
// web/src/pages/Patterns.jsx
import React from 'react';
import InventoryCard from '../components/library/InventoryCard.jsx';

export default function Patterns({ result }) {
  if (!result?.raw) {
    return <div className="text-sm text-zinc-500">Preview-Import — keine Detaildaten. Importiere ein Bild, um das UI-Inventar zu sehen.</div>;
  }
  const items = result.raw.patterns ?? [];
  return (
    <div className="max-w-3xl">
      <p className="text-xs text-zinc-400 mb-4">Visuelle Nachbauten folgen in einer späteren Phase.</p>
      <div className="grid grid-cols-3 gap-3">
        {items.map((item, i) => <InventoryCard key={i} item={item} />)}
      </div>
    </div>
  );
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd web && npx vitest run src/pages/Atomics.test.jsx`
Expected: PASS (2 tests).

- [ ] **Step 6: Commit**

```bash
git add web/src/components/library/InventoryCard.jsx web/src/pages/Atomics.jsx web/src/pages/Components.jsx web/src/pages/Patterns.jsx web/src/pages/Atomics.test.jsx
git commit -m "feat(web): add inventory cards and Atomics/Components/Patterns pages"
```

---

### Task 7: Dashboard page

**Files:**
- Create: `web/src/pages/Dashboard.jsx`
- Test: `web/src/pages/Dashboard.test.jsx`

- [ ] **Step 1: Write the failing test**

```jsx
// web/src/pages/Dashboard.test.jsx
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import Dashboard from './Dashboard.jsx';

const imageResult = {
  source: 'image', mocked: false,
  categories: [{ key: 'colors', label: 'Colors', count: 11, confidence: 'high' }],
  raw: {
    summary: { source_description: 'A SaaS dashboard', app_type: 'SaaS dashboard', color_mode: 'light', design_style: 'minimal' },
    warnings: ['Motion tokens cannot be inferred'],
  },
};

describe('Dashboard page', () => {
  it('shows the summary and category counts', () => {
    render(<Dashboard result={imageResult} />);
    expect(screen.getByText('A SaaS dashboard')).toBeInTheDocument();
    expect(screen.getByText('Colors')).toBeInTheDocument();
    expect(screen.getByText('11')).toBeInTheDocument();
    expect(screen.getByText(/motion tokens/i)).toBeInTheDocument();
  });

  it('shows a PREVIEW notice for a mock import', () => {
    render(<Dashboard result={{ source: 'url', mocked: true, categories: [{ key: 'colors', label: 'Colors', count: 11, confidence: 'med' }], raw: null }} />);
    expect(screen.getByText('PREVIEW')).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd web && npx vitest run src/pages/Dashboard.test.jsx`
Expected: FAIL — file does not exist.

- [ ] **Step 3: Write minimal implementation**

```jsx
// web/src/pages/Dashboard.jsx
import React from 'react';
import ConfidencePill from '../components/library/ConfidencePill.jsx';

function SummaryItem({ label, value }) {
  if (!value) return null;
  return (
    <div className="flex flex-col">
      <span className="text-[10px] uppercase tracking-wider text-zinc-400">{label}</span>
      <span className="text-sm text-zinc-900">{value}</span>
    </div>
  );
}

export default function Dashboard({ result }) {
  const summary = result?.raw?.summary;
  const warnings = result?.raw?.warnings ?? [];
  const categories = result?.categories ?? [];

  return (
    <div className="max-w-3xl flex flex-col gap-6">
      <div className="flex items-center gap-2">
        <h1 className="text-sm font-semibold text-zinc-900">Übersicht</h1>
        {result?.mocked && (
          <span className="text-[9px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded bg-amber-100 text-amber-800">PREVIEW</span>
        )}
        <span className="text-xs text-zinc-500 ml-auto">Quelle: {result?.source}</span>
      </div>

      {summary && (
        <div className="grid grid-cols-2 gap-3 border border-zinc-200 rounded-lg p-4">
          <SummaryItem label="Beschreibung" value={summary.source_description} />
          <SummaryItem label="App-Typ" value={summary.app_type} />
          <SummaryItem label="Modus" value={summary.color_mode} />
          <SummaryItem label="Stil" value={summary.design_style} />
        </div>
      )}

      <ul className="border border-zinc-200 rounded-lg overflow-hidden">
        {categories.map(cat => (
          <li key={cat.key} className="flex items-center justify-between px-3 py-2 border-b border-zinc-100 last:border-b-0 text-sm">
            <span className="text-zinc-900">{cat.label}</span>
            <span className="flex items-center gap-2">
              <span className="font-semibold tabular-nums">{cat.count}</span>
              <ConfidencePill value={cat.confidence} />
            </span>
          </li>
        ))}
      </ul>

      {warnings.length > 0 && (
        <div className="border border-amber-200 bg-amber-50 rounded-lg p-3">
          <div className="text-xs font-semibold text-amber-800 mb-1">Hinweise</div>
          <ul className="list-disc list-inside text-[11px] text-amber-800">
            {warnings.map((w, i) => <li key={i}>{w}</li>)}
          </ul>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd web && npx vitest run src/pages/Dashboard.test.jsx`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add web/src/pages/Dashboard.jsx web/src/pages/Dashboard.test.jsx
git commit -m "feat(web): add Dashboard library page"
```

---

### Task 8: Wire the modal to report imports and enable "Open library"

**Files:**
- Modify: `web/src/components/ImportModal/ImportSuccess.jsx`
- Modify: `web/src/components/ImportModal/ImportModal.jsx`
- Test: `web/src/components/ImportModal/ImportSuccess.test.jsx` (add a case)

- [ ] **Step 1: Add a failing test for the enabled button**

Append to `web/src/components/ImportModal/ImportSuccess.test.jsx` (inside the existing top-level `describe`, or add a new `describe`):

```jsx
import userEvent from '@testing-library/user-event';
import { vi } from 'vitest';

it('calls onOpenLibrary when "Open library" is clicked', async () => {
  const onOpenLibrary = vi.fn();
  const result = { source: 'image', mocked: false, categories: [], raw: {} };
  render(<ImportSuccess result={result} onNewImport={() => {}} onOpenLibrary={onOpenLibrary} />);
  await userEvent.click(screen.getByRole('button', { name: /open library/i }));
  expect(onOpenLibrary).toHaveBeenCalledOnce();
});
```

(If `render`/`screen` are not yet imported in that file, add `import { render, screen } from '@testing-library/react';`.)

- [ ] **Step 2: Run test to verify it fails**

Run: `cd web && npx vitest run src/components/ImportModal/ImportSuccess.test.jsx`
Expected: FAIL — the button is `disabled`, so the click does nothing / the handler is never called.

- [ ] **Step 3: Enable the button in ImportSuccess**

In `web/src/components/ImportModal/ImportSuccess.jsx`:
- Change the function signature to accept the new prop: `export default function ImportSuccess({ result, onNewImport, onOpenLibrary }) {`
- Replace the disabled "Open library" button with:

```jsx
        <button onClick={onOpenLibrary}
          className="text-xs px-3 py-1.5 bg-zinc-900 text-white rounded hover:bg-zinc-700 transition-colors">
          Open library
        </button>
```

- [ ] **Step 4: Pass the handlers through ImportModal**

In `web/src/components/ImportModal/ImportModal.jsx`:
- Change signature: `export default function ImportModal({ open, onClose, onImported, onOpenLibrary }) {`
- In the existing `useEffect` on `stage`, report the result. Replace the effect body with:

```jsx
  useEffect(() => {
    if (stage === 'success' && result) {
      try { localStorage.setItem('designbridge.hasImported', '1'); } catch {}
      onImported?.(result);
    }
  }, [stage, result, onImported]);
```

- In the success branch, pass the handler to ImportSuccess:

```jsx
    body = <ImportSuccess result={result} onNewImport={reset} onOpenLibrary={onOpenLibrary} />;
```

- [ ] **Step 5: Run the modal tests**

Run: `cd web && npx vitest run src/components/ImportModal/`
Expected: PASS (all existing tests plus the new one).

- [ ] **Step 6: Commit**

```bash
git add web/src/components/ImportModal/ImportSuccess.jsx web/src/components/ImportModal/ImportModal.jsx web/src/components/ImportModal/ImportSuccess.test.jsx
git commit -m "feat(web): enable Open library and report imports from modal"
```

---

### Task 9: Wire App.jsx (store, page router, sidebar nav)

**Files:**
- Modify: `web/src/App.jsx`

No new automated test (App has fetch + localStorage side effects); verified by smoke test in Task 10.

- [ ] **Step 1: Add imports and state**

In `web/src/App.jsx`, add to the imports:

```jsx
import { loadLastImport, saveLastImport } from './lib/libraryStore.js';
import Dashboard from './pages/Dashboard.jsx';
import Tokens from './pages/Tokens.jsx';
import Atomics from './pages/Atomics.jsx';
import Components from './pages/Components.jsx';
import Patterns from './pages/Patterns.jsx';
import EmptyState from './components/library/EmptyState.jsx';
```

Add state inside `App`, next to the other `useState` calls:

```jsx
  const [lastImport, setLastImport] = useState(null);
```

In the existing `useEffect` (the one that fetches `/api/health`), after the `try { ... }` localStorage block, add:

```jsx
    setLastImport(loadLastImport());
```

- [ ] **Step 2: Add an import handler**

Inside `App`, add:

```jsx
  const handleImported = (result) => {
    saveLastImport(result);
    setLastImport(result);
  };

  const renderPage = () => {
    if (!lastImport) return <EmptyState onNewImport={() => setModalOpen(true)} />;
    switch (page) {
      case 'Tokens': return <Tokens result={lastImport} />;
      case 'Atomics': return <Atomics result={lastImport} />;
      case 'Components': return <Components result={lastImport} />;
      case 'Patterns': return <Patterns result={lastImport} />;
      case 'Dashboard':
      default: return <Dashboard result={lastImport} />;
    }
  };
```

- [ ] **Step 3: Replace the main placeholder**

Replace:

```jsx
        <main className="flex-1 overflow-y-auto">
          <div className="p-8 text-zinc-400 text-sm">{page} — coming soon</div>
        </main>
```

with:

```jsx
        <main className="flex-1 overflow-y-auto">
          <div className="p-8">{renderPage()}</div>
        </main>
```

- [ ] **Step 4: Make the sidebar items navigate**

Replace the sidebar `.map(...)` button block (the one rendering Tokens/Atomics/Components/Patterns) so each button sets the page and highlights when active:

```jsx
          {['Tokens', 'Atomics', 'Components', 'Patterns'].map((label) => (
            <button key={label} onClick={() => setPage(label)}
              className={`flex items-center gap-2 px-2 py-1.5 rounded text-sm transition-colors w-full text-left ${page === label ? 'bg-zinc-100 text-zinc-900 font-medium' : 'text-zinc-500 hover:bg-zinc-100 hover:text-zinc-900'}`}>
              {label}
            </button>
          ))}
```

- [ ] **Step 5: Wire the modal props**

Replace:

```jsx
      <ImportModal open={modalOpen} onClose={() => setModalOpen(false)} />
```

with:

```jsx
      <ImportModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        onImported={handleImported}
        onOpenLibrary={() => { setModalOpen(false); setPage('Dashboard'); }}
      />
```

- [ ] **Step 6: Run the full suite (nothing should break)**

Run: `cd web && npm test`
Expected: PASS — all tests across all files green.

- [ ] **Step 7: Commit**

```bash
git add web/src/App.jsx
git commit -m "feat(web): wire Library pages, store and nav into App"
```

---

### Task 10: Full verification and smoke test

- [ ] **Step 1: Run the whole test suite**

Run: `cd web && npm test`
Expected: PASS — all files green (existing modal tests + new libraryStore, ConfidencePill, EmptyState, Tokens, Atomics, Dashboard).

- [ ] **Step 2: Start the app**

Run (from repo root): `npm run dev`
Open http://localhost:5173.

- [ ] **Step 3: Manual smoke checklist**

- Fresh load with no prior import → Library pages show the EmptyState ("Noch nichts importiert").
- Do a URL import (`https://acme.com`) → success → click **Open library** → lands on Dashboard, shows counts + PREVIEW; Tokens/Atomics pages show the "Preview-Import — keine Detaildaten" notice.
- Do an Image import (real screenshot) → **Open library** → Dashboard shows summary + counts; Tokens page shows real colors/typography/shadows; Atomics/Components/Patterns show text cards with the dashed "Vorschau folgt" preview area.
- Reload the page → the last import is still shown (persisted).
- Click the sidebar items (Tokens/Atomics/Components/Patterns) and the top nav → the main area switches and the active item highlights.

- [ ] **Step 4: Stop the dev server.**

- [ ] **Step 5: Finish the branch** via the superpowers:finishing-a-development-branch skill (tests green → merge `feat/library` into `main` or open a PR).

---

## Self-Review

**Spec coverage:** Persistence → Task 1. Dashboard → Task 7. Tokens visual → Tasks 4–5. Inventory text cards + reserved preview area → Tasks 3 (PreviewPlaceholder) + 6. Open library enabled → Task 8. Empty state → Tasks 3 + 9. Mock/preview notices → Tasks 5, 6, 7. App wiring + nav → Task 9. Style consistency → reuses existing classes + shared ConfidencePill. Tests per spec → Tasks 1, 2, 3, 5, 6, 7. All covered.

**Placeholder scan:** No TBD/TODO; every code step shows full code; every test step shows the assertions and the run command with expected result.

**Type/name consistency:** `loadLastImport`/`saveLastImport`/`clearLastImport` consistent across Tasks 1 & 9. Page prop is `result` everywhere (Tasks 5, 6, 7, 9). Modal props `onImported`/`onOpenLibrary` consistent across Tasks 8 & 9. `ConfidencePill` value-normalization consistent. `PreviewPlaceholder` default label "Vorschau folgt" matches the Atomics test assertion.
