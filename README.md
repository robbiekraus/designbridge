# Designbridge

> Sync design systems between Figma and code — automatically.

An open-source CLI + local web app that extracts design tokens, atomic components, and patterns from screenshots, URLs, and code repositories — and keeps Figma and your codebase in sync.

---

## Quick start

### 1. Prerequisites

- Node.js 18+
- An [Anthropic API key](https://console.anthropic.com)

### 2. Install

```bash
# Install server dependencies
npm install

# Install frontend dependencies
cd web && npm install && cd ..
```

### 3. Configure

```bash
cp .env.example .env
```

Edit `.env` and add your Anthropic API key:

```
ANTHROPIC_API_KEY=sk-ant-your-key-here
```

### 4. Run

```bash
npm run dev
```

This starts:
- **Server** on `http://localhost:3047`
- **Frontend** on `http://localhost:5173` ← open this in your browser

---

## What works now (MVP)

### Source Scanner — Image tab
Upload any UI screenshot → Claude Vision extracts:

- **Color palette** — all distinct colors with semantic roles
- **Typography scale** — font sizes, weights, and usage context
- **Spacing scale** — padding/gap values snapped to 4px grid
- **Border radius** — corner radius values per element type
- **Shadows** — elevation levels as CSS box-shadow values
- **UI Inventory** — atomics, components, and layout patterns detected

Results include confidence scores (high / medium / low) and export as JSON.

---

## Coming next

- [ ] Diff view — compare scan results against existing Figma tokens
- [ ] Figma push — write extracted tokens directly into Figma variables
- [ ] URL scanning — extract tokens from any live website
- [ ] Repo scanning — read token files and Storybook stories from a GitHub repo
- [ ] Token mapping — match extracted tokens to existing shadcn/Tailwind variables

---

## Project structure

```
designbridge/
├── server/
│   ├── index.js          # Express server (port 3047)
│   ├── routes/scan.js    # POST /api/scan/image
│   └── lib/claude.js     # Anthropic Claude Vision wrapper
└── web/
    └── src/
        ├── App.jsx
        └── pages/SourceScanner.jsx
```

---

## Tech stack

| Layer | Technology |
|---|---|
| Server | Node.js + Express |
| AI | Anthropic Claude (claude-sonnet-4-5) |
| File upload | Multer |
| Frontend | React + Vite |
| Styling | Tailwind CSS |
| Components | shadcn/ui (planned) |

---

## License

MIT
