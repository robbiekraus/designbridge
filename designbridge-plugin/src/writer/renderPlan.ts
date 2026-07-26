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
  // 'catalog' zuerst: dort liegen die DS-Komponenten (`DS/…`, Spec 2026-07-25-katalog-als-figma-
  // library-design.md). Der Namespace macht Kollisionen mit gescannten Bausteinen unmöglich, die
  // Reihenfolge ist also nur Kosmetik — kürzester Weg für den häufigsten Fall.
  for (const key of ['catalog', 'atom', 'molecule', 'organism', 'template'] as const) {
    // Defensiv: eine fehlende Sektion (z. B. Aufrufer aus einem älteren Pfad) darf nicht den
    // kompletten Import mit einem TypeError abbrechen — dann findet der Ref eben nichts.
    const section = sections[key];
    if (!section?.children) continue;
    const found = section.children.find((c) => c.name === name);
    if (found && (found.type === 'COMPONENT' || found.type === 'COMPONENT_SET')) {
      return found as ComponentNode | ComponentSetNode;
    }
  }
  return undefined;
}

/** Instanz-Anpassungen der DS-Library (Spec 2026-07-25-katalog-als-figma-library-design.md
 *  §Entscheidung 1/3): `scale` → rescale (die Library liegt bei 1×, der Baustein ist skaliert),
 *  `overrideText` → erster TEXT-Node der Instanz (die Komponente trägt nur den Katalog-Platzhalter).
 *  Liefert false, wenn ein gesetzter overrideText NICHT untergebracht werden kann — dann ist die
 *  Instanz irreführend (sie zeigte „Button" statt „Details") und der Aufrufer nimmt den Fallback.
 *  Wirft nur, was die Figma-API wirft; der Aufrufer fängt das. */
async function applyInstanceOverrides(
  instance: InstanceNode,
  el: Extract<PlanNode, { type: 'component-ref' }>
): Promise<boolean> {
  if (typeof el.scale === 'number' && el.scale > 0 && el.scale !== 1) {
    instance.rescale(el.scale);
  }
  if (el.overrideText === undefined) return true;

  const target = instance.findAll((n) => n.type === 'TEXT')[0] as TextNode | undefined;
  if (!target) return false;
  const font = target.fontName;
  // Zeichen setzen geht nur mit geladener Schrift. Gemischte Schriften (figma.mixed) kommen aus
  // unseren Katalog-Plänen nie vor — defensiv trotzdem nicht laden, dann wirft characters= und der
  // Aufrufer fällt auf den Fallback zurück.
  if (font && typeof font === 'object' && 'family' in font) {
    await figma.loadFontAsync(font as FontName);
  }
  target.characters = el.overrideText;
  return true;
}

/** Instanz erzeugen und anpassen. Scheitert die Anpassung, wird die Instanz wieder entfernt und
 *  null geliefert — der Aufrufer rendert dann den Fallback (= das Bild, das ohne DS-Library
 *  entstünde). Kein halb angepasstes Objekt bleibt liegen. */
async function instantiate(
  component: ComponentNode,
  el: Extract<PlanNode, { type: 'component-ref' }>,
  warnings: string[]
): Promise<SceneNode | null> {
  const instance = component.createInstance();
  try {
    if (await applyInstanceOverrides(instance, el)) return instance;
    warnings.push(`Instanz „${el.name}" hat keinen Textknoten für „${el.overrideText}" — Fallback gerendert.`);
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    warnings.push(`Instanz „${el.name}" nicht anpassbar (${reason}) — Fallback gerendert.`);
  }
  try { instance.remove(); } catch { /* bereits entfernt */ }
  return null;
}

/** component-ref → echte Instanz. Nicht gefunden → fallback-Plan rendern (oder Platzhalter-Hinweis) + warning.
 *  Variante nicht gefunden → Default-Variante des Sets + warning. */
