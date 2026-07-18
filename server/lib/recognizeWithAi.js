import { getAiClient } from './aiClient.js';
import { extractJson } from './aiJson.js';

const MODEL = 'claude-sonnet-5';
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
    atoms: [...(ruleList.atoms ?? [])],
    molecules: [...(ruleList.molecules ?? [])],
    organisms: [...(ruleList.organisms ?? [])],
    templates: [...(ruleList.templates ?? [])],
  };
  // drop entries from the back of each list until it fits (or nothing left to drop)
  for (const key of ['templates', 'organisms', 'molecules', 'atoms']) {
    while (out[key].length && JSON.stringify(out).length > maxChars) {
      out[key].pop();
    }
  }
  return { json: JSON.stringify(out), trimmed: true };
}

const CLASSIFICATION_DEFINITIONS = `Classify every UI element into exactly ONE of four atomic-design levels:
- "atoms": smallest indivisible UI elements — button, input field, label, icon, badge/chip, avatar, status dot, single checkbox/radio/toggle. If it can't be split into smaller meaningful UI parts, it's an atom.
- "molecules": a small group of atoms acting as ONE simple unit — search field (input + icon), dropdown/select (field + menu), one form field (label + input + hint), a list item (icon + text + value), a metric/stat pair (label + number), breadcrumb, pagination.
- "organisms": a larger self-contained section built from molecules and atoms — a card (KPI/stat card), a chart (bar/line/donut incl. its legend and axes), a data table, a full form, a navigation bar, a header/topbar, a sidebar navigation, a footer, a hero. If it's a distinct block you could lift out and reuse as a whole section, it's an organism.
- "templates": the overall screen layout — how organisms are arranged into a full screen (e.g. sidebar + topbar + content grid). Emit AT MOST ONE template for the whole screen.
CRITICAL: a card, a chart and a table are ORGANISMS, not molecules. A button and a bare input are ATOMS. The whole screen is the single TEMPLATE — never fold the individual sections into it, and never mark an individual section as a template.`;

function buildPrompt(html, css, rulesJson) {
  return `You are a UI component recognition engine. You are given the HTML and CSS of a web page plus a draft list of components found by deterministic rules. Confirm correct entries, fix wrong ones, and add ones the rules missed.

Return ONLY valid JSON, no markdown, no preamble, in this shape:
{
  "atoms":      [{ "name": "...", "variants": ["..."], "confidence": "high|med|low", "source": "rules+ai|ai", "notes": "" }],
  "molecules":  [{ "name": "...", "confidence": "high|med|low", "source": "rules+ai|ai", "notes": "" }],
  "organisms":  [{ "name": "...", "confidence": "high|med|low", "source": "rules+ai|ai", "notes": "" }],
  "templates":  [{ "name": "...", "confidence": "high|med|low", "source": "rules+ai|ai", "notes": "" }],
  "warnings":   ["..."]
}

${CLASSIFICATION_DEFINITIONS}

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
    atoms: parsed.atoms ?? [],
    molecules: parsed.molecules ?? [],
    organisms: parsed.organisms ?? [],
    templates: parsed.templates ?? [],
    warnings,
  };
}
