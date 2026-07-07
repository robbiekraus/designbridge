// Bauplan-Bausteine für die planFor-Methoden der Templates (Figma-Emitter v2).
// Format: box = {type:'box', layout:'row'|'column', padding:[t,r,b,l], radius, fill, stroke, children}
//         text = {type:'text', content, fontSize, fontWeight, color} · ColorRef = {token|null, hex}

export const colorRef = (slot) => ({ token: slot.token, hex: slot.value });

export const px = (v, fallback) => {
  const n = parseFloat(v);
  return Number.isFinite(n) ? n : fallback;
};

export const weight = (v, fallback = 500) => {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : fallback;
};

export const textEl = (content, refs, colorSlot, overrides = {}) => ({
  type: 'text',
  content,
  fontSize: px(refs.fontSize, 14),
  fontWeight: weight(refs.fontWeight),
  color: colorRef(colorSlot),
  ...overrides,
});

export const box = (overrides = {}) => ({
  type: 'box', layout: 'row', padding: [0, 0, 0, 0], radius: 0,
  fill: null, stroke: null, children: [], ...overrides,
});
