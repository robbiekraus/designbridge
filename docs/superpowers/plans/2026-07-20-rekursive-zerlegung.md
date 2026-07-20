# Rekursive Zerlegung Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Der Bild-Scan zieht die wiederverwendbaren Kleinteile aus Organismen (Nav-Items, KPI-Innereien, Buttons) als eigene Library-Atome/Moleküle heraus — mit Instanz-Zählung und Eltern-Zuordnung.

**Architecture:** Reine Erweiterung des bestehenden *einen* Bild-Scan-Calls in `server/lib/claude.js`. Der KI-Prompt wird um eine Zerlegungs-Instruktion angereichert (kein Extra-Call). Zwei neue optionale Item-Felder `instanceCount`/`partOf` fließen durch `mergeByName` (summiert Instanzen) und eine neue reine `partOf`-Ableitung (bbox-Enthaltung via `taxonomy.js`) bis in den Web-Emitter (`emitComponents`) und ein kleines Label in `LibraryObjectList`. Plugin, `scan.js` und `scanResultAdapter` bleiben unberührt (Image-Pfad reicht `result` per `res.json(result)` 1:1 durch; `result.raw` trägt die Felder bis in `emitComponents`).

**Tech Stack:** Node.js (`node:test`), Express, Vite + React + Tailwind, Vitest (Web-Tests, `describe/it/expect` + Testing Library).

**Spec:** [docs/superpowers/specs/2026-07-20-rekursive-zerlegung-design.md](../specs/2026-07-20-rekursive-zerlegung-design.md)

**Branch:** `experiment/rekursive-zerlegung` (kein Railway-Deploy — Push löst kein Prod-Deploy aus). Baseline: Server 289/289 grün.

**Konventionen:** Server-Tests via `npm run test:server`. Web-Tests via `cd web && npm test`. Nach jedem Schreiben in bediente Verzeichnisse `find . -name '._*' -delete`. Commits klein und häufig, deutsche Commit-Messages im Projektstil, Trailer `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`.

**Datenfluss (zur Orientierung):** KI → `analyzeScreenshot` (Prompt + `mergeByName` + `derivePartOf`) → `res.json(result)` (Image-Handler, unverändert) → Web `adaptScanResponse` legt Antwort unter `result.raw` (unverändert) → `emitComponents(result, kind)` liest `result.raw[kind+'s']` und muss die Felder mit-emittieren → `LibraryObjectList` rendert das Label.

---

## Task 1: `mergeByName` summiert `instanceCount`

**Files:**
- Modify: `server/lib/claude.js` (Funktion `mergeByName`, ca. Zeile 125–143)
- Test: `server/lib/claude.test.js`

- [ ] **Step 1: Failing-Test schreiben**

In `server/lib/claude.test.js` bei den bestehenden `mergeByName`-Tests (ca. Zeile 113 ff.) ergänzen:

```js
test('mergeByName: summiert instanceCount über gleichnamige Treffer', () => {
  const merged = mergeByName([
    { name: 'Nav Item', bbox: { x: 0, y: 0, w: 0.1, h: 0.05 } },
    { name: 'Nav Item', bbox: { x: 0, y: 0.05, w: 0.1, h: 0.05 } },
    { name: 'Nav Item', bbox: { x: 0, y: 0.1, w: 0.1, h: 0.05 } },
  ]);
  assert.equal(merged.length, 1);
  assert.equal(merged[0].instanceCount, 3);
});

test('mergeByName: respektiert von der KI geliefertes instanceCount und addiert', () => {
  const merged = mergeByName([
    { name: 'Nav Item', instanceCount: 9, bbox: { x: 0, y: 0, w: 0.1, h: 0.05 } },
    { name: 'Nav Item', bbox: { x: 0, y: 0.05, w: 0.1, h: 0.05 } },
  ]);
  assert.equal(merged[0].instanceCount, 10);
});

test('mergeByName: fehlendes/ungültiges instanceCount zählt als 1', () => {
  const merged = mergeByName([
    { name: 'Badge', instanceCount: 0, bbox: { x: 0, y: 0, w: 0.02, h: 0.02 } },
    { name: 'Badge', instanceCount: -5, bbox: { x: 0, y: 0, w: 0.02, h: 0.02 } },
  ]);
  assert.equal(merged[0].instanceCount, 2);
});

test('mergeByName: einzelner Treffer bekommt instanceCount 1', () => {
  const merged = mergeByName([{ name: 'Logo', bbox: { x: 0, y: 0, w: 0.05, h: 0.05 } }]);
  assert.equal(merged[0].instanceCount, 1);
});
```

