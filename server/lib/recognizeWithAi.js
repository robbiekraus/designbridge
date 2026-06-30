import Anthropic from '@anthropic-ai/sdk';

const MODEL = 'claude-sonnet-4-5';
const MAX_HTML = 20000;

export function trimHtml(html) {
  let out = (html || '')
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<svg[\s\S]*?<\/svg>/gi, '')
    .replace(/<!--[\s\S]*?-->/g, '');
  const truncated = out.length > MAX_HTML;
  if (truncated) out = out.slice(0, MAX_HTML);
  return { html: out, truncated };
}

function buildPrompt(html, css, ruleList) {
  return `You are a UI component recognition engine. You are given the HTML and CSS of a web page plus a draft list of components found by deterministic rules. Confirm correct entries, fix wrong ones, and add ones the rules missed.

Return ONLY valid JSON, no markdown, no preamble, in this shape:
{
  "atomics":    [{ "name": "...", "variants": ["..."], "confidence": "high|med|low", "source": "rules+ai|ai", "notes": "" }],
  "components": [{ "name": "...", "confidence": "high|med|low", "source": "rules+ai|ai", "notes": "" }],
  "patterns":   [{ "name": "...", "confidence": "high|med|low", "source": "rules+ai|ai", "notes": "" }],
  "warnings":   ["..."]
}

Rules:
- Use source "rules+ai" when an entry confirms or corrects one from the draft list; use "ai" for entries you add.
- When you correct a draft entry, describe the change in notes, e.g. "Input → Suche".
- Only report what the HTML actually supports. Be conservative.

DRAFT LIST (from rules):
${JSON.stringify(ruleList)}

CSS:
${css || ''}

HTML:
${html}`;
}

export async function recognizeWithAi(html, css, ruleList, { client } = {}) {
  const c = client ?? new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const { html: trimmed, truncated } = trimHtml(html);
  const response = await c.messages.create({
    model: MODEL,
    max_tokens: 4096,
    messages: [{ role: 'user', content: [{ type: 'text', text: buildPrompt(trimmed, css, ruleList) }] }],
  });
  const text = response.content.map((b) => b.text || '').join('');
  const clean = text.replace(/```json\n?|```\n?/g, '').trim();
  let parsed;
  try {
    parsed = JSON.parse(clean);
  } catch {
    throw new Error(`Claude returned invalid JSON. Raw: ${text.slice(0, 300)}`);
  }
  const warnings = Array.isArray(parsed.warnings) ? parsed.warnings : [];
  if (truncated) warnings.push('HTML war groß und wurde für die KI-Analyse gekürzt.');
  return {
    atomics: parsed.atomics ?? [],
    components: parsed.components ?? [],
    patterns: parsed.patterns ?? [],
    warnings,
  };
}
