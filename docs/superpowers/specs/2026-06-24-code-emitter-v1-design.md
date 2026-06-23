# Code Emitter v1 — Design Spec

**Date:** 2026-06-24
**Status:** Draft, awaiting user review
**Project:** Designbridge (`web/`)
**Owner:** Robert Kraus
**Roadmap:** Phase 2 of the Designbridge phased roadmap (see memory `project-designbridge-roadmap`). Phase 1 (Library scaffold) is on `main`.

## Purpose

Turn the design tokens extracted by an import into ready-to-use developer files. After importing, the user opens a new **Export** tab in the Library, picks a format, sees a live preview of the generated code, and copies it or downloads it. This is the first half of the bidirectional bridge: canonical model → code.

The hard part is not the file formats — it is bridging the gap between the **scan's free-text token notes** (`role: "primary button background"`) and the **stable, machine-usable token names** that code needs (`--color-button-primary`). That bridge (normalization) is solved once; three thin emitters then derive the three formats from the single normalized set.

## Scope

### In scope (v1)
- New **Export** entry in the Library navigation in `web/src/App.jsx`, routed to a new `web/src/pages/Export.jsx`.
- Three target formats, generated from the current import's tokens:
  - **CSS custom properties** → `tokens.css`
  - **Tailwind config fragment** → `tailwind.config.tokens.js` (maps token names to `var(--…)` references, matching the prior-art style in `exports/`)
  - **Design tokens JSON** → `tokens.json` (W3C DTCG-style `$value`/`$type`, matching the existing `exports/tokens.json` sample)
- A **normalization layer** that converts the raw scan token arrays into one canonical, named, collision-free token set. Solved once, consumed by all emitters.
- Token categories emitted: **colors, typography, spacing, border radius, shadows** (the five rich token types the image scan returns).
- **Export tab UI:** left = format chooser (three options, one active); right = read-only live preview (monospace, scrollable) of the selected format; top-right = **Kopieren** (clipboard) and **Herunterladen** (single file) plus **Alle herunterladen** (all three files, sequential downloads — no archive dependency).
- **Confidence flagging (decision B — export everything, flag the uncertain):**
  - Only `confidence: "low"` tokens are flagged. `high` and `med` are emitted clean.
  - CSS and Tailwind: a trailing comment on the token's line — `/* unsicher erkannt — bitte prüfen */`.
  - JSON (no comments allowed): a sibling field `"confidence": "low"` on the flagged token object.
- **Empty / no-detail state:** if there is no import, or the import is a mock with `raw: null` (URL/Repo preview imports carry no token detail), the tab shows a calm empty state — "Importiere ein Bild, um Tokens zu exportieren." — exactly as `Tokens.jsx` already does. No emitters run.
- Visual style strictly follows the existing zinc/white Tailwind look in `web/src/App.jsx`. No new design system.
- Unit tests (Vitest) for the normalizer and each emitter, plus a render test for the empty state.

### Out of scope (v1)
- Components / atomics / patterns emission — these are text-only from the scan, no code can be built from them yet. That is **Phase 3** (Code emitter v2).
- Editing or renaming tokens in the UI; selecting/deselecting individual tokens.
- Persisting export settings or chosen format across reloads.
- A real `.zip` archive for "Alle herunterladen" (would need a new dependency; sequential downloads instead).
- Additional formats (SCSS, JS object, Style Dictionary) — cheap to add later via one more emitter, but not in v1.
- Any Figma-direction emission (that is Phase 5).

## The canonical token model (output of normalization)

The image scan returns (`localStorage["designbridge.lastImport"].raw.tokens`):

```
colors:        [{ hex, role, confidence }]
typography:    [{ size, weight, role, sample, confidence }]
spacing:       [{ value, usage, confidence }]
border_radius: [{ value, usage, confidence }]
shadows:       [{ css, description, confidence }]
```

`normalizeTokens(rawTokens)` converts this into a flat, ordered list of canonical tokens:

```
{
  group:      'color' | 'font' | 'spacing' | 'radius' | 'shadow',
  name:       string,        // slug, unique within its group
  value:      string,        // resolved scalar, ready to emit (see per-type rules)
  confidence: 'high' | 'med' | 'low' | null,
  source:     object         // the original scan entry, for traceability
}
```

Typography is a **compound**: each typography entry yields one canonical token whose `value` is an object `{ fontSize, fontWeight }` (the emitters expand it per format). All other types are scalar.

### Naming rules
- `slugify(text)`: lowercase; trim; replace any run of non-alphanumeric characters with a single `-`; strip leading/trailing `-`. Works the same for German or English source text.
- Source of the human label: `role` (colors, typography) or `usage` (spacing, radius) or `description` (shadows).
- **Empty / unusable label** → fallback name `<group>-<n>` using 1-based order within the group: `color-1`, `font-1`, `spacing-1`, `radius-1`, `shadow-1`.
- **Collision within a group** → append `-2`, `-3`, … in order of appearance. The first occurrence keeps the bare name.

### Per-type value rules
- **color:** `value` = `hex` as-is (e.g. `#022d2c`).
- **typography:** `value` = `{ fontSize: "<size>px", fontWeight: "<weight>" }`. `size` is numeric → append `px`. `weight` emitted as a string number.
- **spacing:** numeric `value` → `"<value>px"`; if already a string with a unit, pass through.
- **radius:** pass through as given (`"8px"`, `"50%"`, numeric → `"<n>px"`).
- **shadow:** `value` = `css` string as-is (already valid CSS, e.g. `0 1px 3px rgba(0,0,0,.1)`).

