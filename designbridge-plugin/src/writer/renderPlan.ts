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

/** Plan-Fidelity-Scheibe A (docs/superpowers/specs/2026-07-17-plan-fidelity-design.md):
 *  positioniert ein bereits eingehängtes Kind absolut innerhalb seines Auto-Layout-Parents.
 *  MUSS erst NACH frame.appendChild(node) aufgerufen werden — layoutPositioning='ABSOLUTE' auf
 *  einem Node, der noch nicht Kind eines Auto-Layout-Frames ist, wirft in der Figma-API.
 *  box/svg/component-ref: feste Größe per resize(). text: nur Höhe automatisch (textAutoResize
 *  'HEIGHT'), Breite wird nur fixiert, wenn absolute.width > 0 (0 würde eine leere/kollabierte
 *  Textbox erzwingen). */
/** Pattern-Fidelity-Scheibe „Stretch & Grow" (docs/superpowers/specs/2026-07-18-pattern-fidelity-stretch-grow-design.md):
 *  Achsen-Bestimmtheit EINES Frames — sagt aus, ob dessen width/height für Kinder als
 *  „bestimmte Gegen-/Primärachse" zählen (Voraussetzung für STRETCH/GROW, s. u.). */
export interface Determinacy {
  widthDeterminate: boolean;
  heightDeterminate: boolean;
}

/** Entscheidet für EIN Kind, ob stretch/grow angewendet werden (reine Plan-Logik, unabhängig
 *  vom gerenderten Node — deshalb schon vor dem eigentlichen Rendern des Kindes aufrufbar).
 *  Reihenfolge/Vorrang laut Spec:
 *  - `absolute` gewinnt immer (kein stretch/grow).
 *  - svg bekommt NIE stretch/grow (skaliert nicht mit, s. Spec „Bewusste Grenzen").
 *  - stretch braucht eine bestimmte GEGENachse des Parents, grow eine bestimmte PRIMÄRachse
 *    (Guard: HUG-Achse → kein Stretch/Grow, heutiges Verhalten bleibt Fallback).
 *  - Text-Sonderregel: Text-Stretch in row-Parents (würde die Höhe füllen) wird NICHT
 *    angewendet — Text-Stretch ist nur für column-Parents (Breite füllen) sinnvoll. */
function decideStretchGrow(
  child: PlanNode,
  parentLayout: 'row' | 'column',
  counterDeterminate: boolean,
  primaryDeterminate: boolean
): { appliedStretch: boolean; appliedGrow: boolean } {
  if (child.absolute || child.type === 'svg') {
    return { appliedStretch: false, appliedGrow: false };
  }
  const isText = child.type === 'text';
  const appliedStretch = child.stretch === true && counterDeterminate && !(isText && parentLayout === 'row');
  const appliedGrow = child.grow === true && primaryDeterminate;
  return { appliedStretch, appliedGrow };
}

/** Wendet eine bereits getroffene stretch/grow-Entscheidung auf den eingehängten Node an.
 *  MUSS nach appendChild passieren (Auto-Layout-Property, gleiche Reihenfolge-Regel wie
 *  applyAbsolute — layoutAlign/layoutGrow auf einem noch nicht eingehängten Kind ist
 *  undefiniert/wirft). Text-Sonderregeln (Spec §Plugin): Text-Stretch (nur column-Parents,
 *  s. decideStretchGrow) UND Text-Grow (row-Parents) fixieren die Breite extern und setzen
 *  daher textAutoResize='HEIGHT' (Höhe wächst weiter automatisch). */
function applyStretchGrow(
  node: SceneNode,
  child: PlanNode,
  parentLayout: 'row' | 'column',
  decision: { appliedStretch: boolean; appliedGrow: boolean }
): void {
  const isText = child.type === 'text';
  const alignable = node as SceneNode & {
    layoutAlign?: 'MIN' | 'CENTER' | 'MAX' | 'STRETCH' | 'INHERIT';
    layoutGrow?: number;
  };
  if (decision.appliedStretch) {
    alignable.layoutAlign = 'STRETCH';
    if (isText && parentLayout === 'column') {
      (node as TextNode).textAutoResize = 'HEIGHT';
    }
  }
  if (decision.appliedGrow) {
    alignable.layoutGrow = 1;
    if (isText && parentLayout === 'row') {
      (node as TextNode).textAutoResize = 'HEIGHT';
    }
  }
}

/** Achsen-Bestimmtheit fürs Kind berechnen — wird nur für Box-Kinder tatsächlich weitergereicht
 *  (an den rekursiven renderPlan-Aufruf, s. renderNode), bei anderen Node-Typen folgenlos.
 *  Vertrag (Spec §Plugin „Bestimmtheit für die Rekursion"): eine Achse ist bestimmt, wenn das
 *  Kind sie selbst explizit setzt (width/height !== null), ODER `absolute` (wird resized),
 *  ODER sie über angewendetes stretch/grow vom (bestimmten) Parent kommt. Welche physische
 *  Achse (Breite/Höhe) stretch (Gegenachse) bzw. grow (Primärachse) jeweils betrifft, hängt
 *  vom Parent-`layout` ab. */
