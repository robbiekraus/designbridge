// Server-seitiges Grounding-Vokabular (Scheibe 1, Spec 2026-07-23-slice1-ds-grounding-default-
// catalog-design.md §Q2/Q4). Der Interpretations-Prompt lehrt das Modell dieses Vokabular, damit es
// erkannte Bausteine mit data-ds-component="<Name>" markiert (Grounding-Signal).
//
// WICHTIG — Sync-Vertrag: Namen UND Varianten-Optionen MÜSSEN mit
// web/src/lib/catalog/shadcn-default.js übereinstimmen. Dort liegen zusätzlich plan + import
// (Emit-Belange, die der Server nicht braucht). Getrennt gehalten, weil web/ und server/ separate
// Pakete sind — eine Vereinheitlichung (ein von beiden gelesenes JSON) ist ein späterer Refactor.
// Bei Abweichung droht kein Absturz: htmlToPlan validiert web-seitig gegen den echten Katalog und
// verwirft unbekannte Namen/ungültige Varianten (Q4) — es ginge nur Grounding-Präzision verloren.

export const SHADCN_VOCABULARY = [
  { name: 'Button', variants: { variant: ['default', 'secondary', 'destructive', 'outline', 'ghost', 'link'], size: ['default', 'sm', 'lg', 'icon'] } },
  { name: 'Input', variants: {} },
  { name: 'Label', variants: {} },
  { name: 'Badge', variants: { variant: ['default', 'secondary', 'destructive', 'outline'] } },
  { name: 'Card', variants: {} },
  { name: 'Checkbox', variants: {} },
  { name: 'Avatar', variants: {} },
  { name: 'Separator', variants: {} },
  // Aufstockung 26.07.2026 — mit 8 Einträgen wurde alles Übrige als generischer Kasten nachgebaut.
  // Nur Komponenten, deren Wurzel als EIN Element sichtbar rendert; Select/Table/DropdownMenu/
  // Tooltip fehlen bewusst (Radix-Wurzel rendert ohne Pflicht-Unterkomponenten nichts → Inhalt
  // würde im Code-Emit verschwinden). Begründung im Block-Kommentar von
  // web/src/lib/catalog/shadcn-default.js.
  { name: 'Tabs', variants: {} },
  { name: 'ToggleGroup', variants: { variant: ['default', 'outline'] } },
  { name: 'Progress', variants: {} },
  { name: 'Switch', variants: {} },
  { name: 'Skeleton', variants: {} },
  { name: 'Textarea', variants: {} },
  { name: 'Alert', variants: { variant: ['default', 'destructive'] } },
  { name: 'Breadcrumb', variants: {} },
  { name: 'Pagination', variants: {} },
];

/** Kompakter Vokabular-Block für den Prompt: eine Zeile je Komponente, Varianten-Achsen in Klammern.
 *  Leeres/kein Vokabular → '' (der Aufrufer lässt den Grounding-Teil dann ganz weg). */
export function catalogPromptBlock(vocab = SHADCN_VOCABULARY) {
  if (!Array.isArray(vocab) || vocab.length === 0) return '';
  return vocab
    .map((c) => {
      const axes = Object.entries(c.variants || {})
        .filter(([, opts]) => Array.isArray(opts) && opts.length)
        .map(([axis, opts]) => `${axis}: ${opts.join('|')}`)
        .join('; ');
      return axes ? `- ${c.name} (${axes})` : `- ${c.name}`;
    })
    .join('\n');
}
