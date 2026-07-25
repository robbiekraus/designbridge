// Emits the DesignBridge → Figma import envelope consumed by the Figma plugin
// (designbridge-plugin/src/writer/parsePayload.ts). v2 = colors + typography + components.
// `catalog` (optional, Spec 2026-07-25-katalog-als-figma-library-design.md) trägt das Design System
// selbst als Komponenten-Bibliothek. Additiv: leerer Katalog → Feld fehlt ganz, ältere Plugins sehen
// exakt das bisherige Envelope.
export function emitFigma(tokens, components = [], catalog = []) {
  const colors = [];
  const text = [];

  for (const tk of tokens) {
    if (tk.group === 'color') {
      colors.push({ name: tk.name, hex: tk.value });
    } else if (tk.group === 'font') {
      const entry = { name: tk.name };
      const fontSize = parseFloat(tk.value?.fontSize);
      const fontWeight = parseInt(tk.value?.fontWeight, 10);
      if (!Number.isNaN(fontSize)) entry.fontSize = fontSize;
      if (!Number.isNaN(fontWeight)) entry.fontWeight = fontWeight;
      text.push(entry);
    }
  }

  const envelope = { designbridge: 'figma-import', version: 2, colors, text, components };
  if (Array.isArray(catalog) && catalog.length > 0) envelope.catalog = catalog;

  return JSON.stringify(envelope, null, 2) + '\n';
}
