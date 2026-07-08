# Visuelle Interpretation Slice 1 — Implementierungsplan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Nach einem Bild-Import bekommen alle Bausteine ohne Hand-Template automatisch eine KI-interpretierte shadcn/Tailwind-Vorschau in der Library (gelbe Pille „von KI interpretiert"), gerendert in einem sandboxed iframe.

**Architecture:** Der Server behält das Upload-Bild 15 min in einem In-Memory-Store (`imageStore`) und gibt `meta.import_id` zurück. Ein neuer Endpoint `POST /api/interpret/components` macht EINEN Claude-Vision-Call (Bild + Liste aller Nicht-Template-Bausteine) und liefert je Baustein `{html, jsx}`. Die Web-App triggert das automatisch nach dem Import, cached das Ergebnis im `lastImport` (localStorage) und rendert `html` in einem sandboxed `<iframe>` mit Tailwind-Laufzeit. Fehler fallen weich auf den heutigen Platzhalter zurück („Erneut versuchen"). `DEMO_FALLBACK=1` liefert Fixture-Interpretationen — Feature ist ohne Credits baubar/testbar.

**Tech Stack:** Express + `@anthropic-ai/sdk` (Server, injizierbarer Client wie `recognizeWithAi.js`), `node --test` (Server-Tests, Glob `server/lib/*.test.js`), React + Vitest (Web), Tailwind Play CDN im iframe.

**Spec:** `docs/superpowers/specs/2026-07-08-visual-interpretation-slice1-design.md`

**Wichtige Repo-Regeln:** Nach Datei-Writes in served-Verzeichnissen `find . -name '._*' -delete` (AppleDouble, CLAUDE.md Regel 7). Keine neuen Dependencies nötig.

**Datenformen (überall identisch verwenden):**
- Request `POST /api/interpret/components`: `{ "import_id": "abc123", "components": [{ "name", "kind", "variants": [], "notes": "" }] }`
- Response: `{ "interpretations": [{ "name", "html", "jsx" }], "failed": ["Name", …] }`
- Web-Cache auf `result` (= `designbridge.lastImport`): `interpretations: { [name]: { html, jsx } }`, `interpretFailed: [name]`, `interpretPending: bool`, `interpretError: string|null`

---

### Task 0: Branch + Baseline

**Files:** keine

- [ ] **Step 1: Branch anlegen** (wir arbeiten im Haupt-Repo, kein Worktree — Muster Phase 5.2)

```bash
cd "/Volumes/4TB Shield/Vibe Coding Bootcamp/Projekte/Designbridge"
git checkout main && git pull
git checkout -b feat/visual-interpretation-v1
```

- [ ] **Step 2: Baseline verifizieren**

Run: `npm run test:server` → Expected: 77/77 pass.
Run: `cd web && npx vitest run` → Expected: 127/127 pass.

---

### Task 1: Server — `imageStore.js` (Bild 15 min behalten)

**Files:**
- Create: `server/lib/imageStore.js`
- Test: `server/lib/imageStore.test.js`

- [ ] **Step 1: Failing Test schreiben**

```js
// server/lib/imageStore.test.js
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { putImage, getImage, removeImage, clearImages } from './imageStore.js';

function tmpFile() {
  const p = path.join(os.tmpdir(), `db-imgstore-${Date.now()}-${Math.random().toString(16).slice(2)}.png`);
  fs.writeFileSync(p, 'fake-png-bytes');
  return p;
}

beforeEach(() => clearImages());

test('putImage/getImage roundtrip liefert Pfad und Mimetype', () => {
  const p = tmpFile();
  const id = putImage(p, 'image/png');
  assert.equal(typeof id, 'string');
  assert.ok(id.length >= 8);
  assert.deepEqual(getImage(id), { path: p, mimetype: 'image/png' });
});

test('getImage mit unbekannter ID liefert null', () => {
  assert.equal(getImage('nope'), null);
});

test('removeImage entfernt Eintrag und löscht die Datei', async () => {
  const p = tmpFile();
  const id = putImage(p, 'image/png');
  removeImage(id);
  assert.equal(getImage(id), null);
  // unlink ist async-fire-and-forget — kurz warten
  await new Promise((r) => setTimeout(r, 50));
  assert.equal(fs.existsSync(p), false);
});

test('Eintrag verfällt nach TTL und Datei wird gelöscht', async () => {
  const p = tmpFile();
  const id = putImage(p, 'image/png', { ttlMs: 30 });
  assert.ok(getImage(id));
  await new Promise((r) => setTimeout(r, 120));
  assert.equal(getImage(id), null);
  assert.equal(fs.existsSync(p), false);
});

test('clearImages räumt alles ab', () => {
  const id1 = putImage(tmpFile(), 'image/png');
  const id2 = putImage(tmpFile(), 'image/jpeg');
  clearImages();
  assert.equal(getImage(id1), null);
  assert.equal(getImage(id2), null);
});
```

- [ ] **Step 2: Test laufen lassen — muss fehlschlagen**

Run: `node --test server/lib/imageStore.test.js`
Expected: FAIL (`Cannot find module './imageStore.js'`)

- [ ] **Step 3: Implementieren**

```js
// server/lib/imageStore.js
// Kurzlebiger In-Memory-Store für Upload-Bilder, damit die KI-Interpretation
// das Original nach dem Scan noch einmal ansehen kann. Kein Persistieren;
// nach TTL wird der Eintrag entfernt UND die Tempdatei gelöscht.
// Muster: figmaExportStore.js (ephemerer Übergabepuffer).
import fs from 'fs';
import crypto from 'crypto';

const TTL_MS = 15 * 60 * 1000; // 15 Minuten

const entries = new Map(); // id → { path, mimetype, timer }

export function putImage(path, mimetype, { ttlMs = TTL_MS } = {}) {
  const id = crypto.randomBytes(8).toString('hex');
  const timer = setTimeout(() => removeImage(id), ttlMs);
  if (timer.unref) timer.unref(); // Prozess-Exit nicht blockieren
  entries.set(id, { path, mimetype, timer });
  return id;
}

export function getImage(id) {
  const e = entries.get(id);
  return e ? { path: e.path, mimetype: e.mimetype } : null;
}

export function removeImage(id) {
  const e = entries.get(id);
  if (!e) return;
  clearTimeout(e.timer);
  entries.delete(id);
  fs.unlink(e.path, () => {});
}

export function clearImages() {
  for (const id of [...entries.keys()]) removeImage(id);
}
```

- [ ] **Step 4: Test laufen lassen — muss bestehen**

Run: `node --test server/lib/imageStore.test.js`
Expected: 5/5 PASS

- [ ] **Step 5: Commit**

```bash
find . -name '._*' -not -path '*/node_modules/*' -delete
git add server/lib/imageStore.js server/lib/imageStore.test.js
git commit -m "feat(server): imageStore — Upload-Bild 15 min für Interpretation behalten"
```

---

### Task 2: Server — `scan.js` verdrahten (`meta.import_id`)

**Files:**
- Modify: `server/routes/scan.js` (nur der `POST /image`-Handler, ~Zeilen 42–80)

- [ ] **Step 1: Import ergänzen** (oben bei den anderen lib-Imports)

```js
import { putImage } from '../lib/imageStore.js';
```

- [ ] **Step 2: Handler umbauen** — heute löscht `finally { fs.unlink(req.file.path, …) }` das Bild IMMER sofort. Neu: bei Erfolg UND im `DEMO_FALLBACK`-Pfad wandert das Bild in den Store (Antwort bekommt `meta.import_id`); nur im harten 500-Fehlerpfad wird direkt gelöscht. Der Handler wird zu:

```js
router.post('/image', upload.single('image'), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'No image uploaded' });
  }

  let extractTargets = {};
  try {
    extractTargets = req.body.extract ? JSON.parse(req.body.extract) : {};
  } catch {
    extractTargets = {};
  }

  try {
    console.log(`[scan] Analyzing ${req.file.originalname} (${(req.file.size / 1024).toFixed(0)} KB)`);

    const result = await analyzeScreenshot(
      req.file.path,
      req.file.mimetype,
      extractTargets
    );

    result.meta.image_filename = req.file.originalname;
    // Bild kurzlebig behalten, damit /api/interpret/components es ansehen kann.
    result.meta.import_id = putImage(req.file.path, req.file.mimetype);

    res.json(result);
  } catch (err) {
    console.error('[scan] Error:', err.message);
    if (process.env.DEMO_FALLBACK === '1') {
      console.warn('[scan] DEMO_FALLBACK active — returning bundled fixture instead of failing.');
      // Brief pause so the "Extracting tokens…" progress reads like a real analysis.
      await new Promise(r => setTimeout(r, 2500));
      const fallback = loadDemoFallback(req.file.originalname);
      fallback.meta.import_id = putImage(req.file.path, req.file.mimetype);
      res.json(fallback);
    } else {
      fs.unlink(req.file.path, () => {});
      res.status(500).json({ error: err.message });
    }
  }
});
```

**Achtung:** Der bisherige `finally`-Block entfällt komplett — die Löschung übernimmt jetzt der Store (TTL) bzw. der 500-Pfad.

- [ ] **Step 3: Verifizieren — keine Regression**

Run: `npm run test:server`
Expected: 82/82 PASS (77 alte + 5 neue aus Task 1; Route selbst ist nicht im Test-Glob, wird im Browser-Smoke geprüft)

- [ ] **Step 4: Commit**

```bash
git add server/routes/scan.js
git commit -m "feat(server): Scan behält Bild im imageStore, Antwort trägt meta.import_id"
```

---

### Task 3: Server — `interpretComponents.js` (der eine Vision-Call)

**Files:**
- Create: `server/lib/interpretComponents.js`
- Test: `server/lib/interpretComponents.test.js`

- [ ] **Step 1: Failing Test schreiben**

```js
// server/lib/interpretComponents.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { interpretComponents, sanitizeHtml } from './interpretComponents.js';

function tmpImage() {
  const p = path.join(os.tmpdir(), `db-interp-${Date.now()}.png`);
  fs.writeFileSync(p, Buffer.from('89504e47', 'hex')); // PNG-Magic reicht — wird nur base64-gelesen
  return p;
}

function fakeClient(responseObj) {
  const calls = [];
  return {
    calls,
    messages: {
      create: async (args) => {
        calls.push(args);
        return { content: [{ text: JSON.stringify(responseObj) }] };
      },
    },
  };
}

const COMPONENTS = [
  { name: 'Stat Card', kind: 'component', variants: [], notes: '' },
  { name: 'Data Table', kind: 'component', variants: [], notes: '' },
];

test('liefert Interpretationen für angefragte Bausteine', async () => {
  const client = fakeClient({
    interpretations: [
      { name: 'Stat Card', html: '<div class="rounded-lg border p-4">Umsatz</div>', jsx: 'export function StatCard() { return null; }' },
      { name: 'Data Table', html: '<table class="w-full"><tr><td>Zeile</td></tr></table>', jsx: 'export function DataTable() { return null; }' },
    ],
  });
  const res = await interpretComponents(tmpImage(), 'image/png', COMPONENTS, { client });
  assert.equal(res.interpretations.length, 2);
  assert.deepEqual(res.failed, []);
  assert.equal(res.interpretations[0].name, 'Stat Card');
  assert.match(res.interpretations[0].html, /rounded-lg/);
});

test('EIN Call: Bild als base64-Block + Prompt enthält Baustein-Namen', async () => {
  const client = fakeClient({ interpretations: [] });
  await interpretComponents(tmpImage(), 'image/png', COMPONENTS, { client });
  assert.equal(client.calls.length, 1);
  const content = client.calls[0].messages[0].content;
  assert.equal(content[0].type, 'image');
  assert.equal(content[0].source.media_type, 'image/png');
  assert.ok(content[0].source.data.length > 0);
  assert.match(content[1].text, /Stat Card/);
  assert.match(content[1].text, /Data Table/);
});

test('fehlender oder leerer Baustein landet in failed, Rest liefert', async () => {
  const client = fakeClient({
    interpretations: [
      { name: 'Stat Card', html: '<div class="p-2">ok</div>', jsx: '' },
      { name: 'Data Table', html: '   ', jsx: 'x' }, // leer nach trim → failed
    ],
  });
  const res = await interpretComponents(tmpImage(), 'image/png', COMPONENTS, { client });
  assert.equal(res.interpretations.length, 1);
  assert.deepEqual(res.failed, ['Data Table']);
});

test('script-Tags und on*-Attribute werden gestrippt', () => {
  const dirty = '<div class="p-2" onclick="evil()"><script>alert(1)</script>Hi<img src=x onerror=evil()></div>';
  const clean = sanitizeHtml(dirty);
  assert.doesNotMatch(clean, /<script/i);
  assert.doesNotMatch(clean, /onclick/i);
  assert.doesNotMatch(clean, /onerror/i);
  assert.match(clean, /Hi/);
});

test('ungültiges JSON von Claude wirft verständlichen Fehler', async () => {
  const client = { messages: { create: async () => ({ content: [{ text: 'Sorry, kann ich nicht.' }] }) } };
  await assert.rejects(
    () => interpretComponents(tmpImage(), 'image/png', COMPONENTS, { client }),
    /invalid JSON/
  );
});
```

- [ ] **Step 2: Test laufen lassen — muss fehlschlagen**

Run: `node --test server/lib/interpretComponents.test.js`
Expected: FAIL (`Cannot find module './interpretComponents.js'`)

- [ ] **Step 3: Implementieren**

```js
// server/lib/interpretComponents.js
// EIN Claude-Vision-Call pro Import: Original-Bild + Liste der Bausteine ohne
// Template → je Baustein eine möglichst originalgetreue shadcn/Tailwind-
// Umsetzung { html, jsx }. Injizierbarer Client wie recognizeWithAi.js.
import Anthropic from '@anthropic-ai/sdk';
import fs from 'fs';

const MODEL = 'claude-sonnet-4-5';

export function sanitizeHtml(html) {
  return String(html ?? '')
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<script\b[^>]*>/gi, '')
    .replace(/\son\w+\s*=\s*"[^"]*"/gi, '')
    .replace(/\son\w+\s*=\s*'[^']*'/gi, '')
    .replace(/\son\w+\s*=\s*[^\s>]+/gi, '');
}

function buildPrompt(components) {
  return `You are a UI reconstruction engine. You see a screenshot of a real user interface. For EACH component in the list below, reconstruct it as faithfully as possible to how it appears in THIS screenshot.

Return ONLY valid JSON, no markdown, no preamble, in this shape:
{
  "interpretations": [
    { "name": "<exact name from the list>", "html": "<self-contained HTML using ONLY Tailwind utility classes>", "jsx": "<the same component as a React function component in shadcn/Tailwind style, exported with a PascalCase name>" }
  ]
}

Rules:
- Stay as close to the original as possible: copy the visible colors (as Tailwind arbitrary values like bg-[#4263EB]), spacing, radii, typography and REAL text content from the screenshot.
- html must be fully self-contained: Tailwind classes only, no <script>, no event handlers, no external images or fonts. Inline SVG is allowed (e.g. for simple chart shapes).
- For charts, reconstruct a simplified but recognizable visual (bars/lines/donut as divs or inline SVG) — not a live chart library.
- Keep each html snippet compact (one component, not the whole page).
- If a component is not clearly visible in the screenshot, still produce your best faithful guess from its name and notes.

COMPONENTS TO RECONSTRUCT:
${JSON.stringify(components, null, 2)}`;
}

export async function interpretComponents(imagePath, mimetype, components, { client } = {}) {
  const c = client ?? new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const base64 = fs.readFileSync(imagePath).toString('base64');
  const response = await c.messages.create({
    model: MODEL,
    max_tokens: 16384,
    messages: [{
      role: 'user',
      content: [
        { type: 'image', source: { type: 'base64', media_type: mimetype, data: base64 } },
        { type: 'text', text: buildPrompt(components) },
      ],
    }],
  });
  const text = response.content.map((b) => b.text || '').join('');
  const clean = text.replace(/```json\n?|```\n?/g, '').trim();
  let parsed;
  try {
    parsed = JSON.parse(clean);
  } catch {
    throw new Error(`Claude returned invalid JSON. Raw: ${text.slice(0, 300)}`);
  }
  const byName = new Map((parsed.interpretations ?? []).map((i) => [i.name, i]));
  const interpretations = [];
  const failed = [];
  for (const comp of components) {
    const it = byName.get(comp.name);
    const html = sanitizeHtml(it?.html);
    if (!it || !html.trim()) {
      failed.push(comp.name);
      continue;
    }
    interpretations.push({
      name: comp.name,
      html,
      jsx: typeof it.jsx === 'string' && it.jsx.trim() ? it.jsx : '',
    });
  }
  return { interpretations, failed };
}
```

- [ ] **Step 4: Test laufen lassen — muss bestehen**

Run: `node --test server/lib/interpretComponents.test.js`
Expected: 5/5 PASS

- [ ] **Step 5: Commit**

```bash
find . -name '._*' -not -path '*/node_modules/*' -delete
git add server/lib/interpretComponents.js server/lib/interpretComponents.test.js
git commit -m "feat(server): interpretComponents — ein Vision-Call, {html,jsx} je Baustein"
```

---

### Task 4: Server — Demo-Fixture `demo-interpretations.json`

**Files:**
- Create: `server/fixtures/demo-interpretations.json`
- Test: `server/lib/demoInterpretations.test.js`

Kontext: Die Demo-Dashboard-Fixture (`demo-dashboard.json`) enthält 17 Bausteine; ohne Template (kein button/card/badge/input im Namen) sind: **Avatar, Status Dot, Sidebar Navigation, Donut Chart, Bar Chart, Data Table, Tooltip, Segmented Control, Category List Item, Dashboard Grid Layout, Metrics Overview, Sidebar + Content Shell** (Namen mit „Card"/„Button"/„Input" matchen Templates). Die Fixture liefert für ALLE 12 eine Interpretation im Demo-Dashboard-Look (Blau `#4263EB`, Zinc-Grau, `rounded-lg`).

- [ ] **Step 1: Failing Test schreiben**

```js
// server/lib/demoInterpretations.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FIXTURE = path.join(__dirname, '../fixtures/demo-interpretations.json');

test('Fixture existiert, ist valides JSON-Array', () => {
  const all = JSON.parse(fs.readFileSync(FIXTURE, 'utf8'));
  assert.ok(Array.isArray(all));
  assert.ok(all.length >= 12);
});

test('jeder Eintrag hat name/html/jsx, html ist script-frei', () => {
  const all = JSON.parse(fs.readFileSync(FIXTURE, 'utf8'));
  for (const e of all) {
    assert.equal(typeof e.name, 'string');
    assert.ok(e.name.length > 0);
    assert.ok(e.html.trim().length > 0, `${e.name}: html leer`);
    assert.equal(typeof e.jsx, 'string');
    assert.doesNotMatch(e.html, /<script/i, `${e.name}: script im html`);
    assert.doesNotMatch(e.html, /\son\w+=/i, `${e.name}: on*-Handler im html`);
  }
});

test('deckt die Nicht-Template-Bausteine der Demo-Dashboard-Fixture ab', () => {
  const all = JSON.parse(fs.readFileSync(FIXTURE, 'utf8'));
  const names = new Set(all.map((e) => e.name));
  for (const required of [
    'Avatar', 'Status Dot', 'Sidebar Navigation', 'Donut Chart', 'Bar Chart',
    'Data Table', 'Tooltip', 'Segmented Control', 'Category List Item',
    'Dashboard Grid Layout', 'Metrics Overview', 'Sidebar + Content Shell',
  ]) {
    assert.ok(names.has(required), `fehlt: ${required}`);
  }
});
```

- [ ] **Step 2: Test laufen lassen — muss fehlschlagen**

Run: `node --test server/lib/demoInterpretations.test.js`
Expected: FAIL (Datei existiert nicht)

- [ ] **Step 3: Fixture schreiben** — `server/fixtures/demo-interpretations.json` mit exakt diesem Inhalt:

```json
[
  {
    "name": "Avatar",
    "html": "<div class=\"flex items-center gap-3\"><div class=\"h-9 w-9 rounded-full bg-[#4263EB] text-white flex items-center justify-center text-sm font-medium\">RK</div><div class=\"h-9 w-9 rounded-full bg-[#EDF2FF] text-[#4263EB] flex items-center justify-center text-sm font-medium\">AM</div></div>",
    "jsx": "export function Avatar({ initials = \"RK\", className = \"\" }) {\n  return (\n    <div className={`h-9 w-9 rounded-full bg-[#4263EB] text-white flex items-center justify-center text-sm font-medium ${className}`}>\n      {initials}\n    </div>\n  );\n}\n"
  },
  {
    "name": "Status Dot",
    "html": "<div class=\"flex items-center gap-4 text-sm text-[#495057]\"><span class=\"flex items-center gap-1.5\"><span class=\"h-2 w-2 rounded-full bg-[#51CF66]\"></span>Aktiv</span><span class=\"flex items-center gap-1.5\"><span class=\"h-2 w-2 rounded-full bg-[#FCC419]\"></span>Wartend</span></div>",
    "jsx": "export function StatusDot({ color = \"#51CF66\", label = \"Aktiv\" }) {\n  return (\n    <span className=\"flex items-center gap-1.5 text-sm text-[#495057]\">\n      <span className=\"h-2 w-2 rounded-full\" style={{ backgroundColor: color }} />\n      {label}\n    </span>\n  );\n}\n"
  },
  {
    "name": "Sidebar Navigation",
    "html": "<nav class=\"w-56 rounded-lg border border-[#E9ECEF] bg-white p-3 space-y-1\"><div class=\"rounded-md bg-[#EDF2FF] px-3 py-2 text-sm font-medium text-[#4263EB]\">Dashboard</div><div class=\"rounded-md px-3 py-2 text-sm text-[#495057] hover:bg-[#F8F9FA]\">Berichte</div><div class=\"rounded-md px-3 py-2 text-sm text-[#495057] hover:bg-[#F8F9FA]\">Ereignisse</div><div class=\"rounded-md px-3 py-2 text-sm text-[#495057] hover:bg-[#F8F9FA]\">Einstellungen</div></nav>",
    "jsx": "export function SidebarNavigation({ items = [\"Dashboard\", \"Berichte\", \"Ereignisse\", \"Einstellungen\"], active = 0 }) {\n  return (\n    <nav className=\"w-56 rounded-lg border border-[#E9ECEF] bg-white p-3 space-y-1\">\n      {items.map((label, i) => (\n        <div key={label} className={`rounded-md px-3 py-2 text-sm ${i === active ? \"bg-[#EDF2FF] font-medium text-[#4263EB]\" : \"text-[#495057] hover:bg-[#F8F9FA]\"}`}>\n          {label}\n        </div>\n      ))}\n    </nav>\n  );\n}\n"
  },
  {
    "name": "Donut Chart",
    "html": "<div class=\"rounded-lg border border-[#E9ECEF] bg-white p-4 w-56\"><div class=\"text-sm font-medium text-[#212529] mb-3\">Kategorien</div><svg viewBox=\"0 0 42 42\" class=\"h-28 w-28 mx-auto\"><circle cx=\"21\" cy=\"21\" r=\"15.9\" fill=\"none\" stroke=\"#E9ECEF\" stroke-width=\"6\"></circle><circle cx=\"21\" cy=\"21\" r=\"15.9\" fill=\"none\" stroke=\"#4263EB\" stroke-width=\"6\" stroke-dasharray=\"55 45\" stroke-dashoffset=\"25\"></circle><circle cx=\"21\" cy=\"21\" r=\"15.9\" fill=\"none\" stroke=\"#51CF66\" stroke-width=\"6\" stroke-dasharray=\"25 75\" stroke-dashoffset=\"70\"></circle></svg></div>",
    "jsx": "export function DonutChart({ title = \"Kategorien\" }) {\n  return (\n    <div className=\"rounded-lg border border-[#E9ECEF] bg-white p-4 w-56\">\n      <div className=\"text-sm font-medium text-[#212529] mb-3\">{title}</div>\n      <svg viewBox=\"0 0 42 42\" className=\"h-28 w-28 mx-auto\">\n        <circle cx=\"21\" cy=\"21\" r=\"15.9\" fill=\"none\" stroke=\"#E9ECEF\" strokeWidth=\"6\" />\n        <circle cx=\"21\" cy=\"21\" r=\"15.9\" fill=\"none\" stroke=\"#4263EB\" strokeWidth=\"6\" strokeDasharray=\"55 45\" strokeDashoffset=\"25\" />\n        <circle cx=\"21\" cy=\"21\" r=\"15.9\" fill=\"none\" stroke=\"#51CF66\" strokeWidth=\"6\" strokeDasharray=\"25 75\" strokeDashoffset=\"70\" />\n      </svg>\n    </div>\n  );\n}\n"
  },
  {
    "name": "Bar Chart",
    "html": "<div class=\"rounded-lg border border-[#E9ECEF] bg-white p-4 w-64\"><div class=\"text-sm font-medium text-[#212529] mb-3\">Umsatz je Monat</div><div class=\"flex items-end gap-2 h-24\"><div class=\"flex-1 rounded-t bg-[#4263EB]\" style=\"height:40%\"></div><div class=\"flex-1 rounded-t bg-[#4263EB]\" style=\"height:65%\"></div><div class=\"flex-1 rounded-t bg-[#4263EB]\" style=\"height:50%\"></div><div class=\"flex-1 rounded-t bg-[#4263EB]\" style=\"height:85%\"></div><div class=\"flex-1 rounded-t bg-[#5C7CFA]\" style=\"height:100%\"></div></div></div>",
    "jsx": "export function BarChart({ title = \"Umsatz je Monat\", values = [40, 65, 50, 85, 100] }) {\n  return (\n    <div className=\"rounded-lg border border-[#E9ECEF] bg-white p-4 w-64\">\n      <div className=\"text-sm font-medium text-[#212529] mb-3\">{title}</div>\n      <div className=\"flex items-end gap-2 h-24\">\n        {values.map((v, i) => (\n          <div key={i} className=\"flex-1 rounded-t bg-[#4263EB]\" style={{ height: `${v}%` }} />\n        ))}\n      </div>\n    </div>\n  );\n}\n"
  },
  {
    "name": "Data Table",
    "html": "<div class=\"rounded-lg border border-[#E9ECEF] bg-white overflow-hidden w-72\"><table class=\"w-full text-sm\"><thead><tr class=\"bg-[#F8F9FA] text-left text-[#868E96]\"><th class=\"px-3 py-2 font-medium\">Ereignis</th><th class=\"px-3 py-2 font-medium\">Status</th></tr></thead><tbody><tr class=\"border-t border-[#F1F3F5]\"><td class=\"px-3 py-2 text-[#212529]\">Deploy v2.1</td><td class=\"px-3 py-2\"><span class=\"rounded bg-[#51CF66]/15 px-1.5 py-0.5 text-xs text-[#2B8A3E]\">OK</span></td></tr><tr class=\"border-t border-[#F1F3F5]\"><td class=\"px-3 py-2 text-[#212529]\">Import Lauf</td><td class=\"px-3 py-2\"><span class=\"rounded bg-[#FCC419]/20 px-1.5 py-0.5 text-xs text-[#E67700]\">Läuft</span></td></tr></tbody></table></div>",
    "jsx": "export function DataTable({ rows = [[\"Deploy v2.1\", \"OK\"], [\"Import Lauf\", \"Läuft\"]] }) {\n  return (\n    <div className=\"rounded-lg border border-[#E9ECEF] bg-white overflow-hidden\">\n      <table className=\"w-full text-sm\">\n        <thead>\n          <tr className=\"bg-[#F8F9FA] text-left text-[#868E96]\">\n            <th className=\"px-3 py-2 font-medium\">Ereignis</th>\n            <th className=\"px-3 py-2 font-medium\">Status</th>\n          </tr>\n        </thead>\n        <tbody>\n          {rows.map(([name, status]) => (\n            <tr key={name} className=\"border-t border-[#F1F3F5]\">\n              <td className=\"px-3 py-2 text-[#212529]\">{name}</td>\n              <td className=\"px-3 py-2\">{status}</td>\n            </tr>\n          ))}\n        </tbody>\n      </table>\n    </div>\n  );\n}\n"
  },
  {
    "name": "Tooltip",
    "html": "<div class=\"inline-flex flex-col items-center\"><div class=\"rounded bg-[#1A1B1E] px-2 py-1 text-xs text-white\">Details anzeigen</div><div class=\"h-2 w-2 -mt-1 rotate-45 bg-[#1A1B1E]\"></div></div>",
    "jsx": "export function Tooltip({ label = \"Details anzeigen\" }) {\n  return (\n    <div className=\"inline-flex flex-col items-center\">\n      <div className=\"rounded bg-[#1A1B1E] px-2 py-1 text-xs text-white\">{label}</div>\n      <div className=\"h-2 w-2 -mt-1 rotate-45 bg-[#1A1B1E]\" />\n    </div>\n  );\n}\n"
  },
  {
    "name": "Segmented Control",
    "html": "<div class=\"inline-flex rounded-lg bg-[#F1F3F5] p-1 text-sm\"><div class=\"rounded-md bg-white px-3 py-1 font-medium text-[#212529] shadow-sm\">Woche</div><div class=\"px-3 py-1 text-[#868E96]\">Monat</div><div class=\"px-3 py-1 text-[#868E96]\">Jahr</div></div>",
    "jsx": "export function SegmentedControl({ options = [\"Woche\", \"Monat\", \"Jahr\"], active = 0 }) {\n  return (\n    <div className=\"inline-flex rounded-lg bg-[#F1F3F5] p-1 text-sm\">\n      {options.map((o, i) => (\n        <div key={o} className={`px-3 py-1 ${i === active ? \"rounded-md bg-white font-medium text-[#212529] shadow-sm\" : \"text-[#868E96]\"}`}>\n          {o}\n        </div>\n      ))}\n    </div>\n  );\n}\n"
  },
  {
    "name": "Category List Item",
    "html": "<div class=\"flex items-center gap-3 rounded-lg border border-[#E9ECEF] bg-white px-3 py-2 w-64\"><span class=\"h-2.5 w-2.5 rounded-full bg-[#4263EB]\"></span><span class=\"flex-1 text-sm text-[#212529]\">Marketing</span><span class=\"text-sm font-medium text-[#212529]\">42%</span></div>",
    "jsx": "export function CategoryListItem({ label = \"Marketing\", value = \"42%\", color = \"#4263EB\" }) {\n  return (\n    <div className=\"flex items-center gap-3 rounded-lg border border-[#E9ECEF] bg-white px-3 py-2\">\n      <span className=\"h-2.5 w-2.5 rounded-full\" style={{ backgroundColor: color }} />\n      <span className=\"flex-1 text-sm text-[#212529]\">{label}</span>\n      <span className=\"text-sm font-medium text-[#212529]\">{value}</span>\n    </div>\n  );\n}\n"
  },
  {
    "name": "Dashboard Grid Layout",
    "html": "<div class=\"grid grid-cols-3 gap-3 w-80\"><div class=\"h-14 rounded-lg border border-[#E9ECEF] bg-white\"></div><div class=\"h-14 rounded-lg border border-[#E9ECEF] bg-white\"></div><div class=\"h-14 rounded-lg border border-[#E9ECEF] bg-white\"></div><div class=\"col-span-2 h-20 rounded-lg border border-[#E9ECEF] bg-white\"></div><div class=\"h-20 rounded-lg border border-[#E9ECEF] bg-white\"></div></div>",
    "jsx": "export function DashboardGridLayout({ children }) {\n  return <div className=\"grid grid-cols-3 gap-3\">{children}</div>;\n}\n"
  },
  {
    "name": "Metrics Overview",
    "html": "<div class=\"flex gap-3\"><div class=\"rounded-lg border border-[#E9ECEF] bg-white p-4 w-36\"><div class=\"text-xs text-[#868E96]\">Umsatz</div><div class=\"text-xl font-semibold text-[#1A1B1E]\">€48.2k</div><div class=\"text-xs text-[#2B8A3E]\">+12%</div></div><div class=\"rounded-lg border border-[#E9ECEF] bg-white p-4 w-36\"><div class=\"text-xs text-[#868E96]\">Nutzer</div><div class=\"text-xl font-semibold text-[#1A1B1E]\">1.204</div><div class=\"text-xs text-[#C92A2A]\">-3%</div></div></div>",
    "jsx": "export function MetricsOverview({ metrics = [{ label: \"Umsatz\", value: \"€48.2k\", delta: \"+12%\" }] }) {\n  return (\n    <div className=\"flex gap-3\">\n      {metrics.map((m) => (\n        <div key={m.label} className=\"rounded-lg border border-[#E9ECEF] bg-white p-4 w-36\">\n          <div className=\"text-xs text-[#868E96]\">{m.label}</div>\n          <div className=\"text-xl font-semibold text-[#1A1B1E]\">{m.value}</div>\n          <div className=\"text-xs text-[#2B8A3E]\">{m.delta}</div>\n        </div>\n      ))}\n    </div>\n  );\n}\n"
  },
  {
    "name": "Sidebar + Content Shell",
    "html": "<div class=\"flex gap-3 w-80\"><div class=\"w-20 rounded-lg border border-[#E9ECEF] bg-[#F8F9FA] h-32\"></div><div class=\"flex-1 space-y-2\"><div class=\"h-8 rounded-lg border border-[#E9ECEF] bg-white\"></div><div class=\"h-20 rounded-lg border border-[#E9ECEF] bg-white\"></div></div></div>",
    "jsx": "export function SidebarContentShell({ sidebar, children }) {\n  return (\n    <div className=\"flex gap-3\">\n      <div className=\"w-56 shrink-0\">{sidebar}</div>\n      <div className=\"flex-1 space-y-3\">{children}</div>\n    </div>\n  );\n}\n"
  }
]
```

- [ ] **Step 4: Test laufen lassen — muss bestehen**

Run: `node --test server/lib/demoInterpretations.test.js`
Expected: 3/3 PASS

- [ ] **Step 5: Commit**

```bash
find . -name '._*' -not -path '*/node_modules/*' -delete
git add server/fixtures/demo-interpretations.json server/lib/demoInterpretations.test.js
git commit -m "feat(server): Demo-Fixture Interpretationen für alle Nicht-Template-Bausteine"
```

---

### Task 5: Server — Route `POST /api/interpret/components` + Mount

**Files:**
- Create: `server/routes/interpret.js`
- Modify: `server/index.js` (Import + `app.use`)

- [ ] **Step 1: Route implementieren** (dünn — Logik liegt getestet in den libs)

```js
// server/routes/interpret.js
import express from 'express';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { getImage } from '../lib/imageStore.js';
import { interpretComponents } from '../lib/interpretComponents.js';

const router = express.Router();
const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Demo safety net analog scan.js: bei DEMO_FALLBACK=1 liefert ein gescheiterter
// Live-Call die gebündelten Fixture-Interpretationen statt eines 502.
function loadDemoInterpretations(requestedNames) {
  const all = JSON.parse(
    fs.readFileSync(path.join(__dirname, '../fixtures/demo-interpretations.json'), 'utf8')
  );
  const byName = new Map(all.map((i) => [i.name, i]));
  const interpretations = [];
  const failed = [];
  for (const name of requestedNames) {
    const it = byName.get(name);
    if (it) interpretations.push(it);
    else failed.push(name);
  }
  return { interpretations, failed };
}

// POST /api/interpret/components
router.post('/components', async (req, res) => {
  const { import_id: importId, components } = req.body ?? {};
  if (!importId || !Array.isArray(components) || components.length === 0) {
    return res.status(400).json({ error: 'import_id und components sind erforderlich.' });
  }
  const image = getImage(importId);
  if (!image) {
    return res.status(410).json({ error: 'Bild nicht mehr verfügbar — bitte erneut importieren.' });
  }
  try {
    console.log(`[interpret] ${components.length} Bausteine für Import ${importId}`);
    const result = await interpretComponents(image.path, image.mimetype, components);
    res.json(result);
  } catch (err) {
    console.error('[interpret] Error:', err.message);
    if (process.env.DEMO_FALLBACK === '1') {
      try {
        console.warn('[interpret] DEMO_FALLBACK active — returning bundled interpretations.');
        return res.json(loadDemoInterpretations(components.map((c) => c.name)));
      } catch (fallbackErr) {
        console.error('[interpret] DEMO_FALLBACK failed:', fallbackErr.message);
        return res.status(502).json({ error: 'KI-Interpretation fehlgeschlagen — bitte später erneut versuchen.' });
      }
    }
    res.status(502).json({ error: 'KI-Interpretation fehlgeschlagen — bitte später erneut versuchen.' });
  }
});

export default router;
```

- [ ] **Step 2: In `server/index.js` mounten** — Import bei den anderen Routern, Mount bei den anderen `app.use`:

```js
import interpretRouter from './routes/interpret.js';
```

```js
app.use('/api/interpret', interpretRouter);
```

- [ ] **Step 3: Verifizieren — Suite + manueller Endpoint-Check**

Run: `npm run test:server`
Expected: 90/90 PASS (77 Baseline + 5 imageStore + 5 interpretComponents + 3 Fixture)

Run (Endpoint-Smoke, Server kurz starten):
```bash
PORT=3047 DEMO_FALLBACK=1 node server/index.js & SERVER_PID=$!; sleep 2
curl -s -X POST http://localhost:3047/api/interpret/components -H 'Content-Type: application/json' -d '{"import_id":"nope","components":[{"name":"Avatar"}]}'
kill $SERVER_PID
```
Expected: `{"error":"Bild nicht mehr verfügbar — bitte erneut importieren."}` (HTTP 410)

- [ ] **Step 4: Commit**

```bash
git add server/routes/interpret.js server/index.js
git commit -m "feat(server): POST /api/interpret/components — Route mit 410/502/Demo-Fallback"
```

---

### Task 6: Web — `interpret.js` (Filter, Request, Cache-Merge, Orchestrierung)

**Files:**
- Create: `web/src/lib/interpret.js`
- Test: `web/src/lib/interpret.test.js`

- [ ] **Step 1: Failing Test schreiben**

```js
// web/src/lib/interpret.test.js
import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  componentsNeedingInterpretation,
  requestInterpretations,
  attachInterpretations,
  runInterpretation,
} from './interpret.js';

const RESULT = {
  source: 'image',
  raw: {
    meta: { import_id: 'abc123' },
    tokens: {},
    atomics: [
      { name: 'Button', variants: ['primary'], confidence: 'high' }, // Template → raus
      { name: 'Avatar', variants: [], confidence: 'med', notes: 'rund' }, // kein Template → rein
    ],
    components: [
      { name: 'Stat Card', confidence: 'high' }, // "Card" matcht Template → raus
      { name: 'Data Table', confidence: 'med' }, // rein
    ],
    patterns: [{ name: 'Metrics Overview', confidence: 'low' }], // rein
  },
};

afterEach(() => vi.restoreAllMocks());

describe('componentsNeedingInterpretation', () => {
  it('filtert Template-Treffer raus und behält kind/variants/notes', () => {
    const todo = componentsNeedingInterpretation(RESULT);
    expect(todo.map((t) => t.name)).toEqual(['Avatar', 'Data Table', 'Metrics Overview']);
    expect(todo[0]).toEqual({ name: 'Avatar', kind: 'atomic', variants: [], notes: 'rund' });
  });

  it('lässt bereits interpretierte Bausteine aus', () => {
    const withOne = { ...RESULT, interpretations: { Avatar: { html: '<div/>', jsx: '' } } };
    expect(componentsNeedingInterpretation(withOne).map((t) => t.name)).toEqual([
      'Data Table', 'Metrics Overview',
    ]);
  });

  it('liefert [] ohne raw', () => {
    expect(componentsNeedingInterpretation({ source: 'url', raw: null })).toEqual([]);
  });
});

describe('requestInterpretations', () => {
  it('POSTet import_id + components und liefert die Antwort', async () => {
    const payload = { interpretations: [{ name: 'Avatar', html: '<div/>', jsx: '' }], failed: [] };
    const fetchMock = vi.fn(async () => ({ ok: true, json: async () => payload }));
    vi.stubGlobal('fetch', fetchMock);
    const res = await requestInterpretations('abc123', [{ name: 'Avatar' }]);
    expect(res).toEqual(payload);
    const [url, opts] = fetchMock.mock.calls[0];
    expect(url).toBe('/api/interpret/components');
    expect(JSON.parse(opts.body)).toEqual({ import_id: 'abc123', components: [{ name: 'Avatar' }] });
  });

  it('wirft die Server-Fehlermeldung bei !ok', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: false,
      json: async () => ({ error: 'Bild nicht mehr verfügbar — bitte erneut importieren.' }),
    })));
    await expect(requestInterpretations('old', [{ name: 'X' }])).rejects.toThrow(/nicht mehr verfügbar/);
  });
});

