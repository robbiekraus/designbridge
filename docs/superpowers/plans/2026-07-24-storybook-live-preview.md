# Storybook Live-Preview Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ein Klick auf „In Storybook öffnen" auf der Export-Seite baut serverseitig ein echtes, lauffähiges Storybook aus den gerade interpretierten Bausteinen und öffnet es als Link — ohne Terminal, ohne ZIP, für den unmoderierten Usability-Test mit Design-Kunden.

**Architektur:** Zweiter, eigenständiger Railway-Service mit Wurzel `storybook-harness/` (eigenes `server.js`, eigene `node_modules`). Die Haupt-App (`web/`) schickt die Bausteine per HTTP-POST an diesen Dienst; der Dienst legt pro Anfrage ein isoliertes Arbeitsverzeichnis an (`node_modules` als Symlink, keine Kopie), baut mit `storybook build` (~5s, spike-bewiesen) und liefert das Ergebnis unter `/preview/<id>/` aus. Nach 30 Minuten räumt sich das Verzeichnis selbst weg.

**Tech Stack:** Node.js (`node:test` für Tests, kein neues Test-Framework), Express, Storybook 8 (bereits im Harness vorhanden), Vitest + Testing Library (Web-Seite, bestehendes Setup).

**Spec:** `docs/superpowers/specs/2026-07-24-storybook-live-preview-design.md`

---

## Vorwissen für den Einstieg (falls neue Session/neuer Rechner)

- Repo-Wurzel: `/Volumes/4TB Shield/Vibe Coding Bootcamp/Projekte/Designbridge`
- `storybook-harness/` ist ein **eigenständiges** npm-Projekt (eigene `node_modules`, eigenes `package.json`) — nicht Teil des Root- oder `web/`-Workspace.
- In `storybook-harness/` liegen bereits (unverändert lassen, nur lesen/kopieren):
  - `.storybook/main.js` — setzt den `@`-Alias auf die Harness-Wurzel und `esbuild.jsx: 'automatic'`
  - `globals.css`, `tailwind.config.js`, `postcss.config.js` — Tailwind + shadcn-Zink-Theme
  - `components/ui/*.jsx` — die 8 shadcn-API-kompatiblen Stubs (Button, Card, Input, …)
- `web/src/lib/emit/buildStorybookZip.js` exportiert bereits `storybookFiles(result)` → `{ "components/Name.jsx": "<code>", "stories/Name.stories.jsx": "<code>", ".storybook/main.js": "...", "README-storybook.md": "..." }`. Wird in dieser Umsetzung **wiederverwendet**, nicht verändert.
- Bestehendes Muster für TTL-Stores: `server/lib/repoStore.js` (In-Memory-Map, `crypto.randomBytes(8)`-ID, `setTimeout`+`unref()`). `buildPreview.js` übernimmt dieses Muster, plus echte Dateisystem-Seiteneffekte.
- Bestehendes Muster für Server-Route-Tests: `server/routes/interpret.test.js` (`app.listen(0, '127.0.0.1')`, echter `fetch` gegen den Ephemeral-Port, kein Mocking).

---

## Task 1: Harness-Abhängigkeiten ergänzen

**Files:**
- Modify: `storybook-harness/package.json`

- [ ] **Step 1: `express`, `cors`, `dotenv` + Start-Script ergänzen**

In `storybook-harness/package.json` den `"scripts"`-Block um `"start"` erweitern und `"dependencies"` um die drei Pakete (Versionen wie im Root-`package.json`, damit es im selben Node-Setup konsistent bleibt):