## Emitter outputs

Given the canonical list, each emitter is a pure function `(tokens) => string`.

### CSS — `tokens.css`
```css
/* Auto-generated by DesignBridge — do not edit manually */
:root {
  /* colors */
  --color-button-primary: #022d2c;
  --color-text-secondary: #706a6a; /* unsicher erkannt — bitte prüfen */

  /* typography */
  --font-headline-size: 32px;
  --font-headline-weight: 700;

  /* spacing */
  --spacing-gutter: 16px;

  /* radius */
  --radius-card: 8px;

  /* shadows */
  --shadow-card: 0 1px 3px rgba(0,0,0,.1);
}
```
CSS var naming: `--<group>-<name>`. Typography expands to `--font-<name>-size` and `--font-<name>-weight`. Grouped by category with a comment header per group.

### Tailwind — `tailwind.config.tokens.js`
References the CSS vars (so the two formats stay in sync), matching `exports/tailwind.config.tokens.js`:
```js
// DesignBridge — generated Tailwind tokens
// Usage: import tokens from './tokens/tailwind.config.tokens.js'
//        export default { theme: { extend: tokens } }
module.exports = {
  colors: {
    'button-primary': 'var(--color-button-primary)',
    'text-secondary': 'var(--color-text-secondary)', // unsicher erkannt — bitte prüfen
  },
  fontSize: { 'headline': 'var(--font-headline-size)' },
  fontWeight: { 'headline': 'var(--font-headline-weight)' },
  spacing: { 'gutter': 'var(--spacing-gutter)' },
  borderRadius: { 'card': 'var(--radius-card)' },
  boxShadow: { 'card': 'var(--shadow-card)' },
};
```
Empty categories are omitted.

### Tokens JSON — `tokens.json` (DTCG style)
```json
{
  "color": {
    "button-primary": { "$value": "#022d2c", "$type": "color" },
    "text-secondary": { "$value": "#706a6a", "$type": "color", "confidence": "low" }
  },
  "typography": {
    "headline": { "$value": { "fontSize": "32px", "fontWeight": "700" }, "$type": "typography" }
  },
  "spacing":  { "gutter": { "$value": "16px", "$type": "dimension" } },
  "radius":   { "card":   { "$value": "8px",  "$type": "dimension" } },
  "shadow":   { "card":   { "$value": "0 1px 3px rgba(0,0,0,.1)", "$type": "shadow" } }
}
```
The `confidence` field appears only on `low` tokens. (Non-standard but pragmatic; keeps the file valid JSON, where a comment would not be.)

## Architecture

```
web/src/
├── App.jsx                          # add "Export" nav entry + route to <Export/>
├── lib/
│   └── emit/
│       ├── normalizeTokens.js       # raw.tokens → canonical token list  (the hard part)
│       ├── slugify.js               # shared naming helper
│       ├── emitCss.js               # canonical → tokens.css string
│       ├── emitTailwind.js          # canonical → tailwind.config.tokens.js string
│       ├── emitTokensJson.js        # canonical → tokens.json string
│       └── index.js                 # buildExports(result) → { css, tailwind, json } + filenames
└── pages/
    └── Export.jsx                   # the Export tab: format chooser + preview + copy/download
```

Small presentational helpers (a copy button, a download button) may live inline in `Export.jsx` or under `components/library/` following the existing pattern — the implementation plan decides. Downloads use a Blob + temporary `<a download>`; copy uses `navigator.clipboard.writeText`.

## Data flow

1. `Export.jsx` reads the current import `result` (same source the Library already uses).
2. If `result?.raw?.tokens` is missing → render empty state, stop.
3. `buildExports(result)` runs `normalizeTokens` once, then the three emitters; returns the three code strings + their filenames.
4. User picks a format → preview shows that string. **Kopieren** copies it; **Herunterladen** saves that one file; **Alle herunterladen** saves all three in sequence.

## Error / edge handling
- No import, or `raw: null` (mock import) → empty state, no emitters run.
- A token category present but empty → that section/category is omitted from every format (no empty `:root` groups, no empty Tailwind keys).
- `confidence` missing on a token → treated as not-low (emitted clean).
- Clipboard API unavailable → the **Kopieren** button shows a brief "nicht verfügbar" state; download still works.
- Slug that collapses to empty after stripping → falls back to `<group>-<n>`.

## Testing
- `slugify`: spaces, casing, German umlauts/punctuation, empty input.
- `normalizeTokens`: collision suffixing, empty-label fallback, typography compound shape, per-type value formatting, confidence pass-through, empty categories.
- `emitCss` / `emitTailwind` / `emitTokensJson`: snapshot of output for a representative fixture incl. one `low`-confidence token; empty-category omission; valid JSON parse for the JSON emitter.
- `Export.jsx`: renders empty state when no `raw`; renders a preview and the three format options when tokens exist.

## Out-of-scope follow-ups (noted, not built)
- Rename tokens / curate selection in the UI before export.
- Real `.zip` for "Alle herunterladen".
- More formats (SCSS, JS object, Style Dictionary) via additional emitters.
- Wiring the same emitters into a CLI export.