describe('attachInterpretations', () => {
  it('merged in die Map, setzt failed und beendet pending', () => {
    const next = attachInterpretations(
      { ...RESULT, interpretations: { Old: { html: '<b/>', jsx: '' } }, interpretPending: true },
      { interpretations: [{ name: 'Avatar', html: '<div/>', jsx: 'x' }], failed: ['Data Table'] }
    );
    expect(next.interpretations.Old).toBeTruthy();
    expect(next.interpretations.Avatar).toEqual({ html: '<div/>', jsx: 'x' });
    expect(next.interpretFailed).toEqual(['Data Table']);
    expect(next.interpretPending).toBe(false);
    expect(next.interpretError).toBeNull();
  });
});

describe('runInterpretation', () => {
  it('liefert null wenn nichts zu tun ist (keine offenen Bausteine)', async () => {
    const done = {
      ...RESULT,
      interpretations: {
        Avatar: { html: '<div/>', jsx: '' },
        'Data Table': { html: '<div/>', jsx: '' },
        'Metrics Overview': { html: '<div/>', jsx: '' },
      },
    };
    expect(await runInterpretation(done)).toBeNull();
  });

  it('liefert null ohne import_id oder für nicht-image-Quellen', async () => {
    expect(await runInterpretation({ ...RESULT, raw: { ...RESULT.raw, meta: {} } })).toBeNull();
    expect(await runInterpretation({ ...RESULT, source: 'url' })).toBeNull();
  });

  it('happy path: holt und merged', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: true,
      json: async () => ({ interpretations: [{ name: 'Avatar', html: '<div/>', jsx: '' }], failed: [] }),
    })));
    const next = await runInterpretation(RESULT);
    expect(next.interpretations.Avatar).toBeTruthy();
    expect(next.interpretPending).toBe(false);
  });

  it('Fehlerpfad: markiert alle offenen als failed + setzt interpretError', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, json: async () => ({ error: 'kaputt' }) })));
    const next = await runInterpretation(RESULT);
    expect(next.interpretError).toBe('kaputt');
    expect(next.interpretFailed).toEqual(['Avatar', 'Data Table', 'Metrics Overview']);
    expect(next.interpretPending).toBe(false);
  });
});
```

- [ ] **Step 2: Test laufen lassen — muss fehlschlagen**

Run: `cd web && npx vitest run src/lib/interpret.test.js`
Expected: FAIL (Modul existiert nicht)

- [ ] **Step 3: Implementieren**

```js
// web/src/lib/interpret.js
// Automatische KI-Interpretation der Bausteine ohne Hand-Template nach einem
// Bild-Import. Ergebnis wird ins lastImport-Result gemerged (localStorage-Cache).
import { matchTemplate } from './components/templates/registry.js';

