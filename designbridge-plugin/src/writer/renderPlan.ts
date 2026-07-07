// Generischer Bauplan-Renderer: PlanBox → FrameNode. Kennt keine Komponenten-Namen.
import { hexToRgb, PlanBox, PlanNode, ColorRef } from './parsePayload';
import { nearestWeightStyle } from './applyImport';

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
  await applyFill(t, el.color, paintByName);
  return t;
}

export async function renderPlan(
  plan: PlanBox,
  paintByName: Map<string, PaintStyle>,
  warnings: string[]
): Promise<FrameNode> {
  const frame = figma.createFrame();
  frame.layoutMode = plan.layout === 'column' ? 'VERTICAL' : 'HORIZONTAL';
  frame.primaryAxisSizingMode = 'AUTO';
  frame.counterAxisSizingMode = 'AUTO';
  frame.counterAxisAlignItems = 'CENTER';
  frame.itemSpacing = 8;
  const [pt, pr, pb, pl] = plan.padding;
  frame.paddingTop = pt; frame.paddingRight = pr; frame.paddingBottom = pb; frame.paddingLeft = pl;
  frame.cornerRadius = plan.radius;
  frame.fills = [];
  if (plan.fill) await applyFill(frame, plan.fill, paintByName);
  if (plan.stroke) {
    frame.strokes = [solidPaint(plan.stroke)];
    frame.strokeWeight = 1;
  }
  for (const child of plan.children) {
    const node = child.type === 'text'
      ? await renderText(child, paintByName, warnings)
      : await renderPlan(child, paintByName, warnings);
    frame.appendChild(node);
  }
  return frame;
}
