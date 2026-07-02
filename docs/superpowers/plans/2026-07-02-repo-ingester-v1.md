# Repo-Ingester v1 — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Der Repo-Tab importiert echte öffentliche GitHub-Repos — Tarball-Download, deterministisches Parsen (tailwind.config statisch, CSS via `ingestCss`, shadcn-Inventar aus Dateinamen), optional per Claude vertieft — in derselben Server-Shape wie `/api/scan/url`.

**Architecture:** Quelle und Parser sind getrennt: `parseRepoUrl` → `downloadRepoTarball` (codeload, injizierbares fetch, 50-MB-Kappe) → `extractRepoFiles` (tar → Temp-Dir → Auswahl → Cleanup) liefert eine Dateiliste `[{path, content}]`; der pure Kern `ingestRepoFiles(files)` baut daraus die Server-Shape (Tokens + Inventar). `POST /api/scan/repo` + `POST /api/scan/repo/ai` spiegeln das url/url-ai-Muster; der Client schaltet den Repo-Mock ab und routet „Mit KI vertiefen" nach Quelle.

**Tech Stack:** Node/Express (`server/`, ESM, `node --test`), React/Vite/Tailwind (`web/`, Vitest), `tar` (**neu**), `postcss` + `@anthropic-ai/sdk` + `node-html-parser` (vorhanden).

**Referenz-Spec:** `docs/superpowers/specs/2026-07-02-repo-ingester-v1-design.md`
**ADR:** `docs/superpowers/adr/ADR-001-repo-ingester-quelle.md`

**Baseline vor Task 0:** Server 29/29 (`npm run test:server`), Web 96/96 (`cd web && npx vitest run`).

---

### Task 0: Abhängigkeit `tar` installieren

**Files:**
- Modify: `package.json`, `package-lock.json` (Root)

`tar` (node-tar) ist die **einzige** Neuinstallation dieses Plans (CLAUDE.md Regel 6). Begründung: ausgereift und extrem verbreitet (npm selbst entpackt Pakete damit), reines JavaScript ohne natives Build, eingebauter Schutz gegen Pfad-Traversal. Ohne Dep ginge nur `zlib.gunzip` (built-in) plus **handgerolltem TAR-Format-Parsing** (512-Byte-Header, PAX-Extensions, LongLink) — das ist eine fehleranfällige Neuimplementierung eines gelösten Problems und lohnt sich ausdrücklich **nicht**.

- [ ] **Step 1: Installieren** (im Worktree ausführen!)

Run:
```bash
cd "/Volumes/4TB Shield/Vibe Coding Bootcamp/Projekte/Designbridge/.worktrees/feat-repo-ingester-v1" && npm install tar
```
Expected: `tar` erscheint unter `dependencies` in `package.json`, Exit 0.

- [ ] **Step 2: Import smoke-testen**

Run:
```bash
node -e "import('tar').then(m => console.log(typeof m.x, typeof m.c))"
```
Expected: `function function`

- [ ] **Step 3: Baseline prüfen**

Run: `npm run test:server`
Expected: 29/29 PASS (unverändert).

- [ ] **Step 4: Commit**

```bash
git add package.json package-lock.json
git commit -m "build: add tar for github tarball extraction"
```

---

### Task 1: `parseRepoUrl` — URL-Validierung

**Files:**
- Create: `server/lib/repoUrl.js`
- Test: `server/lib/repoUrl.test.js`

- [ ] **Step 1: Failing tests schreiben**

`server/lib/repoUrl.test.js`:
```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseRepoUrl } from './repoUrl.js';

test('parses a plain github repo url', () => {
  assert.deepEqual(parseRepoUrl('https://github.com/shadcn-ui/ui'), {
    owner: 'shadcn-ui', repo: 'ui', branch: null,
  });
});

test('tolerates .git suffix and trailing slash', () => {
  assert.equal(parseRepoUrl('https://github.com/a/b.git').repo, 'b');
  assert.equal(parseRepoUrl('https://github.com/a/b/').repo, 'b');
});

test('extracts a branch from /tree/, including slashes', () => {
  assert.equal(parseRepoUrl('https://github.com/a/b/tree/main').branch, 'main');
  assert.equal(parseRepoUrl('https://github.com/a/b/tree/feat/x').branch, 'feat/x');
});

test('rejects non-github hosts and incomplete paths', () => {
  assert.throws(() => parseRepoUrl('https://gitlab.com/a/b'), /github\.com/);
  assert.throws(() => parseRepoUrl('https://github.com/only-owner'), /owner und repo/);
  assert.throws(() => parseRepoUrl('kein link'), /Ungültige URL/);
});
```

- [ ] **Step 2: Fehlschlag bestätigen**

Run: `npm run test:server`
Expected: FAIL — Modul existiert nicht.

- [ ] **Step 3: Implementieren**

`server/lib/repoUrl.js`:
```js
const NAME = /^[\w.-]+$/;

export function parseRepoUrl(input) {
  let u;
  try {
    u = new URL(String(input || '').trim());
  } catch {
    throw new Error('Ungültige URL.');
  }
  if (u.hostname !== 'github.com') {
    throw new Error('Nur github.com-URLs werden unterstützt.');
  }
  const parts = u.pathname.split('/').filter(Boolean);
  if (parts.length < 2) {
    throw new Error('URL muss owner und repo enthalten (github.com/owner/repo).');
  }
  const owner = parts[0];
  const repo = parts[1].replace(/\.git$/, '');
  if (!NAME.test(owner) || !NAME.test(repo)) {
    throw new Error('Ungültiger owner-/repo-Name.');
  }
  let branch = null;
  if (parts[2] === 'tree' && parts.length > 3) branch = parts.slice(3).join('/');
  return { owner, repo, branch };
}
```

- [ ] **Step 4: Erfolg bestätigen**

Run: `npm run test:server`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add server/lib/repoUrl.js server/lib/repoUrl.test.js
git commit -m "feat(server): parseRepoUrl validates github repo urls"
```

---

### Task 2: `downloadRepoTarball` — codeload-Download mit Branch-Discovery

**Files:**
- Create: `server/lib/fetchRepoTarball.js`
- Test: `server/lib/fetchRepoTarball.test.js`

- [ ] **Step 1: Failing tests schreiben**

`server/lib/fetchRepoTarball.test.js`:
```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { downloadRepoTarball } from './fetchRepoTarball.js';

const TAR = Buffer.from('fake-tarball');

function fakeFetch(routes) {
  return async (url) => {
    const hit = routes.find((r) => url.includes(r.match));
    if (!hit) return { ok: false, status: 404, headers: { get: () => null } };
    return {
      ok: hit.status ? hit.status < 400 : true,
      status: hit.status ?? 200,
      headers: { get: (h) => (h === 'content-length' ? hit.length ?? null : null) },
      json: async () => hit.json,
      arrayBuffer: async () => (hit.body ?? TAR),
    };
  };
}

test('uses the explicit branch without touching the github api', async () => {
  let apiCalled = false;
  const fetchImpl = async (url) => {
    if (url.includes('api.github.com')) apiCalled = true;
    return fakeFetch([{ match: 'codeload.github.com/a/b/tar.gz/refs/heads/dev' }])(url);
  };
  const out = await downloadRepoTarball({ owner: 'a', repo: 'b', branch: 'dev' }, { fetchImpl });
  assert.equal(out.branch, 'dev');
  assert.ok(Buffer.isBuffer(out.buffer));
  assert.equal(apiCalled, false);
});

test('resolves the default branch via the github api', async () => {
  const fetchImpl = fakeFetch([
    { match: 'api.github.com/repos/a/b', json: { default_branch: 'trunk' } },
    { match: '/tar.gz/refs/heads/trunk' },
  ]);
  const out = await downloadRepoTarball({ owner: 'a', repo: 'b' }, { fetchImpl });
  assert.equal(out.branch, 'trunk');
});

test('falls back to main/master when the api is rate-limited', async () => {
  const fetchImpl = fakeFetch([
    { match: 'api.github.com', status: 403 },
    { match: '/tar.gz/refs/heads/master' },
  ]);
  const out = await downloadRepoTarball({ owner: 'a', repo: 'b' }, { fetchImpl });
  assert.equal(out.branch, 'master');
});

test('reports rate limit when fallbacks also miss', async () => {
  const fetchImpl = fakeFetch([{ match: 'api.github.com', status: 403 }]);
  await assert.rejects(() => downloadRepoTarball({ owner: 'a', repo: 'b' }, { fetchImpl }), /Rate-Limit/);
});