const KINDS = [
  ['atomics', 'atomic'],
  ['components', 'component'],
  ['patterns', 'pattern'],
];

/** Bausteine ohne Template, die noch keine Interpretation im Cache haben. */
export function componentsNeedingInterpretation(result) {
  const raw = result?.raw;
  if (!raw) return [];
  const have = result?.interpretations ?? {};
  const out = [];
  for (const [rawKey, kind] of KINDS) {
    for (const item of raw[rawKey] ?? []) {
      if (matchTemplate(item.name)) continue;
      if (have[item.name]) continue;
      out.push({
        name: item.name,
        kind,
        variants: item.variants ?? [],
        notes: item.notes ?? '',
      });
    }
  }
  return out;
}

export async function requestInterpretations(importId, components) {
  const res = await fetch('/api/interpret/components', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ import_id: importId, components }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Interpretation fehlgeschlagen');
  return data;
}

/** Antwort in das Result mergen (immutable) — beendet den pending-Zustand. */
export function attachInterpretations(result, data) {
  const map = { ...(result.interpretations ?? {}) };
  for (const it of data.interpretations ?? []) {
    map[it.name] = { html: it.html, jsx: it.jsx };
  }
  return {
    ...result,
    interpretations: map,
    interpretFailed: data.failed ?? [],
    interpretPending: false,
    interpretError: null,
  };
}

