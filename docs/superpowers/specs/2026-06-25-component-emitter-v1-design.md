# Component Emitter v1 (Phase 3) — Design

**Date:** 2026-06-25
**Status:** Proposed — awaiting review
**Phase:** Roadmap Phase 3 ("Weg 2", der strategische Kern)
**Builds on:** Phase 2 Code Emitter v1 (`web/src/lib/emit/`), Library scaffold (Phase 1)

## Goal

Turn recognized UI objects (atomics, components, patterns) into reusable shadcn/Tailwind
code, shown next to a preview, exportable per object and as a whole-library bundle.

This is the first step of Phase 3. v1 covers a fixed set of known atomic templates
(Button, Card, Badge, Input) with a real rendered preview, plus a generic code stub for
everything else.

## Decided shape — two surfaces

Confirmed with Rob 2026-06-25 (chose "Zwei Flächen"):

1. **Inspect** — the Atomics / Components / Patterns pages become an **accordion list**.
   Expanding a row reveals: a preview, the generated code, and **per-object export**
   (Kopieren / `<Name>.jsx` herunterladen).
2. **Bundle** — the existing **Export tab** keeps its token export and gains
   **"Ganze Library exportieren"** → one download containing tokens + all components.
   A shortcut button in each content page's header links to it.

## Data reality (drives the whole design)

The image scan (`server/lib/claude.js`) returns recognized objects as **text only**:
`{ name, variants[], confidence, notes }` — no props, no structure, no pixels. (Tokens, by
contrast, come back rich.) url/repo imports are mocks with `raw: null`.

Consequences:
- We cannot render the *user's actual* component — we don't have its markup. We render
  **our own template** for that object type, themed with the **extracted tokens**. The
  preview answers "what does a Button look like in *your* design system", not "here is your
  exact button".
- A faithful preview is only possible for object types we own a template for. Everything
  else gets a code stub + `PreviewPlaceholder` (no fake render).

## Architecture

### Template registry (`web/src/lib/components/templates/`)

A small registry mapping a canonical key → `{ match, variants, emit, Preview }`:

- `match(name)` — fuzzy name match (lowercased, stripped) so "btn" / "primary button" /
  "Button" all resolve to the `button` template. Returns a boolean.
- `variants` — the variant names the template knows (e.g. `['primary','secondary','ghost']`).
- `emit(tokens, item)` — pure function returning the component's `.jsx` source string,
  with extracted tokens woven into the Tailwind classes (reuses `normalizeTokens` output).
- `Preview` — a real React component rendering the template's variants, styled from tokens.

v1 templates: `button`, `card`, `badge`, `input`. Adding a template later = one new file.

### Component emitter (`web/src/lib/emit/emitComponents.js`)

`emitComponents(result)` walks `result.raw.{atomics,components,patterns}`, resolves each
item against the registry, and returns a normalized list:

```
{ name, slug, filename, kind: 'atomic'|'component'|'pattern',
  templateKey | null, code, confidence, hasPreview }
```

- Matched → `code` from `template.emit(...)`, `hasPreview: true`.
- Unmatched → `code` = generic stub skeleton (named function, token-aware className
  placeholder, `// TODO` for structure), `hasPreview: false`.
- `slug`/`filename` via existing `slugify` (`Button` → `Button.jsx`).

This mirrors the Phase 2 split: a pure normalizer feeds pure emitters; UI stays thin.

### Shared accordion (`web/src/components/library/LibraryObjectList.jsx`)

One component used by all three content pages. Props: the emitted-component slice for that
page. Renders an accordion; each row:
- collapsed: name, `ConfidencePill` (reuse), generic-stub pill if `!hasPreview`, filename chip.
- expanded: `Preview` (or `PreviewPlaceholder`), code `<pre>` (reuse Export's styling),
  action row with Kopieren + Herunterladen (reuse Export's `downloadFile` + copy logic).

`Atomics.jsx` / `Components.jsx` / `Patterns.jsx` each become a thin wrapper that passes
its slice to `LibraryObjectList`. Today's `InventoryCard` grid is replaced by the accordion.

### Export tab additions (`web/src/pages/Export.jsx`)

- Keep the three token formats untouched.
- Add **"Ganze Library exportieren"** that bundles tokens (css/tailwind/json) + every
  emitted component file.
- **Open decision — bundle mechanism:**
  - *Recommended for v1:* reuse the existing "Alle herunterladen" pattern (loop
    `downloadFile` over all files). **No new dependency.** Downside: many browser downloads.
  - *Alternative:* a real `.zip` via `jszip` — cleaner UX but adds a dependency
    (CLAUDE.md rule 6 → needs explicit OK). Defer to v2 unless Rob wants the zip now.

## Confidence & generic handling

- Low-confidence objects: `ConfidencePill` in the row header + a `// unsicher erkannt —
  bitte prüfen` comment at the top of the emitted code (consistent with Phase 2 token export).
- No-template objects: `generischer Stub · keine Vorschau` pill, `PreviewPlaceholder`
  instead of a render, code = generic skeleton.

## Scope

**v1 (this spec):**
- Template registry with button / card / badge / input.
- `emitComponents` + generic stub fallback.
- `LibraryObjectList` accordion on Atomics / Components / Patterns.
- Per-object Kopieren / Herunterladen.
- "Ganze Library exportieren" in Export tab (multi-file download, no new dep).
- Confidence + generic pills/comments.
- Output format: shadcn-style **`.jsx`** only.

**Later (v2+, explicitly out of scope now):**
- Variant switcher in the preview (click through primary/secondary/ghost).
- Multi-select export via checkboxes ("export selected").
- TSX / plain-HTML output formats.
- Real `.zip` bundle.
- Live preview for patterns / non-template components.
- More templates beyond the initial four.

## Testing

Follow the Phase 2 pattern (Vitest, co-located `*.test.*`):
- `emitComponents.test.js` — matched vs unmatched, slug/filename, low-confidence comment.
- Per-template `emit` snapshot-ish assertions (token values appear in classes).
- `templates/registry.test.js` — `match()` fuzzy cases.
- `LibraryObjectList.test.jsx` — expand reveals preview+code+actions; generic item shows
  placeholder; copy/download wired.
- Export tab test extended for the library-bundle action.

## Files

```
web/src/lib/components/templates/
  registry.js            # match + lookup
  button.js card.js badge.js input.js
  Previews.jsx           # the four <Preview> components
web/src/lib/emit/
  emitComponents.js      # NEW — normalized emitted-component list + generic stub
  index.js               # export emitComponents + library-bundle helper
web/src/components/library/
  LibraryObjectList.jsx  # NEW — shared accordion
web/src/pages/
  Atomics.jsx Components.jsx Patterns.jsx   # thin wrappers over LibraryObjectList
  Export.jsx             # + "Ganze Library exportieren"
```

## Open decisions for review

1. **Bundle mechanism** — multi-file download (no dep, recommended for v1) vs. `.zip`
   via jszip (needs dependency OK). Default: multi-file.
2. **Output format** — `.jsx` only for v1 (TSX later)? Default: yes.
3. Anything in "Later" you'd want pulled into v1?
