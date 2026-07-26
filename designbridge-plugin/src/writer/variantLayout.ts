// Varianten eines Component Sets nebeneinanderlegen, bevor sie zu einem Set werden.
//
// Warum das nötig ist (Befund in Robs Figma-Datei `UuoCS1lCmtRPfAE10Mjter`, 26.07.2026):
// `figma.createComponentFromNode()` liefert jede frisch gebaute Variante an derselben Stelle
// (0,0). Weder buildCatalog.ts noch buildComponents.ts hat je eine Position gesetzt, also lagen
// ALLE Varianten exakt übereinander — `DS/Button` mit 24 Varianten kam als 109×41-Kasten an,
// das gescannte Atom „Button" mit 3 Varianten als 73×32. Figma markiert überlappende Varianten
// rot („Varianten überlappen") und im Set ist nur die oberste sichtbar.
//
// Anordnung: eine Spalte, wie Figmas eigenes Verhalten beim Hinzufügen einer Variante. Bewusst
// kein Raster — die Reihenfolge im Payload bleibt so ablesbar, und die Sektion ist ohnehin ein
// vertikales Auto-Layout, das mitwächst.

/** Abstand zwischen zwei Varianten, in Figma-Pixeln. */
export const VARIANT_GAP = 16;

/**
 * Legt die Varianten als Spalte übereinander gestapelt an (x = 0, y kumulativ).
 *
 * Muss aufgerufen werden, WÄHREND die Koordinaten im richtigen Bezugssystem liegen:
 * - vor `figma.combineAsVariants(...)` (die Komponenten liegen noch frei, ihre relative
 *   Anordnung übernimmt das entstehende Set);
 * - nach `set.appendChild(...)` beim Update eines bestehenden Sets (dort sind x/y relativ zum Set).
 */
export function layOutVariants(variants: Array<{ x: number; y: number; height: number }>): void {
  let y = 0;
  for (const v of variants) {
    v.x = 0;
    v.y = y;
    y += v.height + VARIANT_GAP;
  }
}