/**
 * Orchestrierung: prüft ob etwas zu tun ist, ruft den Endpoint, merged.
 * Gibt das nächste Result zurück — oder null, wenn nichts zu tun war.
 * Wirft nie: Fehler landen als interpretError/interpretFailed im Result.
 */
export async function runInterpretation(result) {
  const todo = componentsNeedingInterpretation(result);
  const importId = result?.raw?.meta?.import_id;
  if (result?.source !== 'image' || !importId || todo.length === 0) return null;
  try {
    const data = await requestInterpretations(importId, todo);
    return attachInterpretations(result, data);
  } catch (e) {
    return {
      ...result,
      interpretPending: false,
      interpretError: e.message || String(e),
      interpretFailed: todo.map((t) => t.name),
    };
  }
}
```

- [ ] **Step 4: Test laufen lassen — muss bestehen**

Run: `cd web && npx vitest run src/lib/interpret.test.js`
Expected: alle PASS

- [ ] **Step 5: Commit**

```bash
find . -name '._*' -not -path '*/node_modules/*' -delete
git add web/src/lib/interpret.js web/src/lib/interpret.test.js
git commit -m "feat(web): interpret.js — Filter, Request, Cache-Merge, Orchestrierung"
```

---

### Task 7: Web — `SourcePill`-Variante + `InterpretedPreview` (sandboxed iframe)

**Files:**
- Modify: `web/src/components/library/SourcePill.jsx` (MAP um einen Eintrag)
- Create: `web/src/components/library/InterpretedPreview.jsx`
- Test: `web/src/components/library/InterpretedPreview.test.jsx`

- [ ] **Step 1: Failing Test schreiben**

```jsx
// web/src/components/library/InterpretedPreview.test.jsx
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import InterpretedPreview, { buildSrcdoc } from './InterpretedPreview.jsx';
import { sourceLabel } from './SourcePill.jsx';

