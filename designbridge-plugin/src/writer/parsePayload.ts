// Pure parsing/validation for the DesignBridge → Figma import payload.
// No `figma` global here so it stays unit-testable.

export interface ImportColor {
  name: string;
  hex: string;
}

export interface ImportText {
  name: string;
  fontSize?: number;
  fontWeight?: number;
}

export interface ColorRef {
  token: string | null;
  hex: string;
}

export type PlanTextAlign = 'left' | 'center' | 'right';

/** Plan-Fidelity-Scheibe A (docs/superpowers/specs/2026-07-17-plan-fidelity-design.md):
 *  CSS position:absolute/fixed-Entsprechung, relativ zum direkten Parent, in px.
 *  PINNED zwischen Web (htmlToPlan) und Plugin — nicht abweichen/erweitern. */
export interface AbsoluteRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface PlanText {
  type: 'text';
  content: string;
  fontSize: number;
  fontWeight: number;
  color: ColorRef;
  align: PlanTextAlign;
  lineHeight: number | null;
  absolute?: AbsoluteRect | null;
}

export type PlanPrimaryAlign = 'MIN' | 'CENTER' | 'MAX' | 'SPACE_BETWEEN';
export type PlanCounterAlign = 'MIN' | 'CENTER' | 'MAX';

export interface PlanBox {
  type: 'box';
  layout: 'row' | 'column';
  padding: [number, number, number, number];
  radius: number;
  fill: ColorRef | null;
  stroke: ColorRef | null;
  children: PlanNode[];
  width: number | null;
  height: number | null;
  gap: number;
  strokeWeight: number;
  primaryAlign: PlanPrimaryAlign;
  counterAlign: PlanCounterAlign;
  absolute?: AbsoluteRect | null;
}

export interface PlanSvg {
  type: 'svg';
  markup: string;
  absolute?: AbsoluteRect | null;
}

export interface PlanRef {
  type: 'component-ref';
  name: string;
  variant: string | null;
  fallback: PlanBox | null;
  absolute?: AbsoluteRect | null;
}

export type PlanNode = PlanBox | PlanText | PlanSvg | PlanRef;

export interface ImportVariant {
  name: string;
  plan: PlanBox | null;
}

export interface ImportComponent {
  name: string;
  kind: 'atomic' | 'component' | 'pattern';
  confidence: string | null;
  source: string | null;
  notes: string | null;
  placeholder: boolean;
  variants: ImportVariant[];
}

export interface ImportPayload {
  colors: ImportColor[];
  text: ImportText[];
  components: ImportComponent[];
}

export interface RGB {
  r: number;
  g: number;
  b: number;
}

