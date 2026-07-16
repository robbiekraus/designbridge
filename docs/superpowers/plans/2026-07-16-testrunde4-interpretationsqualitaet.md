# Testrunde 4: Interpretations-Qualität — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Die 7 bewiesenen Ursachen der "generischen" KI-Interpretationen beheben (Diagnose Session 16.07., siehe RESUME.md) — Mini-Crops, hohe Temperature, stille flash-lite-Degradierung, Monster-Batch, fehlende Demo-/Modell-Kennzeichnung, mergeByName-bbox, externe Bilder.

**Architecture:** Alle Fixes sind chirurgische Änderungen an bestehenden Modulen: `imageDecomposer` (Upscaling), `geminiClient` (Temperature + Fallback-Kette), `interpretComponents` (Chunking + Modell-Durchreichung + sanitizeHtml), Routes (Demo-Flag), Web-Lib/UI (Badges). Keine neuen Dependencies, keine neuen Endpoints.

**Tech Stack:** Node/Express, Jimp, Vitest (Server: `npm run test:server`, Web: `cd web && npx vitest run`), React/Tailwind.

**Betriebsregeln (WICHTIG):**
- Jeder Push auf `main` deployt automatisch auf Railway. Nur am Ende pushen, nach grünen Voll-Suiten.
- Nach Datei-Writes: `find . -name '._*' -delete` (AppleDouble, Repo-Regel 7).
- Vorher-Stand: Server-Tests 170, Web-Tests 321. Nach jedem Task müssen ALLE bestehenden Tests weiter grün sein (Anpassungen an bestehende Tests sind erlaubt, wenn der Task das Verhalten bewusst ändert — im Task vermerkt).

---

### Task 1: Mindest-Crop-Größe / Upscaling (Diagnose-Ursache a — höchste Prio)

**Files:**
- Modify: `server/lib/decompose/imageDecomposer.js` (Funktion `cropVisual`)
- Test: `server/lib/decompose/imageDecomposer.test.js`

Winzige Crops (Avatar 34×31 px) geben dem Modell zu wenig Pixel — es erfindet Inhalte (lieferte z. B. ein Unsplash-Stockfoto). Fix: Crops mit kurzer Kante < 128 px bikubisch hochskalieren, Faktor gedeckelt bei 4×.

- [ ] **Step 1: Failing Test schreiben** — in `imageDecomposer.test.js` (bestehende Test-Muster für Bild-Erzeugung übernehmen; die Datei erzeugt bereits Testbilder mit Jimp):

```js
it('skaliert winzige Crops auf mindestens 128px kurze Kante hoch (max 4x)', async () => {
  // 1000x800-Bild, bbox 3.4% x 4% => 34x32 px Crop => nach 4x: 136x128
  const img = await new Jimp(1000, 800, 0x3366ffff);
  const p = tmpFile('tiny.png'); // an vorhandene tmp-Helfer der Testdatei anpassen
  await img.writeAsync(p);
  const segments = await imageDecomposer.decompose({ imagePath: p }, [
    { name: 'avatar', bbox: { x: 0.1, y: 0.1, w: 0.034, h: 0.04 } },
  ]);
  const out = await Jimp.read(Buffer.from(segments[0].visual.base64, 'base64'));
  expect(Math.min(out.getWidth(), out.getHeight())).toBeGreaterThanOrEqual(128);
});

it('lässt große Crops unverändert (kein Upscaling)', async () => {
  const img = await new Jimp(1000, 800, 0x3366ffff);
  const p = tmpFile('big.png');
  await img.writeAsync(p);
  const segments = await imageDecomposer.decompose({ imagePath: p }, [
    { name: 'card', bbox: { x: 0.1, y: 0.1, w: 0.5, h: 0.5 } },
  ]);
  const out = await Jimp.read(Buffer.from(segments[0].visual.base64, 'base64'));
  expect(out.getWidth()).toBe(500);
  expect(out.getHeight()).toBe(400);
});
```

- [ ] **Step 2: Test laufen lassen, FAIL bestätigen** — `npm run test:server -- imageDecomposer` (erwartet: erster neuer Test rot, min-Kante 32 < 128)

