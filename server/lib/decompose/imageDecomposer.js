// ImageDecomposer: zerlegt ein Bild anhand der Scan-bboxes in Segmente mit
// echten Bild-Ausschnitten (Crops). Erfüllt das Decomposer-Interface:
// decompose(source, inventory) -> Segment[]
import Jimp from 'jimp';

function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

async function cropVisual(img, bbox) {
  const W = img.getWidth();
  const H = img.getHeight();
  let x = Math.round(clamp(bbox.x, 0, 1) * W);
  let y = Math.round(clamp(bbox.y, 0, 1) * H);
  let w = Math.round(clamp(bbox.w, 0, 1) * W);
  let h = Math.round(clamp(bbox.h, 0, 1) * H);
  w = clamp(w, 1, W - x);
  h = clamp(h, 1, H - y);
  const crop = img.clone().crop(x, y, w, h);
  const buf = await crop.getBufferAsync(Jimp.MIME_PNG);
  return { base64: buf.toString('base64'), media_type: 'image/png' };
}

export const imageDecomposer = {
  async decompose({ imagePath }, inventory) {
    let img = null;
    const segments = [];
    for (let i = 0; i < inventory.length; i++) {
      const item = inventory[i];
      const hasBox = item.bbox && typeof item.bbox.w === 'number' && item.bbox.w > 0 && item.bbox.h > 0;
      let visual = null;
      let bounds = null;
      if (hasBox) {
        if (!img) img = await Jimp.read(imagePath);
        bounds = { x: item.bbox.x, y: item.bbox.y, w: item.bbox.w, h: item.bbox.h };
        try {
          visual = await cropVisual(img, item.bbox);
        } catch {
          visual = null; // kaputte Box → Ganz-Bild-Fallback downstream
        }
      }
      segments.push({
        id: `seg_${i}`,
        label: item.name,
        kind: item.kind ?? 'component',
        confidence: item.confidence,
        notes: item.notes ?? '',
        bounds,
        visual,
        structure: null,
      });
    }
    return segments;
  },
};
