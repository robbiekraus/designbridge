# Component Emitter v1 (Phase 3) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn recognized UI objects into reusable shadcn/Tailwind code shown beside a token-themed preview, exportable per object and as a whole-library `.zip`.

**Architecture:** A pure pipeline (`normalizeTokens` → `pickTokens` → per-type templates) produces emitted-component objects `{name, filename, code, variants, hasPreview, ...}`. A shared accordion (`LibraryObjectList`) renders each on the Atomics/Components/Patterns pages with a variant switcher, an inline-styled preview, the code, and per-object copy/download. The Export tab gains a `jszip`-built library bundle. Preview is real only for the four templates we own (Button/Card/Badge/Input); everything else gets a generic code stub + `PreviewPlaceholder`.

**Tech Stack:** React 18, Vite, Tailwind 3, Vitest + @testing-library/react, jszip (new).

All paths are relative to the repo root. The web app lives in `web/`. Run tests from `web/`.

---

## File structure

```
web/src/lib/emit/
  pickTokens.js              # NEW — normalized tokens → themed value picks (pure)
  pickTokens.test.js         # NEW
  emitComponents.js          # NEW — raw scan → emitted-component list + generic stub
  emitComponents.test.js     # NEW
  buildLibraryZip.js         # NEW — tokens + components → .zip Blob (jszip)
  buildLibraryZip.test.js    # NEW
  index.js                   # MODIFY — re-export emitComponents, buildLibraryZip
web/src/lib/components/templates/
  button.js card.js badge.js input.js   # NEW — one template each
  registry.js                # NEW — TEMPLATES + matchTemplate()
  registry.test.js           # NEW
  Previews.jsx               # NEW — key → preview React component
  Previews.test.jsx          # NEW
web/src/lib/
  download.js                # NEW — shared downloadFile + downloadBlob
web/src/components/library/
  LibraryObjectList.jsx      # NEW — shared accordion
  LibraryObjectList.test.jsx # NEW
web/src/pages/
  Atomics.jsx Components.jsx Patterns.jsx   # MODIFY — thin wrappers
  Export.jsx                 # MODIFY — + "Ganze Library exportieren"; import shared download
```

---

## Task 0: Add the jszip dependency

**Files:**
- Modify: `web/package.json`

- [ ] **Step 1: Install jszip**

Run: `cd web && npm install jszip@^3.10.1`
Expected: `jszip` appears under `dependencies` in `web/package.json`, install succeeds.

- [ ] **Step 2: Verify it imports**

Run: `cd web && node -e "import('jszip').then(m => console.log(typeof m.default))"`
Expected: prints `function`

- [ ] **Step 3: Commit**

```bash
git add web/package.json web/package-lock.json
git commit -m "build: add jszip for library bundle export"
```

---

## Task 1: `pickTokens` — themed value picks

Pure helper turning the `normalizeTokens` output into the handful of values templates need, with zinc/white fallbacks matching the app style.

**Files:**
- Create: `web/src/lib/emit/pickTokens.js`
- Test: `web/src/lib/emit/pickTokens.test.js`

- [ ] **Step 1: Write the failing test**

```js
import { describe, it, expect } from 'vitest';
import { pickTokens } from './pickTokens.js';
import { normalizeTokens } from './normalizeTokens.js';

describe('pickTokens', () => {
  it('falls back to zinc defaults when there are no tokens', () => {
    const p = pickTokens([]);
    expect(p.primary).toBe('#18181b');
    expect(p.onPrimary).toBe('#ffffff');
    expect(p.border).toBe('#e4e4e7');
    expect(p.radius).toBe('6px');
    expect(p.fontSize).toBe('14px');
    expect(p.fontWeight).toBe('500');
  });

  it('pulls primary color, border, radius and font from real tokens', () => {
    const tokens = normalizeTokens({
      colors: [
        { hex: '#022d2c', role: 'primary button', confidence: 'high' },
        { hex: '#dddddd', role: 'border', confidence: 'med' },
      ],
      typography: [{ size: 16, weight: 600, role: 'body', confidence: 'high' }],
      spacing: [],
      border_radius: [{ value: 8, usage: 'cards', confidence: 'high' }],
      shadows: [],
    });
    const p = pickTokens(tokens);
    expect(p.primary).toBe('#022d2c');
    expect(p.border).toBe('#dddddd');
    expect(p.radius).toBe('8px');
    expect(p.fontSize).toBe('16px');
    expect(p.fontWeight).toBe('600');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd web && npx vitest run src/lib/emit/pickTokens.test.js`
Expected: FAIL — "Failed to resolve import './pickTokens.js'"

- [ ] **Step 3: Write minimal implementation**

```js
export function pickTokens(tokens = []) {
  const colors = tokens.filter((t) => t.group === 'color');
  const byRole = (re) =>
    colors.find((c) => re.test(String(c.source?.role ?? '')))?.value;
  const radius = tokens.find((t) => t.group === 'radius')?.value;
  const font = tokens.find((t) => t.group === 'font')?.value;
  return {
    primary: byRole(/primary|brand|accent/i) ?? colors[0]?.value ?? '#18181b',
    onPrimary: '#ffffff',
    text: byRole(/text|foreground|body/i) ?? '#18181b',
    surface: byRole(/background|surface|card/i) ?? '#ffffff',
    surfaceMuted: '#f4f4f5',
    border: byRole(/border|outline|divider/i) ?? '#e4e4e7',
    radius: radius ?? '6px',
    fontSize: font?.fontSize ?? '14px',
    fontWeight: font?.fontWeight ?? '500',
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd web && npx vitest run src/lib/emit/pickTokens.test.js`
Expected: PASS (2 tests)