- [ ] **Step 2: Test laufen lassen — muss scheitern**

Run: `npm run test:server`
Expected: FAIL — `instanceCount` ist `undefined`.

- [ ] **Step 3: Minimale Implementierung**

`mergeByName` in `server/lib/claude.js` ersetzen durch:

```js
export function mergeByName(items) {
  const byName = new Map();
  for (const item of items ?? []) {
    const key = String(item.name ?? '').trim().toLowerCase();
    const count = Number.isFinite(item.instanceCount) && item.instanceCount > 0
      ? Math.floor(item.instanceCount)
      : 1;
    const prev = byName.get(key);
    if (!prev) {
      byName.set(key, {
        ...item,
        instanceCount: count,
        variants: Array.isArray(item.variants) ? [...item.variants] : item.variants,
      });
      continue;
    }
    prev.instanceCount += count;
    if (Array.isArray(item.variants) && item.variants.length) {
      prev.variants = [...new Set([...(prev.variants ?? []), ...item.variants])];
    }
    if (!prev.notes && item.notes) prev.notes = item.notes;
    if (!prev.partOf && item.partOf) prev.partOf = item.partOf;
    if (bboxArea(item.bbox) > bboxArea(prev.bbox)) prev.bbox = item.bbox;
  }
  return [...byName.values()];
}
```

- [ ] **Step 4: Test laufen lassen — muss bestehen**

Run: `npm run test:server`
Expected: PASS (alle bisherigen + 4 neue).

- [ ] **Step 5: Commit**

```bash
git add server/lib/claude.js server/lib/claude.test.js
git commit -m "feat(scan): mergeByName summiert instanceCount je Baustein

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 2: `parentByName` in `taxonomy.js`

**Files:**
- Modify: `server/lib/taxonomy.js` (neue exportierte reine Funktion, ans Dateiende)
- Test: `server/lib/taxonomy.test.js`

- [ ] **Step 1: Failing-Test schreiben**

Import oben um `parentByName` erweitern:
`import { classifyByContainment, buildCompositionTree, parentByName, CONTAIN_RATIO, CANVAS_RATIO, SECTION_RATIO } from './taxonomy.js';`
Die Helfer `areaOf`/`contains` sind in der Datei bereits definiert (Zeile 6–26). Ergänzen:

```js
test('parentByName: kleines Item in großem Container -> child:parent', () => {
  const items = [
    { name: 'Sidebar', ref: { x: 0, y: 0, w: 0.2, h: 1 } },
    { name: 'Nav Item', ref: { x: 0.01, y: 0.1, w: 0.18, h: 0.05 } },
  ];
  const parent = parentByName(items, { areaOf, contains });
  assert.equal(parent['Nav Item'], 'Sidebar');
  assert.equal(parent['Sidebar'], undefined);
});

test('parentByName: ohne Enthaltung kein Eintrag', () => {
  const items = [
    { name: 'A', ref: { x: 0, y: 0, w: 0.1, h: 0.1 } },
    { name: 'B', ref: { x: 0.5, y: 0.5, w: 0.1, h: 0.1 } },
  ];
  const parent = parentByName(items, { areaOf, contains });
  assert.deepEqual(parent, {});
});