test('404 on the api means repo not found', async () => {
  const fetchImpl = fakeFetch([{ match: 'api.github.com', status: 404 }]);
  await assert.rejects(() => downloadRepoTarball({ owner: 'a', repo: 'b' }, { fetchImpl }), /nicht gefunden/);
});

test('rejects oversized repos via content-length and via buffer size', async () => {
  const big = fakeFetch([{ match: '/tar.gz/', length: String(99 * 1024 * 1024) }]);
  await assert.rejects(
    () => downloadRepoTarball({ owner: 'a', repo: 'b', branch: 'main' }, { fetchImpl: big }),
    /zu groß/
  );
  const sneaky = fakeFetch([{ match: '/tar.gz/', body: Buffer.alloc(64) }]);
  await assert.rejects(
    () => downloadRepoTarball({ owner: 'a', repo: 'b', branch: 'main' }, { fetchImpl: sneaky, maxBytes: 16 }),
    /zu groß/
  );
});
```

- [ ] **Step 2: Fehlschlag bestätigen**

Run: `npm run test:server`
Expected: FAIL — Modul existiert nicht.

- [ ] **Step 3: Implementieren**

`server/lib/fetchRepoTarball.js`:
```js
const API = 'https://api.github.com';
const CODELOAD = 'https://codeload.github.com';
const MAX_BYTES = 50 * 1024 * 1024;

async function fetchWithTimeout(url, fetchImpl, timeoutMs, accept) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    return await fetchImpl(url, {
      signal: ctrl.signal,
      headers: {
        'User-Agent': 'DesignBridge/0.1 (+repo-ingester)',
        ...(accept ? { Accept: accept } : {}),
      },
    });
  } finally {
    clearTimeout(t);
  }
}

// GitHub-API ohne Token: 60 Requests/Stunde. 403/429 → null (Aufrufer probiert main/master).
export async function resolveDefaultBranch(owner, repo, { fetchImpl = fetch, timeoutMs = 10000 } = {}) {
  const res = await fetchWithTimeout(`${API}/repos/${owner}/${repo}`, fetchImpl, timeoutMs, 'application/vnd.github+json');
  if (res.status === 404) throw new Error('Repository nicht gefunden (oder privat).');
  if (res.status === 403 || res.status === 429) return null;
  if (!res.ok) throw new Error(`GitHub-API-Fehler (HTTP ${res.status}).`);
  const data = await res.json();
  return data.default_branch || null;
}

export async function downloadRepoTarball(
  { owner, repo, branch = null },
  { fetchImpl = fetch, timeoutMs = 20000, maxBytes = MAX_BYTES } = {}
) {
  let candidates;
  let rateLimited = false;
  if (branch) {
    candidates = [branch];
  } else {
    const def = await resolveDefaultBranch(owner, repo, { fetchImpl, timeoutMs });
    if (def) candidates = [def];
    else {
      rateLimited = true;
      candidates = ['main', 'master'];
    }
  }

  for (const cand of candidates) {
    const ref = cand.split('/').map(encodeURIComponent).join('/');
    const url = `${CODELOAD}/${owner}/${repo}/tar.gz/refs/heads/${ref}`;
    const res = await fetchWithTimeout(url, fetchImpl, timeoutMs);
    if (res.status === 404) continue;
    if (!res.ok) throw new Error(`Download fehlgeschlagen (HTTP ${res.status}).`);
    const len = Number(res.headers?.get?.('content-length') || 0);
    if (len > maxBytes) throw new Error('Repository ist zu groß (max. 50 MB).');
    const buffer = Buffer.from(await res.arrayBuffer());
    if (buffer.byteLength > maxBytes) throw new Error('Repository ist zu groß (max. 50 MB).');
    return { buffer, branch: cand };
  }

  throw new Error(
    rateLimited
      ? 'GitHub-Rate-Limit erreicht — bitte in ein paar Minuten erneut versuchen oder Branch angeben.'
      : 'Repository oder Branch nicht gefunden (oder privat).'
  );
}
```

- [ ] **Step 4: Erfolg bestätigen**

Run: `npm run test:server`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add server/lib/fetchRepoTarball.js server/lib/fetchRepoTarball.test.js
git commit -m "feat(server): download github tarballs via codeload with branch discovery"
```

---

### Task 3: Fixture-Repo + `extractRepoFiles` (tar → Temp-Dir → Auswahl → Cleanup)

**Files:**
- Create: `server/lib/repoFilePatterns.js`
- Create: `server/lib/extractRepoFiles.js`
- Create: `server/fixtures/repo-fixture/…` (Mini-Repo, siehe unten)
- Test: `server/lib/extractRepoFiles.test.js`

- [ ] **Step 1: Fixture-Repo anlegen**

```bash
cd "/Volumes/4TB Shield/Vibe Coding Bootcamp/Projekte/Designbridge/.worktrees/feat-repo-ingester-v1"
mkdir -p server/fixtures/repo-fixture/{src,components/ui,app/dashboard,node_modules/x,dist}
```

`server/fixtures/repo-fixture/tailwind.config.js`:
```js
const plugin = require('tailwindcss/plugin');

module.exports = {
  content: ['./app/**/*.{js,tsx}'],
  theme: {
    extend: {
      colors: {
        primary: '#022d2c',
        accent: '#f97316',
        blue: { 500: '#3b82f6' },
        border: 'hsl(var(--border))',
      },
      spacing: { sm: '0.5rem', md: '1rem' },
      borderRadius: { card: '12px' },
      boxShadow: { card: '0 1px 3px rgba(0,0,0,.1)' },
      fontSize: { base: '1rem', xl: ['1.25rem', { lineHeight: '1.75rem' }] },
    },
  },
  plugins: [plugin(() => {})],
};
```

`server/fixtures/repo-fixture/src/styles.css`:
```css
:root {
  --color-ink: #111827;
  --space-lg: 24px;
  --radius-pill: 999px;
  --shadow-soft: 0 2px 8px rgba(0, 0, 0, 0.08);
}
.cta { background: #7c3aed; }
```

`server/fixtures/repo-fixture/components/ui/button.tsx`:
```tsx
export function Button() { return <button className="rounded bg-primary">OK</button>; }
```

`server/fixtures/repo-fixture/components/ui/dropdown-menu.tsx`:
```tsx
export function DropdownMenu() { return <div role="menu" />; }
```

`server/fixtures/repo-fixture/components/Header.tsx`:
```tsx
export function Header() { return <header>ACME</header>; }
```

`server/fixtures/repo-fixture/app/page.tsx`:
```tsx
export default function Page() { return <main>Start</main>; }
```

`server/fixtures/repo-fixture/app/dashboard/page.tsx`:
```tsx
export default function Dashboard() { return <main>Dashboard</main>; }
```

`server/fixtures/repo-fixture/app/layout.tsx`:
```tsx
export default function Layout({ children }) { return <body>{children}</body>; }
```

Störer, die die Auswahl ignorieren muss —
`server/fixtures/repo-fixture/node_modules/x/index.js`:
```js
module.exports = {};
```
`server/fixtures/repo-fixture/dist/out.css`:
```css
:root { --color-should-not-appear: #ff0000; }
```

Danach AppleDouble-Reste säubern (CLAUDE.md Regel 7):
```bash
find server/fixtures -name '._*' -delete
```

- [ ] **Step 2: Failing tests schreiben**