- [ ] **Step 5: Commit**

```bash
git add web/src/lib/emit/pickTokens.js web/src/lib/emit/pickTokens.test.js
git commit -m "feat: pickTokens — themed value picks for component templates"
```

---

## Task 2: Button template + registry

Each template is `{ key, label, variants, match(name), emit(picks, item), styleFor(variant, picks) }`. `emit` returns shadcn/Tailwind `.jsx` source with token values woven into arbitrary-value classes; `styleFor` returns an inline style object so the preview renders identically without relying on Tailwind JIT.

**Files:**
- Create: `web/src/lib/components/templates/button.js`
- Create: `web/src/lib/components/templates/registry.js`
- Test: `web/src/lib/components/templates/registry.test.js`

- [ ] **Step 1: Write the failing test**

```js
import { describe, it, expect } from 'vitest';
import { matchTemplate, TEMPLATES } from './registry.js';

describe('template registry', () => {
  it('matches button-ish names to the button template', () => {
    expect(matchTemplate('Button')?.key).toBe('button');
    expect(matchTemplate('primary btn')?.key).toBe('button');
    expect(matchTemplate('CTA')?.key).toBe('button');
  });

  it('returns null for unknown names', () => {
    expect(matchTemplate('Hero section')).toBeNull();
    expect(matchTemplate('')).toBeNull();
  });

  it('button template emits token-themed jsx and flags low confidence', () => {
    const btn = TEMPLATES.find((t) => t.key === 'button');
    const picks = { primary: '#022d2c', onPrimary: '#fff', text: '#18181b',
      surfaceMuted: '#f4f4f5', border: '#e4e4e7', radius: '8px',
      fontSize: '16px', fontWeight: '600' };
    const code = btn.emit(picks, { confidence: 'low' });
    expect(code).toContain('bg-[#022d2c]');
    expect(code).toContain('rounded-[8px]');
    expect(code).toContain('export function Button');
    expect(code).toContain('unsicher erkannt');
  });

  it('button styleFor returns an inline style per variant', () => {
    const btn = TEMPLATES.find((t) => t.key === 'button');
    const picks = { primary: '#022d2c', onPrimary: '#fff', text: '#18181b',
      surfaceMuted: '#f4f4f5', border: '#e4e4e7', radius: '8px',
      fontSize: '16px', fontWeight: '600' };
    expect(btn.styleFor('primary', picks).background).toBe('#022d2c');
    expect(btn.styleFor('secondary', picks).borderColor).toBe('#e4e4e7');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd web && npx vitest run src/lib/components/templates/registry.test.js`
Expected: FAIL — "Failed to resolve import './registry.js'"

- [ ] **Step 3: Write the button template**

Create `web/src/lib/components/templates/button.js`:

```js
const LOW = '// unsicher erkannt — bitte prüfen\n';

export const buttonTemplate = {
  key: 'button',
  label: 'Button',
  variants: ['primary', 'secondary', 'ghost'],
  match: (n) => /butt|btn|cta/.test(n),
  emit(p, item) {
    const flag = item?.confidence === 'low' ? LOW : '';
    return (
      flag +
      [
        '// Auto-generated by DesignBridge',
        'export function Button({ variant = "primary", className = "", ...props }) {',
        '  const base =',
        `    "inline-flex items-center justify-center px-4 py-2 rounded-[${p.radius}] text-[${p.fontSize}] font-[${p.fontWeight}] transition-colors";`,
        '  const variants = {',
        `    primary: "bg-[${p.primary}] text-[${p.onPrimary}] hover:opacity-90",`,
        `    secondary: "border border-[${p.border}] text-[${p.text}] hover:bg-[${p.surfaceMuted}]",`,
        `    ghost: "text-[${p.text}] hover:bg-[${p.surfaceMuted}]",`,
        '  };',
        '  return <button className={[base, variants[variant], className].join(" ")} {...props} />;',
        '}',
        '',
      ].join('\n')
    );
  },
  styleFor(variant, p) {
    const base = {
      display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
      padding: '8px 16px', borderRadius: p.radius, fontSize: p.fontSize,
      fontWeight: Number(p.fontWeight) || 500, border: '1px solid transparent',
      cursor: 'pointer',
    };
    if (variant === 'secondary')
      return { ...base, background: 'transparent', color: p.text, borderColor: p.border };
    if (variant === 'ghost')
      return { ...base, background: 'transparent', color: p.text };
    return { ...base, background: p.primary, color: p.onPrimary };
  },
};
```

- [ ] **Step 4: Write the registry (button only for now)**

Create `web/src/lib/components/templates/registry.js`:

```js
import { buttonTemplate } from './button.js';

export const TEMPLATES = [buttonTemplate];

export function matchTemplate(name) {
  const n = String(name ?? '').toLowerCase();
  if (!n) return null;
  return TEMPLATES.find((t) => t.match(n)) ?? null;
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd web && npx vitest run src/lib/components/templates/registry.test.js`
Expected: PASS (4 tests)

- [ ] **Step 6: Commit**

```bash
git add web/src/lib/components/templates/button.js web/src/lib/components/templates/registry.js web/src/lib/components/templates/registry.test.js
git commit -m "feat: button template + template registry with fuzzy matching"
```

---

## Task 3: Card, Badge, Input templates

**Files:**
- Create: `web/src/lib/components/templates/card.js`
- Create: `web/src/lib/components/templates/badge.js`
- Create: `web/src/lib/components/templates/input.js`
- Modify: `web/src/lib/components/templates/registry.js`
- Test: `web/src/lib/components/templates/registry.test.js` (extend)

