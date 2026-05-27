import type {
  TokensFile,
  TokenGroup,
  ColorToken,
  DimensionToken,
  TypographyToken,
} from '../types/manifest';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function rgbToHex(r: number, g: number, b: number): string {
  const toHex = (n: number) =>
    Math.round(n * 255)
      .toString(16)
      .padStart(2, '0');
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`.toUpperCase();
}

function colorWithOpacity(
  r: number,
  g: number,
  b: number,
  a: number
): string {
  if (a < 1) {
    const ri = Math.round(r * 255);
    const gi = Math.round(g * 255);
    const bi = Math.round(b * 255);
    return `rgba(${ri},${gi},${bi},${a.toFixed(2)})`;
  }
  return rgbToHex(r, g, b);
}

/** Euclidean RGB distance (0–255 scale) */
function colorDelta(
  a: { r: number; g: number; b: number },
  b: { r: number; g: number; b: number }
): number {
  return Math.sqrt(
    Math.pow((a.r - b.r) * 255, 2) +
      Math.pow((a.g - b.g) * 255, 2) +
      Math.pow((a.b - b.b) * 255, 2)
  );
}

/** Kebab-case a Figma style/variable name segment */
function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

/** Deeply set a value at a dot-separated path inside a TokenGroup */
function setPath(
  obj: TokenGroup,
  path: string[],
  value: ColorToken | DimensionToken | TypographyToken
): void {
  let cur: TokenGroup = obj;
  for (let i = 0; i < path.length - 1; i++) {
    const key = path[i];
    if (!cur[key] || typeof (cur[key] as ColorToken).$type !== 'undefined') {
      cur[key] = {};
    }
    cur = cur[key] as TokenGroup;
  }
  cur[path[path.length - 1]] = value;
}

// ─── Color Clustering ─────────────────────────────────────────────────────────

interface RawColor {
  path: string[];
  r: number;
  g: number;
  b: number;
  a: number;
  source: 'variable' | 'style';
}

function clusterColors(colors: RawColor[], group: TokenGroup): void {
  const clusters: RawColor[][] = [];

  for (const color of colors) {
    let assigned = false;
    for (const cluster of clusters) {
      const rep = cluster[0];
      if (colorDelta({ r: rep.r, g: rep.g, b: rep.b }, { r: color.r, g: color.g, b: color.b }) < 10) {
        cluster.push(color);
        assigned = true;
        break;
      }
    }
    if (!assigned) clusters.push([color]);
  }

  // Use the variable-sourced entry as canonical if present, else first entry
  for (const cluster of clusters) {
    const canonical =
      cluster.find((c) => c.source === 'variable') ?? cluster[0];
    const token: ColorToken = {
      $value: colorWithOpacity(canonical.r, canonical.g, canonical.b, canonical.a),
      $type: 'color',
    };
    setPath(group, canonical.path, token);
  }
}

// ─── Variables Scanner ────────────────────────────────────────────────────────

async function scanVariables(
  colorRaws: RawColor[],
  spacingGroup: TokenGroup
): Promise<void> {
  const collections = await figma.variables.getLocalVariableCollectionsAsync();

  for (const collection of collections) {
    const modeId = collection.defaultModeId;

    for (const varId of collection.variableIds) {
      const variable = await figma.variables.getVariableByIdAsync(varId);
      if (!variable) continue;

      const rawValue = variable.valuesByMode[modeId];
      if (rawValue === undefined) continue;

      const nameParts = variable.name.split('/').map(slugify);

      if (variable.resolvedType === 'COLOR') {
        const val = rawValue as RGBA;
        colorRaws.push({
          path: nameParts,
          r: val.r,
          g: val.g,
          b: val.b,
          a: val.a,
          source: 'variable',
        });
      } else if (variable.resolvedType === 'FLOAT') {
        const val = rawValue as number;
        const token: DimensionToken = {
          $value: `${val}px`,
          $type: 'dimension',
        };
        setPath(spacingGroup, nameParts, token);
      }
    }
  }
}

// ─── Local Styles Scanner ─────────────────────────────────────────────────────

async function scanLocalStyles(
  colorRaws: RawColor[],
  typographyGroup: TokenGroup
): Promise<void> {
  const paintStyles = await figma.getLocalPaintStylesAsync();
  for (const style of paintStyles) {
    const solid = style.paints.find((p): p is SolidPaint => p.type === 'SOLID');
    if (!solid) continue;
    colorRaws.push({
      path: style.name.split('/').map(slugify),
      r: solid.color.r,
      g: solid.color.g,
      b: solid.color.b,
      a: solid.opacity ?? 1,
      source: 'style',
    });
  }

  const textStyles = await figma.getLocalTextStylesAsync();
  for (const style of textStyles) {
    addTypographyToken(typographyGroup, style);
  }
}

// ─── Used Styles Scanner (captures library/linked styles) ─────────────────────

function collectStyleIds(node: BaseNode, fillIds: Set<string>, textIds: Set<string>): void {
  if ('fillStyleId' in node && typeof node.fillStyleId === 'string' && node.fillStyleId) {
    fillIds.add(node.fillStyleId);
  }
  if ('textStyleId' in node && typeof node.textStyleId === 'string' && node.textStyleId) {
    textIds.add(node.textStyleId);
  }
  if ('children' in node) {
    for (const child of (node as ChildrenMixin).children) {
      collectStyleIds(child, fillIds, textIds);
    }
  }
}

function addTypographyToken(group: TokenGroup, style: TextStyle): void {
  const token: TypographyToken = {
    $value: {
      fontFamily: style.fontName.family,
      fontSize: `${style.fontSize}px`,
      fontWeight: String(style.fontName.style),
      lineHeight:
        style.lineHeight.unit === 'PERCENT'
          ? (style.lineHeight.value / 100).toFixed(2)
          : style.lineHeight.unit === 'PIXELS'
          ? `${style.lineHeight.value}px`
          : '1.4',
    },
    $type: 'typography',
  };
  setPath(group, style.name.split('/').map(slugify), token);
}

async function scanUsedStyles(
  colorRaws: RawColor[],
  typographyGroup: TokenGroup,
  seenStyleIds: Set<string>
): Promise<void> {
  const fillIds = new Set<string>();
  const textIds = new Set<string>();

  // Walk every page
  for (const page of figma.root.children) {
    collectStyleIds(page, fillIds, textIds);
  }

  for (const id of fillIds) {
    if (seenStyleIds.has(id)) continue;
    seenStyleIds.add(id);

    const style = await figma.getStyleByIdAsync(id);
    if (!style || style.type !== 'PAINT') continue;
    const paintStyle = style as PaintStyle;
    const solid = paintStyle.paints.find((p): p is SolidPaint => p.type === 'SOLID');
    if (!solid) continue;

    colorRaws.push({
      path: style.name.split('/').map(slugify),
      r: solid.color.r,
      g: solid.color.g,
      b: solid.color.b,
      a: solid.opacity ?? 1,
      source: 'style',
    });
  }

  for (const id of textIds) {
    if (seenStyleIds.has(id)) continue;
    seenStyleIds.add(id);

    const style = await figma.getStyleByIdAsync(id);
    if (!style || style.type !== 'TEXT') continue;
    addTypographyToken(typographyGroup, style as TextStyle);
  }
}

// ─── Public API ───────────────────────────────────────────────────────────────

export async function scanTokens(): Promise<TokensFile> {
  const colorRaws: RawColor[] = [];
  const spacingGroup: TokenGroup = {};
  const typographyGroup: TokenGroup = {};
  const seenStyleIds = new Set<string>();

  // 1. Variables (source of truth)
  await scanVariables(colorRaws, spacingGroup);

  // 2. Local styles defined in this file
  await scanLocalStyles(colorRaws, typographyGroup);

  // Track IDs already found via getLocalPaintStylesAsync so we don't double-add
  const localPaintStyles = await figma.getLocalPaintStylesAsync();
  for (const s of localPaintStyles) seenStyleIds.add(s.id);
  const localTextStyles = await figma.getLocalTextStylesAsync();
  for (const s of localTextStyles) seenStyleIds.add(s.id);

  // 3. Library/linked styles actually used by nodes in this file
  await scanUsedStyles(colorRaws, typographyGroup, seenStyleIds);

  const colorGroup: TokenGroup = {};
  clusterColors(colorRaws, colorGroup);

  const result: TokensFile = {};
  if (Object.keys(colorGroup).length) result.color = colorGroup;
  if (Object.keys(spacingGroup).length) result.spacing = spacingGroup;
  if (Object.keys(typographyGroup).length) result.typography = typographyGroup;

  return result;
}
