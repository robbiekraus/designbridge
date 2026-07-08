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
    .replace(/\son\w+\s*=\s*[^\s>]+/gi, '')
    // Gefährliche Elemente ganz entfernen (Defense-in-Depth zum iframe-Sandbox)
    .replace(/<\/?(?:iframe|object|embed|base)\b[^>]*>/gi, '')
    .replace(/<meta\b[^>]*http-equiv[^>]*>/gi, '')
    // javascript:-URIs in navigierbaren Attributen entfernen
    .replace(/\s(?:href|src|action|formaction|xlink:href)\s*=\s*"\s*javascript:[^"]*"/gi, '')
    .replace(/\s(?:href|src|action|formaction|xlink:href)\s*=\s*'\s*javascript:[^']*'/gi, '')
    .replace(/\s(?:href|src|action|formaction|xlink:href)\s*=\s*javascript:[^\s>]*/gi, '');
}

function buildPrompt(segments, hasFullImageFallback) {
  const labels = segments.map((s) => s.label);
  return `You are a UI reconstruction engine. Below you receive one cropped image PER component (in order), each preceded by its name. ${hasFullImageFallback ? 'For any component WITHOUT its own crop, use the full screenshot provided first.' : ''}

For EACH component, reconstruct it as faithfully as possible to how it appears in ITS image.

Return ONLY valid JSON, no markdown, no preamble, in this shape:
{
  "interpretations": [
    { "name": "<exact component name>", "html": "<self-contained HTML using ONLY Tailwind utility classes>", "jsx": "<the same component as a React function component in shadcn/Tailwind style, exported with a PascalCase name>" }
  ]
}

Rules:
- Stay as close to the original as possible: copy the visible colors (as Tailwind arbitrary values like bg-[#4263EB]), spacing, radii, typography and REAL text content.
- html must be fully self-contained: Tailwind classes only, no <script>, no event handlers, no external images or fonts. Inline SVG is allowed (e.g. for simple chart shapes).
- For charts, reconstruct a simplified but recognizable visual (bars/lines/donut as divs or inline SVG) — not a live chart library.
- Keep each html snippet compact (one component).
- Produce one entry per component, using its EXACT name.

COMPONENTS (in order): ${JSON.stringify(labels)}`;
}

export async function interpretComponents(imagePath, mimetype, segments, { client } = {}) {
  const c = client ?? new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const withVisual = segments.filter((s) => s.visual && s.visual.base64);
  const withoutVisual = segments.filter((s) => !(s.visual && s.visual.base64));
  const hasFullImageFallback = withoutVisual.length > 0;

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
  content.push({ type: 'text', text: buildPrompt(segments, hasFullImageFallback) });

  const response = await c.messages.create({
    model: MODEL,
    max_tokens: 16384,
    messages: [{ role: 'user', content }],
  });

  const text = response.content.map((b) => b.text || '').join('');
  const clean = text.replace(/```json\n?|```\n?/g, '').trim();
  let parsed;
  try { parsed = JSON.parse(clean); }
  catch { throw new Error(`Claude returned invalid JSON. Raw: ${text.slice(0, 300)}`); }

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
