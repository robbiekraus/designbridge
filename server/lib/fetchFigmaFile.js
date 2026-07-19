const API = 'https://api.figma.com';

function statusToError(status) {
  if (status === 403) return new Error('Figma-Token ungültig oder kein Zugriff auf diese Datei.');
  if (status === 404) return new Error('Figma-Datei nicht gefunden.');
  if (status === 429) return new Error('Figma-Rate-Limit erreicht — später erneut versuchen.');
  return new Error(`Figma-Datei konnte nicht geladen werden: ${status}`);
}

// Figma-Datei + Styles (immer) und best-effort Variables (nur Enterprise-Pläne
// erlauben `/variables/local` — 403/Netzfehler dort sind kein Showstopper,
// der Rest des Imports läuft ohne Variables weiter).
export async function fetchFigmaFile({ fileKey, token, fetchImpl = fetch }) {
  const headers = { 'X-Figma-Token': token };

  const res = await fetchImpl(`${API}/v1/files/${fileKey}`, { headers });
  if (!res.ok) throw statusToError(res.status);
  const data = await res.json();

  let variables = null;
  try {
    const varRes = await fetchImpl(`${API}/v1/files/${fileKey}/variables/local`, { headers });
    if (varRes.ok) {
      const varData = await varRes.json();
      variables = varData?.meta?.variables ?? null;
    }
  } catch {
    variables = null;
  }

  return { document: data.document, styles: data.styles ?? {}, variables };
}