`server/lib/extractRepoFiles.test.js`:
```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import os from 'node:os';
import { readdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import * as tar from 'tar';
import { extractRepoFiles, selectRepoFiles } from './extractRepoFiles.js';

const FIXTURE = path.join(path.dirname(fileURLToPath(import.meta.url)), '../fixtures/repo-fixture');

// Round-Trip: Tarball zur Laufzeit mit derselben Lib bauen — kein Netz, kein binäres Fixture.
async function fixtureTarball() {
  const chunks = [];
  // GitHub-Tarballs haben einen Wurzelordner "repo-sha/" → prefix simuliert das (strip:1 muss greifen).
  const stream = tar.c({ gzip: true, cwd: path.dirname(FIXTURE), prefix: 'repo-abc123' }, ['repo-fixture']);
  for await (const chunk of stream) chunks.push(chunk);
  return Buffer.concat(chunks);
}

test('selectRepoFiles picks tailwind config, css, ui components and pages', async () => {
  const files = await selectRepoFiles(FIXTURE);
  const paths = files.map((f) => f.path);
  assert.ok(paths.includes('tailwind.config.js'));
  assert.ok(paths.includes('src/styles.css'));
  assert.ok(paths.includes('components/ui/button.tsx'));
  assert.ok(paths.includes('components/Header.tsx'));
  assert.ok(paths.includes('app/dashboard/page.tsx'));
  assert.ok(paths.includes('app/layout.tsx'));
});

test('selectRepoFiles skips node_modules and dist', async () => {
  const files = await selectRepoFiles(FIXTURE);
  assert.ok(files.every((f) => !f.path.includes('node_modules') && !f.path.startsWith('dist/')));
});

test('selectRepoFiles loads content only where needed', async () => {
  const files = await selectRepoFiles(FIXTURE);
  const byPath = Object.fromEntries(files.map((f) => [f.path, f]));
  assert.match(byPath['tailwind.config.js'].content, /primary/);
  assert.match(byPath['src/styles.css'].content, /--color-ink/);
  assert.match(byPath['components/ui/button.tsx'].content, /Button/);
  assert.equal(byPath['app/layout.tsx'].content, '');
});

test('extractRepoFiles unpacks a github-style tarball and cleans up its temp dir', async () => {
  const before = (await readdir(os.tmpdir())).filter((d) => d.startsWith('designbridge-repo-'));
  const files = await extractRepoFiles(await fixtureTarball());
  assert.ok(files.some((f) => f.path === 'tailwind.config.js'));
  const after = (await readdir(os.tmpdir())).filter((d) => d.startsWith('designbridge-repo-'));
  assert.equal(after.length, before.length, 'temp dir must be removed');
});

test('extractRepoFiles cleans up the temp dir even on a broken tarball', async () => {
  const before = (await readdir(os.tmpdir())).filter((d) => d.startsWith('designbridge-repo-'));
  await assert.rejects(() => extractRepoFiles(Buffer.from('definitiv kein tarball')));
  const after = (await readdir(os.tmpdir())).filter((d) => d.startsWith('designbridge-repo-'));
  assert.equal(after.length, before.length, 'temp dir must be removed on error too');
});
```

- [ ] **Step 3: Fehlschlag bestätigen**

Run: `npm run test:server`
Expected: FAIL — Module existieren nicht.

- [ ] **Step 4: Implementieren**

`server/lib/repoFilePatterns.js`:
```js
export const SKIP_DIRS = new Set([
  'node_modules', 'dist', 'build', 'out', '.git', '.next',
  'coverage', 'vendor', '.turbo', 'storybook-static',
]);

export const isTailwindConfig = (p) => /(^|\/)tailwind\.config\.(js|ts|cjs|mjs)$/.test(p);
export const isCssFile = (p) => /\.css$/.test(p);
export const isUiComponent = (p) => /(^|\/)components\/ui\/(?!index\.)[^/]+\.(jsx|tsx|js|ts)$/.test(p);
export const isComponentFile = (p) => /(^|\/)components\/(?!ui\/)[^/]+\.(jsx|tsx)$/.test(p);
export const isPageFile = (p) =>
  /(^|\/)pages\/.+\.(jsx|tsx|js|ts)$/.test(p) || /(^|\/)app\/(.*\/)?page\.(jsx|tsx|js|ts)$/.test(p);
export const isLayoutFile = (p) => /(^|\/)app\/(.*\/)?layout\.(jsx|tsx|js|ts)$/.test(p);

export const shouldSkipPath = (p) =>
  p.split('/').some((seg) => SKIP_DIRS.has(seg) || seg.startsWith('._'));
```

`server/lib/extractRepoFiles.js`:
```js
import { mkdtemp, rm, readFile, readdir } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import * as tar from 'tar';
import {
  shouldSkipPath, isTailwindConfig, isCssFile,
  isUiComponent, isComponentFile, isPageFile, isLayoutFile,
} from './repoFilePatterns.js';

const CAPS = {
  tailwind: 3, css: 20, ui: 100, other: 50, total: 150,
  cssBytes: 200 * 1024, uiBytes: 8 * 1024, maxDepth: 8,
};

export async function extractRepoFiles(tarballBuffer, caps = CAPS) {
  const tmp = await mkdtemp(path.join(os.tmpdir(), 'designbridge-repo-'));
  try {
    await new Promise((resolve, reject) => {
      // strip:1 entfernt den "repo-sha/"-Wurzelordner des GitHub-Tarballs.
      // filter: SKIP_DIRS und AppleDouble landen gar nicht erst auf der Platte.
      // node-tar neutralisiert ".."-/absolute Pfade selbst (Zip-Slip-Schutz).
      const unpack = tar.x({ cwd: tmp, strip: 1, filter: (p) => !shouldSkipPath(p) });
      unpack.on('close', resolve);
      unpack.on('error', reject);
      unpack.end(tarballBuffer);
    });
    return await selectRepoFiles(tmp, caps);
  } finally {
    await rm(tmp, { recursive: true, force: true }); // auch im Fehlerfall
  }
}

export async function selectRepoFiles(rootDir, caps = CAPS) {
  const paths = [];
  async function walk(dir, rel, depth) {
    if (depth > caps.maxDepth) return;
    for (const entry of await readdir(dir, { withFileTypes: true })) {
      if (entry.name.startsWith('._')) continue;
      const relPath = rel ? `${rel}/${entry.name}` : entry.name;
      if (shouldSkipPath(relPath)) continue;
      if (entry.isDirectory()) await walk(path.join(dir, entry.name), relPath, depth + 1);
      else if (entry.isFile()) paths.push(relPath);
    }
  }
  await walk(rootDir, '', 0);
  // flachere Pfade zuerst — bei Kappung gewinnen Wurzel-Dateien
  paths.sort((a, b) => a.split('/').length - b.split('/').length || a.localeCompare(b));

  const files = [];
  const counts = { tailwind: 0, css: 0, ui: 0, other: 0 };
  const read = async (p, cap) => (await readFile(path.join(rootDir, p), 'utf8')).slice(0, cap);

  for (const p of paths) {
    if (files.length >= caps.total) break;
    if (isTailwindConfig(p) && counts.tailwind < caps.tailwind) {
      files.push({ path: p, content: await read(p, caps.cssBytes) });
      counts.tailwind++;
    } else if (isCssFile(p) && counts.css < caps.css) {
      files.push({ path: p, content: await read(p, caps.cssBytes) });
      counts.css++;
    } else if (isUiComponent(p) && counts.ui < caps.ui) {
      files.push({ path: p, content: await read(p, caps.uiBytes) });
      counts.ui++;
    } else if ((isComponentFile(p) || isPageFile(p) || isLayoutFile(p)) && counts.other < caps.other) {
      files.push({ path: p, content: '' }); // nur der Pfad zählt
      counts.other++;
    }
  }
  return files;
}
```

Hinweis: Sollte der Unpack-Stream in der installierten `tar`-Version `close` nicht feuern, zusätzlich `unpack.on('finish', resolve)` registrieren — der Round-Trip-Test deckt das sofort auf.

- [ ] **Step 5: Erfolg bestätigen**

Run: `npm run test:server`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add server/lib/repoFilePatterns.js server/lib/extractRepoFiles.js server/lib/extractRepoFiles.test.js server/fixtures/repo-fixture
git commit -m "feat(server): extract and select repo files from tarball with temp-dir cleanup"
```

---

### Task 4: `parseTailwindTheme` — statisches Config-Parsing (keine Codeausführung!)

**Files:**
- Create: `server/lib/tailwindTheme.js`
- Modify: `server/lib/cssIngest.js` (nur `export` vor `remToPx`, `pxNumber`, `normalizeColor` — Reuse)
- Test: `server/lib/tailwindTheme.test.js`

**Sicherheitsregel dieses Tasks:** Die Config wird **niemals** per `require()`/`import()` geladen — das wäre Remote Code Execution. Nur statischer Text-Scan.

- [ ] **Step 1: Failing tests schreiben**

`server/lib/tailwindTheme.test.js`:
```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseTailwindTheme } from './tailwindTheme.js';

const CONFIG = `
const plugin = require('tailwindcss/plugin');
module.exports = {
  theme: {
    spacing: { sm: '0.5rem' },
    extend: {
      colors: {
        primary: '#022d2c',
        blue: { 500: '#3b82f6' },
        border: 'hsl(var(--border))',
      },
      borderRadius: { card: '12px' },
      boxShadow: { card: '0 1px 3px rgba(0,0,0,.1)' },
      fontSize: { base: '1rem', xl: ['1.25rem', { lineHeight: '1.75rem' }] },
      width: { logo: calcWidth() },
    },
  },
};`;

test('reads literal entries from theme and theme.extend', () => {
  const { entries } = parseTailwindTheme(CONFIG);
  assert.deepEqual(entries.colors.find((c) => c.name === 'primary'), {
    name: 'primary', value: '#022d2c', path: 'theme.extend.colors.primary',
  });
  assert.equal(entries.spacing.find((s) => s.name === 'sm').value, '0.5rem');
  assert.equal(entries.radius.find((r) => r.name === 'card').value, '12px');
  assert.equal(entries.shadows.find((s) => s.name === 'card').value, '0 1px 3px rgba(0,0,0,.1)');
});

