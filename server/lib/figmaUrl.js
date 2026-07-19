// Figma-Datei-URLs kommen in zwei Formen vor: neu `/design/:key/...` und
// legacy `/file/:key/...`. node-id (Deep-Link auf einen Frame) ist für v1
// irrelevant — wir importieren immer die ganze Datei.
export function parseFigmaUrl(input) {
  let u;
  try {
    u = new URL(String(input || '').trim());
  } catch {
    throw new Error('Ungültige URL.');
  }
  if (!/(^|\.)figma\.com$/.test(u.hostname)) {
    throw new Error('Nur figma.com-URLs werden unterstützt.');
  }
  const parts = u.pathname.split('/').filter(Boolean);
  const idx = parts.findIndex((p) => p === 'design' || p === 'file');
  if (idx === -1 || !parts[idx + 1]) {
    throw new Error('Ungültige Figma-Datei-URL — erwartet figma.com/design/:key/... oder /file/:key/...');
  }
  return { fileKey: parts[idx + 1] };
}
