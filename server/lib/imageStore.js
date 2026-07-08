// Kurzlebiger In-Memory-Store für Upload-Bilder, damit die KI-Interpretation
// das Original nach dem Scan noch einmal ansehen kann. Kein Persistieren;
// nach TTL wird der Eintrag entfernt UND die Tempdatei gelöscht.
// Muster: figmaExportStore.js (ephemerer Übergabepuffer).
import fs from 'fs';
import crypto from 'crypto';

const TTL_MS = 15 * 60 * 1000; // 15 Minuten

const entries = new Map(); // id → { path, mimetype, timer }

export function putImage(path, mimetype, { ttlMs = TTL_MS } = {}) {
  const id = crypto.randomBytes(8).toString('hex');
  const timer = setTimeout(() => removeImage(id), ttlMs);
  if (timer.unref) timer.unref(); // Prozess-Exit nicht blockieren
  entries.set(id, { path, mimetype, timer });
  return id;
}

export function getImage(id) {
  const e = entries.get(id);
  return e ? { path: e.path, mimetype: e.mimetype } : null;
}

export function removeImage(id) {
  const e = entries.get(id);
  if (!e) return;
  clearTimeout(e.timer);
  entries.delete(id);
  fs.unlink(e.path, () => {});
}

export function clearImages() {
  for (const id of [...entries.keys()]) removeImage(id);
}
