// Figma-Emit-Skalierung (Spec: docs/superpowers/specs/2026-07-19-figma-emit-scaling-design.md).
// Skaliert einen plan-Baum uniform auf die wahre Bild-Pixelgröße (Emit-Zeit-Transform des FIGMA-
// Emitters; der Tailwind-Emitter skaliert NICHT). Reine, rekursive Funktion — kein DOM. Skaliert
// px-Felder: box width/height/padding/gap/radius/strokeWeight/absolute · text fontSize/lineHeight/
// absolute · svg öffnender-Tag width/height (NICHT viewBox)/absolute · component-ref absolute/fallback.

const s = (v, f) => Math.round(v * f);
const sMin1 = (v, f) => Math.max(1, Math.round(v * f));

/** slot/natural, breitengetrieben. bbox.w ist auf das Gesamtbild normiert (0..1). Guards → 1. */
export function scaleFactor(bbox, imageWidth, naturalWidth) {
  if (!bbox || !Number.isFinite(imageWidth) || !Number.isFinite(naturalWidth)) return 1;
  const slotWidth = bbox.w * imageWidth;
  if (!(slotWidth > 0) || !(naturalWidth > 0)) return 1;
  return slotWidth / naturalWidth;
}

function scaleAbsolute(a, f) {
  return { x: s(a.x, f), y: s(a.y, f), width: sMin1(a.width, f), height: sMin1(a.height, f) };
}

function scaleSvgMarkup(markup, f) {
  const gt = String(markup).indexOf('>');
  if (gt === -1) return markup;
  const tag = markup.slice(0, gt).replace(
    /(\s(?:width|height)=")(\d*\.?\d+)(px)?(")/g,
    (_m, pre, num, unit, post) => `${pre}${Math.max(1, Math.round(parseFloat(num) * f))}${unit || ''}${post}`,
  );
  return tag + markup.slice(gt);
}

function scaleNode(node, f) {
  if (!node || typeof node !== 'object') return node;
  if (node.type === 'text') {
    const out = { ...node, fontSize: sMin1(node.fontSize, f) };
    if (node.lineHeight != null) out.lineHeight = sMin1(node.lineHeight, f);
    if (node.absolute) out.absolute = scaleAbsolute(node.absolute, f);
    return out;
  }
  if (node.type === 'svg') {
    const out = { ...node, markup: scaleSvgMarkup(node.markup, f) };
    if (node.absolute) out.absolute = scaleAbsolute(node.absolute, f);
    return out;
  }
  if (node.type === 'component-ref') {
    const out = { ...node };
    if (node.absolute) out.absolute = scaleAbsolute(node.absolute, f);
    if (node.fallback) out.fallback = scaleNode(node.fallback, f);
    return out;
  }
  // box
  const out = { ...node };
  if (node.width != null) out.width = sMin1(node.width, f);
  if (node.height != null) out.height = sMin1(node.height, f);
  out.padding = (node.padding || [0, 0, 0, 0]).map((p) => s(p, f));
  out.gap = s(node.gap, f);
  out.radius = s(node.radius, f);
  out.strokeWeight = sMin1(node.strokeWeight ?? 1, f);
  if (node.absolute) out.absolute = scaleAbsolute(node.absolute, f);
  out.children = (node.children || []).map((c) => scaleNode(c, f));
  return out;
}

/** Skaliert den plan-Baum um `factor`. factor===1 / ungültig (≤0, nicht endlich) → Original (Identität). */
export function scalePlan(node, factor) {
  if (!Number.isFinite(factor) || factor <= 0 || factor === 1) return node;
  return scaleNode(node, factor);
}
