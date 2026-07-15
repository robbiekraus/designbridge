import { getAiClient } from './aiClient.js';
import { isTailwindConfig, isUiComponent } from './repoFilePatterns.js';

const MODEL = 'claude-sonnet-4-5';
const MAX_DIGEST = 30000;

export function buildRepoDigest(files) {
  const lines = ['DATEILISTE:'];
  for (const f of files) lines.push(`- ${f.path}`);
  lines.push('');
  for (const f of files) {
    if ((isTailwindConfig(f.path) || isUiComponent(f.path)) && f.content) {
      lines.push(`=== ${f.path} ===`, f.content, '');
    }
  }
  let digest = lines.join('\n');
  const truncated = digest.length > MAX_DIGEST;
  if (truncated) digest = digest.slice(0, MAX_DIGEST);
  return { digest, truncated };
}

function buildPrompt(digest, ruleList) {
  return `You are a UI component recognition engine. You are given a digest of a code repository (file list plus the sources of the tailwind config and the components/ui files) and a draft component list found by deterministic rules. Confirm correct entries, fix wrong ones, and add ones the rules missed (e.g. variants from cva() calls).

Return ONLY valid JSON, no markdown, no preamble, in this shape:
{
  "atomics":    [{ "name": "...", "variants": ["..."], "confidence": "high|med|low", "source": "rules+ai|ai", "notes": "" }],
  "components": [{ "name": "...", "confidence": "high|med|low", "source": "rules+ai|ai", "notes": "" }],
  "patterns":   [{ "name": "...", "confidence": "high|med|low", "source": "rules+ai|ai", "notes": "" }],
  "warnings":   ["..."]
}

Rules:
- Use source "rules+ai" when an entry confirms or corrects one from the draft list; use "ai" for entries you add.
- When you correct a draft entry, describe the change in notes, e.g. "Header → Navbar".
- Only report what the repository actually supports. Be conservative.

DRAFT LIST (from rules):
${JSON.stringify(ruleList)}

REPOSITORY DIGEST:
${digest}`;
}

export async function deepenRepoWithAi(files, ruleList, { client } = {}) {
  const c = client ?? getAiClient();
  const { digest, truncated } = buildRepoDigest(files);
  const response = await c.messages.create({
    model: MODEL,
    max_tokens: 4096,
    messages: [{ role: 'user', content: [{ type: 'text', text: buildPrompt(digest, ruleList) }] }],
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
  if (truncated) warnings.push('Repo-Digest war groß und wurde für die KI-Analyse gekürzt.');
  return {
    atomics: parsed.atomics ?? [],
    components: parsed.components ?? [],
    patterns: parsed.patterns ?? [],
    warnings,
  };
}
