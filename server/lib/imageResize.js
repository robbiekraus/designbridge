import Jimp from 'jimp';

// Große Screenshots (Langkante > ~1500px) brechen den Vision-Scan ab —
// abgeschnittenes JSON / 500 (Breiten-Test-Befund 2, docs/2026-07-20-breiten-test-eingabetypen-ergebnis.md).
// Vor dem Senden an die Vision-API proportional herunterskalieren. Rein
// in-memory: die Datei auf Platte bleibt unangetastet (scan.js braucht die
// Originalmaße für image_width/height in der Komposition).
//
// Robustheit: Jimp 0.22 kann kein WebP dekodieren, und generell darf ein
// kaputter/unlesbarer Buffer den Scan nie zum Scheitern bringen — im Zweifel
// unverändert durchreichen statt zu werfen.
export async function downscaleForVision(buffer, mime, { maxEdge = 1500 } = {}) {
  try {
    const img = await Jimp.read(buffer);
    const width = img.getWidth();
    const height = img.getHeight();
    const longEdge = Math.max(width, height);

    if (longEdge <= maxEdge) {
      return { buffer, mime, resized: false };
    }

    const scale = maxEdge / longEdge;
    const targetWidth = Math.max(1, Math.round(width * scale));
    const targetHeight = Math.max(1, Math.round(height * scale));
    img.resize(targetWidth, targetHeight);

    const outMime = mime === 'image/jpeg' ? Jimp.MIME_JPEG : Jimp.MIME_PNG;
    const outBuffer = await img.getBufferAsync(outMime);
    return { buffer: outBuffer, mime: outMime, resized: true };
  } catch {
    return { buffer, mime, resized: false };
  }
}