- [ ] **Step 3: Implementierung** — in `cropVisual` nach dem `crop(...)`-Aufruf, vor `getBufferAsync`:

```js
const MIN_CROP_EDGE = 128; // px — kleinere Crops halluziniert das Modell (Diagnose 16.07.)
const MAX_UPSCALE = 4;
```
(Konstanten auf Modulebene, über `cropVisual`.) Und in `cropVisual`:

```js
  const crop = img.clone().crop(x, y, w, h);
  // Winzige Crops (z. B. Avatar 34x31 px) geben dem Modell zu wenig Pixel —
  // es erfindet dann generische Inhalte statt des echten Ausschnitts.
  // Kurze Kante auf MIN_CROP_EDGE hochskalieren, gedeckelt bei MAX_UPSCALE.
  const scale = Math.min(MAX_UPSCALE, MIN_CROP_EDGE / Math.min(w, h));
  if (scale > 1) crop.scale(scale, Jimp.RESIZE_BICUBIC);
  const buf = await crop.getBufferAsync(Jimp.MIME_PNG);
```

- [ ] **Step 4: Tests grün** — `npm run test:server -- imageDecomposer` (alle, auch die bestehenden)
- [ ] **Step 5: Commit** — `git add server/lib/decompose/ && git commit -m "Fix: winzige Crops vor Interpretation hochskalieren (min 128px Kante, max 4x)"`

---

### Task 2: Temperature 0.2 für Gemini (Diagnose-Ursache c, Teil 2)

**Files:**
- Modify: `server/lib/geminiClient.js` (generationConfig)
- Test: `server/lib/geminiClient.test.js`

Default-Temperature ≈1.0 begünstigt "kreative" statt originalgetreuer Rekonstruktionen.

- [ ] **Step 1: Failing Test** — Fake-fetch (Muster aus bestehenden Tests der Datei übernehmen: fetchImpl-Injection, Body via `JSON.parse(call.body)` prüfen):

```js
it('setzt temperature 0.2 als Default in generationConfig', async () => {
  const calls = [];
  const fetchImpl = async (url, opts) => {
    calls.push(JSON.parse(opts.body));
    return { ok: true, json: async () => ({ candidates: [{ content: { parts: [{ text: '{}' }] } }] }) };
  };
  const client = makeGeminiClient({ apiKey: 'k', fetchImpl });
  await client.messages.create({ max_tokens: 100, messages: [{ role: 'user', content: 'hi' }] });
  expect(calls[0].generationConfig.temperature).toBe(0.2);
});

it('reicht params.temperature durch', async () => {
  const calls = [];
  const fetchImpl = async (url, opts) => {
    calls.push(JSON.parse(opts.body));
    return { ok: true, json: async () => ({ candidates: [{ content: { parts: [{ text: '{}' }] } }] }) };
  };
  const client = makeGeminiClient({ apiKey: 'k', fetchImpl });
  await client.messages.create({ max_tokens: 100, temperature: 0.7, messages: [{ role: 'user', content: 'hi' }] });
  expect(calls[0].generationConfig.temperature).toBe(0.7);
});
```

- [ ] **Step 2: FAIL bestätigen** — `npm run test:server -- geminiClient`
- [ ] **Step 3: Implementierung** — in `generationConfig`:

```js
          generationConfig: {
            maxOutputTokens: params.max_tokens,
            // Rekonstruktion soll originalgetreu sein, nicht kreativ: die
            // Default-Temperature (~1.0) war Mitursache der "generischen"
            // Interpretationen (Diagnose 16.07.).
            temperature: params.temperature ?? 0.2,
            responseMimeType: 'application/json',
          },
```

- [ ] **Step 4: Tests grün** — `npm run test:server -- geminiClient`
- [ ] **Step 5: Commit** — `git commit -am "Fix: Gemini temperature 0.2 statt Default ~1.0 (originalgetreue Interpretationen)"`

---

### Task 3: Degradierungs-Stopp — flash-lite raus aus der Fallback-Kette (Diagnose-Ursache b)

