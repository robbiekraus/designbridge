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
