// Figma-runtime writer: turns a parsed import payload into local Paint & Text styles.
// Create-or-update by name so re-running does not duplicate.

import { hexToRgb, ImportPayload } from './parsePayload';
import type { ImportSummary } from '../types/manifest';

const FAMILY = 'Inter';
const COLOR_PREFIX = 'DesignBridge/Color/';
const TEXT_PREFIX = 'DesignBridge/Text/';

const WEIGHT_TO_STYLE: Record<number, string> = {
  100: 'Thin',
  200: 'Extra Light',
  300: 'Light',
  400: 'Regular',
  500: 'Medium',
  600: 'Semi Bold',
  700: 'Bold',
  800: 'Extra Bold',
  900: 'Black',
};

function nearestWeightStyle(weight?: number): string {
  if (!weight) return 'Regular';
  let best = 400;
  let bestDiff = Infinity;
  for (const w of Object.keys(WEIGHT_TO_STYLE)) {
    const num = Number(w);
    const diff = Math.abs(num - weight);
    if (diff < bestDiff) {
      bestDiff = diff;
      best = num;
    }
  }
  return WEIGHT_TO_STYLE[best];
}

export async function applyImport(payload: ImportPayload): Promise<ImportSummary> {
  const summary: ImportSummary = {
    colorsCreated: 0,
    colorsUpdated: 0,
    textCreated: 0,
    textUpdated: 0,
    skipped: [],
  };

  // ─── Colors → Paint styles ───
  const existingPaint = await figma.getLocalPaintStylesAsync();
  const paintByName = new Map(existingPaint.map((s) => [s.name, s]));

  for (const c of payload.colors) {
    let rgb;
    try {
      rgb = hexToRgb(c.hex);
    } catch {
      summary.skipped.push(`Farbe ${c.name} (${c.hex})`);
      continue;
    }
    const styleName = COLOR_PREFIX + c.name;
    const existing = paintByName.get(styleName);
    const style = existing ?? figma.createPaintStyle();
    if (!existing) style.name = styleName;
    style.paints = [{ type: 'SOLID', color: { r: rgb.r, g: rgb.g, b: rgb.b } }];
    if (existing) summary.colorsUpdated++;
    else summary.colorsCreated++;
  }

  // ─── Typography → Text styles ───
  const existingText = await figma.getLocalTextStylesAsync();
  const textByName = new Map(existingText.map((s) => [s.name, s]));

  for (const t of payload.text) {
    let fontName: FontName = { family: FAMILY, style: nearestWeightStyle(t.fontWeight) };
    try {
      await figma.loadFontAsync(fontName);
    } catch {
      fontName = { family: FAMILY, style: 'Regular' };
      try {
        await figma.loadFontAsync(fontName);
      } catch {
        summary.skipped.push(`Textstil ${t.name} (Font ${FAMILY} nicht verfügbar)`);
        continue;
      }
    }
    const styleName = TEXT_PREFIX + t.name;
    const existing = textByName.get(styleName);
    const style = existing ?? figma.createTextStyle();
    if (!existing) style.name = styleName;
    style.fontName = fontName;
    if (typeof t.fontSize === 'number' && t.fontSize > 0) style.fontSize = t.fontSize;
    if (existing) summary.textUpdated++;
    else summary.textCreated++;
  }

  return summary;
}
