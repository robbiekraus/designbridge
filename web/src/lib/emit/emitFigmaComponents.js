// Kanonisches Inventar + Tokens → components[] des Figma-Payloads v2.
// Template-Wissen bleibt in den Templates (planFor); hier nur Orchestrierung.
import { matchTemplate } from '../components/templates/registry.js';
import { normalizeTokens } from './normalizeTokens.js';
import { pickTokenRefs } from './pickTokenRefs.js';

const KINDS = [
  ['atomics', 'atomic'],
  ['components', 'component'],
  ['patterns', 'pattern'],
];

export function emitFigmaComponents(result) {
  const raw = result?.raw;
  if (!raw) return [];
  const refs = pickTokenRefs(normalizeTokens(raw.tokens));
  const out = [];
  for (const [rawKey, kind] of KINDS) {
    const items = Array.isArray(raw[rawKey]) ? raw[rawKey] : [];
    for (const item of items) {
      const tpl = matchTemplate(item.name);
      const meta = {
        name: item.name,
        kind,
        confidence: item.confidence ?? null,
        source: item.source ?? null,
        notes: item.notes ?? null,
      };
      if (tpl?.planFor) {
        out.push({
          ...meta,
          placeholder: false,
          variants: tpl.variants.map((v) => ({ name: v, plan: tpl.planFor(v, refs) })),
        });
      } else {
        const names = Array.isArray(item.variants) && item.variants.length ? item.variants : ['default'];
        out.push({
          ...meta,
          placeholder: true,
          variants: names.map((v) => ({ name: String(v), plan: null })),
        });
      }
    }
  }
  return out;
}