**Files:**
- Modify: `server/lib/geminiClient.js` (`FALLBACK_MODELS`)
- Test: `server/lib/geminiClient.test.js`

flash-lite erfand nachweislich generische Inhalte (Testrunde 2+3). Stille Degradierung dorthin verfälscht Ergebnisse, "Erneut versuchen" läuft in dieselbe Falle. Lieber ehrlich scheitern (Retry trifft später das gute Modell) als leise schlechte Qualität liefern.

- [ ] **Step 1: Failing Test:**

```js
it('degradiert NIE auf flash-lite — Kette endet nach gemini-3-flash-preview', async () => {
  const urls = [];
  const fetchImpl = async (url) => {
    urls.push(url);
    return { ok: false, status: 503, json: async () => ({ error: { message: 'overloaded' } }) };
  };
  const client = makeGeminiClient({ apiKey: 'k', fetchImpl });
  await expect(
    client.messages.create({ max_tokens: 100, messages: [{ role: 'user', content: 'hi' }] })
  ).rejects.toThrow(/503/);
  expect(urls).toHaveLength(2); // flash-latest + 3-flash-preview, KEIN flash-lite
  expect(urls.join(' ')).not.toMatch(/flash-lite/);
});
```

- [ ] **Step 2: FAIL bestätigen** — `npm run test:server -- geminiClient`
- [ ] **Step 3: Implementierung** — `FALLBACK_MODELS` ersetzen:

```js
// Ausweich-Kette bei 404/429/503. flash-lite steht bewusst NICHT mehr drin:
// es erfand bei Interpretationen generische Inhalte statt des echten
// Bildausschnitts (Testrunden 2+3) — stille Degradierung dorthin verfälschte
// jedes Ergebnis unmarkiert. Lieber ehrlich scheitern; Retry trifft das gute
// Modell, sobald die Lastspitze vorbei ist (Diagnose 16.07.).
const FALLBACK_MODELS = ['gemini-3-flash-preview'];
```

- [ ] **Step 4: Bestehende Tests anpassen** — Tests in `geminiClient.test.js`, die die alte 3er-Kette (inkl. `gemini-3.1-flash-lite`) erwarten, auf die 2er-Kette umschreiben. Alle grün: `npm run test:server -- geminiClient`
- [ ] **Step 5: Commit** — `git commit -am "Fix: Degradierungs-Stopp — flash-lite aus der Gemini-Fallback-Kette entfernt"`

---

### Task 4: Batch-Chunking à 4 + Modell pro Interpretation durchreichen (Diagnose-Ursachen c Teil 1 + b Teil 2)

**Files:**
- Modify: `server/lib/interpretComponents.js`
- Test: `server/lib/interpretComponents.test.js`

13 Bausteine in EINEM Call verwässern die Treue. Außerdem verwirft `interpretComponents` bisher `response.model` — die UI kann nicht zeigen, welches Modell geantwortet hat.

**Verhaltensänderungen:** (1) max. 4 Segmente pro KI-Call, sequenziell (Free-Tier ~10 req/min — bei realistisch ≤4 Chunks unkritisch). (2) Jede Interpretation trägt `model`. (3) Ein gescheiterter Chunk reißt nicht mehr den ganzen Batch um: seine Labels landen in `failed`, die anderen Chunks liefern. Nur wenn ALLE Chunks scheitern, wirft die Funktion (→ Route antwortet 502 wie bisher).

- [ ] **Step 1: Failing Tests** (Fake-Client-Muster der bestehenden Datei übernehmen — injizierter `client` mit `messages.create`):