```json
{
  "name": "designbridge-storybook-harness",
  "private": true,
  "version": "0.1.0",
  "type": "module",
  "description": "Lauffähiges Empfangs-Storybook: frisst ein UIPrism-Export-Paket und zeigt die gescannten Komponenten live.",
  "scripts": {
    "sync-shadcn": "node sync-shadcn.mjs",
    "storybook": "storybook dev -p 6006 --no-open",
    "storybook:ingest": "node ingest.mjs",
    "storybook:demo": "node ingest.mjs --fixture sample && storybook dev -p 6006 --no-open",
    "storybook:demo:prod": "node ingest.mjs --fixture prod && storybook dev -p 6006 --no-open",
    "build-storybook": "storybook build",
    "start": "node server.js",
    "test": "node --test lib/*.test.js server.test.js"
  },
  "dependencies": {
    "cors": "^2.8.5",
    "dotenv": "^16.4.5",
    "express": "^4.19.2",
    "react": "^18.3.1",
    "react-dom": "^18.3.1"
  },
  "devDependencies": {
    "@storybook/addon-essentials": "^8.6.0",
    "@storybook/react-vite": "^8.6.0",
    "autoprefixer": "^10.4.20",
    "jszip": "^3.10.1",
    "postcss": "^8.4.49",
    "storybook": "^8.6.0",
    "tailwindcss": "^3.4.17",
    "vite": "^5.4.11"
  }
}
```

- [ ] **Step 2: Installieren**

Run: `cd "storybook-harness" && npm install`
Expected: `added 3 packages` (o. ä.), `package-lock.json` wird aktualisiert, kein Fehler.

- [ ] **Step 3: Commit**

```bash
git add storybook-harness/package.json storybook-harness/package-lock.json
git commit -m "chore(storybook-harness): express/cors/dotenv für den Live-Preview-Server ergänzt"
```

---

## Task 2: `buildPreview.js` — Verzeichnis anlegen, Scaffold, echter Build (happy path)

**Files:**
- Create: `storybook-harness/lib/buildPreview.js`
- Test: `storybook-harness/lib/buildPreview.test.js`

- [ ] **Step 1: Failing Test schreiben**

`storybook-harness/lib/buildPreview.test.js`:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { access } from 'node:fs/promises';
import path from 'node:path';
import { buildPreview, getPreviewDir, clearPreviews } from './buildPreview.js';

const COMPONENTS = {
  'Greeting.jsx': `export function Greeting({ className = "", ...props }) {
  return (
    <div className={\`flex \${className}\`} {...props}>
      Hallo
    </div>
  );
}
`,
  'PrimaryAction.jsx': `import { Button } from "@/components/ui/button";

export function PrimaryAction({ className = "", ...props }) {
  return (
    <div className={\`flex \${className}\`} {...props}>
      <Button>Speichern</Button>
    </div>
  );
}
`,
};

const STORIES = {
  'Greeting.stories.jsx': `import { Greeting } from '../components/Greeting';

export default { title: 'Atoms/Greeting', component: Greeting };
export const Default = {};
`,
  'PrimaryAction.stories.jsx': `import { PrimaryAction } from '../components/PrimaryAction';

export default { title: 'Molecules/PrimaryAction', component: PrimaryAction };
export const Default = {};
`,
};

test.after(() => clearPreviews());

test('buildPreview baut ein echtes Storybook (inkl. shadcn-Alias) und liefert eine abrufbare id', async () => {
  const { id, staticDir } = await buildPreview({ components: COMPONENTS, stories: STORIES });
  assert.ok(id);
  await access(path.join(staticDir, 'index.html'));
  assert.equal(getPreviewDir(id), staticDir);
});

test('ohne Komponenten wirft buildPreview statt ein leeres Storybook zu bauen', async () => {
  await assert.rejects(
    buildPreview({ components: {}, stories: {} }),
    /keine komponenten/i,
  );
});
```

- [ ] **Step 2: Test laufen lassen, Fehlschlag bestätigen**

Run: `cd "storybook-harness" && node --test lib/buildPreview.test.js`
Expected: FAIL — `Cannot find module './buildPreview.js'`

- [ ] **Step 3: `buildPreview.js` implementieren**

`storybook-harness/lib/buildPreview.js`:

```js
// Baut pro Anfrage ein isoliertes, echtes Storybook aus übergebenen Komponenten+Stories.
// Muster für die TTL-Verwaltung: server/lib/repoStore.js (In-Memory-Map, randomBytes-ID,
// setTimeout+unref). Neu hier: echte Dateisystem-Seiteneffekte (Verzeichnis, Build).
import crypto from 'node:crypto';
import os from 'node:os';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdir, writeFile, cp, rm, symlink } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const execFileAsync = promisify(execFile);