- [ ] **Step 1: Add failing tests for the three templates**

Append to `web/src/lib/components/templates/registry.test.js` inside the `describe` block:

```js
  it('matches card / badge / input names', () => {
    expect(matchTemplate('Card')?.key).toBe('card');
    expect(matchTemplate('tag pill')?.key).toBe('badge');
    expect(matchTemplate('text field')?.key).toBe('input');
  });

  it('each new template emits its own component name', () => {
    const picks = { primary: '#022d2c', onPrimary: '#fff', text: '#18181b',
      surface: '#fff', surfaceMuted: '#f4f4f5', border: '#e4e4e7', radius: '8px',
      fontSize: '16px', fontWeight: '600' };
    expect(TEMPLATES.find((t) => t.key === 'card').emit(picks, {})).toContain('export function Card');
    expect(TEMPLATES.find((t) => t.key === 'badge').emit(picks, {})).toContain('export function Badge');
    expect(TEMPLATES.find((t) => t.key === 'input').emit(picks, {})).toContain('export function Input');
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd web && npx vitest run src/lib/components/templates/registry.test.js`
Expected: FAIL — "Cannot read properties of undefined (reading 'emit')" (card not registered yet)

- [ ] **Step 3: Create the card template**

Create `web/src/lib/components/templates/card.js`:

```js
const LOW = '// unsicher erkannt — bitte prüfen\n';

export const cardTemplate = {
  key: 'card',
  label: 'Card',
  variants: ['default'],
  match: (n) => /card|tile|panel/.test(n),
  emit(p, item) {
    const flag = item?.confidence === 'low' ? LOW : '';
    return (
      flag +
      [
        '// Auto-generated by DesignBridge',
        'export function Card({ className = "", ...props }) {',
        '  return (',
        `    <div className={["bg-[${p.surface}] border border-[${p.border}] rounded-[${p.radius}] p-4", className].join(" ")} {...props} />`,
        '  );',
        '}',
        '',
      ].join('\n')
    );
  },
  styleFor(_variant, p) {
    return {
      background: p.surface, border: `1px solid ${p.border}`,
      borderRadius: p.radius, padding: '16px', color: p.text,
      fontSize: p.fontSize, minWidth: '160px',
    };
  },
};
```

- [ ] **Step 4: Create the badge template**

Create `web/src/lib/components/templates/badge.js`:

```js
const LOW = '// unsicher erkannt — bitte prüfen\n';

export const badgeTemplate = {
  key: 'badge',
  label: 'Badge',
  variants: ['default', 'secondary'],
  match: (n) => /badge|tag|chip|pill|label/.test(n),
  emit(p, item) {
    const flag = item?.confidence === 'low' ? LOW : '';
    return (
      flag +
      [
        '// Auto-generated by DesignBridge',
        'export function Badge({ variant = "default", className = "", ...props }) {',
        '  const base = "inline-flex items-center px-2 py-0.5 rounded-full text-[12px] font-[500]";',
        '  const variants = {',
        `    default: "bg-[${p.primary}] text-[${p.onPrimary}]",`,
        `    secondary: "bg-[${p.surfaceMuted}] text-[${p.text}]",`,
        '  };',
        '  return <span className={[base, variants[variant], className].join(" ")} {...props} />;',
        '}',
        '',
      ].join('\n')
    );
  },
  styleFor(variant, p) {
    const base = {
      display: 'inline-flex', alignItems: 'center', padding: '2px 8px',
      borderRadius: '9999px', fontSize: '12px', fontWeight: 500,
    };
    if (variant === 'secondary')
      return { ...base, background: p.surfaceMuted, color: p.text };
    return { ...base, background: p.primary, color: p.onPrimary };
  },
};
```

- [ ] **Step 5: Create the input template**

Create `web/src/lib/components/templates/input.js`:

```js
const LOW = '// unsicher erkannt — bitte prüfen\n';

export const inputTemplate = {
  key: 'input',
  label: 'Input',
  variants: ['default', 'disabled'],
  match: (n) => /input|field|textbox|text box|form field/.test(n),
  emit(p, item) {
    const flag = item?.confidence === 'low' ? LOW : '';
    return (
      flag +
      [
        '// Auto-generated by DesignBridge',
        'export function Input({ className = "", ...props }) {',
        '  return (',
        `    <input className={["w-full px-3 py-2 bg-[${p.surface}] border border-[${p.border}] rounded-[${p.radius}] text-[${p.fontSize}] disabled:opacity-50", className].join(" ")} {...props} />`,
        '  );',
        '}',
        '',
      ].join('\n')
    );
  },
  styleFor(variant, p) {
    return {
      width: '100%', padding: '8px 12px', background: p.surface,
      border: `1px solid ${p.border}`, borderRadius: p.radius,
      fontSize: p.fontSize, color: p.text,
      opacity: variant === 'disabled' ? 0.5 : 1,
    };
  },
};
```

- [ ] **Step 6: Register all four templates**

Replace the contents of `web/src/lib/components/templates/registry.js`:

```js
import { buttonTemplate } from './button.js';
import { cardTemplate } from './card.js';
import { badgeTemplate } from './badge.js';
import { inputTemplate } from './input.js';

export const TEMPLATES = [buttonTemplate, cardTemplate, badgeTemplate, inputTemplate];

export function matchTemplate(name) {
  const n = String(name ?? '').toLowerCase();
  if (!n) return null;
  return TEMPLATES.find((t) => t.match(n)) ?? null;
}
```

- [ ] **Step 7: Run test to verify it passes**