```js
it('teilt 9 Segmente in 3 Calls à max 4', async () => {
  const calls = [];
  const client = { messages: { create: async (params) => {
    calls.push(params);
    // Namen aus dem Prompt-Textblock ziehen: letzter content-Block enthält die Labels
    const labels = JSON.parse(params.messages[0].content.at(-1).text.match(/COMPONENTS \(in order\): (\[.*\])$/)[1]);
    return {
      model: 'gemini-test',
      stop_reason: 'end_turn',
      content: [{ type: 'text', text: JSON.stringify({ interpretations: labels.map((l) => ({ name: l, html: `<div style="color:#000">${l}</div>`, jsx: '' })) }) }],
    };
  } } };
  const segments = Array.from({ length: 9 }, (_, i) => ({ label: `comp-${i}`, visual: { base64: 'aGk=', media_type: 'image/png' } }));
  const result = await interpretComponents(null, null, segments, { client });
  expect(calls).toHaveLength(3);
  expect(result.interpretations).toHaveLength(9);
  expect(result.interpretations[0].model).toBe('gemini-test');
});

it('ein gescheiterter Chunk => nur seine Labels failed, andere liefern', async () => {
  let n = 0;
  const client = { messages: { create: async (params) => {
    n++;
    if (n === 1) throw new Error('503 overloaded');
    const labels = JSON.parse(params.messages[0].content.at(-1).text.match(/COMPONENTS \(in order\): (\[.*\])$/)[1]);
    return { model: 'm', stop_reason: 'end_turn', content: [{ type: 'text', text: JSON.stringify({ interpretations: labels.map((l) => ({ name: l, html: `<b>${l}</b>`, jsx: '' })) }) }] };
  } } };
  const segments = Array.from({ length: 8 }, (_, i) => ({ label: `c${i}`, visual: { base64: 'aGk=', media_type: 'image/png' } }));
  const result = await interpretComponents(null, null, segments, { client });
  expect(result.failed).toEqual(['c0', 'c1', 'c2', 'c3']);
  expect(result.interpretations).toHaveLength(4);
});

it('ALLE Chunks gescheitert => wirft', async () => {
  const client = { messages: { create: async () => { throw new Error('503'); } } };
  const segments = [{ label: 'a', visual: { base64: 'aGk=', media_type: 'image/png' } }];
  await expect(interpretComponents(null, null, segments, { client })).rejects.toThrow('503');
});
```

- [ ] **Step 2: FAIL bestätigen** — `npm run test:server -- interpretComponents`
- [ ] **Step 3: Implementierung** — `interpretComponents` in Orchestrator + `interpretChunk` aufteilen. Der bisherige Funktionskörper (Segment-Sortierung, content-Aufbau, Call, Parsing, byName-Zuordnung) wandert nahezu unverändert in `interpretChunk`; Unterschiede: Vollbild-Base64 wird EINMAL im Orchestrator gelesen und reingereicht, und die Interpretationen tragen `model`:

```js
const CHUNK_SIZE = 4; // Diagnose 16.07.: 13 Bausteine in einem Call verwässern die Treue

export async function interpretComponents(imagePath, mimetype, segments, { client } = {}) {
  const c = client ?? getAiClient();
  // Vollbild nur einmal von Platte lesen, auch wenn mehrere Chunks es brauchen.
  const fullImage = imagePath
    ? { base64: fs.readFileSync(imagePath).toString('base64'), media_type: mimetype }
    : null;
  const chunks = [];
  for (let i = 0; i < segments.length; i += CHUNK_SIZE) chunks.push(segments.slice(i, i + CHUNK_SIZE));

  const interpretations = [];
  const failed = [];
  let lastError = null;
  for (const chunk of chunks) {
    try {
      const r = await interpretChunk(c, fullImage, chunk);
      interpretations.push(...r.interpretations);
      failed.push(...r.failed);
    } catch (err) {
      // Ein kaputter Chunk (z. B. Lastspitze) reißt nicht den ganzen Batch um —
      // seine Bausteine landen als failed (Retry pro Zeile in der UI).
      lastError = err;
      failed.push(...chunk.map((s) => s.label));
    }
  }
  if (interpretations.length === 0 && lastError) throw lastError;
  return { interpretations, failed };
}

async function interpretChunk(c, fullImage, segments) {
  // ... bisheriger Körper ab `const withVisual = ...` bis zum return, mit 3 Änderungen:
  // (1) hasFullImageFallback = bare.length > 0 && !!fullImage;
  //     und der Vollbild-Block nutzt fullImage.base64 / fullImage.media_type
  //     statt fs.readFileSync(imagePath) / mimetype.
  // (2) buildPrompt(segments, ...) bekommt wie bisher die (Chunk-)Segmente.
  // (3) im Erfolgs-Push: interpretations.push({ name: s.label, html, jsx: ...,
  //     model: response.model ?? null });
}
```

