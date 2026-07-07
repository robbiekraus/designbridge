// In-memory handoff buffer for the Code → Figma direction.
// The web app POSTs the latest Figma payload here; the Figma plugin GETs it.
// Ephemeral by design — it is a handoff buffer, not persistence.

let latest = null;

export function setFigmaExport(payload) {
  latest = payload;
}

export function getFigmaExport() {
  return latest;
}

export function clearFigmaExport() {
  latest = null;
}
