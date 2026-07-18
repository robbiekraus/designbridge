// Figma-runtime writer: turns a parsed import payload into local Paint & Text styles.
// Create-or-update by name so re-running does not duplicate.

import { hexToRgb, ImportPayload } from './parsePayload';
import type { ImportComponentKind, ImportSummary } from '../types/manifest';

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

export function nearestWeightStyle(weight?: number): string {
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
    componentsCreated: 0,
    componentsUpdated: 0,
    placeholders: 0,
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

// ─── Fertig-Meldung: Zähl-Wording Plugin vs. App (Fix 5) ───────────────────────
// Pure string formatting, kein figma-Zugriff — bewusst hier statt in ui.ts, damit
// es ohne DOM-Global unter node:test läuft (siehe tests/formatImportSummary.test.ts).

const KIND_ORDER: ImportComponentKind[] = ['atom', 'molecule', 'organism', 'template'];

const KIND_LABELS: Record<ImportComponentKind, { singular: string; plural: string }> = {
  atom: { singular: 'Atom', plural: 'Atoms' },
  molecule: { singular: 'Molecule', plural: 'Molecules' },
  organism: { singular: 'Organism', plural: 'Organisms' },
  template: { singular: 'Template', plural: 'Templates' },
};

/** "3 Atomics, 9 Components, 1 Pattern" — feste Reihenfolge, kinds mit 0 werden weggelassen. */
function formatKindBreakdown(byKind: Partial<Record<ImportComponentKind, number>> | undefined): string {
  if (!byKind) return '';
  return KIND_ORDER.map((kind) => ({ kind, count: byKind[kind] ?? 0 }))
    .filter(({ count }) => count > 0)
    .map(({ kind, count }) => {
      const label = KIND_LABELS[kind];
      return `${count} ${count === 1 ? label.singular : label.plural}`;
    })
    .join(', ');
}

/** Baut die Kernaussage der Fertig-Meldung ("10 Farben neu, …, 13 Bausteine neu (…)").
 *  Ersetzt den Sammelbegriff „Komponenten" durch „Bausteine" (Kollision mit der
 *  App-Kategorie „Components" vermeiden) und hängt die Kind-Aufschlüsselung in
 *  Klammern an, falls vorhanden. Farben/Textstile unverändert; Platzhalter als
 *  „davon N Platzhalter" (Testrunde 8, Fix 2) — die sind in „X Bausteine neu"
 *  bereits enthalten, keine zusätzliche Zählung. */
export function formatImportSummary(s: ImportSummary): string {
  const createdBreakdown = formatKindBreakdown(s.componentsCreatedByKind);
  const updatedBreakdown = formatKindBreakdown(s.componentsUpdatedByKind);

  return [
    `${s.colorsCreated} Farben neu`,
    s.colorsUpdated ? `${s.colorsUpdated} Farben aktualisiert` : '',
    `${s.textCreated} Textstile neu`,
    s.textUpdated ? `${s.textUpdated} Textstile aktualisiert` : '',
    s.componentsCreated
      ? `${s.componentsCreated} Bausteine neu${createdBreakdown ? ` (${createdBreakdown})` : ''}`
      : '',
    s.componentsUpdated
      ? `${s.componentsUpdated} Bausteine aktualisiert${updatedBreakdown ? ` (${updatedBreakdown})` : ''}`
      : '',
    // "davon" macht klar: die Platzhalter sind in "X Bausteine neu" bereits ENTHALTEN,
    // keine zusätzlichen Bausteine (Testrunde 8, Fix 2 — sonst liest sich "13, 1" wie 13+1).
    s.placeholders ? `davon ${s.placeholders} Platzhalter` : '',
  ]
    .filter(Boolean)
    .join(', ');
}