Wichtig: `fs`-Import bleibt (Orchestrator liest). Der Fehlertext bei max_tokens/ungültigem JSON bleibt unverändert in `interpretChunk`.

- [ ] **Step 4: Bestehende Tests anpassen** — Tests, die einen einzigen Call für >4 Segmente erwarten oder das Ergebnis-Shape ohne `model` strikt prüfen, aktualisieren. Alle grün: `npm run test:server -- interpretComponents`
- [ ] **Step 5: Volle Server-Suite** — `npm run test:server` (Routes nutzen die Funktion; nichts darf brechen)
- [ ] **Step 6: Commit** — `git commit -am "Fix: Interpretation in Chunks a 4 Bausteinen + Modellname pro Interpretation"`

---

### Task 5: Demo-Kennzeichnung in beiden Routes (Diagnose-Ursache f)

**Files:**
- Modify: `server/routes/interpret.js` (Demo-Zweig)
- Modify: `server/routes/scan.js` (`loadDemoFallback`)
- Test: `server/lib/demoInterpretations.test.js` (bzw. wo der Demo-Zweig getestet wird — `grep -rn "DEMO_FALLBACK" server/ --include="*.test.js"`)

Demo-Konserven müssen als solche erkennbar sein — sonst verfälschen sie jeden Qualitätstest unmarkiert.

- [ ] **Step 1: Failing Test** — bestehende Demo-Fallback-Tests erweitern: Response muss `demo: true` tragen (interpret) bzw. `meta.demo === true` und `meta.model === 'demo-fixture'` (scan).
- [ ] **Step 2: FAIL bestätigen** — `npm run test:server`
- [ ] **Step 3: Implementierung** — `interpret.js`:

```js
        return res.json({ ...loadDemoInterpretations(components.map((c) => c.name), file), demo: true });
```

`scan.js`, in `loadDemoFallback`:

```js
  raw.meta = { ...raw.meta, image_filename: filename, fallback: true, demo: true, model: 'demo-fixture' };
```

(Behebt zugleich die Kosmetik "meta.model zeigt im Demo-Fallback weiter Claude-Namen", RESUME 16.07.)

- [ ] **Step 4: Tests grün** — `npm run test:server`
- [ ] **Step 5: Commit** — `git commit -am "Fix: Demo-Fallback-Antworten tragen demo:true (nie mehr unmarkierte Konserven)"`

---

### Task 6: Modell- & Demo-Badge in der Web-UI

**Files:**
- Modify: `web/src/lib/interpret.js` (`attachInterpretations`)
- Modify: `web/src/lib/emit/emitComponents.js` (Item-Shape)
- Modify: `web/src/components/library/SourcePill.jsx` (MAP)
- Modify: `web/src/components/library/LibraryObjectList.jsx` (Row-Header)
- Test: bestehende Web-Tests zu `interpret.js`/`emitComponents.js` erweitern (`cd web && npx vitest run` — Testdateien via `grep -rln "attachInterpretations\|emitComponents" web/src --include="*.test.*"`)

- [ ] **Step 1: Failing Tests** — (a) `attachInterpretations` übernimmt `model` und `demo`:

```js
it('attachInterpretations übernimmt model und demo-Flag', () => {
  const result = { interpretations: {} };
  const data = { interpretations: [{ name: 'button', html: '<b/>', jsx: '', model: 'gemini-x' }], failed: [], demo: true };
  const next = attachInterpretations(result, data);
  expect(next.interpretations.button.model).toBe('gemini-x');
  expect(next.interpretations.button.demo).toBe(true);
});
```

(b) `emitComponents`-Items tragen `interpretedModel`/`interpretedDemo` (bestehendes Test-Setup der Datei nutzen).

- [ ] **Step 2: FAIL bestätigen** — `cd web && npx vitest run`
- [ ] **Step 3: Implementierung** — `attachInterpretations`:

```js
  for (const it of data.interpretations ?? []) {
    map[it.name] = { html: it.html, jsx: it.jsx, model: it.model ?? null, demo: Boolean(data.demo) };
  }
```

`emitComponents.js` (im `out.push`, nach `interpretedHtml`):

```js
        interpretedModel: interp?.model ?? null,
        interpretedDemo: Boolean(interp?.demo),
```

`SourcePill.jsx` (MAP ergänzen):

```js
  demo: { label: 'Demo-Daten', cls: 'bg-red-100 text-red-700' },
```

`LibraryObjectList.jsx` (Row-Header, nach der `interpreted`-Pill):

```jsx
        {item.interpretedHtml && <SourcePill value="interpreted" />}
        {item.interpretedDemo && <SourcePill value="demo" />}
        {item.interpretedHtml && !item.interpretedDemo && item.interpretedModel && (
          <span className="text-[10px] font-mono text-zinc-400">{item.interpretedModel}</span>
        )}
```

- [ ] **Step 4: Tests grün** — `cd web && npx vitest run`
- [ ] **Step 5: Commit** — `git commit -am "UX: Modell-Badge + Demo-Daten-Pill an interpretierten Bausteinen"`

---

### Task 7: mergeByName behält die GRÖSSTE bbox (Diagnose-Ursache d)

**Files:**
- Modify: `server/lib/claude.js` (`mergeByName`)
- Test: `server/lib/claude.test.js`

Bisher behält der erste Treffer die bbox — oft ein Mini-Exemplar (z. B. der kleinste von drei Buttons). Downstream cropt dann das Mini-Exemplar. Größte bbox = bestes Material.

- [ ] **Step 1: Failing Test:**

```js
it('mergeByName behält die größte bbox', async () => {
  // über analyzeScreenshot mit Fake-Client ODER mergeByName exportieren — dem
  // bestehenden Test-Stil der Datei folgen. Kern-Assertion:
  // Items: button mit bbox w:0.05,h:0.03 zuerst, dann button mit w:0.2,h:0.1
  // => gemergtes Item hat bbox w:0.2,h:0.1
});
```

Konkret, falls `mergeByName` nicht exportiert ist: exportieren (`export function mergeByName`) und direkt testen:

```js
import { mergeByName } from './claude.js';

it('mergeByName behält die größte bbox', () => {
  const merged = mergeByName([
    { name: 'button', bbox: { x: 0.1, y: 0.1, w: 0.05, h: 0.03 } },
    { name: 'button', bbox: { x: 0.5, y: 0.5, w: 0.2, h: 0.1 } },
  ]);
  expect(merged).toHaveLength(1);
  expect(merged[0].bbox).toEqual({ x: 0.5, y: 0.5, w: 0.2, h: 0.1 });
});
```

- [ ] **Step 2: FAIL bestätigen** — `npm run test:server -- claude`
- [ ] **Step 3: Implementierung** — in `mergeByName`, im Merge-Zweig (nach dem variants-Merge):

```js
const bboxArea = (b) => (b && typeof b.w === 'number' && typeof b.h === 'number' ? b.w * b.h : 0);
```
(Modulebene.) Im Merge-Zweig:

```js
    // Größte bbox gewinnt: der erste Treffer war oft ein Mini-Exemplar,
    // dessen Crop downstream zu klein zum Interpretieren ist (Diagnose 16.07.).
    if (bboxArea(item.bbox) > bboxArea(prev.bbox)) prev.bbox = item.bbox;
```

Kommentar über der Funktion anpassen ("Der erste Treffer behält notes/confidence; die bbox gewinnt der größte Treffer.").

- [ ] **Step 4: Tests grün** — `npm run test:server -- claude`
- [ ] **Step 5: Commit** — `git commit -am "Fix: mergeByName behält die größte bbox statt der ersten"`

---

### Task 8: sanitizeHtml ersetzt externe Bilder (Diagnose-Ursache e)

**Files:**
- Modify: `server/lib/interpretComponents.js` (`sanitizeHtml`)
- Test: `server/lib/interpretComponents.test.js`