function childDeterminacy(
  child: PlanNode,
  parentLayout: 'row' | 'column',
  appliedStretch: boolean,
  appliedGrow: boolean
): Determinacy {
  const explicitWidth = child.type === 'box' && child.width !== null;
  const explicitHeight = child.type === 'box' && child.height !== null;
  const abs = !!child.absolute;
  const stretchGivesWidth = parentLayout === 'column' && appliedStretch;
  const stretchGivesHeight = parentLayout === 'row' && appliedStretch;
  const growGivesWidth = parentLayout === 'row' && appliedGrow;
  const growGivesHeight = parentLayout === 'column' && appliedGrow;
  return {
    widthDeterminate: explicitWidth || abs || stretchGivesWidth || growGivesWidth,
    heightDeterminate: explicitHeight || abs || stretchGivesHeight || growGivesHeight,
  };
}

function applyAbsolute(node: SceneNode, el: PlanNode): void {
  const abs = el.absolute;
  if (!abs) return;
  const positioned = node as SceneNode & { layoutPositioning: 'AUTO' | 'ABSOLUTE'; x: number; y: number };
  positioned.layoutPositioning = 'ABSOLUTE';
  positioned.x = abs.x;
  positioned.y = abs.y;
  if (el.type === 'text') {
    const t = node as TextNode;
    t.textAutoResize = 'HEIGHT';
    if (abs.width > 0) t.resize(abs.width, t.height);
  } else {
    (node as SceneNode & { resize(w: number, h: number): void }).resize(abs.width, abs.height);
  }
}

async function renderNode(
  el: PlanNode,
  paintByName: Map<string, PaintStyle>,
  warnings: string[],
  sections: SectionFrames,
  determinacy?: Determinacy
): Promise<SceneNode> {
  switch (el.type) {
    case 'text':
      return renderText(el, paintByName, warnings);
    case 'svg':
      return renderSvg(el, warnings);
    case 'component-ref':
      return renderComponentRef(el, paintByName, warnings, sections);
    case 'box':
      // Nur Box-Kinder rekursieren über renderPlan — die Achsen-Bestimmtheit wird deshalb
      // nur hier weitergereicht (Spec §Plugin „renderNode reicht sie an Box-Kinder weiter").
      return renderPlan(el, paintByName, warnings, sections, determinacy);
  }
}

export async function renderPlan(
  plan: PlanBox,
  paintByName: Map<string, PaintStyle>,
  warnings: string[],
  sections: SectionFrames,
  determinacy?: Determinacy
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
    // Achsen-Bestimmtheit DIESES Frames (Stretch & Grow, 2026-07-18): ohne explizit
    // durchgereichten Parameter (Wurzel-Aufruf, z. B. buildComponents.ts) aus dem eigenen
    // plan.width/height abgeleitet — exakt der Vertrag „Wurzel-Aufruf: aus plan.width/height
    // !== null". Rekursive Aufrufe (Box-Kinder, s. renderNode) reichen den bereits kombinierten
    // Wert (explizit ODER von einem bestimmten Parent geerbt) explizit durch.
    const own: Determinacy = determinacy ?? {
      widthDeterminate: plan.width !== null,
      heightDeterminate: plan.height !== null,
    };
    const counterDeterminate = plan.layout === 'row' ? own.heightDeterminate : own.widthDeterminate;
    const primaryDeterminate = plan.layout === 'row' ? own.widthDeterminate : own.heightDeterminate;
    for (const child of plan.children) {
      const decision = decideStretchGrow(child, plan.layout, counterDeterminate, primaryDeterminate);
      const nodeDeterminacy = childDeterminacy(child, plan.layout, decision.appliedStretch, decision.appliedGrow);
      const node = await renderNode(child, paintByName, warnings, sections, nodeDeterminacy);
      frame.appendChild(node);
      if (child.absolute) {
        applyAbsolute(node, child);
      } else {
        applyStretchGrow(node, child, plan.layout, decision);
      }
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
    // Fix 6 (Testrunde 6, Spec §Fix 6, Punkt 3): figma.createFrame() liefert clipsContent
    // DEFAULT true — ungesetzt clippt also JEDE Box, auch eine HUG-Box (plan.width/height beide
    // null), sobald ein Kind aus irgendeinem Grund über die gehuggte Größe hinausreicht (z. B.
    // durch eine der beiden Vorgängerursachen dieses Bugs: falsches layout:'row' auf einem
    // Block-Container, siehe htmlToPlan.js readLayout). Vertrag laut Spec: clipsContent nur bei
    // EXPLIZIT gesetzter Größe (dieselbe Bedingung wie oben für FIXED) — eine HUG-Box zeigt ihren
    // Inhalt immer vollständig.
    frame.clipsContent = plan.width !== null || plan.height !== null;
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
