# Repo-Decompose v1 — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Repo-Import bekommt gehobene Komponenten (echter Quellcode als Wahrheit) plus optionale KI-Interpretation auf Knopfdruck (pro Baustein + „Alle interpretieren") — die letzte offene Quelle der Brücke Quelle→Library→Figma.

**Architecture:** Ein ephemerer `repoStore` (Kopie von `pageStore`) hält die extrahierten Dateien unter `import_id`. Ein neuer `repoDecomposer` erfüllt das bestehende Decompose-Interface und hängt `structure.code` an. Der Repo-Scan hebt den Code (capped) direkt in die Inventar-Einträge und legt die vollen Dateien in den Store. Die bestehende Interpret-Route bekommt einen `repo`-Zweig; `interpretComponents` versteht Code-Segmente. Web zeigt gehobenen Code + „aus Repo gehoben"-Pille und triggert Interpretation on-demand (Per-Baustein-Knopf = bestehendes `retryInterpretation`; „Alle interpretieren" = bestehendes `runInterpretation`, Gate um `repo` erweitert).

**Tech Stack:** Node/Express (server, `node --test`), Vite/React/Tailwind (web, Vitest), bestehende Anthropic-Vision-Integration mit `DEMO_FALLBACK`-Fixtures. Keine neuen Dependencies.

**Spec:** `docs/superpowers/specs/2026-07-14-repo-decompose-v1-design.md`

---

## Dateistruktur

**Neu (server):**
- `server/lib/repoStore.js` (+ `.test.js`) — `putRepo`/`getRepo`/`removeRepo`/`clearRepos`
- `server/lib/decompose/repoDecomposer.js` (+ `.test.js`) — `repoDecomposer`, `liftRepoInventory`, `CODE_CAP`
- `server/fixtures/demo-repo-interpretations.json` — Demo-Interpretationen für den Smoke

**Ändern (server):**
- `server/lib/decompose/index.js` — `repo` in REGISTRY + Typedef um `code`/`path`/`lang`
- `server/lib/repoInventory.js` (+ `.test.js`) — `path`-Feld auf atomics/components
- `server/lib/interpretComponents.js` (+ `.test.js`) — Code-Segmente + Prompt-Regel
- `server/routes/scan.js` — `/repo` hebt Code + `import_id`
- `server/routes/interpret.js` — `repo`-Zweig + `demo-repo`-Fixture

**Neu (web):**
- `web/src/components/library/InterpretAllBar.jsx` (+ `.test.jsx`) — „Alle interpretieren"-Leiste

**Ändern (web):**
- `web/src/components/library/SourcePill.jsx` (+ `.test.js`) — `lifted`-Variante
- `web/src/lib/emit/emitComponents.js` (+ `.test.js`) — gehobener Code/Flag/Dateiname
- `web/src/lib/interpret.js` (+ `.test.js`) — `path` in Bausteinen, `runInterpretation` erlaubt `repo`
- `web/src/components/library/LibraryObjectList.jsx` — `lifted`-Pille + „Mit KI interpretieren"-Knopf
- `web/src/App.jsx` — `InterpretAllBar` einhängen

**Test-Kommandos:**
- Server: `npm run test:server` (= `node --test 'server/**/*.test.js'`)
- Web: `cd web && npm test` (= `vitest run`); einzeln: `cd web && npx vitest run src/pfad/datei.test.js`
- Smoke: `PORT=3047 npm run dev:demo` → http://localhost:5173

---

## Task 0: Branch + Baseline

**Files:** keine

- [ ] **Step 1: Feature-Branch von `main`**

Run:
```bash
cd "/Volumes/4TB Shield/Vibe Coding Bootcamp/Projekte/Designbridge"
git checkout main && git checkout -b feat/repo-decompose-v1
```

- [ ] **Step 2: Baseline grün**

Run: `npm run test:server && (cd web && npm test)`
Expected: Server 121 pass / 0 fail, Web 292 pass / 0 fail.

---

## Task 1: `repoStore` (server)

Ephemerer Datei-Puffer unter `import_id`, exakt nach dem Muster von `pageStore.js`, aber speichert `{files, meta}`.

**Files:**
- Create: `server/lib/repoStore.js`
- Test: `server/lib/repoStore.test.js`

- [ ] **Step 1: Failing test**

```js
// server/lib/repoStore.test.js
import test from 'node:test';
import assert from 'node:assert/strict';
import { putRepo, getRepo, removeRepo, clearRepos } from './repoStore.js';

test('putRepo/getRepo speichert Dateien + Meta', () => {
  const files = [{ path: 'a.tsx', content: 'x' }];
  const id = putRepo(files, { sourceUrl: 'gh/o/r' });
  const got = getRepo(id);
  assert.deepEqual(got.files, files);
  assert.equal(got.meta.sourceUrl, 'gh/o/r');
  removeRepo(id);
  assert.equal(getRepo(id), null);
});

test('TTL 0 räumt sofort ab', async () => {
  const id = putRepo([{ path: 'a', content: 'y' }], {}, { ttlMs: 0 });
  await new Promise((r) => setTimeout(r, 5));
  assert.equal(getRepo(id), null);
});

test('getRepo für unbekannte id ist null', () => {
  clearRepos();
  assert.equal(getRepo('nope'), null);
});
```

- [ ] **Step 2: Run → FAIL**

Run: `node --test server/lib/repoStore.test.js`
Expected: FAIL — `Cannot find module './repoStore.js'`.

- [ ] **Step 3: Implement**

```js
// server/lib/repoStore.js
// Kurzlebiger In-Memory-Store für extrahierte Repo-Dateien, damit die
// KI-Interpretation den Quellcode nach dem Scan noch einmal ansehen kann.
// Muster: pageStore.js / imageStore.js (ephemerer Übergabepuffer, TTL 15 min).
import crypto from 'crypto';

const TTL_MS = 15 * 60 * 1000;

const entries = new Map(); // id → { files, meta, timer }

export function putRepo(files, meta = {}, { ttlMs = TTL_MS } = {}) {
  const id = crypto.randomBytes(8).toString('hex');
  const timer = setTimeout(() => removeRepo(id), ttlMs);
  if (timer.unref) timer.unref();
  entries.set(id, { files, meta, timer });
  return id;
}

export function getRepo(id) {
  const e = entries.get(id);
  return e ? { files: e.files, meta: e.meta } : null;
}

export function removeRepo(id) {
  const e = entries.get(id);
  if (!e) return;
  clearTimeout(e.timer);
  entries.delete(id);
}

export function clearRepos() {
  for (const id of [...entries.keys()]) removeRepo(id);
}
```