Der Prompt verbietet externe Bilder, das Modell liefert trotzdem gelegentlich `<img src="https://images.unsplash.com/...">` — im sandboxed iframe lädt das fremde Inhalte und täuscht Originaltreue vor. Externe `src` durch neutralen Inline-SVG-Platzhalter (data-URI) ersetzen.

- [ ] **Step 1: Failing Test:**

```js
it('ersetzt externe img-src durch Inline-Platzhalter', () => {
  const out = sanitizeHtml('<img src="https://images.unsplash.com/photo-1.jpg" style="width:40px">');
  expect(out).not.toMatch(/https?:\/\//);
  expect(out).toContain('data:image/svg+xml');
  expect(out).toContain('width:40px'); // Attribute drumherum bleiben erhalten
});

it('lässt data-URI-Bilder unangetastet', () => {
  const html = '<img src="data:image/svg+xml;utf8,<svg xmlns=\'http://www.w3.org/2000/svg\'/>">';
  expect(sanitizeHtml(html)).toBe(html);
});
```

- [ ] **Step 2: FAIL bestätigen** — `npm run test:server -- interpretComponents`
- [ ] **Step 3: Implementierung** — Konstante auf Modulebene + drei Replace-Regeln am Ende der sanitizeHtml-Kette:

```js
// Neutraler grauer Platzhalter statt externer Bilder: das Modell liefert trotz
// Prompt-Verbot gelegentlich Stockfoto-URLs (Unsplash, Diagnose 16.07.) — die
// laden fremde Inhalte ins iframe und gaukeln Originaltreue vor.
const IMG_PLACEHOLDER = "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='48' height='48'><rect width='48' height='48' rx='6' fill='%23e4e4e7'/></svg>";
```

In der Kette:

```js
    .replace(/(<img\b[^>]*\ssrc\s*=\s*")(?:https?:)?\/\/[^"]*(")/gi, `$1${IMG_PLACEHOLDER}$2`)
    .replace(/(<img\b[^>]*\ssrc\s*=\s*')(?:https?:)?\/\/[^']*(')/gi, `$1${IMG_PLACEHOLDER}$2`)
    .replace(/(<img\b[^>]*\ssrc\s*=\s*)(?:https?:)?\/\/[^\s>]+/gi, `$1"${IMG_PLACEHOLDER}"`);
```

- [ ] **Step 4: Tests grün** — `npm run test:server -- interpretComponents`
- [ ] **Step 5: Commit** — `git commit -am "Fix: sanitizeHtml ersetzt externe Bild-URLs durch Inline-Platzhalter"`

---

### Task 9: Abschluss — Voll-Suiten, Doku, Push (= Live-Deploy)

**Files:**
- Modify: `RESUME.md` (Session-Eintrag Testrunde 4)

- [ ] **Step 1: Volle Suiten** — `npm run test:server` UND `cd web && npx vitest run` — beide komplett grün, Zahlen notieren (vorher 170/321, jetzt mehr).
- [ ] **Step 2: AppleDouble-Cleanup** — `find . -name '._*' -delete`
- [ ] **Step 3: RESUME.md** — Abschnitt "Session 16.07.2026 — Testrunde 4" mit den 8 Fixes + neuen Testzahlen; E2E-Checkliste: Hinweis, dass Interpretations-Urteil jetzt sinnvoll ist. Commit.
- [ ] **Step 4: Push auf main** — `git push` (⚠️ deployt automatisch auf Railway). Danach Live-Smoke: `curl -s https://designbridge-production.up.railway.app/ | head -c 200` liefert HTML.

---

## Notiz für danach (NICHT Teil dieses Plans)

**Gemini-Pro-A/B-Test (Robs Frage 16.07.):** Nach diesem Plan genügt auf Railway `GEMINI_MODEL=gemini-3-pro-preview` setzen (env-gesteuert, kein Code nötig) → denselben Screenshot einmal mit Flash, einmal mit Pro importieren, Modell-Badge (Task 6) zeigt ehrlich, wer geantwortet hat. Free-Tier-Limits für Pro beachten (wenige Anfragen/Tag).
