// Generischer Bauplan-Renderer: PlanBox → FrameNode. Kennt keine Komponenten-Namen.
import { hexToRgb, PlanBox, PlanNode, ColorRef } from './parsePayload';
import { nearestWeightStyle } from './applyImport';
import type { SectionFrames } from './buildComponents';

const STYLE_PREFIX = 'DesignBridge/Color/';

function solidPaint(ref: ColorRef): SolidPaint {
  return { type: 'SOLID', color: hexToRgb(ref.hex) };
}

/** Fill setzen: verknüpfter Style wenn Token bekannt, sonst Hex. */
async function applyFill(
  node: FrameNode | TextNode,
  ref: ColorRef,
  paintByName: Map<string, PaintStyle>
): Promise<void> {
  const style = ref.token ? paintByName.get(STYLE_PREFIX + ref.token) : undefined;
  if (style) {
    await node.setFillStyleIdAsync(style.id);
    return;
  }
  node.fills = [solidPaint(ref)];
}

async function renderText(
  el: Extract<PlanNode, { type: 'text' }>,
  paintByName: Map<string, PaintStyle>,
  warnings: string[]
): Promise<TextNode> {
  const t = figma.createText();
  const styleName = nearestWeightStyle(el.fontWeight);
  try {
    await figma.loadFontAsync({ family: 'Inter', style: styleName });
    t.fontName = { family: 'Inter', style: styleName };
  } catch {
    await figma.loadFontAsync({ family: 'Inter', style: 'Regular' });
    t.fontName = { family: 'Inter', style: 'Regular' };
    warnings.push(`Schrift Inter ${styleName} nicht ladbar — Regular verwendet.`);
  }
  t.characters = el.content;
  t.fontSize = el.fontSize;
  t.textAlignHorizontal = el.align === 'center' ? 'CENTER' : el.align === 'right' ? 'RIGHT' : 'LEFT';
  if (el.lineHeight !== null) {
    t.lineHeight = { value: el.lineHeight, unit: 'PIXELS' };
  }
  await applyFill(t, el.color, paintByName);
  return t;
}

/** SVG-Markup zu editierbaren Vektor-Nodes. Wirft createNodeFromSvg (kaputtes Markup),
 *  fällt es auf einen Hinweis-Frame zurück statt den ganzen Elternbaum zu sprengen. */
async function renderSvg(
  el: Extract<PlanNode, { type: 'svg' }>,
  warnings: string[]
): Promise<SceneNode> {
  try {
    return figma.createNodeFromSvg(el.markup);
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    warnings.push(`SVG nicht renderbar: ${reason}`);
    return renderNotice(`SVG nicht renderbar: ${reason}`);
  }
}

/** Kleiner gestrichelter Hinweis-Frame für Fehlerfälle (SVG-Fehler, fehlende Komponente ohne fallback). */
async function renderNotice(message: string): Promise<FrameNode> {
  const frame = figma.createFrame();
  try {
    frame.layoutMode = 'VERTICAL';
    frame.primaryAxisSizingMode = 'AUTO';
    frame.counterAxisSizingMode = 'AUTO';
    frame.paddingTop = 8; frame.paddingRight = 8; frame.paddingBottom = 8; frame.paddingLeft = 8;
    frame.cornerRadius = 4;
    frame.fills = [{ type: 'SOLID', color: { r: 0.97, g: 0.98, b: 0.98 } }];
    frame.strokes = [{ type: 'SOLID', color: { r: 0.8, g: 0.83, b: 0.85 } }];
    frame.strokeWeight = 1;
    frame.dashPattern = [4, 4];
    const t = figma.createText();
    try {
      await figma.loadFontAsync({ family: 'Inter', style: 'Regular' });
      t.fontName = { family: 'Inter', style: 'Regular' };
    } catch {
      // Regular ist die Fallback-Style selbst — wenn das schon nicht lädt, bleibt der Text ungestylt.
    }
    t.characters = message;
    t.fontSize = 11;
    frame.appendChild(t);
    return frame;
  } catch (err) {
    try {
      frame.remove();
    } catch {
      // remove kann selbst werfen — bewusst ignorieren.
    }
    throw err;
  }
}

/** Component/ComponentSet gleichen Namens auf der DesignBridge-Seite finden.
 *  Exakt das Naming, das buildComponents.ts vergibt: comp.name auf Section-Ebene,
 *  `Variant=${v.name}` für Kinder eines Component Sets. */
function findComponentByName(
  sections: SectionFrames,
  name: string
): ComponentNode | ComponentSetNode | undefined {
  for (const key of ['atomic', 'component', 'pattern'] as const) {
    const found = sections[key].children.find((c) => c.name === name);
    if (found && (found.type === 'COMPONENT' || found.type === 'COMPONENT_SET')) {
      return found as ComponentNode | ComponentSetNode;
    }
  }
  return undefined;
}