describe('buildSrcdoc', () => {
  it('bettet das HTML und die Tailwind-Laufzeit ein', () => {
    const doc = buildSrcdoc('<div class="p-2">Hi</div>');
    expect(doc).toContain('cdn.tailwindcss.com');
    expect(doc).toContain('<div class="p-2">Hi</div>');
    expect(doc.startsWith('<!doctype html>')).toBe(true);
  });
});

describe('InterpretedPreview', () => {
  it('rendert ein sandboxed iframe ohne same-origin', () => {
    render(<InterpretedPreview html='<div class="p-2">Hi</div>' title="Avatar" />);
    const frame = screen.getByTitle('Vorschau: Avatar');
    expect(frame.tagName).toBe('IFRAME');
    expect(frame.getAttribute('sandbox')).toBe('allow-scripts');
    expect(frame.getAttribute('srcdoc')).toContain('Hi');
  });
});

describe('SourcePill "interpreted"', () => {
  it('kennt die gelbe Pille „von KI interpretiert"', () => {
    const m = sourceLabel('interpreted');
    expect(m.label).toBe('von KI interpretiert');
    expect(m.cls).toContain('amber');
  });
});
```

- [ ] **Step 2: Test laufen lassen — muss fehlschlagen**

Run: `cd web && npx vitest run src/components/library/InterpretedPreview.test.jsx`
Expected: FAIL (Modul existiert nicht)

- [ ] **Step 3: Implementieren** — `SourcePill.jsx`: im `MAP`-Objekt einen Eintrag ergänzen:

```js
const MAP = {
  'rules+ai': { label: 'Regeln + KI', cls: 'bg-green-100 text-green-800' },
  ai: { label: 'von KI', cls: 'bg-amber-100 text-amber-800' },
  rules: { label: 'nur Regeln', cls: 'bg-zinc-100 text-zinc-600' },
  interpreted: { label: 'von KI interpretiert', cls: 'bg-amber-100 text-amber-800' },
};
```

Neue Datei:

```jsx
// web/src/components/library/InterpretedPreview.jsx
// Rendert KI-interpretiertes HTML in einem abgeschotteten iframe.
// sandbox="allow-scripts" OHNE allow-same-origin: die Tailwind-Laufzeit darf
// laufen, aber der Inhalt hat keinen Zugriff auf App, localStorage, Cookies.
// Feste Max-Höhe mit iframe-eigenem Scroll (bewusst kein postMessage-Resize).
import React from 'react';

