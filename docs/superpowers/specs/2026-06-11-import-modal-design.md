# Initial Import Modal — Design Spec

**Date:** 2026-06-11
**Status:** Draft, awaiting user review
**Project:** Designbridge (`web/`)
**Owner:** Robert Kraus

## Purpose

Create a single entry point for starting a new design-token extraction. The user picks a source (Image, URL, Repo, Figma) inside a modal, submits, and sees what was extracted with counts per category — without leaving the modal.

## Scope

### In scope (v1)
- New `ImportModal` component family in `web/src/components/ImportModal/`.
- Four tabs in fixed order: **Image · URL · Repo · Figma**.
- Image tab is fully functional via the existing `POST /api/scan/image` endpoint.
- URL and Repo tabs render real form UI but submit to a local mock that returns a static `ScanResult` after ~1.5 s; tabs are marked with a `PREVIEW` badge so users know the backend is mocked.
- Figma tab is disabled with a short "coming via plugin flow" hint.
- Auto-open on first app load when nothing has been imported yet (tracked via `localStorage.designbridge.hasImported`).
- Manual re-open via a `New Import` button in the topbar.
- Three-stage modal body: `form` → `progress` → `success`. Modal does not close until the user clicks.
- Success state lists one row per extraction category with count and confidence: Colors, Typography, Spacing, Border radius, Shadows, UI inventory.
- The Image tab replaces the current `SourceScanner.jsx` page content. `SourceScanner.jsx` is deleted.
- The `Source Scanner` entry is removed from both the topbar nav (`NAV` array in `App.jsx`) and the sidebar `Library` block if present. The modal is the only way to start an import.
- Visual style strictly follows the existing zinc/white Tailwind look in `web/src/App.jsx`. No new design system.

### Out of scope (v1)
- Real backend for URL / Repo / Figma imports.
- Library / Dashboard page.
- Diff view against Figma.
- Token-to-Tailwind/shadcn mapping.
- Persistence beyond a single `localStorage` flag.
- Multi-import history.

## Architecture

```
web/src/
├── App.jsx                          # adds modal state + topbar "New Import" button + auto-open
├── components/
│   └── ImportModal/
│       ├── ImportModal.jsx          # container, orchestrates tab + stage state
│       ├── ImportModalShell.jsx     # presentational layout (overlay, header, tab-bar, footer slot)
│       ├── tabs/
│       │   ├── ImageTab.jsx         # drop zone + file input (functional)
│       │   ├── UrlTab.jsx           # URL input + validation (mocked submit)
│       │   ├── RepoTab.jsx          # GitHub URL + branch (mocked submit)
│       │   └── FigmaTab.jsx         # disabled CTA
│       ├── ImportProgress.jsx       # spinner + status text
│       └── ImportSuccess.jsx        # category list with counts + confidence
├── lib/
│   ├── useImportSession.js          # hook: { stage, result, error, submit, reset }
│   └── importMocks.js               # static ScanResult fixtures for URL/Repo
└── pages/
    └── SourceScanner.jsx            # DELETED — modal replaces it
```

### Component responsibilities
- **`ImportModal`** — owns `activeTab` and `stage`. Receives `open`, `onClose`. Hosts `useImportSession`. Routes submit payloads from tabs to the hook.
- **`ImportModalShell`** — presentational only. Overlay, header ("Start a new import"), tab bar, body slot, footer slot. Reusable for the three stages.
- **Tab components** — each one renders its own form, validates locally, and calls `onSubmit({source, payload})`. They do not know about progress or success.
- **`ImportProgress`** — spinner + status text, footer offers `Cancel`.
- **`ImportSuccess`** — reads the normalized `ScanResult` from the hook, renders the category list, offers `New import` (resets to form) and `Open library` (disabled in v1, tooltip "coming soon").
- **`useImportSession`** — pure client-side state machine: `idle → submitting → success | error`. For the image source it POSTs to `/api/scan/image`; for the other sources it returns a static fixture after a delay.

### Data shape

Normalized `ScanResult` returned by the hook regardless of source:

```ts
type Confidence = 'high' | 'med' | 'low';

interface ScanResult {
  source: 'image' | 'url' | 'repo' | 'figma';
  mocked: boolean;                     // true for URL/Repo/Figma in v1
  categories: Array<{
    key: 'colors' | 'typography' | 'spacing' | 'radius' | 'shadows' | 'inventory';
    label: string;                     // "Colors", "Typography", ...
    count: number;
    confidence: Confidence | null;     // null for inventory
    extra?: Record<string, number>;    // e.g. { atomics, components, patterns } for inventory
  }>;
  raw: unknown;                        // original server payload, for later use
}
```

The image-source adapter translates the existing `/api/scan/image` response into this shape; the mock adapters produce the same shape directly.

## User flow

1. User opens the app for the first time. `App.jsx` checks `localStorage.designbridge.hasImported`. If missing, it sets `modalOpen = true`.
2. Modal renders with Image tab active. User can switch tabs.
3. User completes the form for the active tab and clicks `Import`.
4. `useImportSession.submit` transitions to `submitting`. Modal body swaps to `ImportProgress`.
5. On resolve: stage `success`, modal body swaps to `ImportSuccess`, and `localStorage.designbridge.hasImported = '1'`.
6. User clicks `New import` (back to step 2 with the form reset) or `Close`.

## Error handling

- `/api/health` reports `anthropic_key_configured: false` → modal shows a single warning banner; submit is disabled for the Image tab. The other tabs work because they are mocked.
- Image upload fails (network / 4xx / 5xx) → `stage = error`, body shows the message + `Retry` (re-submits the same payload) + `Cancel`.
- URL / Repo validation fails locally → inline field error; submit button stays disabled.

## Testing approach

Unit-level only for v1, no E2E:
- `useImportSession` state transitions: idle → submitting → success, idle → submitting → error, success → idle on reset.
- Adapter from the `/api/scan/image` response into `ScanResult` — covers each category and the inventory split.
- `ImportSuccess` rendering: one row per category with count and confidence.
- `ImportModal` auto-open behavior driven by `localStorage`.

No backend tests in this spec (image endpoint is unchanged).

## Open questions (for follow-up specs)

- What does `Open library` lead to? Defines the next spec.
- How do we persist multiple imports? Probably IndexedDB or a small server-side store — out of scope here.
- Should URL/Repo/Figma drafts persist if the modal closes? v1 says no; revisit when those become real.