- [ ] **Step 4: Run → PASS**

Run: `node --test server/lib/repoStore.test.js`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add server/lib/repoStore.js server/lib/repoStore.test.js
git commit -m "feat(server): repoStore — ephemerer Datei-Puffer für Repo-Import"
```

---

## Task 2: `path`-Feld im Repo-Inventar (server)

`recognizeRepoInventory` trägt den Dateipfad bisher nur in `notes`. Für das Matching im Decomposer braucht es ein strukturiertes `path`-Feld — auf **atomics + components** (echte Komponentendateien); patterns (Seiten/Layouts) bekommen kein `path` (werden nicht gehoben).

**Files:**
- Modify: `server/lib/repoInventory.js`
- Test: `server/lib/repoInventory.test.js` (existiert — Test anhängen)

- [ ] **Step 1: Failing test (anhängen)**

```js
// server/lib/repoInventory.test.js — zusätzlicher Test
test('atomics/components tragen path, patterns nicht', () => {
  const inv = recognizeRepoInventory([
    { path: 'src/components/ui/button.tsx', content: '' },
    { path: 'src/components/PricingCard.tsx', content: '' },
    { path: 'src/app/dashboard/page.tsx', content: '' },
  ]);
  assert.equal(inv.atomics[0].path, 'src/components/ui/button.tsx');
  assert.equal(inv.components[0].path, 'src/components/PricingCard.tsx');
  assert.equal(inv.patterns[0].path, undefined);
});
```

(Falls die Testdatei die Imports `test`/`assert`/`recognizeRepoInventory` noch nicht hat, oben ergänzen wie in den bestehenden Tests der Datei.)

- [ ] **Step 2: Run → FAIL**

Run: `node --test server/lib/repoInventory.test.js`
Expected: FAIL — `inv.atomics[0].path` ist `undefined`.

- [ ] **Step 3: Implement**

In `server/lib/repoInventory.js` die beiden `put`-Aufrufe für `isUiComponent` (atomics) und `isComponentFile` (components) um `path` erweitern:

```js
    if (isUiComponent(path)) {
      put(atomics, {
        name: pascal(base), variants: [], confidence: 'high', source: 'rules', notes: `aus ${path}`, path,
      });
    } else if (isComponentFile(path)) {
      put(components, { name: pascal(base), confidence: 'low', source: 'rules', notes: `aus ${path}`, path });
    } else if (isLayoutFile(path)) {
```

(Die `isLayoutFile`/`isPageFile`-Zweige bleiben unverändert — kein `path`.)

- [ ] **Step 4: Run → PASS**

Run: `node --test server/lib/repoInventory.test.js`
Expected: PASS (bestehende + neuer Test).

- [ ] **Step 5: Commit**

```bash
git add server/lib/repoInventory.js server/lib/repoInventory.test.js
git commit -m "feat(server): repoInventory trägt path auf atomics/components"
```

---

## Task 3: `repoDecomposer` + `liftRepoInventory` (server)

Erfüllt `decompose(source, inventory, {cap}) -> Segment[]` mit `structure.code`. Dazu ein pures `liftRepoInventory(files, inventory, {cap})`, das der Scan-Route den Code in die Inventar-Einträge merged.

**Files:**
- Create: `server/lib/decompose/repoDecomposer.js`
- Test: `server/lib/decompose/repoDecomposer.test.js`

- [ ] **Step 1: Failing test**

```js
// server/lib/decompose/repoDecomposer.test.js
import test from 'node:test';
import assert from 'node:assert/strict';
import { repoDecomposer, liftRepoInventory, CODE_CAP } from './repoDecomposer.js';

const files = [
  { path: 'src/components/PricingCard.tsx', content: 'export const PricingCard = () => <div/>;' },
];

test('decompose hängt structure.code + lang an', async () => {
  const segs = await repoDecomposer.decompose(
    { files },
    [{ name: 'PricingCard', path: 'src/components/PricingCard.tsx' }],
  );
  assert.equal(segs[0].label, 'PricingCard');
  assert.equal(segs[0].structure.code, files[0].content);
  assert.equal(segs[0].structure.lang, 'tsx');
  assert.equal(segs[0].visual, null);
});

test('fehlende Datei → structure null, Segment bleibt gelistet', async () => {
  const segs = await repoDecomposer.decompose({ files }, [{ name: 'Ghost', path: 'nope.tsx' }]);
  assert.equal(segs[0].structure, null);
  assert.equal(segs[0].label, 'Ghost');
});

test('cap kürzt den Code + markiert notes', async () => {
  const big = [{ path: 'a.ts', content: 'x'.repeat(CODE_CAP + 50) }];
  const segs = await repoDecomposer.decompose({ files: big }, [{ name: 'A', path: 'a.ts' }], { cap: CODE_CAP });
  assert.equal(segs[0].structure.code.length, CODE_CAP);
  assert.match(segs[0].notes, /gekürzt/);
});

test('liftRepoInventory merged sourceCode + lang in die Items', async () => {
  const inv = [{ name: 'PricingCard', path: 'src/components/PricingCard.tsx' }];
  await liftRepoInventory(files, inv);
  assert.equal(inv[0].sourceCode, files[0].content);
  assert.equal(inv[0].lang, 'tsx');
});
```

- [ ] **Step 2: Run → FAIL**

Run: `node --test server/lib/decompose/repoDecomposer.test.js`
Expected: FAIL — Modul fehlt.

- [ ] **Step 3: Implement**

```js
// server/lib/decompose/repoDecomposer.js
// RepoDecomposer: matcht Inventar-Bausteine über ihren path auf die Repo-Datei
// und hängt den echten Quellcode als structure.code an. Erfüllt das
// Decomposer-Interface: decompose(source, inventory, {cap}) -> Segment[].
export const CODE_CAP = 8000;

const langOf = (p) => (String(p || '').match(/\.(tsx|ts|jsx|js)$/)?.[1]) ?? 'txt';

export const repoDecomposer = {
  async decompose({ files }, inventory, { cap = null } = {}) {
    const byPath = new Map((files ?? []).map((f) => [f.path, f.content]));
    return inventory.map((item, i) => {
      const content = item.path ? byPath.get(item.path) : undefined;
      const truncated = content != null && cap != null && content.length > cap;
      const code = content == null ? null : (truncated ? content.slice(0, cap) : content);
      return {
        id: `seg_${i}`,
        label: item.name,
        kind: item.kind ?? 'component',
        confidence: item.confidence,
        notes: truncated ? `${item.notes ?? ''} (gekürzt)`.trim() : (item.notes ?? ''),
        bounds: null,
        visual: null,
        structure: content == null ? null : { code, path: item.path, lang: langOf(item.path) },
      };
    });
  },
};

// Für die Scan-Route: hebt den (capped) Code direkt in die Inventar-Items.
// Mutiert die übergebenen Items (gleiche Referenzen wie result.atomics/components).
export async function liftRepoInventory(files, inventory, { cap = CODE_CAP } = {}) {
  const segments = await repoDecomposer.decompose({ files }, inventory, { cap });
  segments.forEach((seg, i) => {
    if (seg.structure) {
      inventory[i].sourceCode = seg.structure.code;
      inventory[i].lang = seg.structure.lang;
      if (/\(gekürzt\)$/.test(seg.notes)) inventory[i].notes = seg.notes;
    }
  });
  return inventory;
}
```

- [ ] **Step 4: Run → PASS**

Run: `node --test server/lib/decompose/repoDecomposer.test.js`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add server/lib/decompose/repoDecomposer.js server/lib/decompose/repoDecomposer.test.js
git commit -m "feat(server): repoDecomposer + liftRepoInventory (structure.code)"
```

---

## Task 4: `repo` in die Decompose-Fabrik (server)

**Files:**
- Modify: `server/lib/decompose/index.js`
- Test: `server/lib/decompose/index.test.js` (existiert — Test anhängen)

- [ ] **Step 1: Failing test (anhängen)**

```js
// server/lib/decompose/index.test.js — zusätzlicher Test
test('getDecomposer("repo") liefert den repoDecomposer', () => {
  const d = getDecomposer('repo');
  assert.equal(typeof d.decompose, 'function');
});
```

- [ ] **Step 2: Run → FAIL**

Run: `node --test server/lib/decompose/index.test.js`
Expected: FAIL — `kein Decomposer für Quelle "repo"`.

- [ ] **Step 3: Implement**

In `server/lib/decompose/index.js`: Import + Registry-Eintrag + Typedef erweitern.

```js
import { imageDecomposer } from './imageDecomposer.js';
import { urlDecomposer } from './urlDecomposer.js';
import { repoDecomposer } from './repoDecomposer.js';

const REGISTRY = {
  image: imageDecomposer,
  url: urlDecomposer,
  repo: repoDecomposer,
};
```

Und den `structure`-Typedef-Kommentar oben ergänzen:

```js
// @property {?{html?:string, css?:string, code?:string, path?:string, lang?:string}} structure   URL: html/css · Repo: code/path/lang
```

- [ ] **Step 4: Run → PASS**

Run: `node --test server/lib/decompose/index.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add server/lib/decompose/index.js server/lib/decompose/index.test.js
git commit -m "feat(server): repo in Decompose-Fabrik registriert"
```

---

## Task 5: Code-Segmente in `interpretComponents` (server)

`interpretComponents` versteht bisher `visual` (Bild) und `structure.html` (URL). Neu: `structure.code` (Repo) — als weiterer Text-Block im Prompt, mit einer Prompt-Regel, den echten Quellcode originaltreu (Klassen/Struktur/Text bewahren) in Inline-HTML + shadcn/Tailwind-jsx zu übersetzen.

**Files:**
- Modify: `server/lib/interpretComponents.js`
- Test: `server/lib/interpretComponents.test.js` (existiert — Test anhängen)

- [ ] **Step 1: Failing test (anhängen)**

```js
// server/lib/interpretComponents.test.js — zusätzlicher Test
test('Code-Segment: sendet SOURCE CODE, liefert html/jsx', async () => {
  const seen = { text: '' };
  const fakeClient = {
    messages: {
      create: async ({ messages }) => {
        seen.text = JSON.stringify(messages[0].content);
        return {
          content: [{
            text: JSON.stringify({
              interpretations: [{ name: 'PricingCard', html: '<div style="color:#111">Pro</div>', jsx: 'export function PricingCard(){return <div/>}' }],
            }),
          }],
        };
      },
    },
  };
  const segments = [{
    id: 'seg_0', label: 'PricingCard', kind: 'component',
    visual: null, structure: { code: 'export const PricingCard = () => <div>Pro</div>;', path: 'x.tsx', lang: 'tsx' },
  }];
  const out = await interpretComponents(null, null, segments, { client: fakeClient });
  assert.match(seen.text, /SOURCE CODE/);
  assert.equal(out.interpretations[0].name, 'PricingCard');
  assert.match(out.interpretations[0].html, /Pro/);
  assert.equal(out.failed.length, 0);
});
```

- [ ] **Step 2: Run → FAIL**

Run: `node --test server/lib/interpretComponents.test.js`
Expected: FAIL — kein `SOURCE CODE` im Prompt-Content; ggf. landet der Baustein in `failed`.

- [ ] **Step 3: Implement**

In `server/lib/interpretComponents.js`:

(a) In `interpretComponents` die Segment-Kategorien um Code erweitern und `bare` anpassen:

```js
  const withVisual = segments.filter((s) => s.visual && s.visual.base64);
  const withStructure = segments.filter((s) => s.structure && s.structure.html);
  const withCode = segments.filter((s) => s.structure && s.structure.code);
  const bare = segments.filter(
    (s) => !(s.visual && s.visual.base64) && !(s.structure && s.structure.html) && !(s.structure && s.structure.code)
  );
```

(b) Nach der `structureGroups`-Schleife (vor dem `content.push(... buildPrompt ...)`) die Code-Blöcke anhängen:

```js
  for (const s of withCode) {
    content.push({
      type: 'text',
      text: `Component: ${s.label}\nSOURCE CODE (${s.structure.lang}):\n${s.structure.code}`,
    });
  }
```

(c) Den `buildPrompt`-Aufruf um `hasCode` erweitern:

```js
  content.push({ type: 'text', text: buildPrompt(segments, hasFullImageFallback, withStructure.length > 0, withCode.length > 0) });
```

(d) `buildPrompt` signatur + Intro + Code-Regel:

```js
function buildPrompt(segments, hasFullImageFallback, hasStructure, hasCode) {
  const labels = segments.map((s) => s.label);
  return `You are a UI reconstruction engine. Below you receive one cropped image OR the source HTML+CSS OR the component SOURCE CODE per component (in order), each preceded by its name. ${hasFullImageFallback ? 'For any component WITHOUT its own crop, use the full screenshot provided first.' : ''}
```

… (Rest des Prompts unverändert) und in der Regel-Liste — direkt nach der `hasStructure`-Zeile — die Code-Zeile ergänzen:

```js
${hasStructure ? '\n- For components given as SOURCE HTML + CSS: translate the REAL markup into inline-styled html (and shadcn/Tailwind jsx) — keep the exact text content, structure, states and visual properties (colors, spacing, radii) expressed by the source CSS. Do not invent content that is not in the source.' : ''}${hasCode ? '\n- For components given as SOURCE CODE (React/shadcn/Tailwind): read the real component source and render a faithful DEFAULT state — preserve the real class names, cva variants, structure and any literal text; express the resulting look as inline-styled html (and keep the original shadcn/Tailwind flavour in jsx). Do not invent content the source does not imply.' : ''}
```

- [ ] **Step 4: Run → PASS**

Run: `node --test server/lib/interpretComponents.test.js`
Expected: PASS (bestehende + neuer Test).

- [ ] **Step 5: Commit**

```bash
git add server/lib/interpretComponents.js server/lib/interpretComponents.test.js
git commit -m "feat(server): interpretComponents versteht Code-Segmente (Repo)"
```

---

## Task 6: Repo-Scan hebt Code + `import_id` (server)

Die `/repo`-Route legt die Dateien in `repoStore` (voll) und hebt den (capped) Code in die Inventar-Einträge.

**Files:**
- Modify: `server/routes/scan.js`
- Test: `server/routes/scan.test.js` (existiert — Test anhängen; testet die pure Hebe-Logik ohne Netzwerk)

- [ ] **Step 1: Failing test (anhängen)**

Die Netzwerk-Route selbst wird im Browser-Smoke (Task 13) end-to-end geprüft; hier testen wir die reine Hebe-Verdrahtung über `liftRepoInventory` (Task 3), um zu sichern, dass Scan-Items nach dem Heben `sourceCode` tragen:

```js
// server/routes/scan.test.js — zusätzlicher Test
import { liftRepoInventory } from '../lib/decompose/repoDecomposer.js';

test('liftRepoInventory hebt Scan-Inventar-Code (Verdrahtung /repo)', async () => {
  const files = [{ path: 'src/components/ui/button.tsx', content: 'export const Button=()=><button/>;' }];
  const inv = [{ name: 'Button', path: 'src/components/ui/button.tsx', source: 'rules' }];
  await liftRepoInventory(files, inv);
  assert.equal(inv[0].sourceCode, files[0].content);
  assert.equal(inv[0].lang, 'tsx');
});
```

- [ ] **Step 2: Run → FAIL**

Run: `node --test server/routes/scan.test.js`
Expected: FAIL, falls `liftRepoInventory` noch nicht importierbar ist — sonst (bei bereits gebauter Task 3) PASS; in dem Fall dient dieser Test als Regressionsschutz für die Route-Verdrahtung. Weiter mit Step 3 (Route-Änderung) unabhängig davon.

- [ ] **Step 3: Implement**

In `server/routes/scan.js` oben die Imports ergänzen:

```js
import { putRepo } from '../lib/repoStore.js';
import { liftRepoInventory } from '../lib/decompose/repoDecomposer.js';
```

Und im `POST '/repo'`-Handler den `try`-Block anpassen:

```js
  try {
    console.log(`[scan/repo] Loading ${parsed.owner}/${parsed.repo}${branch ? `@${branch}` : ''}`);
    const { buffer, branch: usedBranch } = await downloadRepoTarball({ ...parsed, branch });
    const files = await extractRepoFiles(buffer);
    const result = ingestRepoFiles(files, { sourceUrl: req.body.url, branch: usedBranch });
    // Echten Quellcode (capped) in atomics/components heben — patterns tragen keinen Code.
    await liftRepoInventory(files, [...result.atomics, ...result.components]);
    // Volle Dateien im Store für die spätere on-demand-Interpretation.
    result.meta = { ...result.meta, import_id: putRepo(files, { sourceUrl: req.body.url, branch: usedBranch }) };
    res.json(result);
  } catch (err) {
    console.error('[scan/repo] Error:', err.message);
    res.status(statusForRepoError(err)).json({ error: err.message });
  }
```

- [ ] **Step 4: Run → PASS**

Run: `node --test server/routes/scan.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add server/routes/scan.js server/routes/scan.test.js
git commit -m "feat(server): /scan/repo hebt Code + gibt import_id zurück"
```

---

## Task 7: Interpret-Route `repo`-Zweig + Demo-Fixture (server)

**Files:**
- Modify: `server/routes/interpret.js`
- Create: `server/fixtures/demo-repo-interpretations.json`
- Test: `server/fixtures/demo-repo-interpretations.test.js`

- [ ] **Step 1: Failing test (Fixture-Shape)**

```js
// server/fixtures/demo-repo-interpretations.test.js
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

test('demo-repo-interpretations.json hat {name,html,jsx}-Einträge', () => {
  const arr = JSON.parse(fs.readFileSync(path.join(__dirname, 'demo-repo-interpretations.json'), 'utf8'));
  assert.ok(Array.isArray(arr) && arr.length > 0);
  for (const it of arr) {
    assert.equal(typeof it.name, 'string');
    assert.match(it.html, /style=/);
    assert.equal(typeof it.jsx, 'string');
  }
});
```

- [ ] **Step 2: Run → FAIL**

Run: `node --test server/fixtures/demo-repo-interpretations.test.js`
Expected: FAIL — Datei fehlt.

- [ ] **Step 3a: Demo-Repo-Namen ermitteln**

Damit die Fixture echte Baustein-Namen trifft, einmal das Smoke-Repo scannen und die Nicht-Template-Namen ablesen:

```bash
PORT=3047 DEMO_FALLBACK=1 node server/index.js &   # Server starten
sleep 2
curl -s -X POST localhost:3047/api/scan/repo -H 'Content-Type: application/json' \
  -d '{"url":"https://github.com/shadcn-ui/taxonomy"}' \
  | node -e "let d='';process.stdin.on('data',c=>d+=c).on('end',()=>{const r=JSON.parse(d);const tpl=['button','card','badge','input'];const names=[...r.atomics,...r.components].map(x=>x.name).filter(n=>!tpl.includes(n.toLowerCase()));console.log(names.slice(0,8))})"
kill %1
```

3–4 dieser Namen für die Fixture verwenden.

- [ ] **Step 3b: Fixture schreiben**

`server/fixtures/demo-repo-interpretations.json` — pro gewähltem Namen ein Eintrag mit inline-gestyltem `html` (wie `demo-url-interpretations.json`) und `jsx`. Beispielgerüst (Namen durch die in 3a ermittelten ersetzen):

```json
[
  {
    "name": "Callout",
    "html": "<div style=\"display:flex;gap:8px;padding:16px;border:1px solid #e4e4e7;border-radius:8px;background:#f4f4f5;color:#18181b;font-size:14px\"><span style=\"font-weight:600\">Hinweis</span><span>Aus dem Repo gehoben und interpretiert.</span></div>",
    "jsx": "export function Callout(){return <div className=\"flex gap-2 p-4 border rounded-lg bg-zinc-100 text-sm\"><span className=\"font-semibold\">Hinweis</span><span>Aus dem Repo gehoben und interpretiert.</span></div>}"
  }
]
```

- [ ] **Step 3c: Route-Zweig ergänzen**

In `server/routes/interpret.js` den Import + die Quellen-Weiche erweitern:

```js
import { getRepo } from '../lib/repoStore.js';
```

Im `POST '/components'`-Handler:

```js
  const image = getImage(importId);
  const page = image ? null : getPage(importId);
  const repo = image || page ? null : getRepo(importId);
  if (!image && !page && !repo) {
    return res.status(410).json({ error: 'Quelle nicht mehr verfügbar — bitte erneut importieren.' });
  }
  const kind = image ? 'image' : page ? 'url' : 'repo';
  try {
    console.log(`[interpret] ${components.length} Bausteine für Import ${importId}`);
    const source = image
      ? { imagePath: image.path, mimetype: image.mimetype }
      : page
        ? { html: page.html, css: page.css }
        : { files: repo.files };
    const segments = await getDecomposer(kind).decompose(source, components);
    const result = await interpretComponents(image?.path ?? null, image?.mimetype ?? null, segments);
    res.json(result);
  } catch (err) {
```

Und im `DEMO_FALLBACK`-Block die Fixture-Wahl erweitern:

```js
        const file = kind === 'url' ? 'demo-url-interpretations.json'
          : kind === 'repo' ? 'demo-repo-interpretations.json'
          : 'demo-interpretations.json';
```

- [ ] **Step 4: Run → PASS**

Run: `node --test server/fixtures/demo-repo-interpretations.test.js`
Expected: PASS. Danach voller Server-Lauf: `npm run test:server` → alles grün.

- [ ] **Step 5: Commit**

```bash
git add server/routes/interpret.js server/fixtures/demo-repo-interpretations.json server/fixtures/demo-repo-interpretations.test.js
git commit -m "feat(server): interpret-Route repo-Zweig + demo-repo-Fixture"
```

---

## Task 8: `SourcePill` „aus Repo gehoben"-Variante (web)

**Files:**
- Modify: `web/src/components/library/SourcePill.jsx`
- Test: `web/src/components/library/SourcePill.test.js`

- [ ] **Step 1: Failing test**

```js
// web/src/components/library/SourcePill.test.js
import { describe, it, expect } from 'vitest';
import { sourceLabel } from './SourcePill.jsx';

describe('sourceLabel', () => {
  it('kennt die lifted-Variante', () => {
    expect(sourceLabel('lifted').label).toBe('aus Repo gehoben');
  });
  it('bleibt für unbekannte Werte null', () => {
    expect(sourceLabel('nope')).toBe(null);
  });
});
```

- [ ] **Step 2: Run → FAIL**

Run: `cd web && npx vitest run src/components/library/SourcePill.test.js`
Expected: FAIL — `sourceLabel('lifted')` ist `null`.

- [ ] **Step 3: Implement**

In `web/src/components/library/SourcePill.jsx` das `MAP` erweitern:

```js
const MAP = {
  'rules+ai': { label: 'Regeln + KI', cls: 'bg-green-100 text-green-800' },
  ai: { label: 'von KI', cls: 'bg-amber-100 text-amber-800' },
  rules: { label: 'nur Regeln', cls: 'bg-zinc-100 text-zinc-600' },
  interpreted: { label: 'von KI interpretiert', cls: 'bg-amber-100 text-amber-800' },
  lifted: { label: 'aus Repo gehoben', cls: 'bg-blue-100 text-blue-700' },
};
```

- [ ] **Step 4: Run → PASS**

Run: `cd web && npx vitest run src/components/library/SourcePill.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add web/src/components/library/SourcePill.jsx web/src/components/library/SourcePill.test.js
git commit -m "feat(web): SourcePill 'aus Repo gehoben'-Variante"
```

---

## Task 9: `emitComponents` — gehobener Code, Flag, Dateiname (web)

Wenn ein Inventar-Item `sourceCode` trägt (Repo-Hebung), wird der echte Quellcode zum angezeigten `code`, `lifted:true` gesetzt und der Dateiname aus dem echten Pfad abgeleitet. Template-Vorschau bleibt erhalten (Bonus-Render), aber der Code ist die echte Quelle.

**Files:**
- Modify: `web/src/lib/emit/emitComponents.js`
- Test: `web/src/lib/emit/emitComponents.test.js` (existiert — Test anhängen)

- [ ] **Step 1: Failing test (anhängen)**

```js
// web/src/lib/emit/emitComponents.test.js — zusätzlicher Test
it('gehobenes Repo-Item zeigt echten Code + lifted-Flag + echten Dateinamen', () => {
  const result = {
    source: 'repo',
    raw: {
      tokens: { colors: [], typography: [], spacing: [], border_radius: [], shadows: [] },
      atomics: [], patterns: [],
      components: [{ name: 'PricingCard', confidence: 'low', source: 'rules',
        path: 'src/components/PricingCard.tsx', sourceCode: 'export const PricingCard = () => <div>Pro</div>;', lang: 'tsx' }],
    },
  };
  const [item] = emitComponents(result, 'component');
  expect(item.lifted).toBe(true);
  expect(item.code).toMatch(/export const PricingCard/);
  expect(item.filename).toBe('PricingCard.tsx');
});
```

- [ ] **Step 2: Run → FAIL**

Run: `cd web && npx vitest run src/lib/emit/emitComponents.test.js`
Expected: FAIL — `item.lifted` ist `undefined`, `item.code` ist der generische Stub.

- [ ] **Step 3: Implement**

In `web/src/lib/emit/emitComponents.js` innerhalb der `for`-Schleife, direkt vor `out.push({`, die Hebe-Logik einführen und im `out.push` nutzen:

```js
      const interp = !tpl ? (result?.interpretations?.[item.name] ?? null) : null;
      const unresolved = !tpl && !interp;
      const failedListed = (result?.interpretFailed ?? []).includes(item.name);
      const lifted = Boolean(item.sourceCode);
      out.push({
        name: item.name,
        slug,
        filename: lifted && item.path ? item.path.split('/').pop() : `${pascal}.jsx`,
        kind: itemKind,
        templateKey: tpl?.key ?? null,
        variants: tpl?.variants ?? [],
        code: lifted
          ? item.sourceCode
          : (tpl ? tpl.emit(picks, item) : (interp?.jsx?.trim() ? interp.jsx : genericStub(pascal, item))),
        confidence: item.confidence ?? null,
        source: item.source ?? null,
        lifted,
        notes: item.notes ?? null,
        hasPreview: Boolean(tpl),
        interpretedHtml: interp?.html ?? null,
        interpretFailed: unresolved && failedListed,
        interpretPending: unresolved && !failedListed && Boolean(result?.interpretPending),
      });
```

- [ ] **Step 4: Run → PASS**

Run: `cd web && npx vitest run src/lib/emit/emitComponents.test.js`
Expected: PASS (bestehende + neuer Test).

- [ ] **Step 5: Commit**

```bash
git add web/src/lib/emit/emitComponents.js web/src/lib/emit/emitComponents.test.js
git commit -m "feat(web): emitComponents hebt echten Repo-Code (lifted)"
```

---

## Task 10: Client-`interpret.js` — `path` durchreichen + `repo` erlauben (web)

Damit der Server-`repoDecomposer` die Datei findet, muss der Client `path` im Baustein-Objekt mitschicken (in `componentsNeedingInterpretation` UND `findRawComponent`). Und `runInterpretation` (der Batch-Pfad hinter „Alle interpretieren") muss `repo` durchlassen. **Wichtig:** Der Auto-Interpret-Pfad in `App.jsx` gated `repo` separat aus (bleibt in Task 12 so) — `runInterpretation` wird für `repo` nur über den Knopf erreicht.

**Files:**
- Modify: `web/src/lib/interpret.js`
- Test: `web/src/lib/interpret.test.js` (existiert — Tests anhängen)

- [ ] **Step 1: Failing tests (anhängen)**

```js
// web/src/lib/interpret.test.js — zusätzliche Tests
import { componentsNeedingInterpretation, runInterpretation } from './interpret.js';

it('componentsNeedingInterpretation reicht path durch', () => {
  const result = { source: 'repo', raw: { atomics: [], patterns: [],
    components: [{ name: 'PricingCard', path: 'src/components/PricingCard.tsx' }] } };
  const [c] = componentsNeedingInterpretation(result);
  expect(c.path).toBe('src/components/PricingCard.tsx');
});

it('runInterpretation läuft für source:repo (Batch-Knopf)', async () => {
  const calls = [];
  global.fetch = async (url, opts) => {
    calls.push(JSON.parse(opts.body));
    return { ok: true, json: async () => ({ interpretations: [{ name: 'PricingCard', html: '<div/>', jsx: '' }], failed: [] }) };
  };
  const result = { source: 'repo', raw: { meta: { import_id: 'id1' }, atomics: [], patterns: [],
    components: [{ name: 'PricingCard', path: 'p.tsx' }] } };
  const next = await runInterpretation(result);
  expect(next).not.toBe(null);
  expect(calls[0].components[0].path).toBe('p.tsx');
  expect(next.interpretations.PricingCard.html).toBe('<div/>');
});
```

- [ ] **Step 2: Run → FAIL**

Run: `cd web && npx vitest run src/lib/interpret.test.js`
Expected: FAIL — `c.path` `undefined`; `runInterpretation` gibt `null` (repo nicht im Gate).

- [ ] **Step 3: Implement**

In `web/src/lib/interpret.js`:

(a) `componentsNeedingInterpretation` — das gepushte Objekt um `path` erweitern:

```js
      out.push({
        name: item.name,
        kind,
        variants: item.variants ?? [],
        notes: item.notes ?? '',
        bbox: item.bbox ?? null,
        selector: item.selector ?? null,
        path: item.path ?? null,
      });
```

(b) `findRawComponent` — dasselbe:

```js
        return {
          name: item.name,
          kind,
          variants: item.variants ?? [],
          notes: item.notes ?? '',
          bbox: item.bbox ?? null,
          selector: item.selector ?? null,
          path: item.path ?? null,
        };
```

(c) `runInterpretation` — Gate um `repo` erweitern:

```js
  if (!['image', 'url', 'repo'].includes(result?.source) || !importId || todo.length === 0) return null;
```

- [ ] **Step 4: Run → PASS**

Run: `cd web && npx vitest run src/lib/interpret.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add web/src/lib/interpret.js web/src/lib/interpret.test.js
git commit -m "feat(web): interpret reicht path durch + erlaubt repo im Batch"
```

---

## Task 11: `LibraryObjectList` — Pille + „Mit KI interpretieren"-Knopf (web)

Gehobene Bausteine zeigen die `lifted`-Pille; solche ohne Template-Vorschau und ohne Interpretation bekommen einen Per-Baustein-Knopf „Mit KI interpretieren" (ruft das bestehende `onRetryInterpret(name)`).

**Files:**
- Modify: `web/src/components/library/LibraryObjectList.jsx`
- Test: `web/src/components/library/LibraryObjectList.test.jsx` (existiert — Test anhängen; nutzt @testing-library/react wie die bestehenden Tests der Datei)

- [ ] **Step 1: Failing test (anhängen)**

```jsx
// web/src/components/library/LibraryObjectList.test.jsx — zusätzlicher Test
it('gehobener Baustein ohne Vorschau zeigt Pille + Interpret-Knopf', async () => {
  const onRetryInterpret = vi.fn();
  const items = [{
    name: 'PricingCard', slug: 'pricing-card', kind: 'component', filename: 'PricingCard.tsx',
    code: 'export const PricingCard = () => <div/>;', confidence: 'low', source: 'rules',
    lifted: true, variants: [], hasPreview: false, interpretedHtml: null,
    interpretFailed: false, interpretPending: false,
  }];
  render(<LibraryObjectList items={items} picks={{}} onRetryInterpret={onRetryInterpret} />);
  expect(screen.getByText('aus Repo gehoben')).toBeInTheDocument();
  const btn = screen.getByRole('button', { name: /Mit KI interpretieren/ });
  await userEvent.click(btn);
  expect(onRetryInterpret).toHaveBeenCalledWith('PricingCard');
});
```

(Imports `render`/`screen`/`userEvent`/`vi` wie in den bestehenden Tests der Datei übernehmen. Der Interpret-Knopf sitzt im aufgeklappten Bereich — der Test muss die Zeile ggf. erst per Klick auf den Namens-Button öffnen; dazu vor der Assertion `await userEvent.click(screen.getByText('PricingCard'))` einfügen, falls die bestehenden Tests dasselbe Muster nutzen.)

- [ ] **Step 2: Run → FAIL**

Run: `cd web && npx vitest run src/components/library/LibraryObjectList.test.jsx`
Expected: FAIL — weder Pille noch Knopf vorhanden.

- [ ] **Step 3: Implement**

In `web/src/components/library/LibraryObjectList.jsx`:

(a) `Row`-Signatur ist `{ item, picks, onRetryInterpret }` — bleibt. In der Kopfzeile die `lifted`-Pille neben die interpreted-Pille setzen (nach `<SourcePill value={item.source} />`):

```jsx
        <SourcePill value={item.source} />
        {item.lifted && <SourcePill value="lifted" />}
        {item.interpretedHtml && <SourcePill value="interpreted" />}
```

(b) Im aufgeklappten Bereich, direkt nach dem Vorschau-`<div>`-Block (nach dem schließenden `</div>` des `flex items-center gap-2 flex-wrap p-3 …`-Containers und vor dem `interpretFailed`-Block), den Interpret-Knopf ergänzen:

```jsx
          {item.lifted && !item.hasPreview && !item.interpretedHtml && !item.interpretPending && !item.interpretFailed && onRetryInterpret && (
            <div className="pt-2">
              <button
                onClick={() => onRetryInterpret(item.name)}
                className="text-[11px] px-2 py-0.5 rounded border border-zinc-200 text-zinc-700 hover:bg-zinc-50"
              >
                Mit KI interpretieren
              </button>
            </div>
          )}
```

- [ ] **Step 4: Run → PASS**

Run: `cd web && npx vitest run src/components/library/LibraryObjectList.test.jsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add web/src/components/library/LibraryObjectList.jsx web/src/components/library/LibraryObjectList.test.jsx
git commit -m "feat(web): Library zeigt lifted-Pille + Per-Baustein-Interpret-Knopf"
```

---

## Task 12: `InterpretAllBar` + App-Verdrahtung (web)

Eine Leiste über den Library-Seiten, die bei Repo-Import mit noch offenen Bausteinen „Alle interpretieren" anbietet und den Batch (`onRetryInterpret()` ohne Name) auslöst. **Der Auto-Interpret-Pfad in `handleImported` bleibt auf `['image','url']` gegated** — Repo interpretiert nur auf Knopfdruck.

**Files:**
- Create: `web/src/components/library/InterpretAllBar.jsx`
- Test: `web/src/components/library/InterpretAllBar.test.jsx`
- Modify: `web/src/App.jsx`

- [ ] **Step 1: Failing test**

```jsx
// web/src/components/library/InterpretAllBar.test.jsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import InterpretAllBar from './InterpretAllBar.jsx';

const repoWithTodo = {
  source: 'repo',
  raw: { meta: { import_id: 'id1' }, atomics: [], patterns: [],
    components: [{ name: 'PricingCard', path: 'p.tsx' }] },
};

describe('InterpretAllBar', () => {
  it('zeigt Knopf bei Repo-Import mit offenen Bausteinen und triggert Batch', async () => {
    const onInterpretAll = vi.fn();
    render(<InterpretAllBar result={repoWithTodo} onInterpretAll={onInterpretAll} />);
    await userEvent.click(screen.getByRole('button', { name: /Alle interpretieren/ }));
    expect(onInterpretAll).toHaveBeenCalled();
  });

  it('rendert nichts für Bild-Import', () => {
    const { container } = render(<InterpretAllBar result={{ source: 'image', raw: { meta: {}, atomics: [], components: [], patterns: [] } }} onInterpretAll={() => {}} />);
    expect(container.firstChild).toBe(null);
  });
});
```

- [ ] **Step 2: Run → FAIL**

Run: `cd web && npx vitest run src/components/library/InterpretAllBar.test.jsx`
Expected: FAIL — Modul fehlt.

- [ ] **Step 3: Implement**

```jsx
// web/src/components/library/InterpretAllBar.jsx
import React from 'react';
import { componentsNeedingInterpretation } from '../../lib/interpret.js';

// Zeigt bei einem Repo-Import mit noch nicht interpretierten (template-losen)
// Bausteinen einen Batch-Knopf. Repo interpretiert bewusst nur auf Knopfdruck.
export default function InterpretAllBar({ result, onInterpretAll }) {
  if (result?.source !== 'repo') return null;
  const todo = componentsNeedingInterpretation(result);
  const pending = Boolean(result?.interpretPending);
  if (todo.length === 0 && !pending) return null;
  return (
    <div className="mb-4 flex items-center gap-3 rounded border border-zinc-200 bg-zinc-50 px-3 py-2 text-sm">
      <span className="text-zinc-600">
        {pending
          ? 'Bausteine werden interpretiert …'
          : `${todo.length} gehobene Bausteine ohne Vorschau — optional per KI interpretieren.`}
      </span>
      <button
        onClick={onInterpretAll}
        disabled={pending}
        className="ml-auto text-xs px-2.5 py-1 rounded bg-zinc-900 text-white font-medium hover:bg-zinc-700 disabled:opacity-50"
      >
        Alle interpretieren
      </button>
    </div>
  );
}
```

In `web/src/App.jsx` importieren und im `<main>` rendern (vor `renderPage()`, neben dem `AiDeepenBanner`):

```jsx
import InterpretAllBar from './components/library/InterpretAllBar.jsx';
```

```jsx
          <div className="p-8">
            {lastImport && <AiDeepenBanner result={lastImport} onDeepened={handleDeepened} />}
            {lastImport && ['Atomics', 'Components', 'Patterns'].includes(page) && (
              <InterpretAllBar result={lastImport} onInterpretAll={() => handleRetryInterpret()} />
            )}
            {renderPage()}
          </div>
```

- [ ] **Step 4: Run → PASS**

Run: `cd web && npx vitest run src/components/library/InterpretAllBar.test.jsx`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add web/src/components/library/InterpretAllBar.jsx web/src/components/library/InterpretAllBar.test.jsx web/src/App.jsx
git commit -m "feat(web): InterpretAllBar — 'Alle interpretieren' bei Repo-Import"
```

---

## Task 13: Full-Verify + Browser-Smoke

**Files:** keine (nur Verifikation; kleine Fixture-Anpassung erlaubt, falls Namen nicht matchen)

- [ ] **Step 1: Volle Suiten grün**

Run:
```bash
npm run test:server
cd web && npm test && npx vite build
```
Expected: Server alle grün (≥ 121 + neue), Web alle grün (≥ 292 + neue), `vite build` ohne Fehler.

- [ ] **Step 2: AppleDouble bereinigen**

Run: `find . -name '._*' -delete`

- [ ] **Step 3: App starten**

`preview_start` mit der Config, die `PORT=3047 npm run dev:demo` startet (siehe [[project-designbridge-dev-server-port-falle]]). Falls die launch.json-Config das nicht tut: Backend separat `DEMO_FALLBACK=1 PORT=3047 node server/index.js`, Web `cd web && npm run dev`, Preview-Browser auf http://localhost:5173.

- [ ] **Step 4: Repo importieren**

Neuer Import → Repo-Tab → `https://github.com/shadcn-ui/taxonomy` → importieren. Erwartung: Tokens + Inventar; Atomics/Components zeigen Bausteine mit **echtem Quellcode** (aufklappen) + Pille **„aus Repo gehoben"**; template-Namen (Button/Card/…) zusätzlich mit gerenderter Vorschau.

- [ ] **Step 5: On-demand-Interpretation**

Auf der Atomics- oder Components-Seite: (a) an einem template-losen gehobenen Baustein „Mit KI interpretieren" klicken → gerenderte iframe-Vorschau erscheint, Pille wird „von KI interpretiert"; (b) oben „Alle interpretieren" klicken → alle offenen Bausteine bekommen Vorschauen. `read_console_messages` → keine Fehler. (Fixtures aus Task 7 müssen die real erkannten Namen treffen; falls nicht, Namen in `demo-repo-interpretations.json` angleichen und Server neu laden.)

- [ ] **Step 6: Screenshot als Beleg**

`computer {action:"screenshot"}` vom Zustand nach „Alle interpretieren" (gehobener Code + interpretierte Vorschauen sichtbar).

- [ ] **Step 7: Commit (falls Fixture-Anpassung in Step 5 nötig war)**

```bash
git add -A && git commit -m "test(smoke): demo-repo-Fixture an reale Baustein-Namen angeglichen"
```

---

## Self-Review-Notiz (für den ausführenden Worker)

- **Reihenfolge-Abhängigkeiten:** Task 3 vor 6 (scan importiert `liftRepoInventory`), Task 1 vor 7 (interpret importiert `getRepo`), Task 4 vor 6/7 (Fabrik kennt `repo`), Task 10 vor 12 (`runInterpretation` erlaubt repo; `InterpretAllBar` nutzt `componentsNeedingInterpretation`), Task 8/9 vor 11 (Pille + `lifted`-Flag).
- **Namens-Konsistenz:** raw-Feld heißt `sourceCode` (nicht `code`) — Display-`code` wird in `emitComponents` daraus gesetzt. Pillen-Wert ist `lifted`. Store-API: `putRepo`/`getRepo`. Decomposer-Registry-Key: `repo`.
- **Kein Auto-Interpret für Repo:** `handleImported` bleibt auf `['image','url']`; `runInterpretation`-Gate erlaubt `repo` nur, weil der Repo-Pfad dorthin ausschließlich über den Knopf führt.