test('parentByName: verschachtelt -> kleinster enthaltender Container gewinnt', () => {
  const items = [
    { name: 'Screen', ref: { x: 0, y: 0, w: 1, h: 1 } },
    { name: 'Card', ref: { x: 0.1, y: 0.1, w: 0.3, h: 0.3 } },
    { name: 'Trend Badge', ref: { x: 0.12, y: 0.12, w: 0.05, h: 0.03 } },
  ];
  const parent = parentByName(items, { areaOf, contains });
  assert.equal(parent['Trend Badge'], 'Card');
  assert.equal(parent['Card'], 'Screen');
});
```

- [ ] **Step 2: Test laufen lassen — muss scheitern**

Run: `npm run test:server`
Expected: FAIL — `parentByName is not a function`.

- [ ] **Step 3: Minimale Implementierung**

Ans Ende von `server/lib/taxonomy.js` anhängen:

```js
/**
 * parentByName(items, { areaOf, contains }) -> { [childName]: parentName }
 * Invertiert buildCompositionTree: für jedes Kind sein direkter Elternteil
 * (der flächenkleinste enthaltende Container). Nur direkte Kanten.
 */
export function parentByName(items, { areaOf, contains }) {
  const { children } = buildCompositionTree(items, { areaOf, contains });
  const parent = {};
  for (const [parentName, childNames] of Object.entries(children)) {
    for (const childName of childNames) parent[childName] = parentName;
  }
  return parent;
}
```

- [ ] **Step 4: Test laufen lassen — muss bestehen**

Run: `npm run test:server`
Expected: PASS (bestehende + 3 neue).

- [ ] **Step 5: Commit**

```bash
git add server/lib/taxonomy.js server/lib/taxonomy.test.js
git commit -m "feat(taxonomy): parentByName — child->parent aus Kompositions-Baum

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 3: `partOf`-Ableitung in `analyzeScreenshot`

**Files:**
- Modify: `server/lib/claude.js` (Import Zeile 4; neue Funktion `derivePartOf`; Aufruf in `analyzeScreenshot` nach `applyContainmentGuard`, ca. Zeile 235)
- Test: `server/lib/claude.test.js`

- [ ] **Step 1: Failing-Test schreiben**

Import erweitern:
`import { analyzeScreenshot, mergeByName, applyContainmentGuard, derivePartOf } from './claude.js';`
Ergänzen:

```js
test('derivePartOf: setzt partOf für enthaltenes Kind, Organismus bleibt top-level', () => {
  const guarded = {
    atoms: [{ name: 'Nav Item', kind: 'atom', bbox: { x: 0.01, y: 0.1, w: 0.18, h: 0.05 } }],
    molecules: [],
    organisms: [{ name: 'Sidebar', kind: 'organism', bbox: { x: 0, y: 0, w: 0.2, h: 1 } }],
    templates: [{ name: 'Dashboard', kind: 'template', bbox: { x: 0, y: 0, w: 1, h: 1 } }],
  };
  derivePartOf(guarded);
  assert.equal(guarded.atoms[0].partOf, 'Sidebar');
  assert.equal(guarded.organisms[0].partOf, undefined); // Template ist kein partOf-Kandidat
});

test('derivePartOf: von der KI gesetztes partOf wird nicht überschrieben', () => {
  const guarded = {
    atoms: [{ name: 'Icon', kind: 'atom', partOf: 'KPI-Card', bbox: { x: 0.5, y: 0.5, w: 0.02, h: 0.02 } }],
    molecules: [],
    organisms: [{ name: 'Sidebar', kind: 'organism', bbox: { x: 0.4, y: 0.4, w: 0.4, h: 0.4 } }],
    templates: [],
  };
  derivePartOf(guarded);
  assert.equal(guarded.atoms[0].partOf, 'KPI-Card');
});
```

- [ ] **Step 2: Test laufen lassen — muss scheitern**

Run: `npm run test:server`
Expected: FAIL — `derivePartOf is not a function`.

- [ ] **Step 3: Minimale Implementierung**

Import in Zeile 4 erweitern:

```js
import { classifyByContainment, buildCompositionTree, parentByName, CONTAIN_RATIO } from './taxonomy.js';
```

Neue exportierte Funktion unter `applyContainmentGuard` (vor `mergeByName`) einfügen:

```js
// Leitet partOf (Eltern-Organismus) für herausgezogene Kleinteile aus der bbox-
// Enthaltung ab. Additiv: setzt partOf NUR, wo die KI keins geliefert hat.
// Templates sind KEINE partOf-Kandidaten (sonst wäre jeder Organismus "part of screen").
export function derivePartOf(guarded) {
  const flat = [...guarded.atoms, ...guarded.molecules, ...guarded.organisms];
  const items = flat.map((it) => ({ name: it.name, ref: it }));
  const areaOf = (ref) => bboxArea(ref?.bbox);
  const contains = (a, b) => {
    const areaA = bboxArea(a?.bbox);
    const areaB = bboxArea(b?.bbox);
    if (areaA <= areaB || areaB === 0) return false;
    return bboxOverlapArea(a?.bbox, b?.bbox) / areaB >= CONTAIN_RATIO;
  };
  const parent = parentByName(items, { areaOf, contains });
  for (const it of flat) {
    if (!it.partOf && parent[it.name]) it.partOf = parent[it.name];
  }
  return guarded;
}
```

In `analyzeScreenshot` direkt nach `const guarded = applyContainmentGuard(...)` (ca. Zeile 235) einfügen:

```js
  derivePartOf(guarded);
```

- [ ] **Step 4: Test laufen lassen — muss bestehen**

Run: `npm run test:server`
Expected: PASS (bestehende + 2 neue; partOf ist additiv → keine Regression).

- [ ] **Step 5: Commit**

```bash
git add server/lib/claude.js server/lib/claude.test.js
git commit -m "feat(scan): partOf-Ableitung aus bbox-Enthaltung (KI-partOf gewinnt)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 4: `EXTRACTION_PROMPT` um Zerlegungs-Instruktion anreichern

**Files:**
- Modify: `server/lib/claude.js` (`EXTRACTION_PROMPT`, ca. Zeile 7–49)
- Test: `server/lib/claude.test.js`

- [ ] **Step 1: Failing-Test schreiben**

Prompts sind nicht deterministisch testbar; wir pinnen die *Struktur*, damit sie bei späteren Edits nicht still verschwindet. Import erweitern:
`import { analyzeScreenshot, mergeByName, applyContainmentGuard, derivePartOf, EXTRACTION_PROMPT } from './claude.js';`

```js
test('EXTRACTION_PROMPT enthält Zerlegungs-Instruktion + neue Felder', () => {
  assert.match(EXTRACTION_PROMPT, /DECOMPOSE/);
  assert.match(EXTRACTION_PROMPT, /instanceCount/);
  assert.match(EXTRACTION_PROMPT, /partOf/);
});
```

- [ ] **Step 2: Test laufen lassen — muss scheitern**

Run: `npm run test:server`
Expected: FAIL — `EXTRACTION_PROMPT` nicht exportiert / enthält die Strings nicht.

- [ ] **Step 3: Minimale Implementierung**

`const EXTRACTION_PROMPT` zu `export const EXTRACTION_PROMPT` machen.

Die drei JSON-Schema-Zeilen für atoms/molecules/organisms (Zeile 26–28) je um `instanceCount`/`partOf` ergänzen, Muster für `atoms`:

```
  "atoms": [{ "name": "component name", "variants": ["variant names"], "confidence": "high|medium|low", "notes": "", "instanceCount": 1, "partOf": "organism name or omit", "bbox": { "x": 0.0, "y": 0.0, "w": 0.0, "h": 0.0 } }],