export function buildSrcdoc(html) {
  return [
    '<!doctype html><html><head><meta charset="utf-8">',
    '<script src="https://cdn.tailwindcss.com"></script>',
    '</head><body style="margin:0;padding:12px;background:#ffffff">',
    html,
    '</body></html>',
  ].join('');
}

export default function InterpretedPreview({ html, title }) {
  return (
    <iframe
      sandbox="allow-scripts"
      srcDoc={buildSrcdoc(html)}
      title={`Vorschau: ${title}`}
      className="w-full border-0 rounded"
      style={{ height: 240 }}
    />
  );
}
```

- [ ] **Step 4: Test laufen lassen — muss bestehen**

Run: `cd web && npx vitest run src/components/library/InterpretedPreview.test.jsx`
Expected: alle PASS. Danach kurz die volle Web-Suite: `npx vitest run` → keine Regression.

- [ ] **Step 5: Commit**

```bash
find . -name '._*' -not -path '*/node_modules/*' -delete
git add web/src/components/library/InterpretedPreview.jsx web/src/components/library/InterpretedPreview.test.jsx web/src/components/library/SourcePill.jsx
git commit -m "feat(web): InterpretedPreview (sandboxed iframe) + Pille 'von KI interpretiert'"
```

---

### Task 8: Web — `emitComponents` merged Interpretationen

**Files:**
- Modify: `web/src/lib/emit/emitComponents.js`
- Test: `web/src/lib/emit/emitComponents.test.js` (bestehende Datei — Tests ERGÄNZEN, nichts löschen)

- [ ] **Step 1: Failing Tests ergänzen** (ans Ende der bestehenden Testdatei; vorhandene Imports der Datei weiterverwenden — sie importiert bereits `emitComponents`)

```js
describe('emitComponents + Interpretationen', () => {
  const baseRaw = {
    tokens: { colors: [{ hex: '#4263EB', role: 'brand-primary', confidence: 'high' }] },
    atomics: [{ name: 'Avatar', variants: [], confidence: 'med', notes: '' }],
    components: [],
    patterns: [],
  };

  it('Baustein ohne Template MIT Interpretation: jsx wird code, html wird interpretedHtml', () => {
    const result = {
      raw: baseRaw,
      interpretations: { Avatar: { html: '<div class="rounded-full">A</div>', jsx: 'export function Avatar() { return null; }' } },
    };
    const [item] = emitComponents(result, 'atomic');
    expect(item.interpretedHtml).toContain('rounded-full');
    expect(item.code).toContain('export function Avatar');
    expect(item.hasPreview).toBe(false); // hasPreview bleibt Template-Sache
    expect(item.interpretFailed).toBe(false);
    expect(item.interpretPending).toBe(false);
  });

  it('Interpretation mit leerem jsx: html-Vorschau ja, Code fällt auf Stub zurück', () => {
    const result = {
      raw: baseRaw,
      interpretations: { Avatar: { html: '<div>A</div>', jsx: '' } },
    };
    const [item] = emitComponents(result, 'atomic');
    expect(item.interpretedHtml).toBe('<div>A</div>');
    expect(item.code).toContain('generischer Stub');
  });

  it('pending: Baustein ohne Template ohne Interpretation bei interpretPending', () => {
    const result = { raw: baseRaw, interpretPending: true };
    const [item] = emitComponents(result, 'atomic');
    expect(item.interpretedHtml).toBeNull();
    expect(item.interpretPending).toBe(true);
  });

  it('failed: Baustein in interpretFailed wird markiert', () => {
    const result = { raw: baseRaw, interpretFailed: ['Avatar'] };
    const [item] = emitComponents(result, 'atomic');
    expect(item.interpretFailed).toBe(true);
    expect(item.interpretPending).toBe(false);
  });

  it('Template-Bausteine bleiben unberührt von Interpretationen', () => {
    const result = {
      raw: { ...baseRaw, atomics: [{ name: 'Button', variants: [], confidence: 'high' }] },
      interpretations: { Button: { html: '<div>sollte ignoriert werden</div>', jsx: 'x' } },
      interpretPending: true,
    };
    const [item] = emitComponents(result, 'atomic');
    expect(item.hasPreview).toBe(true);
    expect(item.interpretedHtml).toBeNull();
    expect(item.interpretPending).toBe(false);
  });
});
```

- [ ] **Step 2: Tests laufen lassen — die neuen müssen fehlschlagen**

Run: `cd web && npx vitest run src/lib/emit/emitComponents.test.js`
Expected: neue Tests FAIL (`interpretedHtml` undefined), alte PASS

- [ ] **Step 3: `emitComponents.js` erweitern** — im `out.push({ … })`-Block. Vor dem Push:

```js
const interp = !tpl ? (result?.interpretations?.[item.name] ?? null) : null;
```

Und der Push wird zu:

```js
out.push({
  name: item.name,
  slug,
  filename: `${pascal}.jsx`,
  kind: itemKind,
  templateKey: tpl?.key ?? null,
  variants: tpl?.variants ?? [],
  code: tpl
    ? tpl.emit(picks, item)
    : (interp?.jsx?.trim() ? interp.jsx : genericStub(pascal, item)),
  confidence: item.confidence ?? null,
  source: item.source ?? null,
  notes: item.notes ?? null,
  hasPreview: Boolean(tpl),
  interpretedHtml: interp?.html ?? null,
  interpretFailed: !tpl && !interp && (result?.interpretFailed ?? []).includes(item.name),
  interpretPending: !tpl && !interp
    && !(result?.interpretFailed ?? []).includes(item.name)
    && Boolean(result?.interpretPending),
});
```

- [ ] **Step 4: Tests laufen lassen — alle müssen bestehen**

Run: `cd web && npx vitest run src/lib/emit/emitComponents.test.js`
Expected: alle PASS

- [ ] **Step 5: Commit**

```bash
git add web/src/lib/emit/emitComponents.js web/src/lib/emit/emitComponents.test.js
git commit -m "feat(web): emitComponents merged KI-Interpretationen (html/jsx/pending/failed)"
```

---

### Task 9: Web — `LibraryObjectList` rendert Interpretation, Pending, Retry

**Files:**
- Modify: `web/src/components/library/LibraryObjectList.jsx`
- Test: `web/src/components/library/LibraryObjectList.test.jsx` (bestehende Datei — Tests ERGÄNZEN; falls sie nicht existiert, neu anlegen mit genau diesen Tests)

- [ ] **Step 1: Failing Tests ergänzen**

```jsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import LibraryObjectList from './LibraryObjectList.jsx';