test('flattens one nesting level for colors', () => {
  const { entries } = parseTailwindTheme(CONFIG);
  const nested = entries.colors.find((c) => c.name === 'blue-500');
  assert.equal(nested.value, '#3b82f6');
});

test('takes the first string literal from array values (fontSize)', () => {
  const { entries } = parseTailwindTheme(CONFIG);
  assert.equal(entries.fontSize.find((f) => f.name === 'xl').value, '1.25rem');
  assert.equal(entries.fontSize.find((f) => f.name === 'base').value, '1rem');
});

test('keeps non-hex color strings for the caller to filter', () => {
  const { entries } = parseTailwindTheme(CONFIG);
  assert.equal(entries.colors.find((c) => c.name === 'border').value, 'hsl(var(--border))');
});

test('never executes code and warns about computed values', () => {
  const { warnings } = parseTailwindTheme(CONFIG);
  assert.ok(warnings.some((w) => /statisch nicht gelesen/.test(w)));
});

test('returns empty entries without a theme block', () => {
  const { entries, warnings } = parseTailwindTheme('module.exports = {};');
  assert.equal(entries.colors.length, 0);
  assert.deepEqual(warnings, []);
});

test('handles typescript configs with satisfies', () => {
  const ts = `import type { Config } from 'tailwindcss';
export default { theme: { extend: { colors: { ink: '#111827' } } } } satisfies Config;`;
  const { entries } = parseTailwindTheme(ts);
  assert.equal(entries.colors.find((c) => c.name === 'ink').value, '#111827');
});
```

- [ ] **Step 2: Fehlschlag bestätigen**

Run: `npm run test:server`
Expected: FAIL — Modul existiert nicht.

- [ ] **Step 3: `cssIngest`-Helfer exportieren**

In `server/lib/cssIngest.js` vor `remToPx`, `pxNumber` und `normalizeColor` jeweils `export` ergänzen (Zeilen 20, 26, 40) — sonst keine Änderung. Bestehende Tests bleiben grün.

- [ ] **Step 4: Implementieren**

`server/lib/tailwindTheme.js`:
```js
const COMPUTED_WARNING =
  'Berechnete Werte in tailwind.config konnten statisch nicht gelesen werden.';

const SECTIONS = [
  ['colors', 'colors'],
  ['spacing', 'spacing'],
  ['borderRadius', 'radius'],
  ['boxShadow', 'shadows'],
  ['fontSize', 'fontSize'],
];

// Balancierte {…}-Klammer ab startIdx ausschneiden (String-bewusst).
function readBalanced(src, startIdx) {
  let depth = 0;
  let inStr = null;
  for (let i = startIdx; i < src.length; i++) {
    const ch = src[i];
    if (inStr) {
      if (ch === '\\') i++;
      else if (ch === inStr) inStr = null;
      continue;
    }
    if (ch === "'" || ch === '"' || ch === '`') { inStr = ch; continue; }
    if (ch === '{') depth++;
    else if (ch === '}') {
      depth--;
      if (depth === 0) return src.slice(startIdx, i + 1);
    }
  }
  return null;
}

export function extractObjectSource(src, key) {
  const re = new RegExp(`(?:^|[\\s{,])${key}\\s*:\\s*\\{`);
  const m = re.exec(src);
  if (!m) return null;
  return readBalanced(src, src.indexOf('{', m.index + m[0].length - 1));
}

// Top-Level-Kommas splitten (Klammern & Strings respektieren).
function splitTopLevel(inner) {
  const parts = [];
  let depth = 0;
  let inStr = null;
  let cur = '';
  for (let i = 0; i < inner.length; i++) {
    const ch = inner[i];
    if (inStr) {
      cur += ch;
      if (ch === '\\') { cur += inner[++i] ?? ''; }
      else if (ch === inStr) inStr = null;
      continue;
    }
    if (ch === "'" || ch === '"' || ch === '`') { inStr = ch; cur += ch; continue; }
    if ('{[('.includes(ch)) depth++;
    if ('}])'.includes(ch)) depth--;
    if (ch === ',' && depth === 0) { parts.push(cur); cur = ''; continue; }
    cur += ch;
  }
  if (cur.trim()) parts.push(cur);
  return parts;
}

function literalValue(v) {
  const s = /^(?:'([^'\n]*)'|"([^"\n]*)")$/.exec(v);
  if (s) return s[1] ?? s[2];
  if (/^-?[\d.]+$/.test(v)) return v;
  return null;
}

function parseEntries(objSrc, warnings, prefix = '', allowNesting = true) {
  const out = [];
  for (const part of splitTopLevel(objSrc.slice(1, -1))) {
    if (!part.trim()) continue;
    const m = /^\s*(?:'([^']+)'|"([^"]+)"|([\w.-]+))\s*:\s*([\s\S]+?)\s*$/.exec(part);
    if (!m) {
      warnings.add(COMPUTED_WARNING); // Spread, Kommentar-Reste, Unlesbares
      continue;
    }
    const key = m[1] ?? m[2] ?? m[3];
    const value = m[4];
    const lit = literalValue(value);
    if (lit !== null) { out.push({ name: prefix + key, value: lit }); continue; }
    if (value.startsWith('{') && allowNesting) {
      const nested = readBalanced(value, 0);
      if (nested) out.push(...parseEntries(nested, warnings, `${prefix}${key}-`, false));
      continue;
    }
    if (value.startsWith('[')) {
      const first = /['"]([^'"]+)['"]/.exec(value);
      if (first) { out.push({ name: prefix + key, value: first[1] }); continue; }
    }
    warnings.add(COMPUTED_WARNING); // require(), Funktionsaufruf, `${…}`, …
  }
  return out;
}

export function parseTailwindTheme(configSource) {
  const warnings = new Set();
  const entries = { colors: [], spacing: [], radius: [], shadows: [], fontSize: [] };
  const themeSrc = extractObjectSource(configSource || '', 'theme');
  if (!themeSrc) return { entries, warnings: [] };

  const extendSrc = extractObjectSource(themeSrc, 'extend');
  const scopes = [
    // extend-Block aus theme herausschneiden, sonst würden extend-Sektionen doppelt gelesen
    { src: extendSrc ? themeSrc.replace(extendSrc, '{}') : themeSrc, label: 'theme' },
    ...(extendSrc ? [{ src: extendSrc, label: 'theme.extend' }] : []),
  ];

  for (const { src, label } of scopes) {
    for (const [section, cat] of SECTIONS) {
      const objSrc = extractObjectSource(src, section);
      if (!objSrc) continue;
      for (const e of parseEntries(objSrc, warnings)) {
        entries[cat].push({ ...e, path: `${label}.${section}.${e.name}` });
      }
    }
  }
  return { entries, warnings: [...warnings] };
}
```

- [ ] **Step 5: Erfolg bestätigen**

Run: `npm run test:server`
Expected: PASS — inkl. unveränderter `cssIngest`-Tests.

- [ ] **Step 6: Commit**

```bash
git add server/lib/tailwindTheme.js server/lib/tailwindTheme.test.js server/lib/cssIngest.js
git commit -m "feat(server): statically parse tailwind config theme tokens (no code execution)"
```

---

### Task 5: `recognizeRepoInventory` — shadcn-/Seiten-Heuristik

**Files:**
- Create: `server/lib/repoInventory.js`
- Test: `server/lib/repoInventory.test.js`

- [ ] **Step 1: Failing tests schreiben**

`server/lib/repoInventory.test.js`:
```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { recognizeRepoInventory } from './repoInventory.js';

const f = (path) => ({ path, content: '' });