```

(analog `molecules` und `organisms`; `templates` bekommt KEINE der beiden Felder.)

Nach dem `CRITICAL:`-Block (nach Zeile 41) diesen Absatz einfügen:

```
DECOMPOSE each organism into its reusable inner building blocks and add them to the appropriate "atoms"/"molecules" arrays IN ADDITION to the organism itself. Extract an inner element when it (a) repeats within the screen, OR (b) is a standard reusable atom (button, input, icon, badge, avatar, single control). Do NOT extract one-off decorative containers or every stray label. When an inner element repeats (e.g. sidebar nav items), emit it ONCE and set "instanceCount" to how many times it appears — never list the same element multiple times. For every extracted inner element set "partOf" to the exact "name" of the organism it belongs to, and give it a reusable generic name (e.g. "Nav Item", not "Dashboard nav item 3"). Top-level building blocks omit "partOf" and use "instanceCount": 1.
```

- [ ] **Step 4: Test laufen lassen — muss bestehen**

Run: `npm run test:server`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add server/lib/claude.js server/lib/claude.test.js
git commit -m "feat(scan): Prompt zerlegt Organismen in wiederverwendbare Kleinteile

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 5: `emitComponents` reicht `instanceCount`/`partOf` durch

**Files:**
- Modify: `web/src/lib/emit/emitComponents.js` (das gepushte Item-Objekt, ca. Zeile 93–113)
- Test: `web/src/lib/emit/emitComponents.test.js`

- [ ] **Step 1: Failing-Test schreiben**

In `web/src/lib/emit/emitComponents.test.js` (vitest `describe/it/expect`, Import `emitComponents` bereits da) ergänzen:

```js
it('reicht instanceCount und partOf pro Baustein durch', () => {
  const r = { raw: { tokens: {}, atoms: [], molecules: [{ name: 'Nav Item', instanceCount: 9, partOf: 'Sidebar' }], organisms: [], templates: [] } };
  const items = emitComponents(r, 'molecule');
  expect(items).toHaveLength(1);
  expect(items[0].instanceCount).toBe(9);
  expect(items[0].partOf).toBe('Sidebar');
});

it('setzt Defaults instanceCount 1 und partOf null', () => {
  const r = { raw: { tokens: {}, atoms: [{ name: 'Logo' }], molecules: [], organisms: [], templates: [] } };
  const items = emitComponents(r, 'atom');
  expect(items[0].instanceCount).toBe(1);
  expect(items[0].partOf).toBe(null);
});
```

- [ ] **Step 2: Test laufen lassen — muss scheitern**

Run: `cd web && npm test`
Expected: FAIL — `instanceCount`/`partOf` sind `undefined` (Whitelist lässt sie weg).

- [ ] **Step 3: Minimale Implementierung**

In `web/src/lib/emit/emitComponents.js` im `out.push({ ... })`-Objekt (ca. Zeile 93–113) zwei Zeilen ergänzen, z. B. direkt nach `notes: item.notes ?? null,`:

```js
        instanceCount: item.instanceCount ?? 1,
        partOf: item.partOf ?? null,
```

- [ ] **Step 4: Test laufen lassen — muss bestehen**

Run: `cd web && npm test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add web/src/lib/emit/emitComponents.js web/src/lib/emit/emitComponents.test.js
git commit -m "feat(web): emitComponents reicht instanceCount/partOf durch

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 6: `LibraryObjectList` zeigt „Teil von {partOf} · ×{instanceCount}"

**Files:**
- Modify: `web/src/components/library/LibraryObjectList.jsx` (`Row`-Header, nach der Namens-Zeile ~54)
- Test: `web/src/components/library/LibraryObjectList.test.jsx`

- [ ] **Step 1: Failing-Test schreiben**

In `web/src/components/library/LibraryObjectList.test.jsx` (vitest + Testing Library, `picks` ist oben in der Datei definiert) ergänzen:

```js
it('zeigt Herkunft und Instanzzahl für herausgezogene Bausteine', () => {
  const items = [{ name: 'Nav Item', slug: 'nav-item', filename: 'NavItem.jsx', kind: 'molecule',
    templateKey: null, variants: [], code: '', confidence: 'high', hasPreview: false,
    instanceCount: 9, partOf: 'Sidebar' }];
  render(<LibraryObjectList items={items} picks={picks} />);
  expect(screen.getByText(/Teil von Sidebar/)).toBeInTheDocument();
  expect(screen.getByText(/×9/)).toBeInTheDocument();
});

it('zeigt kein Herkunfts-Label für Top-Level-Bausteine', () => {
  const items = [{ name: 'Logo', slug: 'logo', filename: 'Logo.jsx', kind: 'atom',
    templateKey: null, variants: [], code: '', confidence: 'high', hasPreview: false,
    instanceCount: 1, partOf: null }];
  render(<LibraryObjectList items={items} picks={picks} />);
  expect(screen.queryByText(/Teil von/)).not.toBeInTheDocument();
  expect(screen.queryByText(/×/)).not.toBeInTheDocument();
});
```

