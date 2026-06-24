import { slugify } from './slugify.js';

function withUnit(value) {
  const s = String(value ?? '').trim();
  if (s === '') return s;
  if (/[a-z%]$/i.test(s)) return s;
  if (/^-?\d*\.?\d+$/.test(s)) return `${s}px`;
  return s;
}

function assignNames(entries, prefix, labelOf) {
  const seen = new Map();
  return entries.map((entry, i) => {
    let base = slugify(labelOf(entry));
    if (!base) base = `${prefix}-${i + 1}`;
    const used = seen.get(base) ?? 0;
    seen.set(base, used + 1);
    return used === 0 ? base : `${base}-${used + 1}`;
  });
}

export function normalizeTokens(rawTokens) {
  const t = rawTokens ?? {};
  const tokens = [];

  const push = (entries, group, prefix, labelOf, valueOf) => {
    const arr = Array.isArray(entries) ? entries : [];
    const names = assignNames(arr, prefix, labelOf);
    arr.forEach((entry, i) => {
      tokens.push({
        group,
        name: names[i],
        value: valueOf(entry),
        confidence: entry.confidence ?? null,
        source: entry,
      });
    });
  };

  push(t.colors, 'color', 'color', c => c.role, c => c.hex);
  push(t.typography, 'font', 'font', x => x.role,
    x => ({ fontSize: withUnit(x.size), fontWeight: String(x.weight) }));
  push(t.spacing, 'spacing', 'spacing', x => x.usage, x => withUnit(x.value));
  push(t.border_radius, 'radius', 'radius', x => x.usage, x => withUnit(x.value));
  push(t.shadows, 'shadow', 'shadow', x => x.description, x => x.css);

  return tokens;
}
