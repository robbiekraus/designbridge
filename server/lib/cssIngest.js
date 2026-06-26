import postcss from 'postcss';

const VAR_RULES = [
  { cat: 'colors', re: /^--(?:color|colour|c|brand|clr)-(.+)$/ },
];

function classifyVar(name) {
  for (const rule of VAR_RULES) {
    const m = rule.re.exec(name);
    if (m) return { cat: rule.cat, role: m[1] };
  }
  return null;
}

function rgbToHex(value) {
  const m = /^rgba?\(\s*([\d.]+)[ ,]+([\d.]+)[ ,]+([\d.]+)/i.exec(value.trim());
  if (!m) return null;
  const hex = [m[1], m[2], m[3]]
    .map((n) => Math.max(0, Math.min(255, Math.round(parseFloat(n)))).toString(16).padStart(2, '0'))
    .join('');
  return `#${hex}`;
}

function normalizeColor(value) {
  const v = value.trim();
  if (/^#[0-9a-f]{3,8}$/i.test(v)) {
    if (v.length === 4) return ('#' + v.slice(1).split('').map((c) => c + c).join('')).toLowerCase();
    return v.toLowerCase();
  }
  return rgbToHex(v);
}

function collectVariables(root) {
  const acc = { colors: [] };
  root.walkDecls((decl) => {
    if (!decl.prop.startsWith('--')) return;
    const hit = classifyVar(decl.prop);
    if (!hit) return;
    if (hit.cat === 'colors') {
      const hex = normalizeColor(decl.value);
      if (hex) acc.colors.push({ hex, role: hit.role, confidence: 'high', source: decl.prop });
    }
  });
  return acc;
}

export function ingestCss(cssText, { sourceUrl = null } = {}) {
  const root = postcss.parse(cssText || '');
  const vars = collectVariables(root);
  return {
    summary: {
      source_description: 'Tokens aus CSS extrahiert',
      app_type: 'Website',
      color_mode: 'unknown',
      design_style: 'aus Stylesheet abgeleitet',
    },
    tokens: { colors: vars.colors, typography: [], spacing: [], border_radius: [], shadows: [] },
    atomics: [],
    components: [],
    patterns: [],
    warnings: ['Nur Tokens — Komponenten werden aus CSS nicht erkannt.'],
    meta: { model: 'css-ingest', source_url: sourceUrl, elapsed_ms: 0 },
  };
}
