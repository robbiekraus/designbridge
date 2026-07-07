// Baut aus ImportComponent[] echte Figma-Komponenten in die Sektions-Frames.
// Create-or-update per Name: bestehende Sets behalten ihre Identität.
import { ImportComponent } from './parsePayload';
import { renderPlan } from './renderPlan';

export interface BuildResult {
  created: number;
  updated: number;
  placeholders: number;
  skipped: string[];
}

export interface SectionFrames {
  atomic: FrameNode;
  component: FrameNode;
  pattern: FrameNode;
}

const BADGE_YELLOW: SolidPaint = { type: 'SOLID', color: { r: 1, g: 0.95, b: 0.75 } };
const BADGE_TEXT: SolidPaint = { type: 'SOLID', color: { r: 0.6, g: 0.45, b: 0.02 } };
const MUTED_TEXT: SolidPaint = { type: 'SOLID', color: { r: 0.4, g: 0.42, b: 0.45 } };

async function loadInter(style: string): Promise<FontName> {
  try {
    await figma.loadFontAsync({ family: 'Inter', style });
    return { family: 'Inter', style };
  } catch {
    await figma.loadFontAsync({ family: 'Inter', style: 'Regular' });
    return { family: 'Inter', style: 'Regular' };
  }
}

async function makeText(content: string, size: number, style: string, fill?: SolidPaint): Promise<TextNode> {
  const t = figma.createText();
  t.fontName = await loadInter(style);
  t.characters = content;
  t.fontSize = size;
  if (fill) t.fills = [fill];
  return t;
}

/** Platzhalter-Karte: Name, Varianten, Notizen, gelbes Badge. */
async function buildPlaceholderFrame(comp: ImportComponent): Promise<FrameNode> {
  const frame = figma.createFrame();
  frame.layoutMode = 'VERTICAL';
  frame.primaryAxisSizingMode = 'AUTO';
  frame.counterAxisSizingMode = 'AUTO';
  frame.itemSpacing = 6;
  frame.paddingTop = 12; frame.paddingRight = 12; frame.paddingBottom = 12; frame.paddingLeft = 12;
  frame.cornerRadius = 6;
  frame.fills = [{ type: 'SOLID', color: { r: 0.97, g: 0.98, b: 0.98 } }];
  frame.strokes = [{ type: 'SOLID', color: { r: 0.8, g: 0.83, b: 0.85 } }];
  frame.strokeWeight = 1;
  frame.dashPattern = [4, 4];

  frame.appendChild(await makeText(comp.name, 13, 'Semi Bold'));
  const variantNames = comp.variants.map((v) => v.name).join(', ') || 'default';
  frame.appendChild(await makeText(`Varianten: ${variantNames}`, 10, 'Regular', MUTED_TEXT));
  if (comp.notes) frame.appendChild(await makeText(`„${comp.notes}"`, 10, 'Regular', MUTED_TEXT));

  const badge = figma.createFrame();
  badge.layoutMode = 'HORIZONTAL';
  badge.primaryAxisSizingMode = 'AUTO';
  badge.counterAxisSizingMode = 'AUTO';
  badge.paddingTop = 2; badge.paddingRight = 6; badge.paddingBottom = 2; badge.paddingLeft = 6;
  badge.cornerRadius = 3;
  badge.fills = [BADGE_YELLOW];
  badge.appendChild(await makeText('Vorlage fehlt — Platzhalter', 9, 'Medium', BADGE_TEXT));
  frame.appendChild(badge);
  return frame;
}

function findByName(section: FrameNode, name: string): SceneNode | undefined {
  return section.children.find((c) => c.name === name);
}

export async function buildComponents(
  components: ImportComponent[],
  sections: SectionFrames,
  paintByName: Map<string, PaintStyle>
): Promise<BuildResult> {
  const result: BuildResult = { created: 0, updated: 0, placeholders: 0, skipped: [] };

  for (const comp of components) {
    const section = sections[comp.kind];
    try {
      if (comp.placeholder) {
        // ── Platzhalter: einzelne Komponente ──
        const frame = await buildPlaceholderFrame(comp);
        const fresh = figma.createComponentFromNode(frame);
        fresh.name = comp.name;
        const existing = findByName(section, comp.name);
        if (existing) {
          section.insertChild(section.children.indexOf(existing), fresh);
          existing.remove();
          result.updated += 1;
        } else {
          section.appendChild(fresh);
          result.created += 1;
        }
        result.placeholders += 1;
        continue;
      }

      // ── Template-Komponente: Component Set mit Varianten ──
      const variantComponents: ComponentNode[] = [];
      for (const v of comp.variants) {
        if (!v.plan) {
          result.skipped.push(`${comp.name}/${v.name}: ungültiger Bauplan`);
          continue;
        }
        const frame = await renderPlan(v.plan, paintByName, result.skipped);
        const c = figma.createComponentFromNode(frame);
        c.name = `Variant=${v.name}`;
        variantComponents.push(c);
      }
      if (variantComponents.length === 0) {
        result.skipped.push(`${comp.name}: keine gültigen Varianten`);
        continue;
      }

      const existing = findByName(section, comp.name);
      if (existing && existing.type === 'COMPONENT_SET') {
        // Update: neue Varianten in bestehendes Set, alte entfernen (Set-Identität bleibt)
        const old = [...existing.children];
        for (const c of variantComponents) existing.appendChild(c);
        for (const o of old) o.remove();
        result.updated += 1;
      } else {
        if (existing) existing.remove(); // Strukturwechsel (z. B. war Platzhalter)
        const set = figma.combineAsVariants(variantComponents, section);
        set.name = comp.name;
        result.created += 1;
      }
    } catch (err) {
      result.skipped.push(`${comp.name}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  return result;
}
