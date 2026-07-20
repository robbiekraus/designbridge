import fs from 'fs';
import { getAiClient } from './aiClient.js';
import { extractJson } from './aiJson.js';
import { classifyByContainment, buildCompositionTree, parentByName, CONTAIN_RATIO } from './taxonomy.js';
import { downscaleForVision } from './imageResize.js';

const EXTRACTION_PROMPT = `You are a design system extraction engine. Analyze this UI screenshot and extract design tokens and UI inventory with high precision.

Return ONLY a valid JSON object with no markdown, no explanation, no preamble.

Structure:
{
  "summary": {
    "source_description": "1-sentence description of this UI",
    "app_type": "e.g. SaaS dashboard, e-commerce, marketing site",
    "color_mode": "light or dark",
    "design_style": "e.g. minimal, material, glassmorphism"
  },
  "tokens": {
    "colors": [{ "hex": "#hex", "role": "semantic role e.g. foreground-primary", "confidence": "high|medium|low" }],
    "typography": [{ "size": "px value", "weight": "number", "role": "semantic role e.g. heading-xl", "sample": "visible text sample", "confidence": "high|medium|low" }],
    "spacing": [{ "value": "px value", "usage": "where used e.g. card padding", "confidence": "high|medium|low" }],
    "border_radius": [{ "value": "px or % value", "usage": "where used", "confidence": "high|medium|low" }],
    "shadows": [{ "description": "semantic name e.g. card-shadow", "css": "box-shadow CSS value", "confidence": "high|medium|low" }]
  },
  "atoms": [{ "name": "component name", "variants": ["variant names"], "confidence": "high|medium|low", "notes": "", "bbox": { "x": 0.0, "y": 0.0, "w": 0.0, "h": 0.0 } }],
  "molecules": [{ "name": "component name", "confidence": "high|medium|low", "notes": "", "bbox": { "x": 0.0, "y": 0.0, "w": 0.0, "h": 0.0 } }],
  "organisms": [{ "name": "component name", "confidence": "high|medium|low", "notes": "", "bbox": { "x": 0.0, "y": 0.0, "w": 0.0, "h": 0.0 } }],
  "templates": [{ "name": "template name", "confidence": "high|medium|low", "bbox": { "x": 0.0, "y": 0.0, "w": 0.0, "h": 0.0 } }],
  "warnings": ["any caveats about low-confidence extractions or things that cannot be inferred from a static image"]
}

Classify every UI element into exactly ONE of four atomic-design levels:
- "atoms": smallest indivisible UI elements — button, input field, label, icon, badge/chip, avatar, status dot, single checkbox/radio/toggle. If it can't be split into smaller meaningful UI parts, it's an atom.
- "molecules": a small group of atoms acting as ONE simple unit — search field (input + icon), dropdown/select (field + menu), one form field (label + input + hint), a list item (icon + text + value), a metric/stat pair (label + number), breadcrumb, pagination.
- "organisms": a larger self-contained section built from molecules and atoms — a card (KPI/stat card), a chart (bar/line/donut incl. its legend and axes), a data table, a full form, a navigation bar, a header/topbar, a sidebar navigation, a footer, a hero. If it's a distinct block you could lift out and reuse as a whole section, it's an organism.
- "templates": the overall screen layout — how organisms are arranged into a full screen (e.g. sidebar + topbar + content grid). Emit AT MOST ONE template for the whole screen.
CRITICAL: a card, a chart and a table are ORGANISMS, not molecules. A button and a bare input are ATOMS. The whole screen is the single TEMPLATE — never fold the individual sections into it, and never mark an individual section as a template.

Rules:
- Only include items you can actually observe in the screenshot
- For colors: extract all distinct hex values visible — backgrounds, text, borders, accents, status colors
- For spacing: estimate values snapped to 4px grid (4, 8, 12, 16, 20, 24, 32, 40, 48, 64px)
- For typography: estimate sizes based on visual proportion (body ≈ 14px, headings scale from there)
- Mark anything estimated (not directly readable) as confidence: "medium" or "low"
- Motion tokens cannot be extracted from static screenshots — omit them entirely
- Be generous: extract everything visible, even partial elements
- For every atom/molecule/organism add "bbox": a TIGHT bounding box around that element AS IT APPEARS in the screenshot, as fractions of image size: x,y = top-left corner (0..1), w,h = width,height (0..1). If unsure, give your best estimate.
- For the "templates" entry, the bbox is the ENTIRE screen: { "x": 0, "y": 0, "w": 1, "h": 1 }.`;

