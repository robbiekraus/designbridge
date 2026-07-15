import fs from 'fs';
import { getAiClient } from './aiClient.js';

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
  "atomics": [{ "name": "component name", "variants": ["variant names"], "confidence": "high|medium|low", "notes": "", "bbox": { "x": 0.0, "y": 0.0, "w": 0.0, "h": 0.0 } }],
  "components": [{ "name": "component name", "confidence": "high|medium|low", "notes": "", "bbox": { "x": 0.0, "y": 0.0, "w": 0.0, "h": 0.0 } }],
  "patterns": [{ "name": "pattern name", "confidence": "high|medium|low", "bbox": { "x": 0.0, "y": 0.0, "w": 0.0, "h": 0.0 } }],
  "warnings": ["any caveats about low-confidence extractions or things that cannot be inferred from a static image"]
}

Rules:
- Only include items you can actually observe in the screenshot
- For colors: extract all distinct hex values visible — backgrounds, text, borders, accents, status colors
- For spacing: estimate values snapped to 4px grid (4, 8, 12, 16, 20, 24, 32, 40, 48, 64px)
- For typography: estimate sizes based on visual proportion (body ≈ 14px, headings scale from there)
- Mark anything estimated (not directly readable) as confidence: "medium" or "low"
- Motion tokens cannot be extracted from static screenshots — omit them entirely
- Be generous: extract everything visible, even partial elements
- For every atomic/component/pattern add "bbox": a TIGHT bounding box around that element AS IT APPEARS in the screenshot, as fractions of image size: x,y = top-left corner (0..1), w,h = width,height (0..1). If unsure, give your best estimate.`;

export async function analyzeScreenshot(imagePath, mimeType, extractTargets, { client } = {}) {
  const c = client ?? getAiClient();
  const imageData = fs.readFileSync(imagePath);
  const base64 = imageData.toString('base64');

  const targetSummary = Object.entries(extractTargets)
    .filter(([, items]) => items.length > 0)
    .map(([group, items]) => `${group}: ${items.join(', ')}`)
    .join(' | ');

  const prompt = `${EXTRACTION_PROMPT}

The user wants to extract specifically: ${targetSummary || 'all visible design tokens and UI elements'}`;

  const t0 = Date.now();

  const response = await c.messages.create({
    model: 'claude-sonnet-4-5',
    max_tokens: 4096,
    messages: [{
      role: 'user',
      content: [
        {
          type: 'image',
          source: { type: 'base64', media_type: mimeType, data: base64 }
        },
        { type: 'text', text: prompt }
      ]
    }]
  });

  const elapsed = Date.now() - t0;
  const text = response.content.map(b => b.text || '').join('');
  const clean = text.replace(/```json\n?|```\n?/g, '').trim();

  let parsed;
  try {
    parsed = JSON.parse(clean);
  } catch (e) {
    throw new Error(`Claude returned invalid JSON. Raw response: ${text.slice(0, 300)}`);
  }

  return { ...parsed, meta: { model: response.model ?? 'claude-sonnet-4-5', elapsed_ms: elapsed } };
}