/** component-ref → echte Instanz. Nicht gefunden → fallback-Plan rendern (oder Platzhalter-Hinweis) + warning.
 *  Variante nicht gefunden → Default-Variante des Sets + warning. */
async function renderComponentRef(
  el: Extract<PlanNode, { type: 'component-ref' }>,
  paintByName: Map<string, PaintStyle>,
  warnings: string[],
  sections: SectionFrames
): Promise<SceneNode> {
  const found = findComponentByName(sections, el.name);
  if (!found) {
    warnings.push(`Komponente „${el.name}" nicht gefunden — Fallback gerendert.`);
    if (el.fallback) return renderPlan(el.fallback, paintByName, warnings, sections);
    return renderNotice(`Komponente „${el.name}" nicht gefunden`);
  }
  if (found.type === 'COMPONENT') {
    return found.createInstance();
  }
  const variantName = el.variant !== null ? `Variant=${el.variant}` : null;
  const match = variantName
    ? (found.children.find((c) => c.name === variantName) as ComponentNode | undefined)
    : undefined;
  if (match) return match.createInstance();
  if (el.variant !== null) {
    warnings.push(`Variante „${el.variant}" von „${el.name}" nicht gefunden — Standardvariante verwendet.`);
  }
  return found.defaultVariant.createInstance();
}

async function renderNode(
  el: PlanNode,
  paintByName: Map<string, PaintStyle>,
  warnings: string[],
  sections: SectionFrames
): Promise<SceneNode> {
  switch (el.type) {
    case 'text':
      return renderText(el, paintByName, warnings);
    case 'svg':
      return renderSvg(el, warnings);
    case 'component-ref':
      return renderComponentRef(el, paintByName, warnings, sections);
    case 'box':
      return renderPlan(el, paintByName, warnings, sections);
  }
}

export async function renderPlan(
  plan: PlanBox,
  paintByName: Map<string, PaintStyle>,
  warnings: string[],
  sections: SectionFrames
): Promise<FrameNode> {
  const frame = figma.createFrame();
  try {
    frame.layoutMode = plan.layout === 'column' ? 'VERTICAL' : 'HORIZONTAL';
    frame.primaryAxisSizingMode = 'AUTO';
    frame.counterAxisSizingMode = 'AUTO';
    frame.primaryAxisAlignItems = plan.primaryAlign;
    frame.counterAxisAlignItems = plan.counterAlign;
    frame.itemSpacing = plan.gap;
    const [pt, pr, pb, pl] = plan.padding;
    frame.paddingTop = pt; frame.paddingRight = pr; frame.paddingBottom = pb; frame.paddingLeft = pl;
    frame.cornerRadius = plan.radius;
    frame.fills = [];
    if (plan.fill) await applyFill(frame, plan.fill, paintByName);
    if (plan.stroke) {
      frame.strokes = [solidPaint(plan.stroke)];
      frame.strokeWeight = plan.strokeWeight;
    }
    for (const child of plan.children) {
      const node = await renderNode(child, paintByName, warnings, sections);
      frame.appendChild(node);
    }
    // Fixe Größen erst NACH layoutMode + Kindern anwenden: erst die betroffene Achse
    // (primary vs. counter, abhängig von row/column) auf FIXED umstellen, dann resizen.
    // Die jeweils andere, weiterhin AUTO-Achse liefert über frame.width/height den
    // aktuell gehuggten Wert, der beim resize()-Aufruf durchgereicht wird (bleibt HUG).
    if (plan.width !== null || plan.height !== null) {
      if (plan.layout === 'row') {
        if (plan.width !== null) frame.primaryAxisSizingMode = 'FIXED';
        if (plan.height !== null) frame.counterAxisSizingMode = 'FIXED';
      } else {
        if (plan.height !== null) frame.primaryAxisSizingMode = 'FIXED';
        if (plan.width !== null) frame.counterAxisSizingMode = 'FIXED';
      }
      frame.resize(plan.width ?? frame.width, plan.height ?? frame.height);
    }
    return frame;
  } catch (err) {
    // Waise vermeiden: bereits erzeugten Frame (samt Kindern) abräumen, dann re-throwen.
    // Jede Rekursionsebene räumt so ihren eigenen Frame ab; buildComponents protokolliert weiter in skipped.
    try {
      frame.remove();
    } catch {
      // remove kann selbst werfen (z. B. Node bereits entfernt) — bewusst ignorieren.
    }
    throw err;
  }
}
