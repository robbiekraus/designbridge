#!/usr/bin/env node
/**
 * figma-fetch.js — DesignBridge GitHub Action sync script
 *
 * Fetches tokens + components from Figma REST API and writes:
 *   - exports/tokens.json
 *   - exports/components.manifest.json
 *
 * Usage:
 *   FIGMA_TOKEN=xxx FIGMA_FILE_KEY=yyy node scripts/figma-fetch.js
 */

'use strict';

const https = require('https');
const fs = require('fs');
const path = require('path');

// ─── Config ──────────────────────────────────────────────────────────────────

const FIGMA_TOKEN = process.env.FIGMA_TOKEN;
const FIGMA_FILE_KEY = process.env.FIGMA_FILE_KEY;
const EXPORTS_DIR = path.join(__dirname, '..', 'exports');

if (!FIGMA_TOKEN || !FIGMA_FILE_KEY) {
  console.error('❌ Missing FIGMA_TOKEN or FIGMA_FILE_KEY environment variables');
  process.exit(1);
}

// ─── HTTP helpers ─────────────────────────────────────────────────────────────

function get(url) {
  return new Promise((resolve, reject) => {
    const options = {
      headers: {
        'X-Figma-Token': FIGMA_TOKEN,
        'User-Agent': 'DesignBridge-Sync/1.0',
      },
    };
    https.get(url, options, (res) => {
      let data = '';
      res.on('data', (chunk) => (data += chunk));
      res.on('end', () => {
        try {
          resolve(JSON.parse(data));
        } catch (e) {
          reject(new Error(`Failed to parse response from ${url}: ${e.message}`));
        }
      });
    }).on('error', reject);
  });
}

// ─── UUID helper ──────────────────────────────────────────────────────────────

function uuidv4() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

