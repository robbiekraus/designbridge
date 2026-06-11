const CONFIDENCE_RANK = { high: 3, med: 2, medium: 2, low: 1 };

function worstConfidence(items) {
  const ranked = items
    .map(i => i?.confidence)
    .filter(Boolean)
    .map(c => CONFIDENCE_RANK[c] ?? null)
    .filter(v => v !== null);
  if (ranked.length === 0) return null;
  const min = Math.min(...ranked);
  return min === 3 ? 'high' : min === 2 ? 'med' : 'low';
}

function categoryRow(key, label, items) {
  const arr = Array.isArray(items) ? items : [];
  return { key, label, count: arr.length, confidence: arr.length ? worstConfidence(arr) : null };
}

export function adaptImageScanResponse(raw) {
  const tokens = raw?.tokens ?? {};
  const atomics = raw?.atomics ?? [];
  const components = raw?.components ?? [];
  const patterns = raw?.patterns ?? [];
  const inventoryItems = [...atomics, ...components, ...patterns];

  return {
    source: 'image',
    mocked: false,
    categories: [
      categoryRow('colors', 'Colors', tokens.colors),
      categoryRow('typography', 'Typography', tokens.typography),
      categoryRow('spacing', 'Spacing', tokens.spacing),
      categoryRow('radius', 'Border radius', tokens.border_radius),
      categoryRow('shadows', 'Shadows', tokens.shadows),
      {
        key: 'inventory',
        label: 'UI inventory',
        count: inventoryItems.length,
        confidence: worstConfidence(inventoryItems),
        extra: {
          atomics: atomics.length,
          components: components.length,
          patterns: patterns.length,
        },
      },
    ],
    raw,
  };
}
