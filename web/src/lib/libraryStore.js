const KEY = 'designbridge.lastImport';

export function saveLastImport(result) {
  try {
    localStorage.setItem(KEY, JSON.stringify(result));
  } catch {
    /* quota / unavailable — ignore, library is session-only this run */
  }
}

export function loadLastImport() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export function clearLastImport() {
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
}