test('components/ui files become high-confidence atomics in PascalCase', () => {
  const { atomics } = recognizeRepoInventory([
    f('components/ui/button.tsx'),
    f('components/ui/dropdown-menu.tsx'),
  ]);
  const names = atomics.map((a) => a.name).sort();
  assert.deepEqual(names, ['Button', 'DropdownMenu']);
  for (const a of atomics) {
    assert.equal(a.confidence, 'high');
    assert.equal(a.source, 'rules');
    assert.deepEqual(a.variants, []);
    assert.match(a.notes, /components\/ui\//);
  }
});

test('plain components/ files become low-confidence components', () => {
  const { components } = recognizeRepoInventory([f('src/components/Header.tsx')]);
  assert.deepEqual(components.map((c) => c.name), ['Header']);
  assert.equal(components[0].confidence, 'low');
});

test('layout and pages become patterns with tiered confidence', () => {
  const { patterns } = recognizeRepoInventory([
    f('app/layout.tsx'),
    f('app/page.tsx'),
    f('app/dashboard/page.tsx'),
    f('pages/pricing.tsx'),
  ]);
  const byName = Object.fromEntries(patterns.map((p) => [p.name, p]));
  assert.equal(byName['Layout'].confidence, 'med');
  assert.equal(byName['Seite: Start'].confidence, 'low');
  assert.ok(byName['Seite: Dashboard']);
  assert.ok(byName['Seite: Pricing']);
});

test('dedupes by name per level and returns empty arrays when nothing matches', () => {
  const twice = recognizeRepoInventory([f('components/ui/button.tsx'), f('src/components/ui/button.jsx')]);
  assert.equal(twice.atomics.length, 1);
  const none = recognizeRepoInventory([f('README.md')]);
  assert.deepEqual(none, { atomics: [], components: [], patterns: [] });
});
```

- [ ] **Step 2: Fehlschlag bestätigen**

Run: `npm run test:server`
Expected: FAIL — Modul existiert nicht.

- [ ] **Step 3: Implementieren**

`server/lib/repoInventory.js`:
```js
import { isUiComponent, isComponentFile, isPageFile, isLayoutFile } from './repoFilePatterns.js';

const pascal = (s) =>
  s.replace(/\.[^.]+$/, '')
    .split(/[-_.\s]/)
    .filter(Boolean)
    .map((w) => w[0].toUpperCase() + w.slice(1))
    .join('');

export function recognizeRepoInventory(files) {
  const atomics = new Map();
  const components = new Map();
  const patterns = new Map();
  const put = (map, entry) => { if (!map.has(entry.name)) map.set(entry.name, entry); };

  for (const { path } of files) {
    const base = path.split('/').pop();
    if (isUiComponent(path)) {
      put(atomics, {
        name: pascal(base), variants: [], confidence: 'high', source: 'rules', notes: `aus ${path}`,
      });
    } else if (isComponentFile(path)) {
      put(components, { name: pascal(base), confidence: 'low', source: 'rules', notes: `aus ${path}` });
    } else if (isLayoutFile(path)) {
      put(patterns, { name: 'Layout', confidence: 'med', source: 'rules', notes: `aus ${path}` });
    } else if (isPageFile(path)) {
      const segs = path.split('/');
      let label = base.replace(/\.[^.]+$/, '');
      if (label === 'page' || label === 'index') label = segs[segs.length - 2] ?? '';
      if (!label || label === 'app' || label === 'pages' || label === 'src') label = 'Start';
      put(patterns, {
        name: `Seite: ${pascal(label)}`, confidence: 'low', source: 'rules', notes: `aus ${path}`,
      });
    }
  }
  return {
    atomics: [...atomics.values()],
    components: [...components.values()],
    patterns: [...patterns.values()],
  };
}
```

- [ ] **Step 4: Erfolg bestätigen**

Run: `npm run test:server`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add server/lib/repoInventory.js server/lib/repoInventory.test.js
git commit -m "feat(server): recognize ui inventory from shadcn and page file conventions"
```

---

### Task 6: `ingestRepoFiles` — quellen-agnostischer Kern

**Files:**
- Create: `server/lib/ingestRepoFiles.js`
- Test: `server/lib/ingestRepoFiles.test.js`

- [ ] **Step 1: Failing tests schreiben**

`server/lib/ingestRepoFiles.test.js`:
```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { selectRepoFiles } from './extractRepoFiles.js';
import { ingestRepoFiles } from './ingestRepoFiles.js';

const FIXTURE = path.join(path.dirname(fileURLToPath(import.meta.url)), '../fixtures/repo-fixture');

test('produces the canonical server shape from the fixture repo', async () => {
  const files = await selectRepoFiles(FIXTURE);
  const result = ingestRepoFiles(files, { sourceUrl: 'https://github.com/a/b', branch: 'main' });

  const primary = result.tokens.colors.find((c) => c.hex === '#022d2c');
  assert.equal(primary.source, 'tailwind.config.js → theme.extend.colors.primary');
  const ink = result.tokens.colors.find((c) => c.hex === '#111827');
  assert.equal(ink.source, 'src/styles.css → --color-ink');

  assert.ok(result.tokens.spacing.some((s) => s.value === 24));          // --space-lg
  assert.ok(result.tokens.border_radius.some((r) => r.value === '12px')); // theme
  assert.ok(result.tokens.shadows.some((s) => /rgba/.test(s.css)));
  assert.ok(result.tokens.typography.some((t) => t.size === 16));        // fontSize.base 1rem

  assert.ok(result.atomics.some((a) => a.name === 'Button'));
  assert.ok(result.patterns.some((p) => p.name === 'Layout'));

  assert.equal(result.meta.model, 'repo-ingest');
  assert.equal(result.meta.source_url, 'https://github.com/a/b');
  assert.equal(result.meta.branch, 'main');
  assert.equal(result.meta.ai_deepened, false);
});

test('skips non-hex tailwind colors like hsl(var(--border))', async () => {
  const files = [{ path: 'tailwind.config.js', content: `module.exports={theme:{extend:{colors:{border:'hsl(var(--border))'}}}}` }];
  const result = ingestRepoFiles(files);
  assert.equal(result.tokens.colors.length, 0);
});

test('dedupes tokens across tailwind and css (tailwind wins)', () => {
  const files = [
    { path: 'tailwind.config.js', content: `module.exports={theme:{extend:{colors:{primary:'#022d2c'}}}}` },
    { path: 'a.css', content: ':root { --color-primary: #022d2c; }' },
  ];
  const result = ingestRepoFiles(files);
  assert.equal(result.tokens.colors.length, 1);
  assert.match(result.tokens.colors[0].source, /tailwind\.config/);
});

test('warns when no tokens are found at all (but still returns 200-shape)', () => {
  const result = ingestRepoFiles([{ path: 'components/ui/button.tsx', content: 'x' }]);
  assert.ok(result.warnings.some((w) => /Keine Design-Tokens/.test(w)));
  assert.ok(result.atomics.length > 0);
});

test('carries computed-config warnings from the tailwind parser', async () => {
  const files = await selectRepoFiles(FIXTURE);
  const result = ingestRepoFiles(files);
  assert.ok(result.warnings.some((w) => /statisch nicht gelesen/.test(w)));
});
```

- [ ] **Step 2: Fehlschlag bestätigen**

Run: `npm run test:server`
Expected: FAIL — Modul existiert nicht.

- [ ] **Step 3: Implementieren**

`server/lib/ingestRepoFiles.js`:
```js
import { ingestCss, normalizeColor, pxNumber, remToPx } from './cssIngest.js';
import { parseTailwindTheme } from './tailwindTheme.js';
import { recognizeRepoInventory } from './repoInventory.js';
import { isTailwindConfig, isCssFile } from './repoFilePatterns.js';

const dedupeBy = (arr, keyFn) => {
  const seen = new Set();
  return arr.filter((t) => {
    const k = keyFn(t);
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
};

function tailwindTokens(filePath, parsed) {
  const src = (p) => `${filePath} → ${p}`;
  const out = { colors: [], typography: [], spacing: [], radius: [], shadows: [] };
  for (const e of parsed.entries.colors) {
    const hex = normalizeColor(String(e.value));
    if (hex) out.colors.push({ hex, role: e.name, confidence: 'high', source: src(e.path) });
  }
  for (const e of parsed.entries.spacing) {
    const px = pxNumber(String(e.value));
    if (px != null) out.spacing.push({ value: px, usage: e.name, confidence: 'high', source: src(e.path) });
  }
  for (const e of parsed.entries.radius) {
    const v = String(e.value);
    out.radius.push({
      value: v.endsWith('%') ? v : remToPx(v), usage: e.name, confidence: 'high', source: src(e.path),
    });
  }
  for (const e of parsed.entries.shadows) {
    if (e.value !== 'none') {
      out.shadows.push({ description: e.name, css: String(e.value), confidence: 'high', source: src(e.path) });
    }
  }
  for (const e of parsed.entries.fontSize) {
    const px = pxNumber(String(e.value));
    if (px != null) {
      out.typography.push({ size: px, weight: '400', role: e.name, sample: 'Aa', confidence: 'high', source: src(e.path) });
    }
  }
  return out;
}

export function ingestRepoFiles(files, { sourceUrl = null, branch = null } = {}) {
  const warnings = new Set();
  const acc = { colors: [], typography: [], spacing: [], radius: [], shadows: [] };

  // 1. Tailwind zuerst — benannte Theme-Einträge gewinnen beim Dedupe.
  for (const f of files.filter((f) => isTailwindConfig(f.path))) {
    const parsed = parseTailwindTheme(f.content);
    parsed.warnings.forEach((w) => warnings.add(w));
    const t = tailwindTokens(f.path, parsed);
    for (const k of Object.keys(acc)) acc[k].push(...t[k]);
  }

  // 2. CSS-Dateien über den vorhandenen Ingester, Herkunft mit Dateipfad präfixiert.
  for (const f of files.filter((f) => isCssFile(f.path))) {
    const r = ingestCss(f.content);
    const withFile = (tok) => ({ ...tok, source: tok.source ? `${f.path} → ${tok.source}` : f.path });
    acc.colors.push(...r.tokens.colors.map(withFile));
    acc.typography.push(...r.tokens.typography.map(withFile));
    acc.spacing.push(...r.tokens.spacing.map(withFile));
    acc.radius.push(...r.tokens.border_radius.map(withFile));
    acc.shadows.push(...r.tokens.shadows.map(withFile));
    if (r.warnings.some((w) => /niedrige Confidence/.test(w))) {
      warnings.add('Einige Werte stammen aus CSS-Deklarationen (niedrige Confidence) — bitte prüfen.');
    }
  }

  const tokens = {
    colors: dedupeBy(acc.colors, (t) => t.hex),
    typography: dedupeBy(acc.typography, (t) => `${t.size}/${t.weight}`),
    spacing: dedupeBy(acc.spacing, (t) => t.value).sort((a, b) => a.value - b.value),
    border_radius: dedupeBy(acc.radius, (t) => String(t.value)),
    shadows: dedupeBy(acc.shadows, (t) => t.css),
  };

  const inventory = recognizeRepoInventory(files);

  const tokenCount = Object.values(tokens).reduce((n, arr) => n + arr.length, 0);
  if (tokenCount === 0) {
    warnings.add('Keine Design-Tokens gefunden — weder tailwind.config noch CSS-Variablen.');
  }

  return {
    summary: {
      source_description: 'Tokens und Inventar aus Repository extrahiert',
      app_type: 'Code-Repository',
      color_mode: 'unknown',
      design_style: 'aus tailwind.config & CSS abgeleitet',
    },
    tokens,
    atomics: inventory.atomics,
    components: inventory.components,
    patterns: inventory.patterns,
    warnings: [...warnings],
    meta: { model: 'repo-ingest', source_url: sourceUrl, branch, ai_deepened: false, elapsed_ms: 0 },
  };
}
```

- [ ] **Step 4: Erfolg bestätigen**

Run: `npm run test:server`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add server/lib/ingestRepoFiles.js server/lib/ingestRepoFiles.test.js
git commit -m "feat(server): ingestRepoFiles builds the canonical shape from a source-agnostic file list"
```

---

### Task 7: Endpoint `POST /api/scan/repo`

**Files:**
- Modify: `server/routes/scan.js` (Imports + neue Route nach `/url/ai`)

- [ ] **Step 1: Imports ergänzen**

In `server/routes/scan.js` nach dem `recognizeWithAi`-Import:
```js
import { parseRepoUrl } from '../lib/repoUrl.js';
import { downloadRepoTarball } from '../lib/fetchRepoTarball.js';
import { extractRepoFiles } from '../lib/extractRepoFiles.js';
import { ingestRepoFiles } from '../lib/ingestRepoFiles.js';
```

- [ ] **Step 2: Route + Fehler-Mapping hinzufügen**

Vor `export default router;`:
```js
function statusForRepoError(err) {
  const m = err?.message || '';
  if (/nicht gefunden/i.test(m)) return 404;
  if (/zu groß/i.test(m)) return 413;
  if (/rate-limit/i.test(m)) return 429;
  return 502;
}

// POST /api/scan/repo — deterministisches Repo-Inventar (0 Credits)
router.post('/repo', async (req, res) => {
  let parsed;
  try {
    parsed = parseRepoUrl(req.body?.url);
  } catch {
    return res.status(400).json({ error: 'Bitte eine öffentliche GitHub-URL angeben (github.com/owner/repo).' });
  }
  const branch = (req.body?.branch || '').trim() || parsed.branch || null;
  try {
    console.log(`[scan/repo] Loading ${parsed.owner}/${parsed.repo}${branch ? `@${branch}` : ''}`);
    const { buffer, branch: usedBranch } = await downloadRepoTarball({ ...parsed, branch });
    const files = await extractRepoFiles(buffer);
    const result = ingestRepoFiles(files, { sourceUrl: req.body.url, branch: usedBranch });
    res.json(result);
  } catch (err) {
    console.error('[scan/repo] Error:', err.message);
    res.status(statusForRepoError(err)).json({ error: err.message });
  }
});
```

- [ ] **Step 3: Server-Tests bleiben grün**

Run: `npm run test:server`
Expected: PASS (keine Route-Tests — Hausstil; Verdrahtung im Browser-Smoke, Lib-Logik bereits unit-getestet).

- [ ] **Step 4: Commit**

```bash
git add server/routes/scan.js
git commit -m "feat(server): POST /api/scan/repo ingests public github repos"
```

---

### Task 8: `deepenRepoWithAi` — Claude-Veredelung (Fake-Client, keine Credits)

**Files:**
- Create: `server/lib/deepenRepoWithAi.js`
- Test: `server/lib/deepenRepoWithAi.test.js`

- [ ] **Step 1: Failing tests schreiben**

`server/lib/deepenRepoWithAi.test.js`:
```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { deepenRepoWithAi, buildRepoDigest } from './deepenRepoWithAi.js';

function fakeClient(payload) {
  return { messages: { create: async () => ({ content: [{ text: JSON.stringify(payload) }] }) } };
}

const FILES = [
  { path: 'tailwind.config.js', content: 'module.exports = {}' },
  { path: 'components/ui/button.tsx', content: 'export function Button() {}' },
  { path: 'app/page.tsx', content: '' },
];

test('returns merged lists from the model', async () => {
  const client = fakeClient({
    atomics: [{ name: 'Button', variants: ['default', 'ghost'], confidence: 'high', source: 'rules+ai', notes: '' }],
    components: [{ name: 'Card', confidence: 'med', source: 'ai', notes: '' }],
    patterns: [],
    warnings: [],
  });
  const baseline = { atomics: [], components: [], patterns: [] };
  const out = await deepenRepoWithAi(FILES, baseline, { client });
  assert.equal(out.atomics[0].source, 'rules+ai');
  assert.deepEqual(out.atomics[0].variants, ['default', 'ghost']);
  assert.equal(out.components[0].source, 'ai');
});

test('throws a clear error on invalid JSON', async () => {
  const client = { messages: { create: async () => ({ content: [{ text: 'not json' }] }) } };
  await assert.rejects(
    () => deepenRepoWithAi(FILES, { atomics: [], components: [], patterns: [] }, { client }),
    /invalid JSON/
  );
});

test('buildRepoDigest lists all paths but embeds only config and ui sources', () => {
  const { digest } = buildRepoDigest(FILES);
  assert.match(digest, /- app\/page\.tsx/);
  assert.match(digest, /=== components\/ui\/button\.tsx ===/);
  assert.ok(!digest.includes('=== app/page.tsx ==='));
});

test('adds a truncation warning when the digest was capped', async () => {
  const client = fakeClient({ atomics: [], components: [], patterns: [], warnings: [] });
  const big = [{ path: 'tailwind.config.js', content: 'x'.repeat(100000) }];
  const out = await deepenRepoWithAi(big, { atomics: [], components: [], patterns: [] }, { client });
  assert.ok(out.warnings.some((w) => /gekürzt/.test(w)));
});
```

- [ ] **Step 2: Fehlschlag bestätigen**

Run: `npm run test:server`
Expected: FAIL — Modul existiert nicht.

- [ ] **Step 3: Implementieren**

`server/lib/deepenRepoWithAi.js`:
```js
import Anthropic from '@anthropic-ai/sdk';
import { isTailwindConfig, isUiComponent } from './repoFilePatterns.js';

const MODEL = 'claude-sonnet-4-5';
const MAX_DIGEST = 30000;

export function buildRepoDigest(files) {
  const lines = ['DATEILISTE:'];
  for (const f of files) lines.push(`- ${f.path}`);
  lines.push('');
  for (const f of files) {
    if ((isTailwindConfig(f.path) || isUiComponent(f.path)) && f.content) {
      lines.push(`=== ${f.path} ===`, f.content, '');
    }
  }
  let digest = lines.join('\n');
  const truncated = digest.length > MAX_DIGEST;
  if (truncated) digest = digest.slice(0, MAX_DIGEST);
  return { digest, truncated };
}

function buildPrompt(digest, ruleList) {
  return `You are a UI component recognition engine. You are given a digest of a code repository (file list plus the sources of the tailwind config and the components/ui files) and a draft component list found by deterministic rules. Confirm correct entries, fix wrong ones, and add ones the rules missed (e.g. variants from cva() calls).

Return ONLY valid JSON, no markdown, no preamble, in this shape:
{
  "atomics":    [{ "name": "...", "variants": ["..."], "confidence": "high|med|low", "source": "rules+ai|ai", "notes": "" }],
  "components": [{ "name": "...", "confidence": "high|med|low", "source": "rules+ai|ai", "notes": "" }],
  "patterns":   [{ "name": "...", "confidence": "high|med|low", "source": "rules+ai|ai", "notes": "" }],
  "warnings":   ["..."]
}

Rules:
- Use source "rules+ai" when an entry confirms or corrects one from the draft list; use "ai" for entries you add.
- When you correct a draft entry, describe the change in notes, e.g. "Header → Navbar".
- Only report what the repository actually supports. Be conservative.

DRAFT LIST (from rules):
${JSON.stringify(ruleList)}

REPOSITORY DIGEST:
${digest}`;
}

export async function deepenRepoWithAi(files, ruleList, { client } = {}) {
  const c = client ?? new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const { digest, truncated } = buildRepoDigest(files);
  const response = await c.messages.create({
    model: MODEL,
    max_tokens: 4096,
    messages: [{ role: 'user', content: [{ type: 'text', text: buildPrompt(digest, ruleList) }] }],
  });
  const text = response.content.map((b) => b.text || '').join('');
  const clean = text.replace(/```json\n?|```\n?/g, '').trim();
  let parsed;
  try {
    parsed = JSON.parse(clean);
  } catch {
    throw new Error(`Claude returned invalid JSON. Raw: ${text.slice(0, 300)}`);
  }
  const warnings = Array.isArray(parsed.warnings) ? parsed.warnings : [];
  if (truncated) warnings.push('Repo-Digest war groß und wurde für die KI-Analyse gekürzt.');
  return {
    atomics: parsed.atomics ?? [],
    components: parsed.components ?? [],
    patterns: parsed.patterns ?? [],
    warnings,
  };
}
```

- [ ] **Step 4: Erfolg bestätigen**

Run: `npm run test:server`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add server/lib/deepenRepoWithAi.js server/lib/deepenRepoWithAi.test.js
git commit -m "feat(server): deepenRepoWithAi merges repo rule list via Claude (injectable client)"
```

---

### Task 9: Endpoint `POST /api/scan/repo/ai`

**Files:**
- Modify: `server/routes/scan.js` (Import + Route nach `/repo`)

- [ ] **Step 1: Import ergänzen**

```js
import { deepenRepoWithAi } from '../lib/deepenRepoWithAi.js';
```

- [ ] **Step 2: Route hinzufügen** (direkt nach dem `/repo`-Block)

```js
// POST /api/scan/repo/ai — optional Claude pass over the repo rule list
router.post('/repo/ai', async (req, res) => {
  let parsed;
  try {
    parsed = parseRepoUrl(req.body?.url);
  } catch {
    return res.status(400).json({ error: 'Bitte eine öffentliche GitHub-URL angeben (github.com/owner/repo).' });
  }
  const branch = (req.body?.branch || '').trim() || parsed.branch || null;
  try {
    console.log(`[scan/repo/ai] Deepening ${parsed.owner}/${parsed.repo}${branch ? `@${branch}` : ''}`);
    // Stateless: Repo erneut laden — der Client bleibt dumm, keine client-gesendete Liste.
    const { buffer, branch: usedBranch } = await downloadRepoTarball({ ...parsed, branch });
    const files = await extractRepoFiles(buffer);
    const result = ingestRepoFiles(files, { sourceUrl: req.body.url, branch: usedBranch });
    const baseline = { atomics: result.atomics, components: result.components, patterns: result.patterns };
    const merged = await deepenRepoWithAi(files, baseline);
    result.atomics = merged.atomics;
    result.components = merged.components;
    result.patterns = merged.patterns;
    result.warnings = [...(result.warnings || []), ...(merged.warnings || [])];
    result.meta = { ...result.meta, model: 'repo-ingest+ai', ai_deepened: true };
    res.json(result);
  } catch (err) {
    console.error('[scan/repo/ai] Error:', err.message);
    res.status(statusForRepoError(err)).json({ error: `Repo- oder KI-Analyse fehlgeschlagen: ${err.message}` });
  }
});
```

- [ ] **Step 3: Server-Tests bleiben grün**

Run: `npm run test:server`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add server/routes/scan.js
git commit -m "feat(server): POST /api/scan/repo/ai deepens repo inventory via Claude"
```

---

### Task 10: Web — `submitRepo` + RepoTab echt (Mock raus, Badges weg)

**Files:**
- Modify: `web/src/lib/useImportSession.js`
- Modify: `web/src/components/ImportModal/tabs/RepoTab.jsx`
- Modify: `web/src/components/ImportModal/ImportModal.jsx` (beide `Preview`-Badges — der URL-Badge ist eine Leiche aus dem UrlTab-Umbau)
- Delete: `web/src/lib/importMocks.js` (letzter Nutzer fällt weg; vorher `grep -rn importMocks web/src` — es darf nur `useImportSession.js` treffen)
- Test: `web/src/lib/useImportSession.test.js` (anhängen)

- [ ] **Step 1: Failing test anhängen**

In `web/src/lib/useImportSession.test.js`:
```js
  it('resolves repo import to success via POST /api/scan/repo', async () => {
    global.fetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        tokens: { colors: [{ hex: '#022d2c', confidence: 'high' }] },
        atomics: [{ name: 'Button', confidence: 'high', source: 'rules' }],
        components: [], patterns: [],
        meta: { model: 'repo-ingest', source_url: 'https://github.com/a/b', branch: 'main', ai_deepened: false },
      }),
    });

    const { result } = renderHook(() => useImportSession());
    await act(async () => {
      await result.current.submit({ source: 'repo', payload: { url: 'https://github.com/a/b', branch: '' } });
    });

    expect(global.fetch).toHaveBeenCalledWith('/api/scan/repo', expect.objectContaining({ method: 'POST' }));
    expect(result.current.stage).toBe('success');
    expect(result.current.result.source).toBe('repo');
    expect(result.current.result.mocked).toBe(false);
  });

  it('surfaces the german server error for repo imports', async () => {
    global.fetch.mockResolvedValue({
      ok: false,
      json: async () => ({ error: 'Repository nicht gefunden (oder privat).' }),
    });
    const { result } = renderHook(() => useImportSession());
    await act(async () => {
      await result.current.submit({ source: 'repo', payload: { url: 'https://github.com/a/b' } });
    });
    expect(result.current.stage).toBe('error');
    expect(result.current.error).toMatch(/nicht gefunden/);
  });
