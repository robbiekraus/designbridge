// Kurzlebiger In-Memory-Store für extrahierte Repo-Dateien, damit die
// KI-Interpretation den Quellcode nach dem Scan noch einmal ansehen kann.
// Muster: pageStore.js / imageStore.js (ephemerer Übergabepuffer, TTL 15 min).
import crypto from 'crypto';

const TTL_MS = 15 * 60 * 1000;

const entries = new Map(); // id → { files, meta, timer }

export function putRepo(files, meta = {}, { ttlMs = TTL_MS } = {}) {
  const id = crypto.randomBytes(8).toString('hex');
  const timer = setTimeout(() => removeRepo(id), ttlMs);
  if (timer.unref) timer.unref();
  entries.set(id, { files, meta, timer });
  return id;
}

export function getRepo(id) {
  const e = entries.get(id);
  return e ? { files: e.files, meta: e.meta } : null;
}

export function removeRepo(id) {
  const e = entries.get(id);
  if (!e) return;
  clearTimeout(e.timer);
  entries.delete(id);
}

export function clearRepos() {
  for (const id of [...entries.keys()]) removeRepo(id);
}
