// KI-Interpretation pro Import in Chunks à max 4 Bausteinen (sequenziell):
// je Baustein eine möglichst originalgetreue Umsetzung { html, model }.
// Das Vollbild (Fallback für Segmente ohne eigenen Crop)
// wird einmal von Platte gelesen und nur an Chunks gesendet, die es brauchen.
// Injizierbarer Client wie recognizeWithAi.js.
import fs from 'fs';
import { getAiClient } from './aiClient.js';
import { extractJson } from './aiJson.js';
import { SHADCN_VOCABULARY, catalogPromptBlock } from './catalog/shadcnVocabulary.js';

const MODEL = 'claude-sonnet-5';

// Neutraler grauer Platzhalter statt externer Bilder: das Modell liefert trotz
// Prompt-Verbot gelegentlich Stockfoto-URLs (Unsplash, Diagnose 16.07.) — die
// laden fremde Inhalte ins iframe und gaukeln Originaltreue vor.
// WICHTIG: quote-frei (%27 statt '): der Platzhalter wird in "..."-, '...'-
// und unquoted-src-Attribute eingesetzt — ein rohes ' oder " würde das
// Attribut vorzeitig abbrechen und kaputtes HTML erzeugen (Review 16.07.).
//
// Fix C (Rob: externe Bilder wurden zu winzigen leeren grauen Kästen — "leere Pages",
// Sidebar-Logo/Avatar): der bisherige Platzhalter trug feste width=48/height=48-Attribute auf dem
// <svg>-Root und skalierte damit NICHT auf die tatsächliche CSS-Box des <img>-Elements — dazu kein
// erkennbares "das ist ein Bild"-Signal, nur eine leere Fläche. Jetzt: viewBox-basiert (kein festes
// width/height mehr auf dem Root → SVG-Spec-Default "100%/100%" füllt die Img-Box aus, gleiche
// Fläche im viewBox-Koordinatensystem 0..48) PLUS ein dezentes Bild-Icon (Sonne+Berg-Silhouette,
// klassisches "Platzhalterbild"-Glyph) in einem etwas dunkleren Grauton auf dem Hintergrund.
const IMG_PLACEHOLDER = "data:image/svg+xml;utf8,<svg xmlns=%27http://www.w3.org/2000/svg%27 viewBox=%270 0 48 48%27><rect width=%2748%27 height=%2748%27 rx=%276%27 fill=%27%23e4e4e7%27/><circle cx=%2716%27 cy=%2716%27 r=%273%27 fill=%27%23a1a1aa%27/><path d=%27M6 36L17 22L23 29L30 18L42 36Z%27 fill=%27%23a1a1aa%27/></svg>";