```

- [ ] **Step 2: Fehlschlag bestätigen**

Run: `cd web && npx vitest run src/lib/useImportSession.test.js`
Expected: FAIL — der Repo-Pfad läuft noch über den Mock (kein `fetch`-Aufruf).

- [ ] **Step 3: `useImportSession.js` umstellen**

(a) Mock-Import entfernen (Zeile 3) und `submitRepo` nach `submitUrl` einfügen:
```js
async function submitRepo({ url, branch }) {
  const res = await fetch('/api/scan/repo', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ url, branch: branch || undefined }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Repo-Scan fehlgeschlagen');
  return adaptScanResponse(data, 'repo');
}
```

(b) Die Repo-Zeile im `submit`-Callback ersetzen:
```js
      else if (source === 'repo') next = await submitRepo(payload);
```

(c) `web/src/lib/importMocks.js` löschen (nach dem grep aus dem Files-Block).

- [ ] **Step 4: RepoTab umbauen**

In `web/src/components/ImportModal/tabs/RepoTab.jsx`:

(a) Branch-Default leeren (Zeile 5):
```js
  const [branch, setBranch] = useState('');
```

(b) Branch-Input bekommt einen Platzhalter:
```jsx
        <input type="text" value={branch} onChange={e => setBranch(e.target.value)}
          placeholder="Default-Branch (automatisch)"
          className="mt-1 w-full px-3 py-2 text-sm border border-zinc-200 rounded text-zinc-900 placeholder:text-zinc-400 focus:outline-none focus:border-zinc-900" />