- [ ] **Step 2: Test laufen lassen — muss scheitern**

Run: `cd web && npm test`
Expected: FAIL — Label wird noch nicht gerendert.

- [ ] **Step 3: Minimale Implementierung**

In `web/src/components/library/LibraryObjectList.jsx` in der `Row`-Header-Zeile, nach den SourcePills und vor der `filename`-Span mit `ml-auto` (ca. Zeile 74), dieses Fragment einfügen:

```jsx
        {(item.partOf || item.instanceCount > 1) && (
          <span className="text-[10px] text-zinc-500">
            {item.partOf && `Teil von ${item.partOf}`}
            {item.partOf && item.instanceCount > 1 && ' · '}
            {item.instanceCount > 1 && `×${item.instanceCount}`}
          </span>
        )}
```

- [ ] **Step 4: Test laufen lassen — muss bestehen**

Run: `cd web && npm test`
Expected: PASS. (Der zweite Test greift, weil `×` nur bei `instanceCount > 1` und „Teil von" nur bei gesetztem `partOf` erscheint.)

- [ ] **Step 5: Commit**

```bash
git add web/src/components/library/LibraryObjectList.jsx web/src/components/library/LibraryObjectList.test.jsx
git commit -m "feat(web): LibraryObjectList zeigt Herkunft + Instanzzahl je Baustein

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 7: Voller Testlauf + Browser-Verifikation + Push

**Files:** keine (Verifikation)

- [ ] **Step 1: Alle Server-Tests grün** — Run: `npm run test:server` · Expected: Baseline (289) + neue, 0 Fehler.
- [ ] **Step 2: Alle Web-Tests grün** — Run: `cd web && npm test` · Expected: 0 Fehler.
- [ ] **Step 3: Dev-Server + echter Bild-Scan.** Preview über die `run`-/Browser-Tools starten (Startbefehl `PORT=3047 npm run dev:demo` wegen Port-Falle). Einen Dashboard-Screenshot importieren. **Quota-Hinweis:** echter Claude/Gemini-Scan braucht Kontingent — falls Tages-Quota leer (Reset ~09:00 dt.), greift der Demo-Fallback (`DEMO_FALLBACK=1`, in `dev:demo` gesetzt) — der zeigt aber die Fixture, nicht die echte Zerlegung. Für den *echten* Beweis der rekursiven Zerlegung einen Scan mit Quota fahren. Prüfen: erscheinen Nav Item (×N), KPI-Innereien, Buttons — mit „Teil von …"-Label?
- [ ] **Step 4: Screenshot als Beweis** an Rob (Library-Ansicht mit den neuen Bausteinen + Labels).
- [ ] **Step 5: Push**

```bash
git push origin experiment/rekursive-zerlegung
```

(Kein Railway-Deploy — nur `main` deployt. Rückführung nach `main` = bewusster späterer Schritt, frühestens nach dem 29.07.)

---

## Bewusst NICHT in diesem Plan (dokumentiert)

- **`scan.js` (Image-Handler) & `scanResultAdapter.js`:** unverändert — der Image-Pfad reicht `result` per `res.json(result)` 1:1 durch, `result.raw` trägt die Felder bis in `emitComponents`. (URL/Repo-Handler mappen Inventar neu, sind aber out-of-scope v1.)
- **Token-/subatomare Verlinkung** (Robs Punkt): Folge-Plan, sobald die Bausteine stehen — das Datenmodell (eigene Bausteine mit Werten) ist hier die Voraussetzung.
- **URL-/Repo-Pfad-Zerlegung:** eigener Plan (DOM-basierte `areaOf`/`contains`).
- **Plugin:** unberührt (`instanceCount`/`partOf` sind Anzeige-Metadaten).
- **KI-Namens-Konsistenz** härten, falls die generischen Namen in der Praxis zu stark schwanken (kontrolliertes Vokabular im Prompt).
