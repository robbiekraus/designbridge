// EIN Claude-Vision-Call pro Import: Original-Bild + Liste der Bausteine ohne
// Template → je Baustein eine möglichst originalgetreue shadcn/Tailwind-
// Umsetzung { html, jsx }. Injizierbarer Client wie recognizeWithAi.js.
import fs from 'fs';
import { getAiClient } from './aiClient.js';
import { extractJson } from './aiJson.js';

const MODEL = 'claude-sonnet-4-5';

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
    .replace(/\s(?:href|src|action|formaction|xlink:href)\s*=\s*javascript:[^\s>]*/gi, '');
}

function buildPrompt(segments, hasFullImageFallback, hasStructure, hasCode) {
  const labels = segments.map((s) => s.label);
  return `You are a UI reconstruction engine. Below you receive one cropped image OR the source HTML+CSS OR the component SOURCE CODE per component (in order), each preceded by its name. ${hasFullImageFallback ? 'For any component WITHOUT its own crop, use the full screenshot provided first.' : ''}

For EACH component, reconstruct it as faithfully as possible to how it appears in ITS image.

Return ONLY valid JSON, no markdown, no preamble, in this shape:
{
  "interpretations": [
    { "name": "<exact component name>", "html": "<self-contained HTML styled with INLINE style attributes and real CSS values>", "jsx": "<the same component as a React function component in shadcn/Tailwind style, exported with a PascalCase name>" }
  ]
}

Rules:
- The "html" field MUST style every element with inline style="..." attributes using concrete CSS values only — hex colors (e.g. style="background:#4263EB;color:#ffffff"), px padding/gap/border-radius, px font-size, font-weight, and flex layout (display:flex;flex-direction;align-items;justify-content). Do NOT use CSS class names or Tailwind utilities in "html": there is no stylesheet, so only inline styles render. (The separate "jsx" field DOES use shadcn/Tailwind — keep that.)
- Stay as close to the original as possible: copy the visible colors, spacing, radii, typography and REAL text content.
- Reproduce ALL text and NUMBERS visible in the crop verbatim — headings, labels, values, percentages, currency, units, dates. Do not invent placeholders and do not omit numbers.
- html must be fully self-contained: inline styles only, no <script>, no event handlers, no external images or fonts. Inline SVG is allowed (e.g. for charts).
- Give charts and their containers explicit px sizes so bars/lines/segments have real dimensions (e.g. a bar container style="display:flex;align-items:flex-end;height:96px;gap:8px" with each bar carrying its own px height like style="height:64px;background:#4263EB").
- For charts, reconstruct a recognizable static SVG (bars/line/donut) AND include the data details visible in the crop: axis tick labels, value/data labels on points or segments, the legend, and any center or total value. Not a live chart library, but not a bare shape either.
- Draw donut/ring/pie segments as real SVG arc paths (<path d="M… A…" fill="none" stroke="…" stroke-width="…">), one path per segment — NEVER with stroke-dasharray/stroke-dashoffset tricks on a circle: design-tool SVG import renders dasharray as a repeating dash pattern and the ring looks striped.
- Preserve state that is visible: highlighted / selected / active / hovered items, badges, status colors and dots, and any tooltip or callout shown in the crop (render it as a small static element). Draw tooltip/callout pointer tails as a small inline SVG triangle (<svg><polygon .../></svg>) — NEVER with CSS border tricks or transform:rotate, those do not survive the design-tool export.${hasStructure ? '\n- For components given as SOURCE HTML + CSS: translate the REAL markup into inline-styled html (and shadcn/Tailwind jsx) — keep the exact text content, structure, states and visual properties (colors, spacing, radii) expressed by the source CSS. Do not invent content that is not in the source.' : ''}${hasCode ? '\n- For components given as SOURCE CODE (React/shadcn/Tailwind): read the real component source and render a faithful DEFAULT state — preserve the real class names, cva variants, structure and any literal text; express the resulting look as inline-styled html (and keep the original shadcn/Tailwind flavour in jsx). Do not invent content the source does not imply.' : ''}
- Keep each html snippet compact (one component).
- Produce one entry per component, using its EXACT name.

COMPONENTS (in order): ${JSON.stringify(labels)}`;
}

export async function interpretComponents(imagePath, mimetype, segments, { client } = {}) {
  const c = client ?? getAiClient();
  const withVisual = segments.filter((s) => s.visual && s.visual.base64);
  const withStructure = segments.filter((s) => s.structure && s.structure.html);
  const withCode = segments.filter((s) => s.structure && s.structure.code);
  const bare = segments.filter(
    (s) => !(s.visual && s.visual.base64) && !(s.structure && s.structure.html) && !(s.structure && s.structure.code)
  );
  const hasFullImageFallback = bare.length > 0 && !!imagePath;

  const content = [];
  if (hasFullImageFallback) {
    const base64 = fs.readFileSync(imagePath).toString('base64');
    content.push({ type: 'text', text: 'FULL SCREENSHOT (fallback for components without their own crop):' });
    content.push({ type: 'image', source: { type: 'base64', media_type: mimetype, data: base64 } });
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
  content.push({ type: 'text', text: buildPrompt(segments, hasFullImageFallback, withStructure.length > 0, withCode.length > 0) });

  const response = await c.messages.create({
    model: MODEL,
    max_tokens: 16384,
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
    interpretations.push({ name: s.label, html, jsx: typeof it.jsx === 'string' && it.jsx.trim() ? it.jsx : '' });
  }
  return { interpretations, failed };
}