```

(c) Den Mock-Hinweis (`Repository scanning is mocked …`) ersetzen durch:
```jsx
      <div className="text-[10px] text-zinc-500">
        Liest tailwind.config, CSS-Variablen und components/ui aus einem öffentlichen GitHub-Repo.
      </div>
```

- [ ] **Step 5: `Preview`-Badges entfernen**

In `web/src/components/ImportModal/ImportModal.jsx` (Zeilen 13-14):
```js
  { id: 'url', label: 'URL' },
  { id: 'repo', label: 'Repo' },
```

- [ ] **Step 6: Erfolg bestätigen**

Run: `cd web && npx vitest run`
Expected: PASS — neue Tests grün, keine Regression (kein Test importiert `importMocks`).

- [ ] **Step 7: Commit**

```bash
git add web/src/lib/useImportSession.js web/src/lib/useImportSession.test.js web/src/components/ImportModal/tabs/RepoTab.jsx web/src/components/ImportModal/ImportModal.jsx
git rm web/src/lib/importMocks.js
git commit -m "feat(web): repo tab submits to /api/scan/repo — mock and preview badges removed"
```

---

### Task 11: Web — „Mit KI vertiefen" für Repo-Importe

**Files:**
- Modify: `web/src/lib/aiDeepen.js`
- Modify: `web/src/components/library/AiDeepenBanner.jsx`
- Test: `web/src/lib/aiDeepen.test.js`, `web/src/components/library/AiDeepenBanner.test.js` (jeweils anhängen)

- [ ] **Step 1: Failing tests anhängen**

In `web/src/lib/aiDeepen.test.js`:
```js
  it('routes repo results to /api/scan/repo/ai with url and branch', async () => {
    const repoResult = {
      source: 'repo',
      raw: { meta: { source_url: 'https://github.com/a/b', branch: 'main' } },
    };
    const serverShape = {
      tokens: {}, atomics: [], components: [], patterns: [],
      meta: { model: 'repo-ingest+ai', ai_deepened: true },
    };
    global.fetch = vi.fn(async () => ({ ok: true, json: async () => serverShape }));
    const next = await deepenWithAi(repoResult);
    expect(global.fetch).toHaveBeenCalledWith('/api/scan/repo/ai', expect.objectContaining({ method: 'POST' }));
    expect(JSON.parse(global.fetch.mock.calls[0][1].body)).toEqual({ url: 'https://github.com/a/b', branch: 'main' });
    expect(next.source).toBe('repo');
    expect(next.raw.meta.ai_deepened).toBe(true);
  });
