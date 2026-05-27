import type {
  ComponentEntry,
  ComponentCategory,
  ComponentProp,
  PropType,
} from '../types/manifest';
import { getOrCreateUUID } from './uuid';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function slugify(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

function toTokenPath(name: string, prefix: string): string {
  const segments = name.split('/').map(slugify).filter(Boolean);
  return [prefix, ...segments].join('.');
}

function inferCategory(node: ComponentNode | ComponentSetNode): ComponentCategory {
  const nameLower = node.name.toLowerCase();
  if (/^(atoms?|atom\/)/.test(nameLower)) return 'atom';
  if (/^(molecules?|molecule\/)/.test(nameLower)) return 'molecule';
  if (/^(organisms?|organism\/)/.test(nameLower)) return 'organism';
  if (/^(templates?|template\/)/.test(nameLower)) return 'template';
  const { width: w, height: h } = node;
  if (w < 100 && h < 100) return 'atom';
  if (w < 400 && h < 300) return 'molecule';
  return 'organism';
}

function inferPropType(values: string[]): PropType {
  if (values.length === 2) {
    const lower = values.map((v) => v.toLowerCase());
    if (lower.includes('true') && lower.includes('false')) return 'boolean';
  }
  if (values.length >= 2) return 'enum';
  return 'string';
}

function parseProps(node: ComponentSetNode): ComponentProp[] {
  const props: ComponentProp[] = [];
  for (const [propName, propDef] of Object.entries(node.componentPropertyDefinitions)) {
    const cleanName = propName.replace(/#\d+$/, '').trim();
    if (propDef.type === 'VARIANT') {
      const values = (propDef as ComponentPropertyDefinition & { variantOptions: string[] }).variantOptions ?? [];
      props.push({ name: cleanName, type: inferPropType(values), values, default: propDef.defaultValue as string });
    } else if (propDef.type === 'BOOLEAN') {
      props.push({ name: cleanName, type: 'boolean', values: ['true', 'false'], default: propDef.defaultValue as boolean });
    } else if (propDef.type === 'TEXT') {
      props.push({ name: cleanName, type: 'string', values: [], default: propDef.defaultValue as string });
    } else if (propDef.type === 'INSTANCE_SWAP') {
      props.push({ name: cleanName, type: 'string', values: [], default: null });
    }
  }
  return props;
}

function buildFigmaUrl(fileKey: string, nodeId: string): string {
  if (!fileKey) return '';
  return `https://www.figma.com/design/${fileKey}?node-id=${nodeId.replace(':', '-')}`;
}

// ─── Token ref resolution (async, cached) ─────────────────────────────────────

async function collectTokenRefs(
  node: BaseNode,
  refs: Set<string>,
  styleCache: Map<string, string>,
  varCache: Map<string, string>
): Promise<void> {
  // Bound variables (Figma Variables API)
  if ('boundVariables' in node && node.boundVariables) {
    const bound = node.boundVariables as Record<string, VariableAlias | VariableAlias[]>;
    for (const binding of Object.values(bound)) {
      const aliases = Array.isArray(binding) ? binding : [binding];
      for (const alias of aliases) {
        if (!alias || alias.type !== 'VARIABLE_ALIAS') continue;
        if (!varCache.has(alias.id)) {
          const v = await figma.variables.getVariableByIdAsync(alias.id);
          varCache.set(alias.id, v ? v.name.split('/').map(slugify).join('.') : '');
        }
        const path = varCache.get(alias.id);
        if (path) refs.add(path);
      }
    }
  }

  // Fill style → color token
  if ('fillStyleId' in node && typeof node.fillStyleId === 'string' && node.fillStyleId) {
    const id = node.fillStyleId;
    if (!styleCache.has(id)) {
      const s = await figma.getStyleByIdAsync(id);
      styleCache.set(id, s ? toTokenPath(s.name, 'color') : '');
    }
    const path = styleCache.get(id);
    if (path) refs.add(path);
  }

  // Text style → typography token
  if ('textStyleId' in node && typeof node.textStyleId === 'string' && node.textStyleId) {
    const id = node.textStyleId;
    if (!styleCache.has(id)) {
      const s = await figma.getStyleByIdAsync(id);
      styleCache.set(id, s ? toTokenPath(s.name, 'typography') : '');
    }
    const path = styleCache.get(id);
    if (path) refs.add(path);
  }

  // Stroke style → color token
  if ('strokeStyleId' in node && typeof node.strokeStyleId === 'string' && node.strokeStyleId) {
    const id = node.strokeStyleId;
    if (!styleCache.has(id)) {
      const s = await figma.getStyleByIdAsync(id);
      styleCache.set(id, s ? toTokenPath(s.name, 'color') : '');
    }
    const path = styleCache.get(id);
    if (path) refs.add(path);
  }

  if ('children' in node) {
    for (const child of (node as ChildrenMixin).children) {
      await collectTokenRefs(child, refs, styleCache, varCache);
    }
  }
}

// ─── Public API ───────────────────────────────────────────────────────────────

export async function scanComponents(fileKey: string): Promise<ComponentEntry[]> {
  const entries: ComponentEntry[] = [];
  const now = new Date().toISOString();
  // Shared caches across all components to minimise API calls
  const styleCache = new Map<string, string>();
  const varCache = new Map<string, string>();

  const componentSets = figma.root.findAllWithCriteria({ types: ['COMPONENT_SET'] }) as ComponentSetNode[];
  const standaloneComponents = (
    figma.root.findAllWithCriteria({ types: ['COMPONENT'] }) as ComponentNode[]
  ).filter((c) => c.parent?.type !== 'COMPONENT_SET');

  for (const set of componentSets) {
    const uuid = getOrCreateUUID(set);
    const refs = new Set<string>();
    await collectTokenRefs(set, refs, styleCache, varCache);
    entries.push({
      uuid,
      name: set.name,
      figmaNodeId: set.id,
      figmaFileKey: fileKey,
      figmaUrl: buildFigmaUrl(fileKey, set.id),
      category: inferCategory(set),
      description: set.description ?? '',
      props: parseProps(set),
      tokenRefs: Array.from(refs),
      codeRef: null,
      status: 'new',
      lastSyncedAt: now,
    });
  }

  for (const comp of standaloneComponents) {
    const uuid = getOrCreateUUID(comp);
    const refs = new Set<string>();
    await collectTokenRefs(comp, refs, styleCache, varCache);
    entries.push({
      uuid,
      name: comp.name,
      figmaNodeId: comp.id,
      figmaFileKey: fileKey,
      figmaUrl: buildFigmaUrl(fileKey, comp.id),
      category: inferCategory(comp),
      description: comp.description ?? '',
      props: [],
      tokenRefs: Array.from(refs),
      codeRef: null,
      status: 'new',
      lastSyncedAt: now,
    });
  }

  return entries;
}
