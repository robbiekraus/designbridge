// Emits the DesignBridge → Figma import envelope consumed by the Figma plugin
// (designbridge-plugin/src/writer/parsePayload.ts). v2 = colors + typography + components.
export function emitFigma(tokens, components = []) {
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

  return JSON.stringify(
    { designbridge: 'figma-import', version: 2, colors, text, components },
    null, 2
  ) + '\n';
}