/** Convert a #rrggbb or #rgb hex string to Figma's 0..1 RGB. Throws on invalid input. */
export function hexToRgb(hex: string): RGB {
  const raw = hex.trim().replace(/^#/, '');
  let full: string;
  if (/^[0-9a-fA-F]{6}$/.test(raw)) {
    full = raw;
  } else if (/^[0-9a-fA-F]{3}$/.test(raw)) {
    full = raw[0] + raw[0] + raw[1] + raw[1] + raw[2] + raw[2];
  } else {
    throw new Error(`Ungültige Farbe: ${hex}`);
  }
  return {
    r: parseInt(full.slice(0, 2), 16) / 255,
    g: parseInt(full.slice(2, 4), 16) / 255,
    b: parseInt(full.slice(4, 6), 16) / 255,
  };
}

function parseColorRef(v: unknown): ColorRef | null {
  if (!v || typeof v !== 'object') return null;
  const r = v as Record<string, unknown>;
  if (typeof r.hex !== 'string' || !r.hex) return null;
  return { token: typeof r.token === 'string' ? r.token : null, hex: r.hex };
}

const TEXT_ALIGNS = ['left', 'center', 'right'] as const;
const PRIMARY_ALIGNS = ['MIN', 'CENTER', 'MAX', 'SPACE_BETWEEN'] as const;
const COUNTER_ALIGNS = ['MIN', 'CENTER', 'MAX'] as const;

/** number|null-Feld validieren: gültige Zahl → durchreichen, alles andere (fehlend, falscher Typ) → null (HUG/AUTO). */
function parseNullableNumber(v: unknown): number | null {
  return typeof v === 'number' ? v : null;
}

/** absolute-Feld validieren (Plan-Fidelity-Scheibe A): nur übernehmen, wenn alle 4 Werte
 *  endliche Zahlen sind — sonst null (defensiv, kaputte/fehlende Werte dürfen den Node nicht
 *  invalidieren, nur die absolute Positionierung entfällt). */
function parseAbsolute(v: unknown): AbsoluteRect | null {
  if (!v || typeof v !== 'object') return null;
  const r = v as Record<string, unknown>;
  const { x, y, width, height } = r;
  if (
    typeof x === 'number' && Number.isFinite(x) &&
    typeof y === 'number' && Number.isFinite(y) &&
    typeof width === 'number' && Number.isFinite(width) &&
    typeof height === 'number' && Number.isFinite(height)
  ) {
    return { x, y, width, height };
  }
  return null;
}

/** svg-Node validieren: markup muss ein String sein und wie SVG-Markup aussehen. */
function parseSvgNode(r: Record<string, unknown>): PlanSvg | null {
  if (typeof r.markup !== 'string') return null;
  if (!r.markup.trim().startsWith('<svg')) return null;
  return { type: 'svg', markup: r.markup, absolute: parseAbsolute(r.absolute) };
}

/** component-ref-Node validieren: name Pflicht, variant optional, fallback rekursiv über den Box-Parser. */
function parseRefNode(r: Record<string, unknown>): PlanRef | null {
  if (typeof r.name !== 'string' || !r.name) return null;
  return {
    type: 'component-ref',
    name: r.name,
    variant: typeof r.variant === 'string' ? r.variant : null,
    fallback: parsePlan(r.fallback),
    absolute: parseAbsolute(r.absolute),
  };
}

/** Ein einzelnes Kind-Node validieren — dispatcht auf text/svg/component-ref/box. Ungültig → null (Node wird übersprungen). */
function parsePlanNode(c: unknown): PlanNode | null {
  if (!c || typeof c !== 'object') return null;
  const r = c as Record<string, unknown>;
  if (r.type === 'text') {
    const color = parseColorRef(r.color);
    if (typeof r.content !== 'string' || !color) return null;
    return {
      type: 'text',
      content: r.content,
      fontSize: typeof r.fontSize === 'number' ? r.fontSize : 14,
      fontWeight: typeof r.fontWeight === 'number' ? r.fontWeight : 400,
      color,
      align: TEXT_ALIGNS.includes(r.align as (typeof TEXT_ALIGNS)[number]) ? (r.align as PlanTextAlign) : 'left',
      lineHeight: parseNullableNumber(r.lineHeight),
      absolute: parseAbsolute(r.absolute),
    };
  }
  if (r.type === 'svg') return parseSvgNode(r);
  if (r.type === 'component-ref') return parseRefNode(r);
  return parsePlan(c);
}

function parsePlan(v: unknown): PlanBox | null {
  if (!v || typeof v !== 'object') return null;
  const r = v as Record<string, unknown>;
  if (r.type !== 'box') return null;
  const pad =
    Array.isArray(r.padding) && r.padding.length === 4 && r.padding.every((n) => typeof n === 'number')
      ? (r.padding as [number, number, number, number])
      : ([0, 0, 0, 0] as [number, number, number, number]);
  const children: PlanNode[] = [];
  for (const c of Array.isArray(r.children) ? r.children : []) {
    const node = parsePlanNode(c);
    if (node) children.push(node);
  }
  return {
    type: 'box',
    layout: r.layout === 'column' ? 'column' : 'row',
    padding: pad,
    radius: typeof r.radius === 'number' ? r.radius : 0,
    fill: parseColorRef(r.fill),
    stroke: parseColorRef(r.stroke),
    children,
    width: parseNullableNumber(r.width),
    height: parseNullableNumber(r.height),
    gap: typeof r.gap === 'number' ? r.gap : 0,
    strokeWeight: typeof r.strokeWeight === 'number' ? r.strokeWeight : 1,
    primaryAlign: PRIMARY_ALIGNS.includes(r.primaryAlign as (typeof PRIMARY_ALIGNS)[number])
      ? (r.primaryAlign as PlanPrimaryAlign)
      : 'MIN',
    counterAlign: COUNTER_ALIGNS.includes(r.counterAlign as (typeof COUNTER_ALIGNS)[number])
      ? (r.counterAlign as PlanCounterAlign)
      : 'CENTER',
    absolute: parseAbsolute(r.absolute),
  };
}

const KINDS = ['atomic', 'component', 'pattern'] as const;

function parseComponents(raw: unknown): ImportComponent[] {
  const out: ImportComponent[] = [];
  for (const c of Array.isArray(raw) ? raw : []) {
    if (!c || typeof c !== 'object') continue;
    const r = c as Record<string, unknown>;
    if (typeof r.name !== 'string' || !r.name) continue;
    const kind = KINDS.includes(r.kind as (typeof KINDS)[number]) ? (r.kind as ImportComponent['kind']) : 'component';
    const variants: ImportVariant[] = [];
    for (const v of Array.isArray(r.variants) ? r.variants : []) {
      if (!v || typeof v !== 'object') continue;
      const vr = v as Record<string, unknown>;
      if (typeof vr.name !== 'string' || !vr.name) continue;
      variants.push({ name: vr.name, plan: parsePlan(vr.plan) });
    }
    out.push({
      name: r.name,
      kind,
      confidence: typeof r.confidence === 'string' ? r.confidence : null,
      source: typeof r.source === 'string' ? r.source : null,
      notes: typeof r.notes === 'string' ? r.notes : null,
      placeholder: r.placeholder === true,
      variants,
    });
  }
  return out;
}

/** Parse and validate the pasted JSON. Throws readable German errors. */
export function parseImportPayload(json: string): ImportPayload {
  let data: unknown;
  try {
    data = JSON.parse(json);
  } catch {
    throw new Error('Kein gültiges JSON — bitte den kompletten DesignBridge-Export einfügen.');
  }
  if (!data || typeof data !== 'object') {
    throw new Error('Leeres oder ungültiges JSON.');
  }
  const obj = data as Record<string, unknown>;
  if (obj.designbridge !== 'figma-import') {
    throw new Error('Das ist kein DesignBridge-Figma-Export (Feld „designbridge" fehlt).');
  }

  const colors: ImportColor[] = [];
  const colorsRaw = Array.isArray(obj.colors) ? obj.colors : [];
  for (const c of colorsRaw) {
    if (c && typeof c === 'object') {
      const rec = c as Record<string, unknown>;
      const name = typeof rec.name === 'string' ? rec.name : '';
      const hex = typeof rec.hex === 'string' ? rec.hex : '';
      if (name && hex) colors.push({ name, hex });
    }
  }

  const text: ImportText[] = [];
  const textRaw = Array.isArray(obj.text) ? obj.text : [];
  for (const t of textRaw) {
    if (t && typeof t === 'object') {
      const rec = t as Record<string, unknown>;
      const name = typeof rec.name === 'string' ? rec.name : '';
      if (!name) continue;
      const entry: ImportText = { name };
      if (typeof rec.fontSize === 'number') entry.fontSize = rec.fontSize;
      if (typeof rec.fontWeight === 'number') entry.fontWeight = rec.fontWeight;
      text.push(entry);
    }
  }

  const components = parseComponents(obj.components);

  if (colors.length === 0 && text.length === 0 && components.length === 0) {
    throw new Error('Keine Farben, Textstile oder Komponenten im Export gefunden.');
  }

  return { colors, text, components };
}
