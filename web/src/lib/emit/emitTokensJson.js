const SECTION = { color: 'color', font: 'typography', spacing: 'spacing', radius: 'radius', shadow: 'shadow' };
const TYPE = { color: 'color', spacing: 'dimension', radius: 'dimension', shadow: 'shadow' };

export function emitTokensJson(tokens) {
  const out = {};
  for (const tk of tokens) {
    const section = SECTION[tk.group];
    (out[section] ??= {});
    const node = tk.group === 'font'
      ? { $value: { fontSize: tk.value.fontSize, fontWeight: tk.value.fontWeight }, $type: 'typography' }
      : { $value: tk.value, $type: TYPE[tk.group] };
    if (tk.confidence === 'low') node.confidence = 'low';
    out[section][tk.name] = node;
  }
  return JSON.stringify(out, null, 2) + '\n';
}