Run: `cd web && npx vitest run src/lib/components/templates/registry.test.js`
Expected: PASS (6 tests)

- [ ] **Step 8: Commit**

```bash
git add web/src/lib/components/templates/
git commit -m "feat: card, badge, input templates registered"
```

---

## Task 4: `emitComponents` + generic stub

Walks `result.raw.{atomics,components,patterns}`, resolves each against the registry, and returns the normalized emitted-component list. Optional `kind` filter.

**Files:**
- Create: `web/src/lib/emit/emitComponents.js`
- Test: `web/src/lib/emit/emitComponents.test.js`

- [ ] **Step 1: Write the failing test**

```js
import { describe, it, expect } from 'vitest';
import { emitComponents } from './emitComponents.js';

const result = {
  raw: {
    tokens: { colors: [{ hex: '#022d2c', role: 'primary', confidence: 'high' }],
      typography: [], spacing: [], border_radius: [], shadows: [] },
    atomics: [{ name: 'Button', variants: ['primary'], confidence: 'high' }],
    components: [{ name: 'Hero section', variants: [], confidence: 'low' }],
    patterns: [],
  },
};

describe('emitComponents', () => {
  it('returns an empty list for preview imports (raw: null)', () => {
    expect(emitComponents({ raw: null })).toEqual([]);
  });

  it('emits a template-backed atomic with preview', () => {
    const all = emitComponents(result);
    const button = all.find((c) => c.name === 'Button');
    expect(button.filename).toBe('Button.jsx');
    expect(button.kind).toBe('atomic');
    expect(button.templateKey).toBe('button');
    expect(button.hasPreview).toBe(true);
    expect(button.variants).toEqual(['primary', 'secondary', 'ghost']);
    expect(button.code).toContain('bg-[#022d2c]');
  });

  it('emits a generic stub (no preview) for unknown objects', () => {
    const hero = emitComponents(result).find((c) => c.name === 'Hero section');
    expect(hero.filename).toBe('HeroSection.jsx');
    expect(hero.templateKey).toBeNull();
    expect(hero.hasPreview).toBe(false);
    expect(hero.code).toContain('export function HeroSection');
    expect(hero.code).toContain('TODO');
  });

  it('filters by kind when asked', () => {
    const atomics = emitComponents(result, 'atomic');
    expect(atomics).toHaveLength(1);
    expect(atomics[0].name).toBe('Button');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd web && npx vitest run src/lib/emit/emitComponents.test.js`
Expected: FAIL — "Failed to resolve import './emitComponents.js'"

- [ ] **Step 3: Write minimal implementation**

