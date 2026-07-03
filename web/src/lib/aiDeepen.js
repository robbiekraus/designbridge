import { adaptScanResponse } from './scanResultAdapter.js';

export async function deepenWithAi(result) {
  const meta = result?.raw?.meta ?? {};
  const url = meta.source_url;
  if (!url) throw new Error('Keine URL zum Vertiefen vorhanden.');
  const isRepo = result?.source === 'repo';
  const endpoint = isRepo ? '/api/scan/repo/ai' : '/api/scan/url/ai';
  const body = isRepo ? { url, ...(meta.branch ? { branch: meta.branch } : {}) } : { url };
  const res = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'KI-Analyse fehlgeschlagen');
  return adaptScanResponse(data, result?.source ?? 'url');
}
