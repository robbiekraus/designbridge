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
