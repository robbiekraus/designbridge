# Designbridge — Agent Instructions

Read this file before touching anything in this repo. It is the source of truth for project context and how to work in here.

## What this project is

Designbridge extracts design tokens, atomic components, and patterns from screenshots, URLs, and code — keeps Figma and codebases in sync. Open-source CLI + local web app.

- **`web/`** — Vite + React + Tailwind app. **This is the production UI.** Backed by the Express server in `server/`.
- **`server/`** — Express on `:3047`. Wraps Anthropic Claude Vision. Current real endpoint: `POST /api/scan/image`.
- **`designbridge-plugin/`** — Figma plugin. Separate codebase, separate concern. Touch only when the task says so.
- **`designbridge-dev/`** — Next.js sandbox for design-system preview. Not production. Do not migrate things into it unless explicitly asked.

## Local paths (Rob's Mac)

- **Bootcamp working directory:** `/Volumes/4TB Shield/Vibe Coding Bootcamp` — Rob's standard directory for all Vibe Coding Bootcamp work. This repo lives locally at `/Volumes/4TB Shield/Vibe Coding Bootcamp/Projekte/Designbridge`. These paths only exist on Rob's Mac, not in remote/cloud sessions.

## Hard rules

1. **Never start design work without a briefing or references.** If the user says "design X", ask for direction or references first. This is a standing user preference.
2. **All new UI work goes into `web/`** unless the user names a different target. Do not silently scaffold in `designbridge-dev/`.
3. **Follow the existing visual style** in `web/src/App.jsx` — zinc/white Tailwind look, small text, tight spacing. No new design system.
4. **Existing endpoints and component patterns first.** Read `server/routes/scan.js` and `web/src/pages/SourceScanner.jsx` before proposing new shapes.
5. **No destructive git actions** (force push, hard reset, branch delete) without explicit OK. Same for deleting files outside the current task scope.
6. **Do not run `npm install` of unfamiliar packages** without saying what and why. Prefer what is already in `package.json`.
7. **AppleDouble files (`._*`) on this volume confuse tooling.** When writing files into directories that get served (e.g. brainstorm screen dirs), clean them with `find . -name '._*' -delete` after every write.

## Working style the user expects

- **Analyze every task and pick the model deliberately.** Before starting a task (or dispatching subagents), assess its complexity and choose the model tier accordingly — and **always tell Rob which model you'll use and why** (one short line, e.g. "Implementer läuft auf Sonnet — mechanischer Task mit fertigem Spec-Code"). Rule of thumb: mechanical/well-specified implementation & reviews → Sonnet; architecture, design decisions, tricky debugging, final reviews → Opus/Fable; trivial lookups → Haiku.
- **One question at a time** during exploration. Multiple choice when possible.
- **Visual mockups in the brainstorm browser companion** for any UI question. Text-only design descriptions do not work for this user.
- **Plan first, implement second.** Spec under `docs/superpowers/specs/`, plan under `docs/superpowers/plans/`, then code.
- **Small, verifiable steps.** Each implementation step ends with something the user can see or run.
- German UI copy stays German if the existing UI is German; otherwise English. Default code identifiers are English.

## Active specs

- [docs/superpowers/specs/2026-06-11-import-modal-design.md](docs/superpowers/specs/2026-06-11-import-modal-design.md) — Initial Import Modal (Image / URL / Repo / Figma)
- [docs/superpowers/specs/2026-07-23-design-system-grounded-interpretation-architecture.md](docs/superpowers/specs/2026-07-23-design-system-grounded-interpretation-architecture.md) — Interpretation gegen ein Design System groundnen (Katalog als Vokabular; Figma↔Repo-Verbindung). Richtungsdokument.
- [docs/superpowers/specs/2026-07-23-slice1-ds-grounding-default-catalog-design.md](docs/superpowers/specs/2026-07-23-slice1-ds-grounding-default-catalog-design.md) — Scheibe 1 (Grounding gegen shadcn/Tailwind-Default-Katalog). **KOMPLETT** 23.07.

## Current goal

Build the Initial Import Modal per the spec above:
- Replaces `web/src/pages/SourceScanner.jsx`.
- Removes the `Source Scanner` nav entry from `web/src/App.jsx`.
- Image tab is functional via the existing `/api/scan/image` endpoint.
- URL / Repo tabs render real form UI but submit to local mocks (clearly badged `PREVIEW`).
- Figma tab is disabled with a "via plugin flow" hint.
- Modal auto-opens on first load (empty state), otherwise via a `New Import` button in the topbar.
- Success state shows extracted categories with counts and confidence — Colors, Typography, Spacing, Border radius, Shadows, UI inventory.

## Out of scope right now

Library / Dashboard page, real URL/Repo/Figma backends, Figma diff/push, token-to-Tailwind mapping, multi-import history. These are follow-ups.

## File layout reference

```
Designbridge/
├── CLAUDE.md                        # this file
├── README.md                        # user-facing
├── docs/
│   └── superpowers/
│       ├── specs/                   # design specs (per topic, dated)
│       └── plans/                   # implementation plans (per topic, dated)
├── server/                          # Express backend (port 3047)
├── web/                             # Vite + React frontend (port 5173) — production UI
├── designbridge-plugin/             # Figma plugin (separate concern)
├── designbridge-dev/                # Next.js sandbox (not production)
└── .superpowers/                    # brainstorm sessions, mockups — gitignored
```