async function renderComponentRef(
  el: Extract<PlanNode, { type: 'component-ref' }>,
  paintByName: Map<string, PaintStyle>,
  warnings: string[],
  sections: SectionFrames
): Promise<SceneNode> {
  const renderFallback = (): Promise<SceneNode> =>
    el.fallback
      ? renderPlan(el.fallback, paintByName, warnings, sections)
      : renderNotice(`Komponente „${el.name}" nicht gefunden`);

  const found = findComponentByName(sections, el.name);
  if (!found) {
    warnings.push(`Komponente „${el.name}" nicht gefunden — Fallback gerendert.`);
    return renderFallback();
  }
  if (found.type === 'COMPONENT') {
    return (await instantiate(found, el, warnings)) ?? renderFallback();
  }
  // Zwei Namensschemata, eine Stelle: gescannte Bausteine sind Sets mit EINER Achse
  // (`Variant=<name>`, buildComponents.ts), DS-Einträge tragen echte Figma-Varianten-Properties
  // (`variant=secondary, size=lg`, buildCatalog.ts) und werden per rohem Namen gematcht.
  const match = el.variant !== null
    ? (found.children.find((c) => c.name === `Variant=${el.variant}` || c.name === el.variant) as ComponentNode | undefined)
    : undefined;
  if (match) return (await instantiate(match, el, warnings)) ?? renderFallback();
  if (el.variant !== null) {
    warnings.push(`Variante „${el.variant}" von „${el.name}" nicht gefunden — Standardvariante verwendet.`);
  }
  return (await instantiate(found.defaultVariant, el, warnings)) ?? renderFallback();
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

/** Der Slot-Rahmen der v3-Flow-Box (htmlToPlan: eine Box in Slot-Größe, die die gesplicte Instanz
 *  als EINZIGES, absolut positioniertes Kind bei (0,0) enthält — sie hält den Fluss-Platz für die
 *  Geschwister) hat eine explizite Größe und clippt deshalb (Fix 6, s. u.). Bleibt die Instanz
 *  größer als der Slot — seit dem Hug-Schutz in applyAbsolute der Normalfall, wenn die
 *  Eltern-Interpretation die Region zu klein gemessen hat —, schnitte der Rahmen sie weg.
 *
 *  Dieselbe Entscheidung wie Fix A vom 18.07. auf der Web-Seite (htmlToPlan readSize): überragt
 *  der Inhalt seinen Rahmen, gewinnt der Inhalt, sonst verschwindet er im Import. Bewusst eng
 *  gefasst auf „genau ein Kind, absolut positioniert, größer als der Rahmen" — das ist die Form
 *  der Flow-Box und sonst nichts. Ein Organismus mit mehreren absoluten Kindern bleibt unberührt.
 *
 *  Nebenwirkung im Wachstumsfall: `resize()` setzt beide Achsen auf FIXED, eine bis dahin
 *  huggende Achse verliert also ihr HUG. Das ist hier richtig — ein absolut positioniertes Kind
 *  zählt in Figma nicht zur gehuggten Größe, eine HUG-Achse würde neben ihm auf 0 kollabieren. */
function growToFitLoneAbsoluteChild(frame: FrameNode, plan: Extract<PlanNode, { type: 'box' }>): void {
  if (plan.width === null && plan.height === null) return; // HUG-Box clippt ohnehin nicht
  if (frame.children.length !== 1) return;
  const only = frame.children[0] as SceneNode & { layoutPositioning?: 'AUTO' | 'ABSOLUTE' };
  if (only.layoutPositioning !== 'ABSOLUTE') return;
  const needW = only.x + only.width;
  const needH = only.y + only.height;
  if (needW <= frame.width && needH <= frame.height) return;
  frame.resize(Math.max(frame.width, needW), Math.max(frame.height, needH));
}

/** Welche Achsen eines Nodes ihre Größe aus dem Inhalt ziehen (Auto-Layout-Sizing 'AUTO').
 *  Ohne Auto-Layout ('NONE') oder auf einem Node ohne diese Felder: keine — beide Achsen fest. */
function hugAxes(node: SceneNode): { width: boolean; height: boolean } {
  const f = node as SceneNode & {
    layoutMode?: 'NONE' | 'HORIZONTAL' | 'VERTICAL';
    primaryAxisSizingMode?: 'AUTO' | 'FIXED';
    counterAxisSizingMode?: 'AUTO' | 'FIXED';
  };
  const primaryAuto = f.primaryAxisSizingMode === 'AUTO';
  const counterAuto = f.counterAxisSizingMode === 'AUTO';
  if (f.layoutMode === 'HORIZONTAL') return { width: primaryAuto, height: counterAuto };
  if (f.layoutMode === 'VERTICAL') return { width: counterAuto, height: primaryAuto };
  return { width: false, height: false };
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
  } else if (el.type === 'component-ref') {
    // Composition-Fidelity v2 (docs/superpowers/specs/2026-07-19-composition-fidelity-v2-
    // shrink-only-design.md): eine Instanz darf pro Achse verkleinert, aber nie über ihre
    // natürliche Größe (node.width/height NACH createInstance(), VOR resize()) hinaus
    // gestreckt werden — unabhängig interpretierte Bausteine haben unterschiedlichen
    // Maßstab, Strecken verzerrt/leert die Instanz.
    //
    // Nachschärfung 26.07.2026 (Befund in Robs Datei `UuoCS1lCmtRPfAE10Mjter`): Verkleinern ist
    // NUR auf einer Achse mit FESTER Größe harmlos. Hugged eine Achse ihren Inhalt (Auto-Layout
    // AUTO), dann IST die natürliche Größe die Inhaltsgröße — ein resize() macht daraus FIXED und
    // schneidet den Überstand ab. Gemessen: `Sidebar Navigation` kam als 392×325 an, während ihr
    // Inhalt bis y+1325 läuft (in der Organismen-Sektion steht dieselbe Sidebar mit 392×1379 da);
    // die Chart-Karte als 1087×67 bei 1253×731 Inhalt. Der Slot stammt aus der EIGENEN
    // Interpretation des Elternteils — eine unabhängige Messung derselben Bildregion, die bei
    // Robs Scan um Faktor 4,2 bzw. 10,9 danebenlag. v2 hat Verkleinern an Karten belegt, wo Slot
    // und natürliche Größe eng beieinander liegen (Fixture-Messung 26.07.: Faktor 0,76–1,16) —
    // dieser Fall bleibt unverändert.
    const resizable = node as SceneNode & { resize(w: number, h: number): void };
    const hug = hugAxes(node);
    const w = hug.width ? node.width : Math.min(node.width, abs.width);
    const h = hug.height ? node.height : Math.min(node.height, abs.height);
    resizable.resize(w, h);
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
    growToFitLoneAbsoluteChild(frame, plan);
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
