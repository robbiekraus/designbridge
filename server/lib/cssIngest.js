import postcss from 'postcss';

const VAR_RULES = [
  { cat: 'colors',     re: /^--(?:color|colour|c|brand|clr)-(.+)$/ },
  { cat: 'fontSize',   re: /^--(?:font-size|text|fs)-(.+)$/ },
  { cat: 'fontWeight', re: /^--(?:font-weight|fw)-(.+)$/ },
  { cat: 'spacing',    re: /^--(?:space|spacing|gap|sp)-(.+)$/ },
  { cat: 'radius',     re: /^--(?:radius|rounded|br|rad)-(.+)$/ },
  { cat: 'shadows',    re: /^--(?:shadow|elevation|shd)-(.+)$/ },
];

function classifyVar(name) {
  for (const rule of VAR_RULES) {
    const m = rule.re.exec(name);
    if (m) return { cat: rule.cat, role: m[1] };
  }
  return null;
}

export function remToPx(value) {
  const m = /^(-?[\d.]+)rem$/.exec(value.trim());
  if (m) return `${Math.round(parseFloat(m[1]) * 16)}px`;
  return value.trim();
}

export function pxNumber(value) {
  const m = /^(-?[\d.]+)px$/.exec(remToPx(value));
  return m ? parseFloat(m[1]) : null;
}

function rgbToHex(value) {
  const m = /^rgba?\(\s*([\d.]+)[ ,]+([\d.]+)[ ,]+([\d.]+)/i.exec(value.trim());
  if (!m) return null;
  const hex = [m[1], m[2], m[3]]
    .map((n) => Math.max(0, Math.min(255, Math.round(parseFloat(n)))).toString(16).padStart(2, '0'))
    .join('');
  return `#${hex}`;
}

export function normalizeColor(value) {
  const v = value.trim();
  if (/^#[0-9a-f]{3,8}$/i.test(v)) {
    if (v.length === 4) return ('#' + v.slice(1).split('').map((c) => c + c).join('')).toLowerCase();
    return v.toLowerCase();
  }
  return rgbToHex(v);
}

function collectVariables(root) {
  const acc = { colors: [], fontSize: [], fontWeight: [], spacing: [], radius: [], shadows: [] };
  root.walkDecls((decl) => {
    if (!decl.prop.startsWith('--')) return;
    const hit = classifyVar(decl.prop);
    if (!hit) return;
    const raw = decl.value.trim();
    const source = decl.prop;
    if (hit.cat === 'colors') {
      const hex = normalizeColor(raw);
      if (hex) acc.colors.push({ hex, role: hit.role, confidence: 'high', source });
    } else if (hit.cat === 'fontSize') {
      const px = pxNumber(raw);
      if (px != null) acc.fontSize.push({ role: hit.role, size: px, source });
    } else if (hit.cat === 'fontWeight') {
      acc.fontWeight.push({ role: hit.role, weight: raw });
    } else if (hit.cat === 'spacing') {
      const px = pxNumber(raw);
      if (px != null) acc.spacing.push({ value: px, usage: hit.role, confidence: 'high', source });
    } else if (hit.cat === 'radius') {
      const val = raw.endsWith('%') ? raw : remToPx(raw);
      acc.radius.push({ value: val, usage: hit.role, confidence: 'high', source });
    } else if (hit.cat === 'shadows') {
      acc.shadows.push({ description: hit.role, css: raw, confidence: 'high', source });
    }
  });
  return acc;
}

function buildTypography(vars) {
  const weightByRole = new Map(vars.fontWeight.map((w) => [w.role, w.weight]));
  return vars.fontSize.map((f) => ({
    size: f.size,
    weight: weightByRole.get(f.role) ?? '400',
    role: f.role,
    sample: 'Aa',
    confidence: 'high',
    source: f.source,
  }));
}

function collectDeclarations(root, vars) {
  const seen = {
    colors: new Set(vars.colors.map((c) => c.hex)),
    fontSize: new Set(vars.fontSize.map((f) => f.size)),
    radius: new Set(vars.radius.map((r) => String(r.value))),
    shadows: new Set(vars.shadows.map((s) => s.css)),
  };
  const out = { colors: [], typography: [], radius: [], shadows: [] };
  root.walkRules((rule) => {
    rule.walkDecls((decl) => {
      const prop = decl.prop.toLowerCase();
      if (prop.startsWith('--')) return;
      const source = `${rule.selector} { ${decl.prop}: … }`;
      if (prop === 'color' || prop === 'background-color' || prop === 'background') {
        const hex = normalizeColor(decl.value);
        if (hex && !seen.colors.has(hex)) {
          seen.colors.add(hex);
          out.colors.push({ hex, role: 'gefunden', confidence: 'low', source });
        }
      } else if (prop === 'font-size') {
        const px = pxNumber(decl.value);
        if (px != null && !seen.fontSize.has(px)) {
          seen.fontSize.add(px);
          out.typography.push({ size: px, weight: '400', role: 'gefunden', sample: 'Aa', confidence: 'low', source });
        }
      } else if (prop === 'border-radius') {
        const val = decl.value.trim().endsWith('%') ? decl.value.trim() : remToPx(decl.value);
        if (!seen.radius.has(String(val))) {
          seen.radius.add(String(val));
          out.radius.push({ value: val, usage: 'gefunden', confidence: 'low', source });
        }
      } else if (prop === 'box-shadow') {
        const css = decl.value.trim();
        if (css !== 'none' && !seen.shadows.has(css)) {
          seen.shadows.add(css);
          out.shadows.push({ description: 'gefunden', css, confidence: 'low', source });
        }
      }
    });
  });
  return out;
}

export function ingestCss(cssText, { sourceUrl = null } = {}) {
  const root = postcss.parse(cssText || '');
  const vars = collectVariables(root);
  const decls = collectDeclarations(root, vars);
  const usedFallback =
    decls.colors.length + decls.typography.length + decls.radius.length + decls.shadows.length > 0;
  const warnings = ['Nur Tokens — Komponenten werden aus CSS nicht erkannt.'];
  if (usedFallback) {
    warnings.push('Einige Werte stammen aus CSS-Deklarationen (niedrige Confidence) — bitte prüfen.');
  }
  return {
    summary: {
      source_description: 'Tokens aus CSS extrahiert',
      app_type: 'Website',
      color_mode: 'unknown',
      design_style: 'aus Stylesheet abgeleitet',
    },
    tokens: {
      colors: [...vars.colors, ...decls.colors],
      typography: [...buildTypography(vars), ...decls.typography],
      spacing: [...vars.spacing].sort((a, b) => a.value - b.value),
      border_radius: [...vars.radius, ...decls.radius],
      shadows: [...vars.shadows, ...decls.shadows],
    },
    atomics: [],
    components: [],
    patterns: [],
    warnings,
    meta: { model: 'css-ingest', source_url: sourceUrl, elapsed_ms: 0 },
  };
}