export function sanitizeHtml(html) {
  return String(html ?? '')
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<script\b[^>]*>/gi, '')
    .replace(/\son\w+\s*=\s*"[^"]*"/gi, '')
    .replace(/\son\w+\s*=\s*'[^']*'/gi, '')
    .replace(/\son\w+\s*=\s*[^\s>]+/gi, '')
    // Gefährliche Elemente ganz entfernen (Defense-in-Depth zum iframe-Sandbox)
    .replace(/<\/?(?:iframe|object|embed|base)\b[^>]*>/gi, '')
    .replace(/<meta\b[^>]*http-equiv[^>]*>/gi, '')
    // javascript:-URIs in navigierbaren Attributen entfernen
    .replace(/\s(?:href|src|action|formaction|xlink:href)\s*=\s*"\s*javascript:[^"]*"/gi, '')
    .replace(/\s(?:href|src|action|formaction|xlink:href)\s*=\s*'\s*javascript:[^']*'/gi, '')
    .replace(/\s(?:href|src|action|formaction|xlink:href)\s*=\s*javascript:[^\s>]*/gi, '')
    // Externe Bild-URLs durch Inline-Platzhalter ersetzen (data:-URIs bleiben unangetastet)
    .replace(/(<img\b[^>]*\ssrc\s*=\s*")(?:https?:)?\/\/[^"]*(")/gi, `$1${IMG_PLACEHOLDER}$2`)
    .replace(/(<img\b[^>]*\ssrc\s*=\s*')(?:https?:)?\/\/[^']*(')/gi, `$1${IMG_PLACEHOLDER}$2`)
    .replace(/(<img\b[^>]*\ssrc\s*=\s*)(?:https?:)?\/\/[^\s>]+/gi, `$1"${IMG_PLACEHOLDER}"`);
}

function buildPrompt(segments, hasFullImageFallback, hasStructure, hasCode, catalog = SHADCN_VOCABULARY) {
  const labels = segments.map((s) => s.label);
  // DS-Grounding (Spec 2026-07-23 §Q2/Q4): dem Modell das Katalog-Vokabular beibringen, damit es
  // erkannte Bausteine mit data-ds-component markiert. Additiv — die Inline-Stile bleiben. Nur bei
  // Sicherheit markieren (kein Zwang, Q4). Der Vokabular-Block steht VOR der COMPONENTS-Zeile, die
  // laut Test-Vertrag die LETZTE Zeile bleiben muss.
  const catalogBlock = catalogPromptBlock(catalog);
  const groundingRule = catalogBlock
    ? `\n- DESIGN-SYSTEM GROUNDING: when an element clearly IS one of the KNOWN COMPONENTS listed below, mark its OUTERMOST element with data-ds-component="<ExactName>", plus data-ds-<axis>="<value>" for any variant/size axis whose value is clearly visible (use ONLY values from the list). Keep the inline styles as usual — the marker is additive metadata. Mark ONLY when confident; if unsure, leave it as plain inline-styled html and do NOT force a component.`
    : '';
  const catalogSection = catalogBlock
    ? `\n\nKNOWN COMPONENTS (for data-ds-component grounding — exact names):\n${catalogBlock}`
    : '';
  return `You are a UI reconstruction engine. Below you receive one cropped image OR the source HTML+CSS OR the component SOURCE CODE per component (in order), each preceded by its name. ${hasFullImageFallback ? 'For any component WITHOUT its own crop, use the full screenshot provided first.' : ''}

For EACH component, reconstruct it as faithfully as possible to how it appears in ITS image.

Return ONLY valid JSON, no markdown, no preamble, in this shape:
{
  "interpretations": [
    { "name": "<exact component name>", "html": "<self-contained HTML styled with INLINE style attributes and real CSS values>" }
  ]
}

Rules:
- The "html" field MUST style every element with inline style="..." attributes using concrete CSS values only — hex colors (e.g. style="background:#4263EB;color:#ffffff"), px padding/gap/border-radius, px font-size, font-weight, and flex layout (display:flex;flex-direction;align-items;justify-content). Do NOT use CSS class names or Tailwind utilities in "html": there is no stylesheet, so only inline styles render.
- Stay as close to the original as possible: copy the visible colors, spacing, radii, typography and REAL text content.
- Reproduce ALL text and NUMBERS visible in the crop verbatim — headings, labels, values, percentages, currency, units, dates. Do not invent placeholders and do not omit numbers.
- html must be fully self-contained: inline styles only, no <script>, no event handlers, no external images or fonts. Inline SVG is allowed (e.g. for charts).
- Give charts and their containers explicit px sizes so bars/lines/segments have real dimensions (e.g. a bar container style="display:flex;align-items:flex-end;height:96px;gap:8px" with each bar carrying its own px height like style="height:64px;background:#4263EB").
- For charts, reconstruct a recognizable static SVG (bars/line/donut) AND include the data details visible in the crop: axis tick labels, value/data labels on points or segments, the legend, and any center or total value. Not a live chart library, but not a bare shape either.
- Draw donut/ring/pie segments as real SVG arc paths (<path d="M… A…" fill="none" stroke="…" stroke-width="…">), one path per segment — NEVER with stroke-dasharray/stroke-dashoffset tricks on a circle: design-tool SVG import renders dasharray as a repeating dash pattern and the ring looks striped.
- Icons (social icons, UI glyphs): draw each one as a simplified inline SVG that resembles the ACTUAL icon visible in the crop — recognizable shape or monogram (e.g. a rounded square with "in" for LinkedIn, a camera outline, a play triangle). NEVER render plain gray or placeholder boxes where the original shows an icon.
- Preserve state that is visible: highlighted / selected / active / hovered items, badges, status colors and dots, and any tooltip or callout shown in the crop (render it as a small static element). Draw tooltip/callout pointer tails as a small inline SVG triangle (<svg><polygon .../></svg>) — NEVER with CSS border tricks or transform:rotate, those do not survive the design-tool export.${hasStructure ? '\n- For components given as SOURCE HTML + CSS: translate the REAL markup into inline-styled html — keep the exact text content, structure, states and visual properties (colors, spacing, radii) expressed by the source CSS. Do not invent content that is not in the source.' : ''}${hasCode ? '\n- For components given as SOURCE CODE (React/shadcn/Tailwind): read the real component source and render a faithful DEFAULT state — preserve the real class names, cva variants, structure and any literal text; express the resulting look as inline-styled html. Do not invent content the source does not imply.' : ''}
- Keep each html snippet compact (one component).
- Produce one entry per component, using its EXACT name.${groundingRule}${catalogSection}

COMPONENTS (in order): ${JSON.stringify(labels)}`;
}

const CHUNK_SIZE = 4; // Diagnose 16.07.: 13 Bausteine in einem Call verwässern die Treue

// Bare = kein eigenes Material (kein Crop, keine Struktur, kein Code) →
// braucht das Vollbild als Fallback. EINE Definition für Orchestrator
// (Gruppierung) und interpretChunk (Content-Aufbau), sonst driften sie.
const isBare = (s) =>
  !(s.visual && s.visual.base64) && !(s.structure && s.structure.html) && !(s.structure && s.structure.code);

export async function interpretComponents(imagePath, mimetype, segments, { client, catalog = SHADCN_VOCABULARY } = {}) {
  const c = client ?? getAiClient();
  // Vollbild nur einmal von Platte lesen, auch wenn mehrere Chunks es brauchen.
  const fullImage = imagePath
    ? { base64: fs.readFileSync(imagePath).toString('base64'), media_type: mimetype }
    : null;
  // Bare-Segmente (kein Crop, keine Struktur, kein Code) ans Ende gruppieren:
  // jeder Chunk mit mindestens einem bare-Segment bekommt das komplette
  // Vollbild-Base64 eingebettet — verstreut lägen sie in fast jedem Chunk,
  // gruppiert nur in ⌈bare/CHUNK_SIZE⌉ Chunks (Bild-Tokens!). Die Reihenfolge
  // im Ergebnis ist unkritisch: die Zuordnung läuft über Namen (byName).
  const ordered = [...segments.filter((s) => !isBare(s)), ...segments.filter(isBare)];
  const chunks = [];
  for (let i = 0; i < ordered.length; i += CHUNK_SIZE) chunks.push(ordered.slice(i, i + CHUNK_SIZE));

  const interpretations = [];
  const failed = [];
  let lastError = null;
  // Sequenziell, NICHT Promise.all: Gemini-Free-Tier erlaubt nur ~10 req/min.
  for (const chunk of chunks) {
    try {
      const r = await interpretChunk(c, fullImage, chunk, catalog);
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

async function interpretChunk(c, fullImage, segments, catalog = SHADCN_VOCABULARY) {
  const withVisual = segments.filter((s) => s.visual && s.visual.base64);
  const withStructure = segments.filter((s) => s.structure && s.structure.html);
  const withCode = segments.filter((s) => s.structure && s.structure.code);
  const bare = segments.filter(isBare);
  const hasFullImageFallback = bare.length > 0 && !!fullImage;

  const content = [];
  if (hasFullImageFallback) {
    content.push({ type: 'text', text: 'FULL SCREENSHOT (fallback for components without their own crop):' });
    content.push({ type: 'image', source: { type: 'base64', media_type: fullImage.media_type, data: fullImage.base64 } });
  }
  for (const s of withVisual) {
    content.push({ type: 'text', text: `Component: ${s.label}` });
    content.push({ type: 'image', source: { type: 'base64', media_type: s.visual.media_type, data: s.visual.base64 } });
  }
  // Identische structure-Blöcke (z. B. der Vollseiten-Fallback mehrerer
  // Selector-Misses) nur EINMAL senden — sonst multipliziert sich die
  // volle Seite pro Segment in den Prompt (Token-Kosten).
  const structureGroups = new Map(); // html → { structure, labels }
  for (const s of withStructure) {
    const g = structureGroups.get(s.structure.html);
    if (g) g.labels.push(s.label);
    else structureGroups.set(s.structure.html, { structure: s.structure, labels: [s.label] });
  }
  for (const { structure, labels } of structureGroups.values()) {
    const who =
      labels.length === 1
        ? `Component: ${labels[0]}`
        : `Components (shared source, one entry EACH): ${labels.join(', ')}`;
    content.push({
      type: 'text',
      text: `${who}\nSOURCE HTML:\n${structure.html}\nRELEVANT CSS:\n${structure.css || '(none)'}`,
    });
  }
  // Code-Segmente (Repo-Import): Quellcode direkt als Textblock mitsenden.
  for (const s of withCode) {
    content.push({
      type: 'text',
      text: `Component: ${s.label}\nSOURCE CODE (${s.structure.lang}):\n${s.structure.code}`,
    });
  }
  content.push({ type: 'text', text: buildPrompt(segments, hasFullImageFallback, withStructure.length > 0, withCode.length > 0, catalog) });

  const response = await c.messages.create({
    model: MODEL,
    // 32768 statt 16384 (Live-Befund 17.07.): Interpretationen mit langen
    // SVG-Pfaden (Linien-Charts) können allein schon ein großes html liefern —
    // 16k wurde reproduzierbar am MAX_TOKENS-Limit abgeschnitten, der Parse
    // scheiterte deterministisch bei jedem Retry (~57s × 2 pro Klick). Das
    // separate "jsx"-Feld wird seit 19.07. nicht mehr angefragt (Token-
    // Sparmaßnahme, kein echter Konsument mehr), das Ceiling bleibt trotzdem —
    // es kostet nichts, nur echte Ausgabe-Tokens werden bezahlt.
    max_tokens: 32768,
    messages: [{ role: 'user', content }],
  });

  const text = response.content.map((b) => b.text || '').join('');
  let parsed;
  try { parsed = extractJson(text); }
  catch {
    if (response.stop_reason === 'max_tokens') {
      throw new Error('Die KI-Antwort wurde am Token-Limit abgeschnitten — bitte erneut versuchen.');
    }
    throw new Error(`Die KI-Antwort war kein gültiges JSON. Anfang der Antwort: ${text.slice(0, 300)}`);
  }

  const byName = new Map((parsed.interpretations ?? []).map((i) => [String(i.name ?? '').trim(), i]));
  const interpretations = [];
  const failed = [];
  for (const s of segments) {
    const it = byName.get(s.label.trim());
    const html = sanitizeHtml(it?.html);
    if (!it || !html.trim()) { failed.push(s.label); continue; }
    interpretations.push({
      name: s.label,
      html,
      model: response.model ?? null,
    });
  }
  return { interpretations, failed };
}