// Gemini nimmt die Prompt-Formulierung "px value" wörtlich und liefert "64px"
// statt 64 (Claude gab nackte Zahlen) — die UI hängt selbst px an → "64pxpx"
// und kaputte fontSize-Styles (Live-Fund 15.07.). Einheiten hier abstreifen,
// damit die Shape modellunabhängig stabil bleibt.
const pxNum = (v) => {
  if (typeof v === 'number') return v;
  const n = parseFloat(String(v));
  return Number.isFinite(n) ? n : v;
};

function normalizeTokenUnits(tokens) {
  if (!tokens) return tokens;
  for (const t of tokens.typography ?? []) t.size = pxNum(t.size);
  for (const s of tokens.spacing ?? []) s.value = pxNum(s.value);
  for (const r of tokens.border_radius ?? []) {
    if (/^\d+(\.\d+)?px$/.test(String(r.value ?? ''))) r.value = parseFloat(r.value);
  }
  return tokens;
}

const bboxArea = (b) => (b && typeof b.w === 'number' && typeof b.h === 'number' ? b.w * b.h : 0);

function bboxOverlapArea(a, b) {
  if (!a || !b) return 0;
  const x1 = Math.max(a.x, b.x);
  const y1 = Math.max(a.y, b.y);
  const x2 = Math.min(a.x + a.w, b.x + b.w);
  const y2 = Math.min(a.y + a.h, b.y + b.h);
  const w = Math.max(0, x2 - x1);
  const h = Math.max(0, y2 - y1);
  return w * h;
}

// Enthaltungs-Guard (Ansatz B, docs/superpowers/specs/2026-07-18-atomic-design-taxonomy-design.md):
// Bild-Pfad v1 — bbox-basierte areaOf/contains, danach zurück in die 4 Buckets.
// „A enthält B": B liegt zu >= CONTAIN_RATIO seiner Fläche in A UND A ist flächengrößer.
export function applyContainmentGuard(atoms, molecules, organisms, templates) {
  const asRefItems = (items, kind) => (items ?? []).map((item) => ({ name: item.name, kind, ref: item }));
  const flat = [
    ...asRefItems(atoms, 'atom'),
    ...asRefItems(molecules, 'molecule'),
    ...asRefItems(organisms, 'organism'),
    ...asRefItems(templates, 'template'),
  ];

  const areaOf = (ref) => bboxArea(ref?.bbox);
  const contains = (a, b) => {
    const areaA = bboxArea(a?.bbox);
    const areaB = bboxArea(b?.bbox);
    if (areaB === 0 || areaA <= areaB) return false;
    return bboxOverlapArea(a?.bbox, b?.bbox) / areaB >= CONTAIN_RATIO;
  };

  const classified = classifyByContainment(flat, { areaOf, contains });

  const buckets = { atom: [], molecule: [], organism: [], template: [] };
  for (const entry of classified) {
    const kind = buckets[entry.kind] ? entry.kind : 'organism'; // Fallback nach PINNED CONTRACT #5
    buckets[kind].push(entry.ref);
  }
  const composition = buildCompositionTree(classified, { areaOf, contains });
  return {
    atoms: buckets.atom,
    molecules: buckets.molecule,
    organisms: buckets.organism,
    templates: buckets.template,
    composition,
  };
}

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

// Die KI listet identische Bausteine mehrfach (Live-Fund 15.07.: dreimal
// "button" für Chips + Send-Button) — gleichnamige Einträge verschmelzen,
// Varianten vereinigen. Der erste Treffer behält notes/confidence; die bbox
// gewinnt der größte Treffer.
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
    // Größte bbox gewinnt: der erste Treffer war oft ein Mini-Exemplar,
    // dessen Crop downstream zu klein zum Interpretieren ist (Diagnose 16.07.).
    if (bboxArea(item.bbox) > bboxArea(prev.bbox)) prev.bbox = item.bbox;
  }
  return [...byName.values()];
}

const defaultSleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Backoff-Schedule zwischen Retry-Versuchen (Index = Versuchsnummer, 0-basiert).
// z.B. 400ms nach Versuch 1, 800ms nach Versuch 2, ...
const backoffMs = (attempt) => 400 * Math.pow(2, attempt);

// Wirft die bestehenden ehrlichen deutschen Fehlermeldungen — unverändert
// gegenüber dem Vor-Retry-Verhalten. Wird pro Versuch aufgerufen; nur ein
// Parse-/Extraktionsfehler landet hier, Provider-Fehler (z.B. isDailyQuota)
// werfen bereits beim `c.messages.create`-Call selbst und laufen NIE hier durch.
function parseResponseOrThrow(response) {
  const text = response.content.map(b => b.text || '').join('');
  try {
    return extractJson(text);
  } catch (e) {
    // Volltext-Diagnose in die Server-Logs — ohne sie ist die Ursache nicht auffindbar.
    console.error(`[scan] KI-Antwort unparsebar (stop_reason=${response.stop_reason}, model=${response.model}, ${text.length} Zeichen). Ende der Antwort: …${text.slice(-300)}`);
    if (response.stop_reason === 'max_tokens') {
      throw new Error('Die KI-Antwort wurde am Token-Limit abgeschnitten — bitte erneut versuchen, ggf. mit einem kleineren Bildausschnitt.');
    }
    throw new Error(`Die KI-Antwort war kein gültiges JSON. Anfang der Antwort: ${text.slice(0, 300)}`);
  }
}

export async function analyzeScreenshot(imagePath, mimeType, extractTargets, { client, maxRetries = 3, sleep, maxEdge = 1500 } = {}) {
  const c = client ?? getAiClient();
  const doSleep = sleep ?? defaultSleep;
  const imageData = fs.readFileSync(imagePath);
  // Nur in-memory verkleinern — die Datei auf Platte bleibt unangetastet,
  // scan.js braucht die Originalmaße separat für die Komposition (Befund 2,
  // docs/2026-07-20-breiten-test-eingabetypen-ergebnis.md).
  const { buffer: visionBuffer, mime: visionMime } = await downscaleForVision(imageData, mimeType, { maxEdge });
  const base64 = visionBuffer.toString('base64');

  const targetSummary = Object.entries(extractTargets)
    .filter(([, items]) => items.length > 0)
    .map(([group, items]) => `${group}: ${items.join(', ')}`)
    .join(' | ');

  const prompt = `${EXTRACTION_PROMPT}

The user wants to extract specifically: ${targetSummary || 'all visible design tokens and UI elements'}`;

  const t0 = Date.now();

  // Bild-Scan ist nicht-deterministisch — ~50% JSON-Parse-Fehler bei komplexen
  // Dashboards, ein Retry hilft meist (Befund 3, docs/2026-07-20-…). Nur
  // Parse-/Extraktionsfehler werden retried; wirft `c.messages.create` selbst
  // (Provider-/Netz-/Quota-Fehler, insb. isDailyQuota), reicht das sofort
  // ungefangen nach oben durch — kein Retry, kein Wegschlucken.
  let response;
  let parsed;
  let lastErr;
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    response = await c.messages.create({
      model: 'claude-sonnet-5',
      max_tokens: 16384,
      messages: [{
        role: 'user',
        content: [
          {
            type: 'image',
            source: { type: 'base64', media_type: visionMime, data: base64 }
          },
          { type: 'text', text: prompt }
        ]
      }]
    });

    try {
      parsed = parseResponseOrThrow(response);
      lastErr = null;
      break;
    } catch (e) {
      lastErr = e;
      if (attempt < maxRetries - 1) {
        await doSleep(backoffMs(attempt));
      }
    }
  }
  if (lastErr) throw lastErr;

  const elapsed = Date.now() - t0;

  const merged = {
    atoms: mergeByName(parsed.atoms),
    molecules: mergeByName(parsed.molecules),
    organisms: mergeByName(parsed.organisms),
    templates: mergeByName(parsed.templates),
  };
  const guarded = applyContainmentGuard(merged.atoms, merged.molecules, merged.organisms, merged.templates);
  derivePartOf(guarded);

  return {
    ...parsed,
    tokens: normalizeTokenUnits(parsed.tokens),
    ...guarded,
    meta: { model: response.model ?? 'claude-sonnet-5', elapsed_ms: elapsed },
  };
}
