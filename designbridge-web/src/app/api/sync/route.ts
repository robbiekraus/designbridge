import { NextRequest, NextResponse } from 'next/server';
import https from 'https';
import fs from 'fs';
import path from 'path';

// ─── HTTP helper ──────────────────────────────────────────────────────────────

function figmaGet(url: string, token: string): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const options = {
      headers: {
        'X-Figma-Token': token,
        'User-Agent': 'DesignBridge-Sync/1.0',
      },
    };
    https.get(url, options, (res) => {
      let data = '';
      res.on('data', (chunk) => (data += chunk));
      res.on('end', () => {
        try {
          resolve(JSON.parse(data));
        } catch (e: unknown) {
          const msg = e instanceof Error ? e.message : String(e);
          reject(new Error(`Failed to parse response from ${url}: ${msg}`));
        }
      });
    }).on('error', reject);
  });
}

// ─── UUID / slug helpers ──────────────────────────────────────────────────────

function uuidv4(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

function slugify(str: string): string {
  return str.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

// ─── Token extraction ─────────────────────────────────────────────────────────

interface RgbColor { r: number; g: number; b: number }

function rgbToHex({ r, g, b }: RgbColor): string {
  const hex = (v: number) => Math.round(v * 255).toString(16).padStart(2, '0');
  return `#${hex(r)}${hex(g)}${hex(b)}`;
}

type TokenTree = Record<string, unknown>;

interface FigmaStyle {
  node_id: string;
  name: string;
  style_type: string;
}

interface FigmaNode {
  document?: {
    fills?: Array<{ type: string; color: RgbColor }>;
    style?: {
      fontFamily?: string;
      fontSize?: number;
      fontWeight?: number;
      lineHeightPx?: number;
      lineHeightPercentFontSize?: number;
    };
  };
}

function buildTokensFromStyles(
  stylesList: FigmaStyle[],
  nodes: Record<string, FigmaNode>
): { color: TokenTree; typography: TokenTree } {
  const tokens: { color: TokenTree; typography: TokenTree } = { color: {}, typography: {} };

  for (const style of stylesList) {
    const nodeId = style.node_id;
    const nodeData = nodes[nodeId];
    if (!nodeData?.document) continue;

    const doc = nodeData.document;
    const nameParts = style.name.split('/').map(slugify).filter(Boolean);

    if (style.style_type === 'FILL') {
      const fills = doc.fills ?? [];
      const solidFill = fills.find((f) => f.type === 'SOLID');
      if (!solidFill) continue;

      let target = tokens.color as TokenTree;
      for (const part of nameParts.slice(0, -1)) {
        if (!target[part]) target[part] = {};
        target = target[part] as TokenTree;
      }
      const leaf = nameParts[nameParts.length - 1];
      target[leaf] = { $value: rgbToHex(solidFill.color), $type: 'color' };
    } else if (style.style_type === 'TEXT') {
      const style_props = doc.style ?? {};
      let target = tokens.typography as TokenTree;
      for (const part of nameParts.slice(0, -1)) {
        if (!target[part]) target[part] = {};
        target = target[part] as TokenTree;
      }
      const leaf = nameParts[nameParts.length - 1];
      target[leaf] = {
        $value: {
          fontFamily: style_props.fontFamily ?? 'Inter',
          fontSize: `${style_props.fontSize ?? 16}px`,
          fontWeight: String(style_props.fontWeight ?? 400),
          lineHeight: style_props.lineHeightPx
            ? `${Math.round(style_props.lineHeightPx)}px`
            : style_props.lineHeightPercentFontSize
            ? `${style_props.lineHeightPercentFontSize}%`
            : '1.5',
        },
        $type: 'typography',
      };
    }
  }

  return tokens;
}

// ─── Component extraction ─────────────────────────────────────────────────────

interface RawComponent {
  name: string;
  figmaNodeId: string;
  type: string;
  description: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  children: any[];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  componentPropertyDefinitions?: Record<string, any>;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function walkComponents(node: any, components: RawComponent[] = []): RawComponent[] {
  if (!node) return components;

  if (node.type === 'COMPONENT_SET' || node.type === 'COMPONENT') {
    components.push({
      name: node.name,
      figmaNodeId: node.id,
      type: node.type,
      description: node.description ?? '',
      children: node.children ?? [],
      componentPropertyDefinitions: node.componentPropertyDefinitions,
    });
    if (node.type !== 'COMPONENT_SET') {
      for (const child of node.children ?? []) {
        walkComponents(child, components);
      }
    }
  } else {
    for (const child of node.children ?? []) {
      walkComponents(child, components);
    }
  }

  return components;
}

function guessCategory(name: string): string {
  const lower = name.toLowerCase();
  if (/button|icon|badge|tag|chip|avatar|checkbox|radio|toggle|switch|input|label|tooltip/.test(lower)) return 'atom';
  if (/card|modal|dialog|dropdown|menu|nav|form|search|list|table|row/.test(lower)) return 'molecule';
  if (/header|footer|sidebar|hero|section|page|layout/.test(lower)) return 'organism';
  return 'atom';
}

interface ComponentProp {
  name: string;
  type: string;
  values: string[];
  default: unknown;
}

function extractProps(node: RawComponent): ComponentProp[] {
  const props: ComponentProp[] = [];
  if (node.componentPropertyDefinitions) {
    for (const [propName, def] of Object.entries(node.componentPropertyDefinitions)) {
      const cleanName = propName.replace(/#.*$/, '').trim();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const d = def as any;
      if (d.type === 'VARIANT') {
        props.push({ name: cleanName, type: 'enum', values: d.variantOptions ?? [], default: d.defaultValue ?? null });
      } else if (d.type === 'BOOLEAN') {
        props.push({ name: cleanName, type: 'boolean', values: [], default: d.defaultValue ?? false });
      } else if (d.type === 'TEXT') {
        props.push({ name: cleanName, type: 'string', values: [], default: d.defaultValue ?? '' });
      }
    }
  }
  return props;
}

// ─── Token flattening & file generation ──────────────────────────────────────

interface FlatToken {
  path: string[];
  value: unknown;
  type: string;
}

function flattenTokens(tree: TokenTree, currentPath: string[] = []): FlatToken[] {
  const results: FlatToken[] = [];
  for (const [key, val] of Object.entries(tree)) {
    if (key.startsWith('$')) continue;
    const node = val as Record<string, unknown>;
    if (node && typeof node === 'object' && '$value' in node && '$type' in node) {
      results.push({ path: [...currentPath, key], value: node['$value'], type: node['$type'] as string });
    } else if (node && typeof node === 'object') {
      results.push(...flattenTokens(node as TokenTree, [...currentPath, key]));
    }
  }
  return results;
}

function guessFontFallback(family: string): string {
  const lower = family.toLowerCase();
  if (/mono|code|courier/.test(lower)) return 'monospace';
  if (/serif|crimson|georgia|times|garamond|palatino|playfair|merriweather/.test(lower)) return 'serif';
  return 'sans-serif';
}

function generateOutputFiles(tokens: { color: TokenTree; typography: TokenTree }, cwd: string): void {
  const generatedDir = path.join(cwd, 'public', 'data', 'generated');
  fs.mkdirSync(generatedDir, { recursive: true });

  const colorTokens = flattenTokens(tokens.color, ['color']);
  const typoTokens = flattenTokens(tokens.typography, ['typography']);

  // ── tokens.css ──────────────────────────────────────────────────────────────
  const cssLines: string[] = ['/* DesignBridge — generated tokens */', ':root {'];

  if (colorTokens.length) {
    cssLines.push('  /* Colors */');
    for (const token of colorTokens) {
      const varName = `--${token.path.join('-')}`;
      cssLines.push(`  ${varName}: ${token.value};`);
    }
  }

  if (typoTokens.length) {
    cssLines.push('  /* Typography */');
    for (const token of typoTokens) {
      const base = `--${token.path.join('-')}`;
      const v = token.value as Record<string, string>;
      if (v.fontFamily) cssLines.push(`  ${base}-font-family: ${v.fontFamily};`);
      if (v.fontSize)   cssLines.push(`  ${base}-font-size: ${v.fontSize};`);
      if (v.fontWeight) cssLines.push(`  ${base}-font-weight: ${v.fontWeight};`);
      if (v.lineHeight) cssLines.push(`  ${base}-line-height: ${v.lineHeight};`);
    }
  }

  cssLines.push('}');
  fs.writeFileSync(path.join(generatedDir, 'tokens.css'), cssLines.join('\n') + '\n');

  // ── tailwind.config.tokens.js ────────────────────────────────────────────────
  const twColors: string[] = [];
  for (const token of colorTokens) {
    const key = token.path.slice(1).join('-'); // drop leading "color"
    const varName = `--${token.path.join('-')}`;
    twColors.push(`  '${key}': 'var(${varName})',`);
  }

  const twFontFamily: string[] = [];
  const twFontSize: string[] = [];
  for (const token of typoTokens) {
    const key = token.path[token.path.length - 1];
    const v = token.value as Record<string, string>;
    if (v.fontFamily) {
      const fallback = guessFontFallback(v.fontFamily);
      twFontFamily.push(`  '${key}': ['${v.fontFamily}', '${fallback}'],`);
    }
    if (v.fontSize) {
      const lh = v.lineHeight ? `, lineHeight: '${v.lineHeight}'` : '';
      const fw = v.fontWeight ? `, fontWeight: '${v.fontWeight}'` : '';
      twFontSize.push(`  '${key}': ['${v.fontSize}', {${lh}${fw} }],`);
    }
  }

  const twLines: string[] = [
    '// DesignBridge — generated Tailwind tokens',
    '// Usage: import tokens from \'./tokens/tailwind.config.tokens.js\'',
    '//        export default { theme: { extend: tokens } }',
    'module.exports = {',
    '  colors: {',
    ...twColors.map((l) => '  ' + l),
    '  },',
    '  fontFamily: {',
    ...twFontFamily.map((l) => '  ' + l),
    '  },',
    '  fontSize: {',
    ...twFontSize.map((l) => '  ' + l),
    '  },',
    '};',
  ];
  fs.writeFileSync(path.join(generatedDir, 'tailwind.config.tokens.js'), twLines.join('\n') + '\n');

  // ── tokens.ts ────────────────────────────────────────────────────────────────
  const tsColorEntries: string[] = [];
  for (const token of colorTokens) {
    const key = token.path.slice(1).join('-');
    const varName = `--${token.path.join('-')}`;
    tsColorEntries.push(`  '${key}': 'var(${varName})',`);
  }

  const tsTypoEntries: string[] = [];
  for (const token of typoTokens) {
    const key = token.path[token.path.length - 1];
    const v = token.value as Record<string, string>;
    const cssVar = `--${token.path.join('-')}-font-size`;
    const parts: string[] = [];
    if (v.fontFamily) parts.push(`    fontFamily: '${v.fontFamily}',`);
    if (v.fontSize)   parts.push(`    fontSize: '${v.fontSize}',`);
    if (v.fontWeight) parts.push(`    fontWeight: '${v.fontWeight}',`);
    if (v.lineHeight) parts.push(`    lineHeight: '${v.lineHeight}',`);
    parts.push(`    cssVar: '${cssVar}',`);
    tsTypoEntries.push(`  '${key}': {\n${parts.join('\n')}\n  },`);
  }

  const tsLines: string[] = [
    '// DesignBridge — generated TypeScript tokens',
    "// Usage: import { tokens, cssVar } from './tokens'",
    '',
    'export const colors = {',
    ...tsColorEntries,
    '} as const;',
    '',
    'export const typography = {',
    ...tsTypoEntries,
    '} as const;',
    '',
    'export type ColorKey = keyof typeof colors;',
    'export type TypographyKey = keyof typeof typography;',
    '',
    '/** Get CSS variable reference for a color token */',
    'export function cssVar(key: ColorKey): string {',
    '  return colors[key];',
    '}',
    '',
    'export const tokens = { colors, typography } as const;',
  ];
  fs.writeFileSync(path.join(generatedDir, 'tokens.ts'), tsLines.join('\n') + '\n');
}

// ─── API Route ────────────────────────────────────────────────────────────────

export async function POST(request: NextRequest) {
  try {
    const FIGMA_TOKEN = process.env.FIGMA_TOKEN;
    if (!FIGMA_TOKEN) {
      return NextResponse.json({ success: false, error: 'FIGMA_TOKEN_MISSING' }, { status: 400 });
    }

    const body = await request.json() as { fileKey?: string };
    const fileKey = body.fileKey?.trim();
    if (!fileKey) {
      return NextResponse.json({ success: false, error: 'fileKey is required' }, { status: 400 });
    }

    const cwd = process.cwd(); // designbridge-web/
    const publicDataDir = path.join(cwd, 'public', 'data');
    const exportsDir = path.join(cwd, '..', 'exports');

    // Load previous manifest to preserve UUIDs and codeRefs
    const prevManifestPath = path.join(publicDataDir, 'components.manifest.json');
    let prevManifest: { components: Array<{ figmaNodeId: string; uuid: string; props: unknown; codeRef: unknown }> } = { components: [] };
    if (fs.existsSync(prevManifestPath)) {
      try {
        prevManifest = JSON.parse(fs.readFileSync(prevManifestPath, 'utf-8'));
      } catch {
        // start fresh
      }
    }

    const prevByNodeId = Object.fromEntries(
      prevManifest.components.map((c) => [c.figmaNodeId, c])
    );

    // 1. Fetch file document (used for both components AND style extraction)
    const fileData = await figmaGet(
      `https://api.figma.com/v1/files/${fileKey}`,
      FIGMA_TOKEN
    ) as { err?: string; name?: string; document?: { children: unknown[] } };
    if (fileData.err) throw new Error(`Figma file API error: ${fileData.err}`);
    const figmaFileName = fileData.name ?? 'file';

    // 2. Fetch published styles list
    const stylesData = await figmaGet(
      `https://api.figma.com/v1/files/${fileKey}/styles`,
      FIGMA_TOKEN
    ) as { err?: string; meta?: { styles: FigmaStyle[] } };
    if (stylesData.err) throw new Error(`Figma styles API error: ${stylesData.err}`);
    const stylesList: FigmaStyle[] = stylesData.meta?.styles ?? [];

    // 3. Also collect style IDs used by nodes (catches team library styles)
    // Track style type by which property key the ID came from
    const usedFillStyleIds = new Set<string>();
    const usedTextStyleIds = new Set<string>();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    function collectNodeStyleIds(node: any): void {
      if (node?.styles && typeof node.styles === 'object') {
        const s = node.styles as Record<string, string>;
        if (s.fill) usedFillStyleIds.add(s.fill);
        if (s.fills) usedFillStyleIds.add(s.fills);
        if (s.text) usedTextStyleIds.add(s.text);
        if (s.stroke) usedFillStyleIds.add(s.stroke);
        if (s.strokes) usedFillStyleIds.add(s.strokes);
      }
      for (const child of node?.children ?? []) collectNodeStyleIds(child);
    }
    for (const page of fileData.document?.children ?? []) collectNodeStyleIds(page);

    // Merge published style node IDs + used style IDs
    const publishedNodeIds = stylesList.map((s) => s.node_id);
    const allNodeIds = [...new Set([
      ...publishedNodeIds,
      ...usedFillStyleIds,
      ...usedTextStyleIds,
    ])];

    // 4. Fetch all style nodes in batches of 50
    let nodes: Record<string, FigmaNode> = {};
    for (let i = 0; i < allNodeIds.length; i += 50) {
      const batch = allNodeIds.slice(i, i + 50);
      const ids = batch.join(',');
      const nodesData = await figmaGet(
        `https://api.figma.com/v1/files/${fileKey}/nodes?ids=${encodeURIComponent(ids)}`,
        FIGMA_TOKEN
      ) as { err?: string; nodes?: Record<string, FigmaNode> };
      if (!nodesData.err && nodesData.nodes) {
        Object.assign(nodes, nodesData.nodes);
      }
    }

    // Build a synthetic styles list from used-but-unpublished style nodes
    const publishedNodeIdSet = new Set(publishedNodeIds);
    const syntheticStyles: FigmaStyle[] = [];
    for (const id of usedFillStyleIds) {
      if (publishedNodeIdSet.has(id)) continue;
      const nodeData = nodes[id];
      if (!nodeData?.document) continue;
      const doc = nodeData.document as Record<string, unknown>;
      syntheticStyles.push({ node_id: id, name: (doc.name as string) ?? id, style_type: 'FILL' });
    }
    for (const id of usedTextStyleIds) {
      if (publishedNodeIdSet.has(id)) continue;
      const nodeData = nodes[id];
      if (!nodeData?.document) continue;
      const doc = nodeData.document as Record<string, unknown>;
      syntheticStyles.push({ node_id: id, name: (doc.name as string) ?? id, style_type: 'TEXT' });
    }

    const allStyles = [...stylesList, ...syntheticStyles];
    const tokens = buildTokensFromStyles(allStyles, nodes);
    const colorCount = allStyles.filter((s) => s.style_type === 'FILL').length;
    const typoCount = allStyles.filter((s) => s.style_type === 'TEXT').length;

    const rawComponents: RawComponent[] = [];
    for (const page of fileData.document?.children ?? []) {
      walkComponents(page, rawComponents);
    }

    // 4. Build manifest
    const now = new Date().toISOString();
    const manifestComponents = rawComponents.map((raw) => {
      const prev = prevByNodeId[raw.figmaNodeId];
      const currentProps = extractProps(raw);
      const status = prev
        ? (JSON.stringify(currentProps) !== JSON.stringify(prev.props) ? 'modified' : 'synced')
        : 'new';

      return {
        uuid: prev?.uuid ?? uuidv4(),
        name: raw.name,
        figmaNodeId: raw.figmaNodeId,
        figmaFileKey: fileKey,
        figmaUrl: `https://www.figma.com/design/${fileKey}/${encodeURIComponent(figmaFileName.replace(/\s+/g, '-'))}?node-id=${raw.figmaNodeId.replace(':', '-')}`,
        category: guessCategory(raw.name),
        description: raw.description,
        props: currentProps,
        tokenRefs: [],
        codeRef: prev?.codeRef ?? null,
        status,
        lastSyncedAt: now,
      };
    });

    const statsNew = manifestComponents.filter((c) => c.status === 'new').length;
    const statsModified = manifestComponents.filter((c) => c.status === 'modified').length;
    const statsSynced = manifestComponents.filter((c) => c.status === 'synced').length;

    const manifest = {
      version: '1.0.0',
      exportedAt: now,
      components: manifestComponents,
    };

    const tokensJson = JSON.stringify(tokens, null, 2);
    const manifestJson = JSON.stringify(manifest, null, 2);

    // 5. Write to public/data (dashboard display)
    fs.mkdirSync(publicDataDir, { recursive: true });
    fs.writeFileSync(path.join(publicDataDir, 'tokens.json'), tokensJson);
    fs.writeFileSync(path.join(publicDataDir, 'components.manifest.json'), manifestJson);

    // 6. Write to ../exports (for external tooling)
    fs.mkdirSync(exportsDir, { recursive: true });
    fs.writeFileSync(path.join(exportsDir, 'tokens.json'), tokensJson);
    fs.writeFileSync(path.join(exportsDir, 'components.manifest.json'), manifestJson);

    // 7. Generate output files (tokens.css, tailwind.config.tokens.js, tokens.ts)
    const generatedFiles = ['tokens.css', 'tailwind.config.tokens.js', 'tokens.ts'];
    generateOutputFiles(tokens, cwd);

    // 8. Auto-sync tokens to designbridge-dev (if it exists next to designbridge-web)
    const devRepoLib = path.join(cwd, '..', 'designbridge-dev', 'lib');
    if (fs.existsSync(devRepoLib)) {
      const generatedDir = path.join(cwd, 'public', 'data', 'generated');
      fs.copyFileSync(
        path.join(generatedDir, 'tokens.css'),
        path.join(devRepoLib, 'designbridge-tokens.css'),
      );
      fs.copyFileSync(
        path.join(generatedDir, 'tokens.ts'),
        path.join(devRepoLib, 'designbridge-tokens.ts'),
      );
    }

    return NextResponse.json({
      success: true,
      stats: {
        components: manifestComponents.length,
        colors: colorCount,
        typography: typoCount,
        new: statsNew,
        modified: statsModified,
        synced: statsSynced,
      },
      generated: generatedFiles,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