```js
import { matchTemplate } from '../components/templates/registry.js';
import { normalizeTokens } from './normalizeTokens.js';
import { pickTokens } from './pickTokens.js';
import { slugify } from './slugify.js';

const KINDS = [
  ['atomics', 'atomic'],
  ['components', 'component'],
  ['patterns', 'pattern'],
];

function toPascal(slug) {
  return slug
    .split('-')
    .filter(Boolean)
    .map((s) => s.charAt(0).toUpperCase() + s.slice(1))
    .join('');
}

function genericStub(pascal, item) {
  const flag = item?.confidence === 'low' ? '// unsicher erkannt — bitte prüfen\n' : '';
  return (
    flag +
    [
      '// Auto-generated by DesignBridge — generischer Stub, bitte ausbauen',
      `export function ${pascal}({ className = "", ...props }) {`,
      '  // TODO: Struktur dieser Komponente ergänzen (Scan liefert nur Name + Varianten)',
      '  return <div className={className} {...props} />;',
      '}',
      '',
    ].join('\n')
  );
}

export function emitComponents(result, kind) {
  const raw = result?.raw;
  if (!raw) return [];
  const picks = pickTokens(normalizeTokens(raw.tokens));
  const out = [];
  for (const [rawKey, itemKind] of KINDS) {
    if (kind && kind !== itemKind) continue;
    const items = Array.isArray(raw[rawKey]) ? raw[rawKey] : [];
    for (const item of items) {
      const tpl = matchTemplate(item.name);
      const slug = slugify(item.name) || 'component';
      const pascal = toPascal(slug) || 'Component';
      out.push({
        name: item.name,
        slug,
        filename: `${pascal}.jsx`,
        kind: itemKind,
        templateKey: tpl?.key ?? null,
        variants: tpl?.variants ?? [],
        code: tpl ? tpl.emit(picks, item) : genericStub(pascal, item),
        confidence: item.confidence ?? null,
        hasPreview: Boolean(tpl),
      });
    }
  }
  return out;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd web && npx vitest run src/lib/emit/emitComponents.test.js`
Expected: PASS (4 tests)

- [ ] **Step 5: Commit**

```bash
git add web/src/lib/emit/emitComponents.js web/src/lib/emit/emitComponents.test.js
git commit -m "feat: emitComponents — emitted-component list + generic stub fallback"
```

---

## Task 5: Preview components

Maps a `templateKey` to a React component rendering the requested variant with inline styles from `styleFor`.

**Files:**
- Create: `web/src/lib/components/templates/Previews.jsx`
- Test: `web/src/lib/components/templates/Previews.test.jsx`

- [ ] **Step 1: Write the failing test**

```jsx
import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { PREVIEWS } from './Previews.jsx';

const picks = { primary: '#022d2c', onPrimary: '#ffffff', text: '#18181b',
  surface: '#ffffff', surfaceMuted: '#f4f4f5', border: '#e4e4e7', radius: '8px',
  fontSize: '16px', fontWeight: '600' };

describe('PREVIEWS', () => {
  it('renders a primary button preview using the primary token color', () => {
    const Button = PREVIEWS.button;
    const { getByText } = render(<Button variant="primary" picks={picks} />);
    const el = getByText('Button');
    expect(el.style.background).toContain('rgb(2, 45, 44)');
  });

  it('has a preview for every template key', () => {
    ['button', 'card', 'badge', 'input'].forEach((k) => {
      expect(typeof PREVIEWS[k]).toBe('function');
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd web && npx vitest run src/lib/components/templates/Previews.test.jsx`
Expected: FAIL — "Failed to resolve import './Previews.jsx'"

- [ ] **Step 3: Write minimal implementation**

```jsx
import React from 'react';
import { buttonTemplate } from './button.js';
import { cardTemplate } from './card.js';
import { badgeTemplate } from './badge.js';
import { inputTemplate } from './input.js';

export const PREVIEWS = {
  button: ({ variant, picks }) => (
    <button style={buttonTemplate.styleFor(variant, picks)}>Button</button>
  ),
  card: ({ variant, picks }) => (
    <div style={cardTemplate.styleFor(variant, picks)}>Card-Inhalt</div>
  ),
  badge: ({ variant, picks }) => (
    <span style={badgeTemplate.styleFor(variant, picks)}>Badge</span>
  ),
  input: ({ variant, picks }) => (
    <input
      style={inputTemplate.styleFor(variant, picks)}
      placeholder="Eingabe"
      readOnly
      disabled={variant === 'disabled'}
    />
  ),
};
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd web && npx vitest run src/lib/components/templates/Previews.test.jsx`
Expected: PASS (2 tests)

- [ ] **Step 5: Commit**

```bash
git add web/src/lib/components/templates/Previews.jsx web/src/lib/components/templates/Previews.test.jsx
git commit -m "feat: preview components for the four templates"
```

---

## Task 6: Shared download util + `LibraryObjectList` accordion

Extract the download helper out of `Export.jsx` so both surfaces share it, then build the accordion: header toggles expansion; expanded shows variant switcher + preview/placeholder + code + copy/download.

**Files:**
- Create: `web/src/lib/download.js`
- Create: `web/src/components/library/LibraryObjectList.jsx`
- Test: `web/src/components/library/LibraryObjectList.test.jsx`
- Modify: `web/src/pages/Export.jsx` (use shared download — see Step 7)

- [ ] **Step 1: Create the shared download util**

Create `web/src/lib/download.js`:

```js
export function downloadBlob(filename, blob) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export function downloadFile(filename, content, mime) {
  downloadBlob(filename, new Blob([content], { type: mime }));
}
```

- [ ] **Step 2: Write the failing test**

```jsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import LibraryObjectList from './LibraryObjectList.jsx';

const picks = { primary: '#022d2c', onPrimary: '#ffffff', text: '#18181b',
  surface: '#ffffff', surfaceMuted: '#f4f4f5', border: '#e4e4e7', radius: '8px',
  fontSize: '16px', fontWeight: '600' };

const items = [
  { name: 'Button', slug: 'button', filename: 'Button.jsx', kind: 'atomic',
    templateKey: 'button', variants: ['primary', 'secondary', 'ghost'],
    code: 'export function Button() {}', confidence: 'high', hasPreview: true },
  { name: 'Hero section', slug: 'hero-section', filename: 'HeroSection.jsx', kind: 'component',
    templateKey: null, variants: [], code: 'export function HeroSection() {}',
    confidence: 'low', hasPreview: false },
];

describe('LibraryObjectList', () => {
  it('shows a row per item and expands to reveal code on click', () => {
    render(<LibraryObjectList items={items} picks={picks} />);
    expect(screen.getByText('Button')).toBeInTheDocument();
    expect(screen.queryByText('export function Button() {}')).not.toBeInTheDocument();
    fireEvent.click(screen.getByText('Button'));
    expect(screen.getByText('export function Button() {}')).toBeInTheDocument();
  });

  it('renders a variant switcher for template-backed items', () => {
    render(<LibraryObjectList items={items} picks={picks} />);
    fireEvent.click(screen.getByText('Button'));
    expect(screen.getByRole('button', { name: 'primary' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'ghost' })).toBeInTheDocument();
  });

  it('shows the placeholder (no preview) for generic items', () => {
    render(<LibraryObjectList items={items} picks={picks} />);
    fireEvent.click(screen.getByText('Hero section'));
    expect(screen.getByText(/keine vorschau/i)).toBeInTheDocument();
  });

  it('copies code to the clipboard', () => {
    const writeText = vi.fn().mockResolvedValue();
    Object.assign(navigator, { clipboard: { writeText } });
    render(<LibraryObjectList items={items} picks={picks} />);
    fireEvent.click(screen.getByText('Button'));
    fireEvent.click(screen.getByRole('button', { name: /kopieren/i }));
    expect(writeText).toHaveBeenCalledWith('export function Button() {}');
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `cd web && npx vitest run src/components/library/LibraryObjectList.test.jsx`
Expected: FAIL — "Failed to resolve import './LibraryObjectList.jsx'"

- [ ] **Step 4: Write minimal implementation**

Create `web/src/components/library/LibraryObjectList.jsx`:

```jsx
import React, { useState } from 'react';
import ConfidencePill from './ConfidencePill.jsx';
import PreviewPlaceholder from './PreviewPlaceholder.jsx';
import { PREVIEWS } from '../../lib/components/templates/Previews.jsx';
import { downloadFile } from '../../lib/download.js';

function Row({ item, picks }) {
  const [open, setOpen] = useState(false);
  const [variant, setVariant] = useState(item.variants[0] ?? null);
  const [copied, setCopied] = useState(false);
  const Preview = item.hasPreview ? PREVIEWS[item.templateKey] : null;

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(item.code);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      setCopied(false);
    }
  };

  return (
    <div className="border-b border-zinc-200">
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-2 w-full text-left px-3 py-2 text-sm hover:bg-zinc-50"
      >
        <span className={`text-zinc-400 transition-transform ${open ? 'rotate-90' : ''}`}>›</span>
        <span className="font-medium text-zinc-900">{item.name}</span>
        <ConfidencePill value={item.confidence} />
        {!item.hasPreview && (
          <span className="text-[10px] px-1.5 py-0.5 rounded bg-zinc-100 text-zinc-500">
            generischer Stub · keine Vorschau
          </span>
        )}
        <span className="ml-auto text-[10px] font-mono text-zinc-400">{item.filename}</span>
      </button>

      {open && (
        <div className="bg-zinc-50 px-3 pb-3">
          {item.variants.length > 0 && (
            <div className="flex gap-1 py-2">
              {item.variants.map((v) => (
                <button
                  key={v}
                  onClick={() => setVariant(v)}
                  className={`text-[11px] px-2 py-0.5 rounded ${
                    variant === v ? 'bg-zinc-900 text-white' : 'bg-zinc-100 text-zinc-600'
                  }`}
                >
                  {v}
                </button>
              ))}
            </div>
          )}

          <div className="text-[9px] uppercase tracking-wider text-zinc-400 pt-1 pb-1.5">Vorschau</div>
          <div className="flex items-center gap-2 flex-wrap p-3 bg-white border border-zinc-200 rounded">
            {Preview ? <Preview variant={variant} picks={picks} /> : <PreviewPlaceholder label="keine Vorschau" />}
          </div>

          <div className="text-[9px] uppercase tracking-wider text-zinc-400 pt-3 pb-1.5">Code</div>
          <pre className="text-xs font-mono bg-white border border-zinc-200 rounded p-3 overflow-auto max-h-72 whitespace-pre">
            {item.code}
          </pre>

          <div className="flex items-center gap-2 mt-2">
            <span className="text-[10px] font-mono text-zinc-400">{item.filename}</span>
            {copied && <span className="text-[10px] text-emerald-600">kopiert</span>}
            <span className="ml-auto" />
            <button
              onClick={copy}
              className="text-xs px-2.5 py-1 rounded border border-zinc-200 text-zinc-700 hover:bg-zinc-50"
            >
              Kopieren
            </button>
            <button
              onClick={() => downloadFile(item.filename, item.code, 'text/javascript')}
              className="text-xs px-2.5 py-1 rounded bg-zinc-900 text-white font-medium hover:bg-zinc-700"
            >
              Herunterladen
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default function LibraryObjectList({ items, picks }) {
  if (!items || items.length === 0) {
    return <div className="text-sm text-zinc-500">Keine Objekte erkannt.</div>;
  }
  return (
    <div className="max-w-3xl border-t border-zinc-200">
      {items.map((item) => (
        <Row key={item.slug + item.kind} item={item} picks={picks} />
      ))}
    </div>
  );
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd web && npx vitest run src/components/library/LibraryObjectList.test.jsx`
Expected: PASS (4 tests)

- [ ] **Step 6: Commit**

```bash
git add web/src/lib/download.js web/src/components/library/LibraryObjectList.jsx web/src/components/library/LibraryObjectList.test.jsx
git commit -m "feat: LibraryObjectList accordion + shared download util"
```

- [ ] **Step 7: Refactor Export.jsx to use the shared download util**

In `web/src/pages/Export.jsx`, delete the local `downloadFile` function (lines defining `function downloadFile(...) {...}`) and add this import near the top, after the existing imports:

```js
import { downloadFile } from '../lib/download.js';
```

Run: `cd web && npx vitest run src/pages/Export.test.jsx`
Expected: PASS (3 tests — unchanged behavior)

- [ ] **Step 8: Commit**

```bash
git add web/src/pages/Export.jsx
git commit -m "refactor: Export uses shared download util"
```

---

## Task 7: Wire Atomics / Components / Patterns pages

Replace the three pages with thin wrappers that emit their slice and render the accordion. Keep the existing "preview import" notice for `raw: null`.

**Files:**
- Modify: `web/src/pages/Atomics.jsx`
- Modify: `web/src/pages/Components.jsx`
- Modify: `web/src/pages/Patterns.jsx`
- Test: `web/src/pages/Components.test.jsx` (create)

- [ ] **Step 1: Write the failing test**

Create `web/src/pages/Components.test.jsx`:

```jsx
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import Components from './Components.jsx';

describe('Components page', () => {
  it('shows the preview-import notice when there is no detail', () => {
    render(<Components result={{ raw: null }} />);
    expect(screen.getByText(/preview-import/i)).toBeInTheDocument();
  });

  it('lists recognized components in the accordion', () => {
    const result = { raw: {
      tokens: { colors: [], typography: [], spacing: [], border_radius: [], shadows: [] },
      atomics: [], patterns: [],
      components: [{ name: 'Button', variants: ['primary'], confidence: 'high' }],
    } };
    render(<Components result={result} />);
    expect(screen.getByText('Button')).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd web && npx vitest run src/pages/Components.test.jsx`
Expected: FAIL — second test fails: "Unable to find an element with the text: Button" (current page renders InventoryCard grid with different markup) OR passes the first only.

- [ ] **Step 3: Rewrite Components.jsx**

Replace the contents of `web/src/pages/Components.jsx`:

```jsx
import React from 'react';
import LibraryObjectList from '../components/library/LibraryObjectList.jsx';
import { emitComponents } from '../lib/emit/emitComponents.js';
import { normalizeTokens } from '../lib/emit/normalizeTokens.js';
import { pickTokens } from '../lib/emit/pickTokens.js';

export default function Components({ result }) {
  if (!result?.raw) {
    return <div className="text-sm text-zinc-500">Preview-Import — keine Detaildaten. Importiere ein Bild, um Komponenten als Code zu sehen.</div>;
  }
  const items = emitComponents(result, 'component');
  const picks = pickTokens(normalizeTokens(result.raw.tokens));
  return <LibraryObjectList items={items} picks={picks} />;
}
```

- [ ] **Step 4: Rewrite Atomics.jsx**

Replace the contents of `web/src/pages/Atomics.jsx`:

```jsx
import React from 'react';
import LibraryObjectList from '../components/library/LibraryObjectList.jsx';
import { emitComponents } from '../lib/emit/emitComponents.js';
import { normalizeTokens } from '../lib/emit/normalizeTokens.js';
import { pickTokens } from '../lib/emit/pickTokens.js';

export default function Atomics({ result }) {
  if (!result?.raw) {
    return <div className="text-sm text-zinc-500">Preview-Import — keine Detaildaten. Importiere ein Bild, um Atomics als Code zu sehen.</div>;
  }
  const items = emitComponents(result, 'atomic');
  const picks = pickTokens(normalizeTokens(result.raw.tokens));
  return <LibraryObjectList items={items} picks={picks} />;
}
```

- [ ] **Step 5: Rewrite Patterns.jsx**

Replace the contents of `web/src/pages/Patterns.jsx`:

```jsx
import React from 'react';
import LibraryObjectList from '../components/library/LibraryObjectList.jsx';
import { emitComponents } from '../lib/emit/emitComponents.js';
import { normalizeTokens } from '../lib/emit/normalizeTokens.js';
import { pickTokens } from '../lib/emit/pickTokens.js';

export default function Patterns({ result }) {
  if (!result?.raw) {
    return <div className="text-sm text-zinc-500">Preview-Import — keine Detaildaten. Importiere ein Bild, um Patterns als Code zu sehen.</div>;
  }
  const items = emitComponents(result, 'pattern');
  const picks = pickTokens(normalizeTokens(result.raw.tokens));
  return <LibraryObjectList items={items} picks={picks} />;
}
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `cd web && npx vitest run src/pages/Components.test.jsx`
Expected: PASS (2 tests)

- [ ] **Step 7: Commit**

```bash
git add web/src/pages/Atomics.jsx web/src/pages/Components.jsx web/src/pages/Patterns.jsx web/src/pages/Components.test.jsx
git commit -m "feat: Atomics/Components/Patterns pages render the accordion"
```

---

## Task 8: `buildLibraryZip`

Bundle tokens + components into one `.zip` Blob with jszip. References `buildExports` only inside the function body (safe with the index.js cycle).

**Files:**
- Create: `web/src/lib/emit/buildLibraryZip.js`
- Test: `web/src/lib/emit/buildLibraryZip.test.js`

- [ ] **Step 1: Write the failing test**

```js
import { describe, it, expect } from 'vitest';
import JSZip from 'jszip';
import { buildLibraryZip } from './buildLibraryZip.js';

const result = {
  raw: {
    tokens: { colors: [{ hex: '#022d2c', role: 'primary', confidence: 'high' }],
      typography: [], spacing: [], border_radius: [], shadows: [] },
    atomics: [{ name: 'Button', variants: ['primary'], confidence: 'high' }],
    components: [], patterns: [],
  },
};

describe('buildLibraryZip', () => {
  it('packs tokens and components into the zip', async () => {
    const blob = await buildLibraryZip(result);
    const zip = await JSZip.loadAsync(blob);
    const names = Object.keys(zip.files);
    expect(names).toContain('tokens/tokens.css');
    expect(names).toContain('tokens/tokens.json');
    expect(names).toContain('tokens/tailwind.config.tokens.js');
    expect(names).toContain('components/Button.jsx');
    expect(names).toContain('README.md');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd web && npx vitest run src/lib/emit/buildLibraryZip.test.js`
Expected: FAIL — "Failed to resolve import './buildLibraryZip.js'"

- [ ] **Step 3: Write minimal implementation**

```js
import JSZip from 'jszip';
import { buildExports } from './index.js';
import { emitComponents } from './emitComponents.js';

function buildReadme(exports, comps) {
  const lines = ['# DesignBridge Library Export', ''];
  if (exports) lines.push('## Tokens', '- tokens/tokens.css', '- tokens/tokens.json', '- tokens/tailwind.config.tokens.js', '');
  if (comps.length) {
    lines.push('## Components');
    for (const c of comps) lines.push(`- components/${c.filename}`);
  }
  return lines.join('\n') + '\n';
}

export async function buildLibraryZip(result) {
  const zip = new JSZip();
  const exports = buildExports(result);
  if (exports) {
    zip.file('tokens/tokens.css', exports.css);
    zip.file('tokens/tailwind.config.tokens.js', exports.tailwind);
    zip.file('tokens/tokens.json', exports.json);
  }
  const comps = emitComponents(result);
  for (const c of comps) zip.file(`components/${c.filename}`, c.code);
  zip.file('README.md', buildReadme(exports, comps));
  return zip.generateAsync({ type: 'blob' });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd web && npx vitest run src/lib/emit/buildLibraryZip.test.js`
Expected: PASS (1 test)

- [ ] **Step 5: Re-export from index.js**

Replace the contents of `web/src/lib/emit/index.js`:

```js
import { normalizeTokens } from './normalizeTokens.js';
import { emitCss } from './emitCss.js';
import { emitTailwind } from './emitTailwind.js';
import { emitTokensJson } from './emitTokensJson.js';

export { emitComponents } from './emitComponents.js';
export { buildLibraryZip } from './buildLibraryZip.js';

export const EXPORT_FORMATS = [
  { id: 'css', label: 'CSS-Variablen', filename: 'tokens.css', mime: 'text/css' },
  { id: 'tailwind', label: 'Tailwind-Config', filename: 'tailwind.config.tokens.js', mime: 'text/javascript' },
  { id: 'json', label: 'tokens.json', filename: 'tokens.json', mime: 'application/json' },
];

export function buildExports(result) {
  const rawTokens = result?.raw?.tokens;
  if (!rawTokens) return null;
  const tokens = normalizeTokens(rawTokens);
  if (tokens.length === 0) return null;
  return {
    css: emitCss(tokens),
    tailwind: emitTailwind(tokens),
    json: emitTokensJson(tokens),
  };
}
```

- [ ] **Step 6: Run the whole emit suite to confirm no cycle breakage**

Run: `cd web && npx vitest run src/lib/emit/`
Expected: PASS (all emit tests, including index.test.js, buildLibraryZip, emitComponents, pickTokens)

- [ ] **Step 7: Commit**

```bash
git add web/src/lib/emit/buildLibraryZip.js web/src/lib/emit/buildLibraryZip.test.js web/src/lib/emit/index.js
git commit -m "feat: buildLibraryZip — tokens + components bundle via jszip"
```

---

## Task 9: "Ganze Library exportieren" in the Export tab

**Files:**
- Modify: `web/src/pages/Export.jsx`
- Test: `web/src/pages/Export.test.jsx` (extend)

- [ ] **Step 1: Add the failing test**

Append inside the `describe('Export page', ...)` block in `web/src/pages/Export.test.jsx`:

```jsx
  it('offers a whole-library export action', () => {
    render(<Export result={imageResult} />);
    expect(screen.getByRole('button', { name: /ganze library exportieren/i })).toBeInTheDocument();
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd web && npx vitest run src/pages/Export.test.jsx`
Expected: FAIL — "Unable to find role=button with name /ganze library exportieren/i"

- [ ] **Step 3: Implement the action**

In `web/src/pages/Export.jsx`:

1. Update the imports from the emit barrel and the download util:

```js
import { buildExports, EXPORT_FORMATS, buildLibraryZip } from '../lib/emit/index.js';
import { downloadFile, downloadBlob } from '../lib/download.js';
```

2. Inside the `Export` component, add a handler (next to `handleDownloadAll`):

```js
  const handleExportLibrary = async () => {
    const blob = await buildLibraryZip(result);
    downloadBlob('designbridge-library.zip', blob);
  };
```

3. In the left `<aside>`, directly below the existing "Alle herunterladen" button, add:

```jsx
        <button
          onClick={handleExportLibrary}
          className="mt-2 w-full text-xs px-2.5 py-1.5 rounded bg-zinc-900 text-white font-medium hover:bg-zinc-700 transition-colors"
        >
          Ganze Library exportieren
        </button>
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd web && npx vitest run src/pages/Export.test.jsx`
Expected: PASS (4 tests)

- [ ] **Step 5: Commit**

```bash
git add web/src/pages/Export.jsx web/src/pages/Export.test.jsx
git commit -m "feat: 'Ganze Library exportieren' (.zip) in the Export tab"
```

---

## Task 10: Full verification + browser smoke test

**Files:** none (verification only)

- [ ] **Step 1: Run the full test suite**

Run: `cd web && npm test`
Expected: ALL tests pass (existing 57 + the new ones). Note the new total in the commit message.

- [ ] **Step 2: Production build**

Run: `cd web && npm run build`
Expected: build completes with no errors.

- [ ] **Step 3: Browser smoke test**

Start the dev server and seed a real image result into `localStorage["designbridge.lastImport"]` (same approach as the Phase 2 smoke test — see `project_designbridge_demo_2026-06-24` / the Phase 2 entry). Verify, in the browser:
- Atomics/Components show the accordion; expanding "Button" (or similar) shows a themed preview, the variant switcher flips primary/secondary/ghost, and the code block shows `bg-[#...]` with the extracted color.
- A non-template object shows "generischer Stub · keine Vorschau" + placeholder.
- Per-object Kopieren / Herunterladen work.
- Export tab → "Ganze Library exportieren" downloads `designbridge-library.zip`; unzip shows `/tokens/*` and `/components/*.jsx`.
- No console errors.

- [ ] **Step 4: Final commit (if smoke test required any fix) + push**

```bash
git push origin main
```

---

## Self-review notes

- **Spec coverage:** two-surface model (Tasks 6–9), template registry + 4 templates (Tasks 2–3), emitComponents + generic stub (Task 4), preview (Task 5), variant switcher (Task 6), confidence/generic pills (Task 6), `.jsx`-only + token-woven code (Tasks 2–4), library `.zip` via jszip (Tasks 0, 8–9), reuse of normalizeTokens/ConfidencePill/PreviewPlaceholder/slugify/downloadFile — all covered.
- **Type consistency:** the emitted-component object shape `{name, slug, filename, kind, templateKey, variants, code, confidence, hasPreview}` is produced in Task 4 and consumed unchanged in Tasks 6–8; template shape `{key,label,variants,match,emit,styleFor}` defined Task 2, consumed Tasks 4–5.
- **No placeholders:** every code step contains complete code; commands have expected output.