function slugify(str) {
  return str.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

// ─── Figma API ────────────────────────────────────────────────────────────────

async function fetchStyles() {
  console.log('  Fetching styles list…');
  const url = `https://api.figma.com/v1/files/${FIGMA_FILE_KEY}/styles`;
  const data = await get(url);
  if (data.err) throw new Error(`Figma styles API error: ${data.err}`);
  return data.meta?.styles ?? [];
}

async function fetchNodes(nodeIds) {
  if (nodeIds.length === 0) return {};
  console.log(`  Fetching ${nodeIds.length} style nodes…`);
  const ids = nodeIds.join(',');
  const url = `https://api.figma.com/v1/files/${FIGMA_FILE_KEY}/nodes?ids=${encodeURIComponent(ids)}`;
  const data = await get(url);
  if (data.err) throw new Error(`Figma nodes API error: ${data.err}`);
  return data.nodes ?? {};
}

async function fetchFile() {
  console.log('  Fetching file document…');
  const url = `https://api.figma.com/v1/files/${FIGMA_FILE_KEY}`;
  const data = await get(url);
  if (data.err) throw new Error(`Figma file API error: ${data.err}`);
  return data;
}

// ─── Token extraction ─────────────────────────────────────────────────────────

function rgbToHex({ r, g, b }) {
  const hex = (v) => Math.round(v * 255).toString(16).padStart(2, '0');
  return `#${hex(r)}${hex(g)}${hex(b)}`;
}

function buildTokensFromStyles(stylesList, nodes) {
  const tokens = { color: {}, typography: {} };

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

      let target = tokens.color;
      for (const part of nameParts.slice(0, -1)) {
        if (!target[part]) target[part] = {};
        target = target[part];
      }
      const leaf = nameParts[nameParts.length - 1];
      target[leaf] = {
        $value: rgbToHex(solidFill.color),
        $type: 'color',
      };
    } else if (style.style_type === 'TEXT') {
      const style_props = doc.style ?? {};
      let target = tokens.typography;
      for (const part of nameParts.slice(0, -1)) {
        if (!target[part]) target[part] = {};
        target = target[part];
      }
      const leaf = nameParts[nameParts.length - 1];
      target[leaf] = {
        $value: {
          fontFamily: style_props.fontFamily ?? 'Inter',
          fontSize: `${style_props.fontSize ?? 16}px`,
          fontWeight: String(style_props.fontWeight ?? 400),
          lineHeight:
            style_props.lineHeightPx
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

function walkComponents(node, components = []) {
  if (!node) return components;

  if (node.type === 'COMPONENT_SET' || node.type === 'COMPONENT') {
    const entry = {
      name: node.name,
      figmaNodeId: node.id,
      type: node.type,
      description: node.description ?? '',
      children: node.children ?? [],
    };
    components.push(entry);
    // Don't recurse into children of COMPONENT_SET — variants are not top-level components
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

function guessCategory(name) {
  const lower = name.toLowerCase();
  if (/button|icon|badge|tag|chip|avatar|checkbox|radio|toggle|switch|input|label|tooltip/.test(lower)) return 'atom';
  if (/card|modal|dialog|dropdown|menu|nav|form|search|list|table|row/.test(lower)) return 'molecule';
  if (/header|footer|sidebar|hero|section|page|layout/.test(lower)) return 'organism';
  return 'atom';
}

function extractProps(node) {
  const props = [];
  if (node.componentPropertyDefinitions) {
    for (const [propName, def] of Object.entries(node.componentPropertyDefinitions)) {
      const cleanName = propName.replace(/#.*$/, '').trim();
      if (def.type === 'VARIANT') {
        props.push({
          name: cleanName,
          type: 'enum',
          values: def.variantOptions ?? [],
          default: def.defaultValue ?? null,
        });
      } else if (def.type === 'BOOLEAN') {
        props.push({
          name: cleanName,
          type: 'boolean',
          values: [],
          default: def.defaultValue ?? false,
        });
      } else if (def.type === 'TEXT') {
        props.push({
          name: cleanName,
          type: 'string',
          values: [],
          default: def.defaultValue ?? '',
        });
      }
    }
  }
  return props;
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log(`\n🔄 DesignBridge Figma Sync — File: ${FIGMA_FILE_KEY}\n`);

  // Load previous manifest to preserve UUIDs and codeRefs
  const prevManifestPath = path.join(EXPORTS_DIR, 'components.manifest.json');
  let prevManifest = { components: [] };
  if (fs.existsSync(prevManifestPath)) {
    try {
      prevManifest = JSON.parse(fs.readFileSync(prevManifestPath, 'utf-8'));
      console.log(`📋 Loaded previous manifest (${prevManifest.components.length} components)`);
    } catch {
      console.warn('⚠️  Could not parse previous manifest — starting fresh');
    }
  }

  const prevByNodeId = Object.fromEntries(
    prevManifest.components.map((c) => [c.figmaNodeId, c])
  );

  // 1. Fetch styles + nodes
  const stylesList = await fetchStyles();
  console.log(`  Found ${stylesList.length} styles`);

  const nodeIds = stylesList.map((s) => s.node_id);
  const nodes = await fetchNodes(nodeIds);

  const tokens = buildTokensFromStyles(stylesList, nodes);
  const colorCount = stylesList.filter((s) => s.style_type === 'FILL').length;
  const typoCount = stylesList.filter((s) => s.style_type === 'TEXT').length;
  console.log(`  ✓ Tokens: ${colorCount} colors, ${typoCount} typography`);

  // 2. Fetch file document for components
  const fileData = await fetchFile();
  const rawComponents = [];
  for (const page of fileData.document?.children ?? []) {
    walkComponents(page, rawComponents);
  }
  console.log(`  Found ${rawComponents.length} component nodes`);

  // 3. Build manifest
  const now = new Date().toISOString();
  const manifestComponents = rawComponents.map((raw) => {
    const prev = prevByNodeId[raw.figmaNodeId];
    const status = prev
      ? (JSON.stringify(extractProps(raw)) !== JSON.stringify(prev.props) ? 'modified' : 'synced')
      : 'new';

    return {
      uuid: prev?.uuid ?? uuidv4(),
      name: raw.name,
      figmaNodeId: raw.figmaNodeId,
      figmaFileKey: FIGMA_FILE_KEY,
      figmaUrl: `https://www.figma.com/design/${FIGMA_FILE_KEY}?node-id=${raw.figmaNodeId.replace(':', '-')}`,
      category: guessCategory(raw.name),
      description: raw.description,
      props: extractProps(raw),
      tokenRefs: [],
      codeRef: prev?.codeRef ?? null,
      status,
      lastSyncedAt: now,
    };
  });

  const statsNew = manifestComponents.filter((c) => c.status === 'new').length;
  const statsModified = manifestComponents.filter((c) => c.status === 'modified').length;
  const statsSynced = manifestComponents.filter((c) => c.status === 'synced').length;
  console.log(`  ✓ Components: ${statsNew} new, ${statsModified} modified, ${statsSynced} synced`);

  const manifest = {
    version: '1.0.0',
    exportedAt: now,
    components: manifestComponents,
  };

  // 4. Write output files
  fs.mkdirSync(EXPORTS_DIR, { recursive: true });
  fs.writeFileSync(path.join(EXPORTS_DIR, 'tokens.json'), JSON.stringify(tokens, null, 2));
  fs.writeFileSync(path.join(EXPORTS_DIR, 'components.manifest.json'), JSON.stringify(manifest, null, 2));

  console.log(`\n✅ Written to ${EXPORTS_DIR}/`);
  console.log(`   tokens.json`);
  console.log(`   components.manifest.json`);

  // Output summary for GitHub Actions step
  console.log(`\n::notice::Sync complete: ${manifestComponents.length} components (${statsNew} new, ${statsModified} modified, ${statsSynced} synced)`);
}

main().catch((err) => {
  console.error('❌ Sync failed:', err.message);
  process.exit(1);
});