function item(overrides = {}) {
  return {
    name: 'Avatar', slug: 'avatar', filename: 'Avatar.jsx', kind: 'atomic',
    templateKey: null, variants: [], code: '// code', confidence: 'med',
    source: null, notes: null, hasPreview: false,
    interpretedHtml: null, interpretFailed: false, interpretPending: false,
    ...overrides,
  };
}

describe('LibraryObjectList — Interpretations-Zustände', () => {
  it('interpretedHtml: iframe-Vorschau + gelbe Pille, kein Stub-Chip', () => {
    render(<LibraryObjectList items={[item({ interpretedHtml: '<div>A</div>' })]} picks={{}} />);
    fireEvent.click(screen.getByText('Avatar'));
    expect(screen.getByTitle('Vorschau: Avatar')).toBeTruthy();
    expect(screen.getByText('von KI interpretiert')).toBeTruthy();
    expect(screen.queryByText('generischer Stub')).toBeNull();
  });

  it('pending: zeigt „Wird interpretiert …"', () => {
    render(<LibraryObjectList items={[item({ interpretPending: true })]} picks={{}} />);
    fireEvent.click(screen.getByText('Avatar'));
    expect(screen.getByText(/Wird interpretiert/)).toBeTruthy();
  });

  it('failed: Fehlerzeile + „Erneut versuchen" ruft onRetryInterpret', () => {
    const retry = vi.fn();
    render(
      <LibraryObjectList
        items={[item({ interpretFailed: true })]}
        picks={{}}
        onRetryInterpret={retry}
      />
    );
    fireEvent.click(screen.getByText('Avatar'));
    expect(screen.getByText(/Interpretation fehlgeschlagen/)).toBeTruthy();
    fireEvent.click(screen.getByText('Erneut versuchen'));
    expect(retry).toHaveBeenCalledTimes(1);
  });

  it('Template-Vorschau bleibt Vorrang (hasPreview schlägt interpretedHtml)', () => {
    render(
      <LibraryObjectList
        items={[item({ hasPreview: true, templateKey: 'button', interpretedHtml: '<div>x</div>', variants: ['primary'] })]}
        picks={{}}
      />
    );
    fireEvent.click(screen.getByText('Avatar'));
    expect(screen.queryByTitle('Vorschau: Avatar')).toBeNull();
  });
});
```

- [ ] **Step 2: Tests laufen lassen — müssen fehlschlagen**

Run: `cd web && npx vitest run src/components/library/LibraryObjectList.test.jsx`
Expected: neue Tests FAIL

- [ ] **Step 3: `LibraryObjectList.jsx` erweitern**

Import ergänzen:

```jsx
import InterpretedPreview from './InterpretedPreview.jsx';
```

`Row` bekommt `onRetryInterpret` als Prop: `function Row({ item, picks, onRetryInterpret }) {`.

Im Header-Button: Stub-Chip-Bedingung erweitern und Pille ergänzen — der Block

```jsx
{!item.hasPreview && (
  <span className="text-[10px] px-1.5 py-0.5 rounded bg-zinc-100 text-zinc-500">
    generischer Stub
  </span>
)}
```

wird zu:

```jsx
{item.interpretedHtml && <SourcePill value="interpreted" />}
{!item.hasPreview && !item.interpretedHtml && (
  <span className="text-[10px] px-1.5 py-0.5 rounded bg-zinc-100 text-zinc-500">
    generischer Stub
  </span>
)}
```

Der Vorschau-Block

```jsx
<div className="flex items-center gap-2 flex-wrap p-3 bg-white border border-zinc-200 rounded">
  {Preview ? <Preview variant={variant} picks={picks} /> : <PreviewPlaceholder label="keine Vorschau" />}
</div>
```

wird zu (Priorität: Template → Interpretation → Laden → Platzhalter):

```jsx
<div className="flex items-center gap-2 flex-wrap p-3 bg-white border border-zinc-200 rounded">
  {Preview ? (
    <Preview variant={variant} picks={picks} />
  ) : item.interpretedHtml ? (
    <div className="w-full">
      <InterpretedPreview html={item.interpretedHtml} title={item.name} />
    </div>
  ) : item.interpretPending ? (
    <PreviewPlaceholder label="Wird interpretiert …" />
  ) : (
    <PreviewPlaceholder label="keine Vorschau" />
  )}
</div>
{item.interpretFailed && (
  <div className="flex items-center gap-2 pt-2 text-[11px] text-zinc-500">
    <span>Interpretation fehlgeschlagen.</span>
    {onRetryInterpret && (
      <button
        onClick={onRetryInterpret}
        className="text-[11px] px-2 py-0.5 rounded border border-zinc-200 text-zinc-700 hover:bg-zinc-50"
      >
        Erneut versuchen
      </button>
    )}
  </div>
)}
```

Und unten im Default-Export `onRetryInterpret` durchreichen:

```jsx
export default function LibraryObjectList({ items, picks, onRetryInterpret }) {
  if (!items || items.length === 0) {
    return <div className="text-sm text-zinc-500">Keine Objekte erkannt.</div>;
  }
  return (
    <div className="max-w-3xl border-t border-zinc-200">
      {items.map((item) => (
        <Row key={item.slug + item.kind} item={item} picks={picks} onRetryInterpret={onRetryInterpret} />
      ))}
    </div>
  );
}
```

- [ ] **Step 4: Tests laufen lassen — alle müssen bestehen**

Run: `cd web && npx vitest run src/components/library/LibraryObjectList.test.jsx`
Expected: alle PASS

- [ ] **Step 5: Commit**

```bash
find . -name '._*' -not -path '*/node_modules/*' -delete
git add web/src/components/library/LibraryObjectList.jsx web/src/components/library/LibraryObjectList.test.jsx
git commit -m "feat(web): Library-Vorschau — Interpretation, Ladezustand, Retry"
```

---

### Task 10: Web — `App.jsx` + Seiten verdrahten (Auto-Trigger, Retry)

**Files:**
- Modify: `web/src/App.jsx`
- Modify: `web/src/pages/Atomics.jsx`, `web/src/pages/Components.jsx`, `web/src/pages/Patterns.jsx`

- [ ] **Step 1: `App.jsx` — Import + Auto-Trigger + Retry-Handler**

Import oben ergänzen:

```jsx
import { componentsNeedingInterpretation, runInterpretation } from './lib/interpret.js';
```

`handleImported` wird zu (startet die Interpretation fire-and-forget; UI wartet nicht):

```jsx
const handleImported = (result) => {
  const todo = componentsNeedingInterpretation(result);
  const initial = result.source === 'image' && todo.length > 0
    ? { ...result, interpretPending: true }
    : result;
  saveLastImport(initial);
  setLastImport(initial);
  if (initial.interpretPending) {
    runInterpretation(initial).then((next) => {
      if (next) {
        saveLastImport(next);
        setLastImport(next);
      }
    });
  }
};
```

Neuer Handler direkt unter `handleDeepened`:

```jsx
const handleRetryInterpret = () => {
  setLastImport((prev) => {
    const pending = { ...prev, interpretPending: true, interpretError: null, interpretFailed: [] };
    saveLastImport(pending);
    runInterpretation(pending).then((next) => {
      if (next) {
        saveLastImport(next);
        setLastImport(next);
      }
    });
    return pending;
  });
};
```

Im `renderPage()`-Switch die drei Inventar-Seiten erweitern:

```jsx
case 'Atomics': return <Atomics result={lastImport} onRetryInterpret={handleRetryInterpret} />;
case 'Components': return <Components result={lastImport} onRetryInterpret={handleRetryInterpret} />;
case 'Patterns': return <Patterns result={lastImport} onRetryInterpret={handleRetryInterpret} />;
```

- [ ] **Step 2: Die drei Seiten durchreichen lassen** — alle drei folgen demselben Muster. `web/src/pages/Atomics.jsx` komplett:

```jsx
import React from 'react';
import LibraryObjectList from '../components/library/LibraryObjectList.jsx';
import { emitComponents } from '../lib/emit/emitComponents.js';
import { normalizeTokens } from '../lib/emit/normalizeTokens.js';
import { pickTokens } from '../lib/emit/pickTokens.js';

export default function Atomics({ result, onRetryInterpret }) {
  if (!result?.raw) {
    return <div className="text-sm text-zinc-500">Preview-Import — keine Detaildaten. Importiere ein Bild, um Atomics als Code zu sehen.</div>;
  }
  const items = emitComponents(result, 'atomic');
  const picks = pickTokens(normalizeTokens(result.raw.tokens));
  return <LibraryObjectList items={items} picks={picks} onRetryInterpret={onRetryInterpret} />;
}
```

`web/src/pages/Components.jsx`: identische Änderung — Signatur `({ result, onRetryInterpret })`, Weitergabe `onRetryInterpret={onRetryInterpret}` an `LibraryObjectList` (der `emitComponents(result, 'component')`-Aufruf und der Empty-State-Text der Datei bleiben wie vorhanden).

`web/src/pages/Patterns.jsx`: identische Änderung — Signatur `({ result, onRetryInterpret })`, Weitergabe `onRetryInterpret={onRetryInterpret}` (mit `emitComponents(result, 'pattern')` wie vorhanden).

- [ ] **Step 3: Verifizieren — volle Web-Suite**

Run: `cd web && npx vitest run`
Expected: alle PASS (keine Regression; die neue Logik ist über Tasks 6–9 getestet, App.jsx ist dünne Verdrahtung)

- [ ] **Step 4: Commit**

```bash
find . -name '._*' -not -path '*/node_modules/*' -delete
git add web/src/App.jsx web/src/pages/Atomics.jsx web/src/pages/Components.jsx web/src/pages/Patterns.jsx
git commit -m "feat(web): Auto-Interpretation nach Bild-Import + Retry in den Inventar-Seiten"
```

---

### Task 11: Full-Verify + Browser-Smoke

**Files:** keine (Verifikation)

- [ ] **Step 1: Komplette Suite**

```bash
cd "/Volumes/4TB Shield/Vibe Coding Bootcamp/Projekte/Designbridge"
npm run test:server          # Expected: 90/90
cd web && npx vitest run     # Expected: alle grün (>140)
find .. -name '._*' -not -path '*/node_modules/*' -not -path '*/.git/*' -delete
```

- [ ] **Step 2: Browser-Smoke (mit DEMO_FALLBACK — 0 Credits)**

Backend: `DEMO_FALLBACK=1 PORT=3047 node server/index.js` · Web: `cd web && npm run dev` (Preview auf :5173).

Prüfen:
1. Bild importieren (beliebige PNG) → Import-Erfolg wie gewohnt.
2. Library → **Atomics**: „Avatar"/„Status Dot" zeigen kurz „Wird interpretiert …", dann eine **gerenderte iframe-Vorschau** (Avatar-Kreise, Status-Punkte) + gelbe Pille **„von KI interpretiert"**. Button/Search Input zeigen weiter ihre Template-Vorschau.
3. **Components**: Sidebar Navigation, Donut/Bar Chart, Data Table etc. gerendert; „Stat Card"/„Line Chart Card" weiter Template (Card).
4. **Patterns**: Dashboard Grid Layout etc. gerendert.
5. Code-Bereich eines interpretierten Bausteins zeigt das `jsx` aus der Fixture; Kopieren/Herunterladen funktioniert.
6. Reload (F5) → Interpretationen bleiben (localStorage-Cache), kein zweiter Netzwerk-Call (Netzwerk-Tab prüfen).
7. Fehlerpfad: Backend OHNE `DEMO_FALLBACK` neu starten (Credits leer ⇒ Live-Call scheitert) → neuer Import → Bausteine zeigen „Interpretation fehlgeschlagen" + „Erneut versuchen"; Klick auf Retry mit wieder aktiviertem `DEMO_FALLBACK`-Backend liefert die Vorschauen nach.
8. Keine Konsolenfehler.

- [ ] **Step 3: Abschluss** — RESUME.md aktualisieren; Merge auf `main` + Push NUR mit Robs OK:

```bash
git checkout main && git merge --ff-only feat/visual-interpretation-v1
git push   # NUR mit Robs explizitem OK
```
