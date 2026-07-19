const dedupeBy = (arr, keyFn) => {
  const seen = new Set();
  return arr.filter((t) => {
    const k = keyFn(t);
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
};

function walkTree(node, cb, parent = null) {
  cb(node, parent);
  (node.children || []).forEach((c) => walkTree(c, cb, node));
}

function toByte(component) {
  return Math.max(0, Math.min(255, Math.round((component ?? 0) * 255)));
}

function hexFromRgb({ r, g, b }) {
  return `#${[r, g, b].map((c) => toByte(c).toString(16).padStart(2, '0')).join('')}`;
}

// Farben/Typografie/Schatten kommen aus benannten Figma-Styles: der Knoten
// trägt in `node.styles.<type>` die Style-ID, `styles[id].name` liefert den
// Rollen-Namen. Erster Treffer je Style-ID gewinnt (weitere Knoten mit
// derselben Style-ID liefern nichts Neues).
function tokensFromStyles(document, styles) {
  const colorsByStyle = new Map();
  const typographyByStyle = new Map();
  const shadowsByStyle = new Map();

  walkTree(document, (node) => {
    const nodeStyles = node.styles || {};

    if (nodeStyles.fill && !colorsByStyle.has(nodeStyles.fill)) {
      const role = styles[nodeStyles.fill]?.name || nodeStyles.fill;
      const fill = (node.fills || []).find((f) => f.type === 'SOLID');
      if (fill) {
        colorsByStyle.set(nodeStyles.fill, {
          hex: hexFromRgb(fill.color), role, confidence: 'high', source: `Figma-Style: ${role}`,
        });
      }
      // GRADIENT_*/IMAGE-Fills werden übersprungen — keine sinnvolle Hex-Farbe ableitbar.
    }

    if (nodeStyles.text && !typographyByStyle.has(nodeStyles.text)) {
      const role = styles[nodeStyles.text]?.name || nodeStyles.text;
      const ts = node.style || {};
      if (ts.fontSize != null) {
        typographyByStyle.set(nodeStyles.text, {
          size: ts.fontSize, weight: String(ts.fontWeight ?? '400'), role, sample: 'Aa',
          confidence: 'high', source: `Figma-Style: ${role}`,
        });
      }
    }

    if (nodeStyles.effect && !shadowsByStyle.has(nodeStyles.effect)) {
      const role = styles[nodeStyles.effect]?.name || nodeStyles.effect;
      const shadowEffects = (node.effects || []).filter(
        (e) => (e.type === 'DROP_SHADOW' || e.type === 'INNER_SHADOW') && e.visible !== false
      );
      if (shadowEffects.length > 0) {
        const css = shadowEffects
          .map((e) => {
            const { r, g, b, a } = e.color || { r: 0, g: 0, b: 0, a: 1 };
            const inset = e.type === 'INNER_SHADOW' ? 'inset ' : '';
            return `${inset}${e.offset?.x ?? 0}px ${e.offset?.y ?? 0}px ${e.radius ?? 0}px ${e.spread ?? 0}px rgba(${toByte(r)},${toByte(g)},${toByte(b)},${a ?? 1})`;
          })
          .join(', ');
        shadowsByStyle.set(nodeStyles.effect, {
          description: role, css, confidence: 'high', source: `Figma-Style: ${role}`,
        });
      }
    }
  });

  return {
    colors: [...colorsByStyle.values()],
    typography: [...typographyByStyle.values()],
    shadows: [...shadowsByStyle.values()],
  };
}

// Uniformes cornerRadius von beliebigen Knoten (Component/Frame + Kinder) —
// per-Ecke-Radien (rectangleCornerRadii) sind out of scope für v1.
function radiusFromTree(document) {
  const out = [];
  walkTree(document, (node) => {
    if (typeof node.cornerRadius === 'number') {
      out.push({
        value: `${node.cornerRadius}px`, usage: 'aus Figma-Knoten', confidence: 'low',
        source: `cornerRadius von ${node.name}`,
      });
    }
  });
  return dedupeBy(out, (r) => r.value);
}

const ATOM_RE = /\b(button|btn|input|badge|icon|avatar|chip|tag|toggle|checkbox|radio|switch|label|tooltip|dot)\b/i;
const MOLECULE_RE = /\b(search|segmented|dropdown|select|field|form-group|menu-item|list-item|breadcrumb|pagination|combobox)\b/i;
const TEMPLATE_RE = /\b(screen|page|dashboard|layout|template|shell)\b/i;
const SHELL_RE = /\b(navbar|hero|footer|sidebar|header)\b/i;

// Top-level Frames zählen als "sehr groß", wenn sie ganze Desktop-Screens
// füllen — grober Größen-Fallback für Frames, deren Name keinen Screen-Hinweis
// trägt (z. B. reine Kompositions-Namen ohne "screen"/"page" im Titel).
function isHeuristicallyLarge(node) {
  const box = node.absoluteBoundingBox;
  return !!box && box.width >= 1200 && box.height >= 700;
}

function classifyComponentName(name) {
  if (ATOM_RE.test(name)) return 'atoms';
  if (MOLECULE_RE.test(name)) return 'molecules';
  return 'organisms'; // unbekannte größere Bausteine sind eher organisms (Default).
}

function inventoryFromTree(document) {
  const buckets = { atoms: new Map(), molecules: new Map(), organisms: new Map(), templates: new Map() };
  const put = (bucket, entry) => { if (!buckets[bucket].has(entry.name)) buckets[bucket].set(entry.name, entry); };

  walkTree(document, (node, parent) => {
    if (node.type === 'COMPONENT_SET') {
      const variants = (node.children || []).filter((c) => c.type === 'COMPONENT').map((c) => c.name);
      put(classifyComponentName(node.name), {
        name: node.name, variants, confidence: 'high', source: 'figma',
        notes: `Component Set mit ${variants.length} Varianten`,
      });
      return;
    }

    if (node.type === 'COMPONENT') {
      if (parent?.type === 'COMPONENT_SET') return; // bereits über das Set erfasst.
      put(classifyComponentName(node.name), {
        name: node.name, variants: [], confidence: 'high', source: 'figma', notes: `aus Figma-Node ${node.id}`,
      });
      return;
    }

    if (node.type === 'FRAME' && parent?.type === 'CANVAS') {
      if (SHELL_RE.test(node.name)) {
        put('organisms', {
          name: node.name, variants: [], confidence: 'med', source: 'figma', notes: `Top-Frame ${node.id}`,
        });
      } else if (TEMPLATE_RE.test(node.name) || isHeuristicallyLarge(node)) {
        put('templates', {
          name: node.name, variants: [], confidence: 'med', source: 'figma', notes: `Top-Frame ${node.id}`,
        });
      }
      // Top-Frames ohne Screen-/Shell-Hinweis und ohne Größen-Indiz werden nicht aufgenommen.
    }
  });

  return {
    atoms: [...buckets.atoms.values()],
    molecules: [...buckets.molecules.values()],
    organisms: [...buckets.organisms.values()],
    templates: [...buckets.templates.values()],
  };
}

function firstValue(valuesByMode) {
  const vals = Object.values(valuesByMode || {});
  return vals.length > 0 ? vals[0] : undefined;
}

function tokensFromVariables(variables) {
  const colors = [];
  const border_radius = [];
  const spacing = [];
  for (const v of Object.values(variables || {})) {
    const value = firstValue(v.valuesByMode);
    if (value === undefined) continue;
    if (v.resolvedType === 'COLOR') {
      colors.push({ hex: hexFromRgb(value), role: v.name, confidence: 'high', source: `Figma-Variable: ${v.name}` });
    } else if (v.resolvedType === 'FLOAT') {
      const name = v.name.toLowerCase();
      if (name.includes('radius')) {
        border_radius.push({ value: `${value}px`, usage: v.name, confidence: 'high', source: `Figma-Variable: ${v.name}` });
      } else if (name.includes('spacing')) {
        spacing.push({ value, usage: v.name, confidence: 'high', source: `Figma-Variable: ${v.name}` });
      }
    }
  }
  return { colors, border_radius, spacing };
}

export function ingestFigmaFile({ document, styles = {}, variables = null }, { sourceUrl = null } = {}) {
  const warnings = [];
  const styleTokens = tokensFromStyles(document, styles);
  const radius = radiusFromTree(document);
  const inventory = inventoryFromTree(document);

  let colors = [...styleTokens.colors];
  let border_radius = [...radius];
  let spacing = [];

  warnings.push('Spacing wird aus Figma-Styles nicht gelesen (steckt in Variables/Enterprise).');

  if (variables != null) {
    const varTokens = tokensFromVariables(variables);
    colors = [...colors, ...varTokens.colors];
    border_radius = [...border_radius, ...varTokens.border_radius];
    spacing = [...spacing, ...varTokens.spacing];
  } else {
    warnings.push('Figma-Variables benötigen Enterprise — übersprungen.');
  }

  return {
    summary: {
      source_description: 'Tokens & Inventar aus Figma',
      app_type: 'Figma-Datei',
      color_mode: 'unknown',
      design_style: 'aus Figma-Styles abgeleitet',
    },
    tokens: {
      colors: dedupeBy(colors, (t) => t.hex),
      typography: dedupeBy(styleTokens.typography, (t) => `${t.size}/${t.weight}`),
      spacing: dedupeBy(spacing, (t) => t.usage),
      border_radius: dedupeBy(border_radius, (t) => String(t.value)),
      shadows: dedupeBy(styleTokens.shadows, (t) => t.css),
    },
    atoms: inventory.atoms,
    molecules: inventory.molecules,
    organisms: inventory.organisms,
    templates: inventory.templates,
    warnings,
    meta: { model: 'figma-ingest', source_url: sourceUrl, ai_deepened: false, elapsed_ms: 0 },
  };
}
