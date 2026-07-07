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

export interface ImportPayload {
  colors: ImportColor[];
  text: ImportText[];
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

  if (colors.length === 0 && text.length === 0) {
    throw new Error('Keine Farben oder Textstile im Export gefunden.');
  }

  return { colors, text };
}