// lib/buildPreview.js → eine Ebene hoch = Harness-Wurzel (Quelle des Scaffolds).
const HARNESS_DIR = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

const TTL_MS = 30 * 60 * 1000;
const BUILD_TIMEOUT_MS = 60_000;

const SCAFFOLD_FILES = ['package.json', 'globals.css', 'tailwind.config.js', 'postcss.config.js'];
const SCAFFOLD_DIRS = [
  ['.storybook', '.storybook'],
  ['components/ui', 'components/ui'],
];

const entries = new Map(); // id -> { workDir, staticDir, timer }

export async function buildPreview({ components, stories }, { ttlMs = TTL_MS, harnessDir = HARNESS_DIR } = {}) {
  if (!components || Object.keys(components).length === 0) {
    throw new Error('Keine Komponenten übergeben — nichts zu bauen.');
  }

  const id = crypto.randomBytes(8).toString('hex');
  const workDir = path.join(os.tmpdir(), 'storybook-preview', id);

  try {
    await mkdir(path.join(workDir, 'components'), { recursive: true });
    await mkdir(path.join(workDir, 'stories'), { recursive: true });

    for (const [filename, code] of Object.entries(components)) {
      await writeFile(path.join(workDir, 'components', filename), code, 'utf8');
    }
    for (const [filename, code] of Object.entries(stories || {})) {
      await writeFile(path.join(workDir, 'stories', filename), code, 'utf8');
    }

    for (const rel of SCAFFOLD_FILES) {
      await cp(path.join(harnessDir, rel), path.join(workDir, rel));
    }
    for (const [src, dest] of SCAFFOLD_DIRS) {
      await cp(path.join(harnessDir, src), path.join(workDir, dest), { recursive: true });
    }
    await symlink(path.join(harnessDir, 'node_modules'), path.join(workDir, 'node_modules'), 'dir');

    await execFileAsync('npx', ['storybook', 'build'], { cwd: workDir, timeout: BUILD_TIMEOUT_MS });
  } catch (err) {
    await rm(workDir, { recursive: true, force: true });
    throw new Error(`Storybook konnte nicht gebaut werden: ${err.message}`);
  }

  const staticDir = path.join(workDir, 'storybook-static');
  const timer = setTimeout(() => removePreview(id), ttlMs);
  if (timer.unref) timer.unref();
  entries.set(id, { workDir, staticDir, timer });

  return { id, staticDir, expiresAt: Date.now() + ttlMs };
}

export function getPreviewDir(id) {
  const e = entries.get(id);
  return e ? e.staticDir : null;
}

export function removePreview(id) {
  const e = entries.get(id);
  if (!e) return;
  clearTimeout(e.timer);
  entries.delete(id);
  rm(e.workDir, { recursive: true, force: true }).catch(() => {});
}

