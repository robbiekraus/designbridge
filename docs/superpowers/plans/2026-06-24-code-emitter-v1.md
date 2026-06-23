# Code Emitter v1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an Export tab to the Designbridge Library that turns the current import's design tokens into CSS variables, a Tailwind config fragment, and a DTCG `tokens.json` — with a live preview, copy, and download.

**Architecture:** A single `normalizeTokens` step converts the scan's free-text token arrays into one canonical, named, collision-free token list. Three thin pure-function emitters (`emitCss`, `emitTailwind`, `emitTokensJson`) derive the formats from that list. `buildExports` orchestrates them. `Export.jsx` is the UI; `App.jsx` adds the nav entry and route.

**Tech Stack:** Vite + React 18, plain JS modules (ESM), Vitest + @testing-library/react, Tailwind. All work in `web/`. Tests run with `npm test` from `web/`.

**Spec:** [docs/superpowers/specs/2026-06-24-code-emitter-v1-design.md](../specs/2026-06-24-code-emitter-v1-design.md)

**Conventions (verified against the codebase):**
- Test files sit next to source: `foo.js` → `foo.test.js`; React: `Foo.jsx` → `Foo.test.jsx`.
- Test imports: `import { describe, it, expect } from 'vitest';` and `import { render, screen } from '@testing-library/react';`.
- Visual style: zinc/white Tailwind, small text, tight spacing — copy classes from `web/src/App.jsx` / `web/src/pages/Tokens.jsx`.
- The current import object is `result`, with token detail at `result.raw.tokens`. Mock imports have `result.raw === null`.
- After writing files, run `find . -name '._*' -delete` from the repo root (macOS AppleDouble cleanup, CLAUDE.md rule 7).

**Canonical token shape produced by `normalizeTokens` (used by every emitter):**
```js
{
  group: 'color' | 'font' | 'spacing' | 'radius' | 'shadow',
  name: string,                 // slug, unique within its group
  value: string | { fontSize: string, fontWeight: string },  // object only for group 'font'
  confidence: 'high' | 'med' | 'medium' | 'low' | null,
  source: object                // original scan entry
}
```
Only `confidence === 'low'` is flagged in output. All commands below are run from `web/` unless stated.

---

### Task 1: `slugify` naming helper

**Files:**
- Create: `web/src/lib/emit/slugify.js`
- Test: `web/src/lib/emit/slugify.test.js`

- [ ] **Step 1: Write the failing test**

```js
// web/src/lib/emit/slugify.test.js
import { describe, it, expect } from 'vitest';
import { slugify } from './slugify.js';

describe('slugify', () => {
  it('lowercases and dashes spaces', () => {
    expect(slugify('Primary Button Background')).toBe('primary-button-background');
  });
  it('collapses non-alphanumeric runs and trims dashes', () => {
    expect(slugify('  Card / Modal!! ')).toBe('card-modal');
  });
  it('strips German diacritics', () => {
    expect(slugify('Primärer Überschrift')).toBe('primarer-uberschrift');
  });
  it('returns empty string for empty or symbol-only input', () => {
    expect(slugify('')).toBe('');
    expect(slugify('   ')).toBe('');
    expect(slugify('!!!')).toBe('');
    expect(slugify(null)).toBe('');
    expect(slugify(undefined)).toBe('');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- slugify`
Expected: FAIL — cannot resolve `./slugify.js` / `slugify is not a function`.

- [ ] **Step 3: Write minimal implementation**

```js
// web/src/lib/emit/slugify.js
export function slugify(text) {
  if (text == null) return '';
  return String(text)
    .normalize('NFKD')                 // separate accents from base letters
    .replace(/\p{Diacritic}/gu, '')    // drop the separated accents
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')       // any non-alphanumeric run → single dash
    .replace(/^-+|-+$/g, '');          // trim leading/trailing dashes
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- slugify`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
cd "/Volumes/4TB Shield/Vibe Coding Bootcamp/Projekte/Designbridge"
find . -name '._*' -delete
git add web/src/lib/emit/slugify.js web/src/lib/emit/slugify.test.js
git commit -m "feat(emit): add slugify naming helper"
```

---

### Task 2: `normalizeTokens` — raw scan tokens → canonical list

**Files:**
- Create: `web/src/lib/emit/normalizeTokens.js`
- Test: `web/src/lib/emit/normalizeTokens.test.js`

- [ ] **Step 1: Write the failing test**

```js
// web/src/lib/emit/normalizeTokens.test.js
import { describe, it, expect } from 'vitest';
import { normalizeTokens } from './normalizeTokens.js';

