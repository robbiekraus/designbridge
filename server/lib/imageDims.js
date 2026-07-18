import Jimp from 'jimp';

/** Bild-Pixelmaße via Jimp (schon Projekt-Dependency). Fehler → null. */
export async function readImageDims(imagePath) {
  try {
    const img = await Jimp.read(imagePath);
    return { width: img.getWidth(), height: img.getHeight() };
  } catch {
    return null;
  }
}
