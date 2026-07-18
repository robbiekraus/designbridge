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

export function adaptScanResponse(raw, source = 'image') {
  const tokens = raw?.tokens ?? {};
  const atoms = raw?.atoms ?? [];
  const molecules = raw?.molecules ?? [];
  const organisms = raw?.organisms ?? [];
  const templates = raw?.templates ?? [];
  const inventoryItems = [...atoms, ...molecules, ...organisms, ...templates];

  return {
    source,
    mocked: false,
    warnings: Array.isArray(raw?.warnings) ? raw.warnings : [],
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
          atoms: atoms.length,
          molecules: molecules.length,
          organisms: organisms.length,
          templates: templates.length,
        },
      },
    ],
    raw,
  };
}

export const adaptImageScanResponse = (raw) => adaptScanResponse(raw, 'image');