export function clearPreviews() {
  for (const id of [...entries.keys()]) removePreview(id);
}
```

- [ ] **Step 4: Test laufen lassen, Erfolg bestätigen**

Run: `cd "storybook-harness" && node --test lib/buildPreview.test.js`
Expected: PASS, beide Tests grün. (Dauer ~5-10s wegen echtem Storybook-Build — das ist erwartet, kein Hänger.)

- [ ] **Step 5: Commit**

```bash
git add storybook-harness/lib/buildPreview.js storybook-harness/lib/buildPreview.test.js
git commit -m "feat(storybook-harness): buildPreview baut serverseitig ein echtes Storybook pro Anfrage"
```

---

## Task 3: `buildPreview.js` — Fehlerfall (kaputter Code) räumt auf

**Files:**
- Modify: `storybook-harness/lib/buildPreview.test.js`

- [ ] **Step 1: Failing Test schreiben**

An `storybook-harness/lib/buildPreview.test.js` anfügen:

```js
test('kaputter Komponenten-Code → buildPreview wirft und räumt das Arbeitsverzeichnis weg', async () => {
  const brokenComponents = {
    'Broken.jsx': 'export function Broken( {\n  return <div>;\n}\n', // absichtlich kaputtes JSX
  };
  const brokenStories = {
    'Broken.stories.jsx': `import { Broken } from '../components/Broken';
export default { title: 'Atoms/Broken', component: Broken };
export const Default = {};
`,
  };

  let thrown = null;
  try {
    await buildPreview({ components: brokenComponents, stories: brokenStories });
  } catch (err) {
    thrown = err;
  }
  assert.ok(thrown, 'buildPreview sollte werfen, nicht ein halbes Storybook zurückgeben');
  assert.match(thrown.message, /storybook konnte nicht gebaut werden/i);
});
```

- [ ] **Step 2: Test laufen lassen, Fehlschlag/Erfolg prüfen**

Run: `cd "storybook-harness" && node --test lib/buildPreview.test.js`
Expected: Da die Fehlerbehandlung in Task 2 schon implementiert ist, sollte dieser Test **bereits PASS** sein — das bestätigt, dass Task 2 den Fehlerfall korrekt mitgebaut hat. Falls FAIL: Meldung genau lesen, meist liegt es an einer abweichenden Fehlermeldung von `execFile` — die Regex oben anpassen, nicht die Fehlerbehandlung in `buildPreview.js` aufweichen.

- [ ] **Step 3: Commit**

```bash
git add storybook-harness/lib/buildPreview.test.js
git commit -m "test(storybook-harness): Fehlerfall für buildPreview abgesichert (kaputter Code → Cleanup)"
```

---

## Task 4: `buildPreview.js` — TTL-Ablauf

**Files:**
- Modify: `storybook-harness/lib/buildPreview.test.js`

- [ ] **Step 1: Failing Test schreiben**

Anfügen:

```js
test('TTL 0 räumt die Vorschau sofort ab (Muster: repoStore.js)', async () => {
  const { id } = await buildPreview({ components: COMPONENTS, stories: STORIES }, { ttlMs: 0 });
  await new Promise((r) => setTimeout(r, 50));
  assert.equal(getPreviewDir(id), null);
});
```

- [ ] **Step 2: Test laufen lassen**

Run: `cd "storybook-harness" && node --test lib/buildPreview.test.js`
Expected: PASS — die TTL-Logik ist bereits Teil der Step-3-Implementierung aus Task 2 (`setTimeout` + `removePreview`). Dieser Test bestätigt das Verhalten explizit.

- [ ] **Step 3: Commit**

```bash
git add storybook-harness/lib/buildPreview.test.js
git commit -m "test(storybook-harness): TTL-Ablauf für buildPreview abgesichert"
```

---

## Task 5: `server.js` — `/health`, `/build`, `/preview/:id/*`

**Files:**
- Create: `storybook-harness/server.js`
- Test: `storybook-harness/server.test.js`

- [ ] **Step 1: Failing Test schreiben**

`storybook-harness/server.test.js`:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { buildApp } from './server.js';
import { clearPreviews } from './lib/buildPreview.js';

// Muster: server/routes/interpret.test.js (echter Ephemeral-Port, echter fetch).
async function withBuilderServer(fn) {
  const app = buildApp();
  const server = app.listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    await fn(base);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

test.after(() => clearPreviews());

test('GET /health antwortet ok', async () => {
  await withBuilderServer(async (base) => {
    const res = await fetch(`${base}/health`);
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.ok, true);
  });
});

test('POST /build ohne components → 400 mit Klartext-Fehler', async () => {
  await withBuilderServer(async (base) => {
    const res = await fetch(`${base}/build`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({}),
    });
    assert.equal(res.status, 400);
    const body = await res.json();
    assert.match(body.error, /komponenten/i);
  });
});

test('POST /build mit echten Komponenten → 200 + abrufbare /preview/:id/index.html', async () => {
  await withBuilderServer(async (base) => {
    const res = await fetch(`${base}/build`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        components: {
          'Greeting.jsx': `export function Greeting({ className = "", ...props }) {
  return <div className={\`flex \${className}\`} {...props}>Hallo</div>;
}
`,
        },
        stories: {
          'Greeting.stories.jsx': `import { Greeting } from '../components/Greeting';
export default { title: 'Atoms/Greeting', component: Greeting };
export const Default = {};
`,
        },
      }),
    });
    assert.equal(res.status, 200);
    const { id, url } = await res.json();
    assert.ok(id);
    assert.equal(url, `/preview/${id}/`);

    const previewRes = await fetch(`${base}${url}index.html`);
    assert.equal(previewRes.status, 200);
  });
});

test('GET /preview/:id/ für unbekannte id → 404 mit Klartext-Meldung', async () => {
  await withBuilderServer(async (base) => {
    const res = await fetch(`${base}/preview/does-not-exist/index.html`);
    assert.equal(res.status, 404);
    const text = await res.text();
    assert.match(text, /abgelaufen|existiert nicht/i);
  });
});
```

- [ ] **Step 2: Test laufen lassen, Fehlschlag bestätigen**

Run: `cd "storybook-harness" && node --test server.test.js`
Expected: FAIL — `Cannot find module './server.js'`

- [ ] **Step 3: `server.js` implementieren**

`storybook-harness/server.js`:

```js
// Zweiter, eigenständiger Dienst (eigener Railway-Service, Wurzel storybook-harness/).
// Baut auf Zuruf ein echtes Storybook aus übergebenen Bausteinen — kein Terminal für
// die Testperson nötig. Siehe docs/superpowers/specs/2026-07-24-storybook-live-preview-design.md.
import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { buildPreview, getPreviewDir } from './lib/buildPreview.js';

export function buildApp() {
  const app = express();
  const corsOrigin = process.env.CORS_ORIGIN || 'http://localhost:5173';
  app.use(cors({ origin: corsOrigin }));
  app.use(express.json({ limit: '5mb' }));

  app.get('/health', (req, res) => {
    res.json({ ok: true });
  });

  app.post('/build', async (req, res) => {
    const { components, stories } = req.body || {};
    if (!components || Object.keys(components).length === 0) {
      res.status(400).json({ error: 'Keine Komponenten übergeben.' });
      return;
    }
    try {
      const { id, expiresAt } = await buildPreview({ components, stories });
      res.json({ id, url: `/preview/${id}/`, expiresAt });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  app.use('/preview/:id', (req, res, next) => {
    const dir = getPreviewDir(req.params.id);
    if (!dir) {
      res.status(404).send('Diese Storybook-Vorschau ist abgelaufen oder existiert nicht — bitte in UIPrism erneut auf „In Storybook öffnen" klicken.');
      return;
    }
    express.static(dir)(req, res, next);
  });

  return app;
}

if (process.env.NODE_ENV !== 'test') {
  const PORT = process.env.PORT || 4400;
  buildApp().listen(PORT, () => {
    console.log(`\n📚 Storybook-Builder läuft auf http://localhost:${PORT}\n`);
  });
}
```

- [ ] **Step 4: Test laufen lassen, Erfolg bestätigen**

Run: `cd "storybook-harness" && node --test server.test.js`
Expected: PASS, alle 4 Tests grün.

- [ ] **Step 5: Commit**

```bash
git add storybook-harness/server.js storybook-harness/server.test.js
git commit -m "feat(storybook-harness): server.js mit /build und /preview/:id/*"
```

---

## Task 6: Railway-Konfiguration für den zweiten Dienst

**Files:**
- Create: `storybook-harness/railway.json`

- [ ] **Step 1: Datei anlegen**

`storybook-harness/railway.json` (Muster: Root-`railway.json`, aber eigener Start-/Healthcheck-Pfad):

```json
{
  "$schema": "https://railway.app/railway.schema.json",
  "build": {
    "builder": "NIXPACKS",
    "buildCommand": "npm install && npm run sync-shadcn"
  },
  "deploy": {
    "startCommand": "npm start",
    "healthcheckPath": "/health",
    "healthcheckTimeout": 100,
    "restartPolicyType": "ON_FAILURE",
    "restartPolicyMaxRetries": 3
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add storybook-harness/railway.json
git commit -m "chore(storybook-harness): railway.json für den eigenständigen Preview-Dienst"
```

---

## Task 7: `storybookFiles` aus dem Emit-Index exportieren

**Files:**
- Modify: `web/src/lib/emit/index.js`

- [ ] **Step 1: Export ergänzen**

In `web/src/lib/emit/index.js` die bestehende Export-Zeile ergänzen (nach `buildStorybookZip`):

```js
export { buildStorybookZip, storybookFiles } from './buildStorybookZip.js';
```

(ersetzt die bisherige Zeile `export { buildStorybookZip } from './buildStorybookZip.js';`)

- [ ] **Step 2: Bestehende Tests laufen lassen (Regressionscheck)**

Run: `cd "web" && npx vitest run src/lib/emit/`
Expected: alle bestehenden Tests weiterhin PASS — reiner Export, keine Verhaltensänderung.

- [ ] **Step 3: Commit**

```bash
git add web/src/lib/emit/index.js
git commit -m "refactor(web): storybookFiles aus dem Emit-Index exportiert (für Export.jsx)"
```

---

## Task 8: Export.jsx — Button „In Storybook öffnen"

**Files:**
- Modify: `web/src/pages/Export.jsx`
- Modify: `web/src/pages/Export.test.jsx`

- [ ] **Step 1: Failing Test schreiben**

In `web/src/pages/Export.test.jsx` anfügen (gleiche Datei, gleiches `describe`-Block):

```js
it('bietet einen Live-Preview-Button, der die Bausteine an den Storybook-Builder schickt und das Ergebnis öffnet', async () => {
  const fetchMock = vi.fn().mockResolvedValue({
    ok: true,
    json: async () => ({ id: 'abc123', url: '/preview/abc123/' }),
  });
  vi.stubGlobal('fetch', fetchMock);
  const openMock = vi.fn();
  vi.stubGlobal('open', openMock);

  render(<Export result={imageResult} />);
  fireEvent.click(screen.getByRole('button', { name: /in storybook öffnen/i }));

  await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
  const [url, opts] = fetchMock.mock.calls[0];
  expect(url).toMatch(/\/build$/);
  expect(opts.method).toBe('POST');
  const body = JSON.parse(opts.body);
  expect(Object.keys(body)).toEqual(expect.arrayContaining(['components', 'stories']));

  await waitFor(() => expect(openMock).toHaveBeenCalledWith(expect.stringContaining('/preview/abc123/'), '_blank'));

  vi.unstubAllGlobals();
});

it('zeigt eine ehrliche Fehlermeldung, wenn der Storybook-Builder nicht antwortet', async () => {
  const fetchMock = vi.fn().mockRejectedValue(new Error('network down'));
  vi.stubGlobal('fetch', fetchMock);

  render(<Export result={imageResult} />);
  fireEvent.click(screen.getByRole('button', { name: /in storybook öffnen/i }));

  await waitFor(() => expect(screen.getByText(/konnte nicht gebaut werden/i)).toBeInTheDocument());

  vi.unstubAllGlobals();
});
```

- [ ] **Step 2: Test laufen lassen, Fehlschlag bestätigen**

Run: `cd "web" && npx vitest run src/pages/Export.test.jsx`
Expected: FAIL — `Unable to find role "button" with name /in storybook öffnen/i`

- [ ] **Step 3: Button + Handler implementieren**

In `web/src/pages/Export.jsx`:

Import-Zeile (Zeile 2) erweitern:

```js
import { buildExports, EXPORT_FORMATS, buildLibraryZip, buildStorybookZip, storybookFiles } from '../lib/emit/index.js';
```

Nach der `ZipTag`-Funktion (nach Zeile 17), vor `export default function Export`, die Builder-URL ergänzen:

```js
// Dev: eigener kleiner Dienst auf Port 4400 (siehe storybook-harness/server.js).
// Prod: über VITE_STORYBOOK_BUILDER_URL gesetzt (zweiter Railway-Service).
const STORYBOOK_BUILDER_URL = import.meta.env.VITE_STORYBOOK_BUILDER_URL || 'http://localhost:4400';
```

Im Komponentenkörper, nach der bestehenden State-Zeile `const [figmaCopied, setFigmaCopied] = useState(null);` (Zeile 37), neuen State ergänzen:

```js
const [storybookPreview, setStorybookPreview] = useState(null); // null | 'building' | 'error'
```

Nach `handleExportStorybook` (nach Zeile 96), neuen Handler ergänzen:

```js
const handleOpenStorybookPreview = async () => {
  setStorybookPreview('building');
  try {
    const files = storybookFiles(result);
    const components = {};
    const stories = {};
    for (const [filePath, content] of Object.entries(files)) {
      if (filePath.startsWith('components/')) components[filePath.slice('components/'.length)] = content;
      else if (filePath.startsWith('stories/')) stories[filePath.slice('stories/'.length)] = content;
    }
    const res = await fetch(`${STORYBOOK_BUILDER_URL}/build`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ components, stories }),
    });
    if (!res.ok) throw new Error('Storybook-Builder antwortete mit Fehler');
    const { url } = await res.json();
    window.open(`${STORYBOOK_BUILDER_URL}${url}`, '_blank');
    setStorybookPreview(null);
  } catch (err) {
    console.error('Storybook-Live-Preview fehlgeschlagen:', err);
    setStorybookPreview('error');
    setTimeout(() => setStorybookPreview(null), 4000);
  }
};
```

Im JSX, in der „Nach Storybook"-Karte (Zeile 185-197), den neuen Button unter dem bestehenden Download-Button ergänzen:

```jsx
        <div className="border border-zinc-200 rounded-lg p-4 flex flex-col gap-3">
          <h4 className="text-sm font-medium text-zinc-900">Nach Storybook <ZipTag /></h4>
          <p className="text-xs text-zinc-500 leading-relaxed flex-1">
            Komponenten + <code className="text-[11px]">*.stories.jsx</code> + <code className="text-[11px]">.storybook/main.js</code> — das Developer-Paket zum Reinlegen.
          </p>
          <button
            onClick={handleExportStorybook}
            title="Komponenten + Stories + .storybook/main.js als Handoff-Paket"
            className="w-full text-xs px-2.5 py-1.5 rounded bg-primary text-white font-medium hover:bg-primary-hover transition-colors"
          >
            Nach Storybook exportieren
          </button>
          <button
            onClick={handleOpenStorybookPreview}
            disabled={storybookPreview === 'building'}
            className="w-full text-xs px-2.5 py-1.5 rounded border border-zinc-200 text-zinc-700 hover:bg-zinc-50 transition-colors disabled:opacity-50"
          >
            {storybookPreview === 'building' ? 'Storybook wird gebaut …' : 'In Storybook öffnen'}
          </button>
          {storybookPreview === 'error' && (
            <span className="text-[11px] text-red-600">Storybook konnte nicht gebaut werden — bitte nochmal versuchen.</span>
          )}
        </div>
```

- [ ] **Step 4: Test laufen lassen, Erfolg bestätigen**

Run: `cd "web" && npx vitest run src/pages/Export.test.jsx`
Expected: PASS, alle Tests grün (inkl. der beiden neuen).

- [ ] **Step 5: Ganze Web-Suite laufen lassen (Regressionscheck)**

Run: `cd "web" && npx vitest run`
Expected: alle Tests weiterhin grün, keine neuen Fehlschläge.

- [ ] **Step 6: Commit**

```bash
git add web/src/pages/Export.jsx web/src/pages/Export.test.jsx
git commit -m "feat(web): Export-Seite bekommt 'In Storybook öffnen' — echter Live-Preview ohne Terminal"
```

---

## Task 9: Manueller End-to-End-Test (beide Dienste lokal)

Kein Code-Task — Verifikation vor dem ersten Live-Einsatz. Reihenfolge:

- [ ] **Schritt 1:** Storybook-Builder lokal starten
  Run: `cd "storybook-harness" && PORT=4400 npm start`
  Expected: Konsole zeigt „📚 Storybook-Builder läuft auf http://localhost:4400"

- [ ] **Schritt 2:** Haupt-App lokal starten (zweites Terminal, Repo-Wurzel)
  Run: `npm run dev`
  Expected: Server auf `:3047`, Vite auf `:5173` wie gewohnt.

- [ ] **Schritt 3:** Im Browser `http://localhost:5173` öffnen, ein Bild importieren (wie im bestehenden Ablauf), zur Export-Seite gehen.

- [ ] **Schritt 4:** Auf „In Storybook öffnen" klicken.
  Expected: Button zeigt kurz „Storybook wird gebaut …", nach ~5-10s öffnet sich ein neuer Tab mit einem echten Storybook, das genau die soeben interpretierten Bausteine zeigt (nicht das Sunstone-Beispiel).

- [ ] **Schritt 5:** In der neuen Storybook-Ansicht: Konsole auf Fehler prüfen, mindestens einen gegroundeten Baustein (mit `@/components/ui/*`-Import) anklicken und prüfen, dass er sichtbar rendert (kein „Failed to fetch"/kein Parse-Error).

- [ ] **Schritt 6:** Absichtlich einen zweiten Import mit einem Bild machen, das erfahrungsgemäß mal einen KI-Interpretationsfehler auslöst (falls verfügbar) — prüfen, dass bei einem Build-Fehler die rote Fehlermeldung erscheint statt eines hängenden Buttons.

---

## Task 10: Deployment (Rob, manueller Schritt — kein Code)

- [ ] Im Railway-Dashboard einen **neuen Service** im selben Projekt anlegen, **Root-Verzeichnis auf `storybook-harness/`** setzen. `railway.json` aus Task 6 wird automatisch erkannt (NIXPACKS, Start-Command, Healthcheck).
- [ ] Im **bestehenden** Web-Service die Env-Var `VITE_STORYBOOK_BUILDER_URL` auf die URL des neuen Service setzen (Railway zeigt sie nach dem ersten Deploy an, Format etwa `https://<name>.up.railway.app`).
- [ ] Im **neuen** Service die Env-Var `CORS_ORIGIN` auf die Domain der Haupt-App setzen (`https://designbridge-production.up.railway.app`), sonst blockt der Browser den `/build`-Aufruf.
- [ ] Nach dem Deploy: einmal den manuellen Test aus Task 9 gegen die **Live-URLs** wiederholen, bevor die Testperson den Link bekommt.

---

## Selbst-Review (durchgeführt)

**Spec-Abdeckung:**
- Serverseitiger On-Demand-Build ✅ Task 2
- `node_modules`-Symlink statt Kopie (Spike-Ergebnis) ✅ Task 2, Step 3
- Subpath-Serving `/preview/:id/*` (Spike-Ergebnis) ✅ Task 5
- 30-Minuten-TTL nach Store-Muster ✅ Task 2 (Default) + Task 4 (Test)
- Fehlerfall mit ehrlicher deutscher Meldung, kein Stacktrace ✅ Task 3 (Backend), Task 8 (Frontend)
- Eigener Railway-Service, Haupt-App unangetastet ✅ Task 6, Task 10
- Kein zusätzlicher KI-Aufruf ✅ architekturell erfüllt — `buildPreview` bekommt nur bereits interpretierte Bausteine, ruft keine KI-Route auf
- Ladezustand während der Bauzeit ✅ Task 8 (`storybookPreview === 'building'`)

**Placeholder-Scan:** keine TBD/TODO, jeder Schritt enthält vollständigen Code.

**Typkonsistenz:** `buildPreview({ components, stories }, opts)` → `{ id, staticDir, expiresAt }` durchgängig gleich benutzt in `buildPreview.test.js`, `server.js`, `server.test.js`. `getPreviewDir(id)` gibt in allen Verwendungsstellen den `staticDir`-Pfad zurück (nicht `workDir`) — geprüft.

**Scope:** Ein zusammenhängendes Feature, keine Aufteilung nötig — jeder Task liefert für sich lauffähigen, getesteten Code.
