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

export interface PlanText {
  type: 'text';
  content: string;
  fontSize: number;
  fontWeight: number;
  color: ColorRef;
}

export interface PlanBox {
  type: 'box';
  layout: 'row' | 'column';
  padding: [number, number, number, number];
  radius: number;
  fill: ColorRef | null;
  stroke: ColorRef | null;
  children: PlanNode[];
}

export type PlanNode = PlanBox | PlanText;

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
    if (c && typeof c === 'object' && (c as Record<string, unknown>).type === 'text') {
      const t = c as Record<string, unknown>;
      const color = parseColorRef(t.color);
      if (typeof t.content === 'string' && color) {
        children.push({
          type: 'text',
          content: t.content,
          fontSize: typeof t.fontSize === 'number' ? t.fontSize : 14,
          fontWeight: typeof t.fontWeight === 'number' ? t.fontWeight : 400,
          color,
        });
      }
    } else {
      const nested = parsePlan(c);
      if (nested) children.push(nested);
    }
  }
  return {
    type: 'box',
    layout: r.layout === 'column' ? 'column' : 'row',
    padding: pad,
    radius: typeof r.radius === 'number' ? r.radius : 0,
    fill: parseColorRef(r.fill),
    stroke: parseColorRef(r.stroke),
    children,
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