```

In `web/src/components/library/AiDeepenBanner.test.js`:
```js
  it('shows for a fresh repo import and hides once deepened', () => {
    expect(shouldShowDeepenBanner({ source: 'repo', raw: { meta: { ai_deepened: false } } })).toBe(true);
    expect(shouldShowDeepenBanner({ source: 'repo', raw: { meta: { ai_deepened: true } } })).toBe(false);
  });
```

- [ ] **Step 2: Fehlschlag bestätigen**

Run: `cd web && npx vitest run src/lib/aiDeepen.test.js src/components/library/AiDeepenBanner.test.js`
Expected: FAIL — Repo-Routing und Repo-Banner existieren nicht.

- [ ] **Step 3: `aiDeepen.js` routet nach Quelle**

`web/src/lib/aiDeepen.js` komplett ersetzen:
```js
import { adaptScanResponse } from './scanResultAdapter.js';

export async function deepenWithAi(result) {
  const meta = result?.raw?.meta ?? {};
  const url = meta.source_url;
  if (!url) throw new Error('Keine URL zum Vertiefen vorhanden.');
  const isRepo = result?.source === 'repo';
  const endpoint = isRepo ? '/api/scan/repo/ai' : '/api/scan/url/ai';
  const body = isRepo ? { url, ...(meta.branch ? { branch: meta.branch } : {}) } : { url };
  const res = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'KI-Analyse fehlgeschlagen');
  return adaptScanResponse(data, result?.source ?? 'url');
}
```

- [ ] **Step 4: Banner auch für Repo-Importe**

In `web/src/components/library/AiDeepenBanner.jsx` die Sichtbarkeits-Funktion ersetzen:
```js
export function shouldShowDeepenBanner(result) {
  return (result?.source === 'url' || result?.source === 'repo') && !result?.raw?.meta?.ai_deepened;
}
```

- [ ] **Step 5: Erfolg bestätigen**

Run: `cd web && npx vitest run`
Expected: PASS — alle Web-Tests grün (Bestand + neue).

- [ ] **Step 6: Commit**

```bash
git add web/src/lib/aiDeepen.js web/src/lib/aiDeepen.test.js web/src/components/library/AiDeepenBanner.jsx web/src/components/library/AiDeepenBanner.test.js
git commit -m "feat(web): ai deepening banner and routing for repo imports"
```

---

### Task 12: Voll-Verifikation + Browser-Smoke

**Files:** keine (nur Verifikation; bei nötigen Fixes deren Dateien committen)

- [ ] **Step 1: Alle Server-Tests**

Run: `npm run test:server`
Expected: PASS — Baseline 29 + neue Tests (repoUrl, fetchRepoTarball, extractRepoFiles, tailwindTheme, repoInventory, ingestRepoFiles, deepenRepoWithAi), 0 fail.

- [ ] **Step 2: Alle Web-Tests**

Run: `cd web && npx vitest run`
Expected: PASS — Baseline 96 + neue Tests, keine Regressionen.

- [ ] **Step 3: Build**

Run: `cd web && npx vite build`
Expected: Build ohne Fehler.

- [ ] **Step 4: App aus dem Worktree starten — bekannte Falle beachten!**

⚠️ **`preview_start` startet Vite aus dem Haupt-Repo und injiziert `PORT`** — für Worktree-Arbeit ungeeignet. Workaround (aus RESUME/Memory):

```bash
lsof -ti:3047; lsof -ti:5173   # müssen frei sein — sonst laufende Instanz zuerst stoppen
cd "<worktree>" && PORT=3047 node server/index.js   # Backend separat, im Hintergrund
cd "<worktree>/web" && npm run dev                   # Vite explizit aus dem Worktree
```

Frontend im Browser (Inkognito): `http://localhost:5173`.

- [ ] **Step 5: Browser-Smoke**

1. Import-Dialog → **Repo-Tab** (kein `Preview`-Badge mehr, auch nicht am URL-Tab).
2. Kleines echtes öffentliches Repo mit tailwind.config + `components/ui/` importieren — z. B. `https://github.com/shadcn-ui/taxonomy` (Branch leer lassen → Default-Branch-Discovery greift).
3. Erwartet: Erfolgs-Screen mit Kategorien; Library zeigt Tokens mit `↳ aus tailwind.config …` / `↳ aus …css → --…`-Herkunft, Atomics aus `components/ui` mit grauer „nur Regeln"-Pille, Patterns (Layout/Seiten); `AiDeepenBanner` sichtbar.
4. Fehlerpfad: `https://github.com/dieses-repo/existiert-nicht-9x7` importieren → deutsche 404-Meldung im Modal, „Try again" funktioniert.
5. „Mit KI vertiefen" klicken:
   - Mit Credits: Banner verschwindet, Pillen grün/gelb, ggf. Varianten/Korrektur-Notizen.
   - Ohne Credits: ruhige Fehlerzeile, Regel-Liste bleibt vollständig (Fehlerpfad = bestandener Test).
6. Konsole prüfen (keine Fehler), Screenshot als Beleg.
   - Ohne Internet ist der Smoke nicht durchführbar → dokumentieren und mit Rob nachholen.

- [ ] **Step 6: AppleDouble-Reste säubern (CLAUDE.md Regel 7)**

```bash
cd "<worktree>" && find . -name '._*' -delete
```

- [ ] **Step 7: Abschluss-Commit (falls Fixes nötig waren)**

```bash
git add -A
git commit -m "test: verify repo ingester end-to-end"
```

---

## Hinweise für die Ausführung

- **Worktree:** Der Plan läuft im Worktree `.worktrees/feat-repo-ingester-v1` (Branch `feat/repo-ingester-v1`). **Vor Task 0 dort `npm install` und `cd web && npm install` ausführen** (frischer Worktree hat kein `node_modules`), dann Baseline prüfen: Server 29/29, Web 96/96.
- **Push/Merge:** Nach Abschluss mit Rob sprechen (Regel 5 — kein eigenmächtiger Push); Merge nach `main` über den `finishing-a-development-branch`-Flow.
- **Credits:** Nur Task 12 Schritt 5.5 kann echte Credits kosten — alle Tests laufen mit Fake-Client/Fake-Fetch (0 Credits, kein Netz).
- **Reihenfolge:** Tasks streng geordnet (0→12). Server-Kern (1-6) ist rein additiv; 7/9 verdrahten; Web (10-11) setzt nur die Server-Shape voraus.
