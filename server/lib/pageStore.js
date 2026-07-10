// Kurzlebiger In-Memory-Store für gefetchte Seiten (HTML+CSS), damit die
// KI-Interpretation die Quelle nach dem Scan noch einmal ansehen kann.
// Muster: imageStore.js (ephemerer Übergabepuffer, TTL 15 min).
import crypto from 'crypto';

const TTL_MS = 15 * 60 * 1000;

const entries = new Map(); // id → { html, css, timer }

export function putPage(html, css, { ttlMs = TTL_MS } = {}) {
  const id = crypto.randomBytes(8).toString('hex');
  const timer = setTimeout(() => removePage(id), ttlMs);
  if (timer.unref) timer.unref();
  entries.set(id, { html, css, timer });
  return id;
}

export function getPage(id) {
  const e = entries.get(id);
  return e ? { html: e.html, css: e.css } : null;
}

export function removePage(id) {
  const e = entries.get(id);
  if (!e) return;
  clearTimeout(e.timer);
  entries.delete(id);
}

export function clearPages() {
  for (const id of [...entries.keys()]) removePage(id);
}
