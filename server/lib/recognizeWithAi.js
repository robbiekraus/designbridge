import { getAiClient } from './aiClient.js';
import { extractJson } from './aiJson.js';

const MODEL = 'claude-sonnet-4-5';
const MAX_HTML = 20000;
const MAX_CSS = 20000;
const MAX_RULES = 8000;

export function trimHtml(html) {
  let out = (html || '')
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<svg[\s\S]*?<\/svg>/gi, '')
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<(?:script|style|svg)\b[^>]*>/gi, '');
  const truncated = out.length > MAX_HTML;
  if (truncated) out = out.slice(0, MAX_HTML);
  return { html: out, truncated };
}

function trimRuleList(ruleList, maxChars) {
  const full = JSON.stringify(ruleList ?? {});
  if (full.length <= maxChars) return { json: full, trimmed: false };
  const out = {
    atomics: [...(ruleList.atomics ?? [])],
    components: [...(ruleList.components ?? [])],
    patterns: [...(ruleList.patterns ?? [])],
  };
  // drop entries from the back of each list until it fits (or nothing left to drop)
  for (const key of ['patterns', 'components', 'atomics']) {
    while (out[key].length && JSON.stringify(out).length > maxChars) {
      out[key].pop();
    }
  }
  return { json: JSON.stringify(out), trimmed: true };
}

function buildPrompt(html, css, rulesJson) {
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
${rulesJson}

CSS:
${css || ''}

HTML:
${html}`;
}

export async function recognizeWithAi(html, css, ruleList, { client } = {}) {
  const c = client ?? getAiClient();
  const { html: trimmed, truncated } = trimHtml(html);
  const cssTruncated = (css || '').length > MAX_CSS;
  const safeCss = (css || '').slice(0, MAX_CSS);
  const { json: safeRules, trimmed: rulesTrimmed } = trimRuleList(ruleList, MAX_RULES);
  const response = await c.messages.create({
    model: MODEL,
    max_tokens: 16384,
    messages: [{ role: 'user', content: [{ type: 'text', text: buildPrompt(trimmed, safeCss, safeRules) }] }],
  });
  const text = response.content.map((b) => b.text || '').join('');
  let parsed;
  try {
    parsed = extractJson(text);
  } catch {
    if (response.stop_reason === 'max_tokens') {
      throw new Error('Die KI-Antwort wurde am Token-Limit abgeschnitten — bitte erneut versuchen.');
    }
    throw new Error(`Die KI-Antwort war kein gültiges JSON. Anfang der Antwort: ${text.slice(0, 300)}`);
  }
  const warnings = Array.isArray(parsed.warnings) ? parsed.warnings : [];
  if (truncated) warnings.push('HTML war groß und wurde für die KI-Analyse gekürzt.');
  if (cssTruncated) warnings.push('CSS war groß und wurde für die KI-Analyse gekürzt.');
  if (rulesTrimmed) warnings.push('Die Regel-Liste war groß und wurde für die KI-Analyse gekürzt.');
  return {
    atomics: parsed.atomics ?? [],
    components: parsed.components ?? [],
    patterns: parsed.patterns ?? [],
    warnings,
  };
}
