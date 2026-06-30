import { adaptScanResponse } from './scanResultAdapter.js';

export async function deepenWithAi(result) {
  const url = result?.raw?.meta?.source_url;
  if (!url) throw new Error('Keine URL zum Vertiefen vorhanden.');
  const res = await fetch('/api/scan/url/ai', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ url }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'KI-Analyse fehlgeschlagen');
  return adaptScanResponse(data, 'url');
}