const raw = {
  colors: [
    { hex: '#022d2c', role: 'primary button background', confidence: 'high' },
    { hex: '#706a6a', role: 'secondary text', confidence: 'low' },
    { hex: '#ffffff', role: 'secondary text', confidence: 'med' }, // collision with previous role
    { hex: '#000000', role: '', confidence: 'high' },              // empty label → fallback
  ],
  typography: [
    { size: 32, weight: 700, role: 'headline', sample: 'Ag', confidence: 'high' },
    { size: '14px', weight: '500', role: 'body', confidence: 'medium' },
  ],
  spacing: [
    { value: 16, usage: 'gutter', confidence: 'high' },
    { value: '8px', usage: 'inline gap', confidence: 'low' },
  ],
  border_radius: [
    { value: 8, usage: 'card', confidence: 'high' },
    { value: '50%', usage: 'avatar', confidence: 'med' },
  ],
  shadows: [
    { css: '0 1px 3px rgba(0,0,0,.1)', description: 'card shadow', confidence: 'high' },
  ],
};

describe('normalizeTokens', () => {
  it('names colors, handles collisions and empty labels', () => {
    const out = normalizeTokens(raw).filter(t => t.group === 'color');
    expect(out.map(t => t.name)).toEqual([
      'primary-button-background',
      'secondary-text',
      'secondary-text-2',
      'color-4',
    ]);
    expect(out[0]).toMatchObject({ group: 'color', value: '#022d2c', confidence: 'high' });
    expect(out[1].confidence).toBe('low');
  });

  it('builds typography as a compound value with px font size', () => {
    const out = normalizeTokens(raw).filter(t => t.group === 'font');
    expect(out[0]).toMatchObject({ name: 'headline', value: { fontSize: '32px', fontWeight: '700' } });
    expect(out[1].value).toEqual({ fontSize: '14px', fontWeight: '500' });
  });

  it('appends px to unitless spacing and radius, passes units through', () => {
    const all = normalizeTokens(raw);
    const spacing = all.filter(t => t.group === 'spacing');
    const radius = all.filter(t => t.group === 'radius');
    expect(spacing.map(t => t.value)).toEqual(['16px', '8px']);
    expect(radius.map(t => t.value)).toEqual(['8px', '50%']);
  });

  it('passes shadow css through unchanged', () => {
    const shadow = normalizeTokens(raw).find(t => t.group === 'shadow');
    expect(shadow).toMatchObject({ name: 'card-shadow', value: '0 1px 3px rgba(0,0,0,.1)' });
  });

  it('returns an empty array for missing or empty token sets', () => {
    expect(normalizeTokens(undefined)).toEqual([]);
    expect(normalizeTokens({})).toEqual([]);
    expect(normalizeTokens({ colors: [] })).toEqual([]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- normalizeTokens`
Expected: FAIL — cannot resolve `./normalizeTokens.js`.

- [ ] **Step 3: Write minimal implementation**

```js
// web/src/lib/emit/normalizeTokens.js
import { slugify } from './slugify.js';

// Append `px` to a bare number; pass through anything that already has a unit or `%`.
function withUnit(value) {
  const s = String(value ?? '').trim();
  if (s === '') return s;
  if (/[a-z%]$/i.test(s)) return s;        // ends in a letter (px/em/rem) or %
  if (/^-?\d*\.?\d+$/.test(s)) return `${s}px`;
  return s;
}

// Assign collision-free names within one group.
// First occurrence keeps the bare slug; later duplicates get -2, -3, …
// Empty/unusable labels fall back to `<prefix>-<1-based index>`.
function assignNames(entries, prefix, labelOf) {
  const seen = new Map();
  return entries.map((entry, i) => {
    let base = slugify(labelOf(entry));
    if (!base) base = `${prefix}-${i + 1}`;
    const used = seen.get(base) ?? 0;
    seen.set(base, used + 1);
    return used === 0 ? base : `${base}-${used + 1}`;
  });
}

export function normalizeTokens(rawTokens) {
  const t = rawTokens ?? {};
  const tokens = [];

  const push = (entries, group, prefix, labelOf, valueOf) => {
    const arr = Array.isArray(entries) ? entries : [];
    const names = assignNames(arr, prefix, labelOf);
    arr.forEach((entry, i) => {
      tokens.push({
        group,
        name: names[i],
        value: valueOf(entry),
        confidence: entry.confidence ?? null,
        source: entry,
      });
    });
  };

  push(t.colors, 'color', 'color', c => c.role, c => c.hex);
  push(t.typography, 'font', 'font', x => x.role,
    x => ({ fontSize: withUnit(x.size), fontWeight: String(x.weight) }));
  push(t.spacing, 'spacing', 'spacing', x => x.usage, x => withUnit(x.value));
  push(t.border_radius, 'radius', 'radius', x => x.usage, x => withUnit(x.value));
  push(t.shadows, 'shadow', 'shadow', x => x.description, x => x.css);

  return tokens;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- normalizeTokens`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
cd "/Volumes/4TB Shield/Vibe Coding Bootcamp/Projekte/Designbridge"
find . -name '._*' -delete
git add web/src/lib/emit/normalizeTokens.js web/src/lib/emit/normalizeTokens.test.js
git commit -m "feat(emit): normalize raw scan tokens into a canonical named set"
```

---

### Task 3: `emitCss` — canonical tokens → `tokens.css`

**Files:**
- Create: `web/src/lib/emit/emitCss.js`
- Test: `web/src/lib/emit/emitCss.test.js`

- [ ] **Step 1: Write the failing test**

```js
// web/src/lib/emit/emitCss.test.js
import { describe, it, expect } from 'vitest';
import { emitCss } from './emitCss.js';

const tokens = [
  { group: 'color', name: 'button-primary', value: '#022d2c', confidence: 'high' },
  { group: 'color', name: 'text-secondary', value: '#706a6a', confidence: 'low' },
  { group: 'font', name: 'headline', value: { fontSize: '32px', fontWeight: '700' }, confidence: 'high' },
  { group: 'shadow', name: 'card', value: '0 1px 3px rgba(0,0,0,.1)', confidence: 'high' },
];

describe('emitCss', () => {
  it('emits grouped :root custom properties', () => {
    const css = emitCss(tokens);
    expect(css).toContain(':root {');
    expect(css).toContain('  --color-button-primary: #022d2c;');
    expect(css).toContain('  /* colors */');
    expect(css).toContain('  --font-headline-size: 32px;');
    expect(css).toContain('  --font-headline-weight: 700;');
    expect(css).toContain('  --shadow-card: 0 1px 3px rgba(0,0,0,.1);');
  });

  it('flags only low-confidence tokens with a comment', () => {
    const css = emitCss(tokens);
    expect(css).toContain('--color-text-secondary: #706a6a; /* unsicher erkannt — bitte prüfen */');
    expect(css).not.toContain('#022d2c; /*');
  });

  it('omits groups with no tokens', () => {
    const css = emitCss([{ group: 'color', name: 'x', value: '#fff', confidence: 'high' }]);
    expect(css).not.toContain('/* spacing */');
    expect(css).not.toContain('/* typography */');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- emitCss`
Expected: FAIL — cannot resolve `./emitCss.js`.

- [ ] **Step 3: Write minimal implementation**

```js
// web/src/lib/emit/emitCss.js
const GROUP_ORDER = ['color', 'font', 'spacing', 'radius', 'shadow'];
const GROUP_LABEL = {
  color: 'colors', font: 'typography', spacing: 'spacing', radius: 'radius', shadow: 'shadows',
};
const LOW = '/* unsicher erkannt — bitte prüfen */';

function linesForToken(tk) {
  const flag = tk.confidence === 'low' ? ` ${LOW}` : '';
  if (tk.group === 'font') {
    return [
      `  --font-${tk.name}-size: ${tk.value.fontSize};${flag}`,
      `  --font-${tk.name}-weight: ${tk.value.fontWeight};`,
    ];
  }
  const prefix = { color: 'color', spacing: 'spacing', radius: 'radius', shadow: 'shadow' }[tk.group];
  return [`  --${prefix}-${tk.name}: ${tk.value};${flag}`];
}

export function emitCss(tokens) {
  const lines = ['/* Auto-generated by DesignBridge — do not edit manually */', ':root {'];
  for (const group of GROUP_ORDER) {
    const inGroup = tokens.filter(t => t.group === group);
    if (inGroup.length === 0) continue;
    lines.push('', `  /* ${GROUP_LABEL[group]} */`);
    for (const tk of inGroup) lines.push(...linesForToken(tk));
  }
  lines.push('}', '');
  return lines.join('\n');
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- emitCss`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
cd "/Volumes/4TB Shield/Vibe Coding Bootcamp/Projekte/Designbridge"
find . -name '._*' -delete
git add web/src/lib/emit/emitCss.js web/src/lib/emit/emitCss.test.js
git commit -m "feat(emit): add CSS custom-properties emitter"
```

---

### Task 4: `emitTailwind` — canonical tokens → `tailwind.config.tokens.js`

**Files:**
- Create: `web/src/lib/emit/emitTailwind.js`
- Test: `web/src/lib/emit/emitTailwind.test.js`

- [ ] **Step 1: Write the failing test**

```js
// web/src/lib/emit/emitTailwind.test.js
import { describe, it, expect } from 'vitest';
import { emitTailwind } from './emitTailwind.js';

const tokens = [
  { group: 'color', name: 'button-primary', value: '#022d2c', confidence: 'high' },
  { group: 'color', name: 'text-secondary', value: '#706a6a', confidence: 'low' },
  { group: 'font', name: 'headline', value: { fontSize: '32px', fontWeight: '700' }, confidence: 'high' },
  { group: 'spacing', name: 'gutter', value: '16px', confidence: 'high' },
  { group: 'radius', name: 'card', value: '8px', confidence: 'high' },
  { group: 'shadow', name: 'card', value: '0 1px 3px rgba(0,0,0,.1)', confidence: 'high' },
];

describe('emitTailwind', () => {
  it('maps token names to var() references under the right theme keys', () => {
    const out = emitTailwind(tokens);
    expect(out).toContain('module.exports = {');
    expect(out).toContain("    'button-primary': 'var(--color-button-primary)',");
    expect(out).toContain("  fontSize: {");
    expect(out).toContain("    'headline': 'var(--font-headline-size)',");
    expect(out).toContain("  fontWeight: {");
    expect(out).toContain("    'headline': 'var(--font-headline-weight)',");
    expect(out).toContain("  spacing: {");
    expect(out).toContain("    'gutter': 'var(--spacing-gutter)',");
    expect(out).toContain("  borderRadius: {");
    expect(out).toContain("    'card': 'var(--radius-card)',");
    expect(out).toContain("  boxShadow: {");
    expect(out).toContain("    'card': 'var(--shadow-card)',");
  });

  it('flags only low-confidence tokens with a line comment', () => {
    const out = emitTailwind(tokens);
    expect(out).toContain("    'text-secondary': 'var(--color-text-secondary)', // unsicher erkannt — bitte prüfen");
  });

  it('omits theme keys whose group has no tokens', () => {
    const out = emitTailwind([{ group: 'color', name: 'x', value: '#fff', confidence: 'high' }]);
    expect(out).not.toContain('spacing:');
    expect(out).not.toContain('boxShadow:');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- emitTailwind`
Expected: FAIL — cannot resolve `./emitTailwind.js`.

- [ ] **Step 3: Write minimal implementation**

```js
// web/src/lib/emit/emitTailwind.js
const LOW = '// unsicher erkannt — bitte prüfen';

function entryLine(name, ref, low) {
  return `    '${name}': '${ref}',${low ? ` ${LOW}` : ''}`;
}

function block(key, entries) {
  return `  ${key}: {\n${entries.join('\n')}\n  },`;
}

export function emitTailwind(tokens) {
  const by = group => tokens.filter(t => t.group === group);
  const colors = by('color');
  const fonts = by('font');
  const spacing = by('spacing');
  const radius = by('radius');
  const shadows = by('shadow');

  const blocks = [];
  if (colors.length) {
    blocks.push(block('colors',
      colors.map(t => entryLine(t.name, `var(--color-${t.name})`, t.confidence === 'low'))));
  }
  if (fonts.length) {
    blocks.push(block('fontSize',
      fonts.map(t => entryLine(t.name, `var(--font-${t.name}-size)`, t.confidence === 'low'))));
    blocks.push(block('fontWeight',
      fonts.map(t => entryLine(t.name, `var(--font-${t.name}-weight)`, false))));
  }
  if (spacing.length) {
    blocks.push(block('spacing',
      spacing.map(t => entryLine(t.name, `var(--spacing-${t.name})`, t.confidence === 'low'))));
  }
  if (radius.length) {
    blocks.push(block('borderRadius',
      radius.map(t => entryLine(t.name, `var(--radius-${t.name})`, t.confidence === 'low'))));
  }
  if (shadows.length) {
    blocks.push(block('boxShadow',
      shadows.map(t => entryLine(t.name, `var(--shadow-${t.name})`, t.confidence === 'low'))));
  }

  return [
    '// DesignBridge — generated Tailwind tokens',
    "// Usage: import tokens from './tokens/tailwind.config.tokens.js'",
    '//        export default { theme: { extend: tokens } }',
    'module.exports = {',
    blocks.join('\n'),
    '};',
    '',
  ].join('\n');
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- emitTailwind`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
cd "/Volumes/4TB Shield/Vibe Coding Bootcamp/Projekte/Designbridge"
find . -name '._*' -delete
git add web/src/lib/emit/emitTailwind.js web/src/lib/emit/emitTailwind.test.js
git commit -m "feat(emit): add Tailwind config emitter"
```

---

### Task 5: `emitTokensJson` — canonical tokens → DTCG `tokens.json`

**Files:**
- Create: `web/src/lib/emit/emitTokensJson.js`
- Test: `web/src/lib/emit/emitTokensJson.test.js`

- [ ] **Step 1: Write the failing test**

```js
// web/src/lib/emit/emitTokensJson.test.js
import { describe, it, expect } from 'vitest';
import { emitTokensJson } from './emitTokensJson.js';

const tokens = [
  { group: 'color', name: 'button-primary', value: '#022d2c', confidence: 'high' },
  { group: 'color', name: 'text-secondary', value: '#706a6a', confidence: 'low' },
  { group: 'font', name: 'headline', value: { fontSize: '32px', fontWeight: '700' }, confidence: 'high' },
  { group: 'spacing', name: 'gutter', value: '16px', confidence: 'high' },
  { group: 'radius', name: 'card', value: '8px', confidence: 'high' },
  { group: 'shadow', name: 'card', value: '0 1px 3px rgba(0,0,0,.1)', confidence: 'high' },
];

describe('emitTokensJson', () => {
  it('produces valid DTCG-shaped JSON', () => {
    const parsed = JSON.parse(emitTokensJson(tokens));
    expect(parsed.color['button-primary']).toEqual({ $value: '#022d2c', $type: 'color' });
    expect(parsed.typography.headline).toEqual({
      $value: { fontSize: '32px', fontWeight: '700' }, $type: 'typography',
    });
    expect(parsed.spacing.gutter).toEqual({ $value: '16px', $type: 'dimension' });
    expect(parsed.radius.card).toEqual({ $value: '8px', $type: 'dimension' });
    expect(parsed.shadow.card).toEqual({ $value: '0 1px 3px rgba(0,0,0,.1)', $type: 'shadow' });
  });

  it('adds a confidence field only to low-confidence tokens', () => {
    const parsed = JSON.parse(emitTokensJson(tokens));
    expect(parsed.color['text-secondary'].confidence).toBe('low');
    expect(parsed.color['button-primary'].confidence).toBeUndefined();
  });

  it('omits empty sections', () => {
    const parsed = JSON.parse(emitTokensJson([
      { group: 'color', name: 'x', value: '#fff', confidence: 'high' },
    ]));
    expect(parsed.color).toBeDefined();
    expect(parsed.spacing).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- emitTokensJson`
Expected: FAIL — cannot resolve `./emitTokensJson.js`.

- [ ] **Step 3: Write minimal implementation**

```js
// web/src/lib/emit/emitTokensJson.js
const SECTION = { color: 'color', font: 'typography', spacing: 'spacing', radius: 'radius', shadow: 'shadow' };
const TYPE = { color: 'color', spacing: 'dimension', radius: 'dimension', shadow: 'shadow' };

export function emitTokensJson(tokens) {
  const out = {};
  for (const tk of tokens) {
    const section = SECTION[tk.group];
    (out[section] ??= {});
    const node = tk.group === 'font'
      ? { $value: { fontSize: tk.value.fontSize, fontWeight: tk.value.fontWeight }, $type: 'typography' }
      : { $value: tk.value, $type: TYPE[tk.group] };
    if (tk.confidence === 'low') node.confidence = 'low';
    out[section][tk.name] = node;
  }
  return JSON.stringify(out, null, 2) + '\n';
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- emitTokensJson`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
cd "/Volumes/4TB Shield/Vibe Coding Bootcamp/Projekte/Designbridge"
find . -name '._*' -delete
git add web/src/lib/emit/emitTokensJson.js web/src/lib/emit/emitTokensJson.test.js
git commit -m "feat(emit): add DTCG tokens.json emitter"
```

---

### Task 6: `buildExports` orchestrator + format registry

**Files:**
- Create: `web/src/lib/emit/index.js`
- Test: `web/src/lib/emit/index.test.js`

- [ ] **Step 1: Write the failing test**

```js
// web/src/lib/emit/index.test.js
import { describe, it, expect } from 'vitest';
import { buildExports, EXPORT_FORMATS } from './index.js';

const imageResult = {
  source: 'image', mocked: false, raw: {
    tokens: {
      colors: [{ hex: '#022d2c', role: 'primary button', confidence: 'high' }],
      typography: [{ size: 32, weight: 700, role: 'headline', confidence: 'high' }],
      spacing: [], border_radius: [], shadows: [],
    },
  },
};
const mockResult = { source: 'url', mocked: true, raw: null };

describe('buildExports', () => {
  it('returns the three format strings for a real image import', () => {
    const out = buildExports(imageResult);
    expect(Object.keys(out)).toEqual(['css', 'tailwind', 'json']);
    expect(out.css).toContain('--color-primary-button: #022d2c;');
    expect(out.tailwind).toContain("'primary-button': 'var(--color-primary-button)'");
    expect(JSON.parse(out.json).color['primary-button'].$value).toBe('#022d2c');
  });

  it('returns null for a mock import with no token detail', () => {
    expect(buildExports(mockResult)).toBeNull();
  });

  it('returns null when there are no tokens at all', () => {
    expect(buildExports({ raw: { tokens: {} } })).toBeNull();
    expect(buildExports(null)).toBeNull();
  });

  it('exposes a stable format registry', () => {
    expect(EXPORT_FORMATS.map(f => f.id)).toEqual(['css', 'tailwind', 'json']);
    expect(EXPORT_FORMATS.find(f => f.id === 'json').filename).toBe('tokens.json');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- "emit/index"`
Expected: FAIL — cannot resolve `./index.js`.

- [ ] **Step 3: Write minimal implementation**

```js
// web/src/lib/emit/index.js
import { normalizeTokens } from './normalizeTokens.js';
import { emitCss } from './emitCss.js';
import { emitTailwind } from './emitTailwind.js';
import { emitTokensJson } from './emitTokensJson.js';

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

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- "emit/index"`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
cd "/Volumes/4TB Shield/Vibe Coding Bootcamp/Projekte/Designbridge"
find . -name '._*' -delete
git add web/src/lib/emit/index.js web/src/lib/emit/index.test.js
git commit -m "feat(emit): add buildExports orchestrator and format registry"
```

---

### Task 7: `Export.jsx` page — format chooser, preview, copy/download

**Files:**
- Create: `web/src/pages/Export.jsx`
- Test: `web/src/pages/Export.test.jsx`

- [ ] **Step 1: Write the failing test**

```jsx
// web/src/pages/Export.test.jsx
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import Export from './Export.jsx';

const imageResult = {
  source: 'image', mocked: false, raw: {
    tokens: {
      colors: [{ hex: '#022d2c', role: 'primary button', confidence: 'high' }],
      typography: [], spacing: [], border_radius: [], shadows: [],
    },
  },
};
const mockResult = { source: 'url', mocked: true, raw: null };

describe('Export page', () => {
  it('shows an empty notice when there is no token detail', () => {
    render(<Export result={mockResult} />);
    expect(screen.getByText(/importiere ein bild/i)).toBeInTheDocument();
  });

  it('renders the three format options and the CSS preview by default', () => {
    render(<Export result={imageResult} />);
    expect(screen.getByRole('button', { name: 'CSS-Variablen' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Tailwind-Config' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'tokens.json' })).toBeInTheDocument();
    expect(screen.getByTestId('export-preview').textContent).toContain('--color-primary-button: #022d2c;');
  });

  it('switches the preview when another format is picked', async () => {
    const user = userEvent.setup();
    render(<Export result={imageResult} />);
    await user.click(screen.getByRole('button', { name: 'tokens.json' }));
    expect(screen.getByTestId('export-preview').textContent).toContain('"$value": "#022d2c"');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- "pages/Export"`
Expected: FAIL — cannot resolve `./Export.jsx`.

- [ ] **Step 3: Write minimal implementation**

```jsx
// web/src/pages/Export.jsx
import React, { useMemo, useState } from 'react';
import { buildExports, EXPORT_FORMATS } from '../lib/emit/index.js';

function downloadFile(filename, content, mime) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export default function Export({ result }) {
  const exports = useMemo(() => buildExports(result), [result]);
  const [activeId, setActiveId] = useState('css');
  const [copied, setCopied] = useState(null); // 'ok' | 'fail' | null

  if (!exports) {
    return (
      <div className="text-sm text-zinc-500">
        Importiere ein Bild, um Tokens zu exportieren. Preview-Importe (URL/Repo) enthalten keine Detaildaten.
      </div>
    );
  }

  const current = EXPORT_FORMATS.find(f => f.id === activeId);
  const code = exports[activeId];

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied('ok');
    } catch {
      setCopied('fail');
    }
    setTimeout(() => setCopied(null), 1500);
  };

  const handleDownloadAll = () => {
    EXPORT_FORMATS.forEach(f => downloadFile(f.filename, exports[f.id], f.mime));
  };

  return (
    <div className="flex gap-6 max-w-5xl">
      <aside className="w-48 flex-shrink-0">
        <div className="text-xs font-semibold uppercase tracking-wider text-zinc-400 mb-3">Format</div>
        <div className="flex flex-col gap-0.5">
          {EXPORT_FORMATS.map(f => (
            <button
              key={f.id}
              onClick={() => setActiveId(f.id)}
              className={`px-2 py-1.5 rounded text-sm text-left transition-colors ${
                activeId === f.id
                  ? 'bg-zinc-100 text-zinc-900 font-medium'
                  : 'text-zinc-500 hover:bg-zinc-100 hover:text-zinc-900'
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
        <button
          onClick={handleDownloadAll}
          className="mt-4 w-full text-xs px-2.5 py-1.5 rounded border border-zinc-200 text-zinc-700 hover:bg-zinc-50 transition-colors"
        >
          Alle herunterladen
        </button>
      </aside>

      <section className="flex-1 min-w-0">
        <div className="flex items-center justify-between mb-3">
          <span className="text-xs font-mono text-zinc-500">{current.filename}</span>
          <div className="flex items-center gap-2">
            {copied === 'ok' && <span className="text-[10px] text-emerald-600">kopiert</span>}
            {copied === 'fail' && <span className="text-[10px] text-red-600">nicht verfügbar</span>}
            <button
              onClick={handleCopy}
              className="text-xs px-2.5 py-1 rounded border border-zinc-200 text-zinc-700 hover:bg-zinc-50 transition-colors"
            >
              Kopieren
            </button>
            <button
              onClick={() => downloadFile(current.filename, code, current.mime)}
              className="text-xs px-2.5 py-1 rounded bg-zinc-900 text-white font-medium hover:bg-zinc-700 transition-colors"
            >
              Herunterladen
            </button>
          </div>
        </div>
        <pre
          data-testid="export-preview"
          className="text-xs font-mono bg-zinc-50 border border-zinc-200 rounded p-4 overflow-auto max-h-[70vh] whitespace-pre"
        >
          {code}
        </pre>
      </section>
    </div>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- "pages/Export"`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
cd "/Volumes/4TB Shield/Vibe Coding Bootcamp/Projekte/Designbridge"
find . -name '._*' -delete
git add web/src/pages/Export.jsx web/src/pages/Export.test.jsx
git commit -m "feat(web): add Export page with format chooser, preview and download"
```

---

### Task 8: Wire the Export tab into `App.jsx`

**Files:**
- Modify: `web/src/App.jsx` (import on line 8 area; `NAV` on line 11; sidebar list on line 85; `renderPage` switch on lines 40-47)

- [ ] **Step 1: Add the import**

After the `import Patterns` line (currently line 7), add:

```jsx
import Patterns from './pages/Patterns.jsx';
import Export from './pages/Export.jsx';
```

- [ ] **Step 2: Add `Export` to the top nav array**

Change line 11 from:

```jsx
const NAV = ['Dashboard', 'Tokens', 'Atomics', 'Components', 'Patterns'];
```

to:

```jsx
const NAV = ['Dashboard', 'Tokens', 'Atomics', 'Components', 'Patterns', 'Export'];
```

- [ ] **Step 3: Add `Export` to the sidebar Library list**

Change the sidebar list (currently line 85) from:

```jsx
{['Tokens', 'Atomics', 'Components', 'Patterns'].map((label) => (
```

to:

```jsx
{['Tokens', 'Atomics', 'Components', 'Patterns', 'Export'].map((label) => (
```

- [ ] **Step 4: Add the route in `renderPage`**

In the `switch (page)` block, add a case alongside the others (before `case 'Dashboard'`):

```jsx
      case 'Patterns': return <Patterns result={lastImport} />;
      case 'Export': return <Export result={lastImport} />;
```

- [ ] **Step 5: Run the full test suite**

Run: `npm test`
Expected: PASS — all existing tests plus the new emit/Export tests green (no regressions).

- [ ] **Step 6: Verify the production build**

Run: `npm run build`
Expected: `vite build` completes with no errors.

- [ ] **Step 7: Manual smoke check (preview tools)**

Start the dev server, import an image (or load with an existing `localStorage["designbridge.lastImport"]`), click the **Export** tab. Confirm:
- Three format buttons; CSS preview shows by default with `--color-…` lines.
- Switching to Tailwind / tokens.json updates the preview.
- **Kopieren** shows the "kopiert" hint; **Herunterladen** saves the current file; **Alle herunterladen** saves three files.
- With a fresh state (no import), the Export tab shows the empty notice.

- [ ] **Step 8: Commit**

```bash
cd "/Volumes/4TB Shield/Vibe Coding Bootcamp/Projekte/Designbridge"
find . -name '._*' -delete
git add web/src/App.jsx
git commit -m "feat(web): wire Export tab into nav and routing"
```

---

## Final verification

- [ ] Run `npm test` from `web/` — entire suite green.
- [ ] Run `npm run build` from `web/` — clean build.
- [ ] Manual: Export tab works end-to-end for an image import; empty state for mock/no import.

## Notes for the implementer
- **DRY:** every format is derived from the one canonical list; never re-parse `raw.tokens` inside an emitter.
- **YAGNI:** no rename UI, no token curation, no `.zip`, no extra formats — those are explicit follow-ups in the spec.
- **Confidence:** only `'low'` is flagged. `'med'`/`'medium'`/`'high'` emit clean. This matches the mixed confidence strings the scan actually returns.
- **Style:** match the zinc/white classes already used in `App.jsx` and `Tokens.jsx`. No new design system, no new dependencies.
