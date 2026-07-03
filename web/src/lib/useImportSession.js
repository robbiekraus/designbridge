import { useCallback, useState } from 'react';
import { adaptScanResponse, adaptImageScanResponse } from './scanResultAdapter.js';

async function submitImage(file) {
  const formData = new FormData();
  formData.append('image', file);
  const res = await fetch('/api/scan/image', { method: 'POST', body: formData });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Scan failed');
  return adaptScanResponse(data, 'image');
}

async function submitUrl(url) {
  const res = await fetch('/api/scan/url', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ url }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'URL-Scan fehlgeschlagen');
  return adaptScanResponse(data, 'url');
}

async function submitRepo({ url, branch }) {
  const res = await fetch('/api/scan/repo', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ url, branch: branch || undefined }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Repo-Scan fehlgeschlagen');
  return adaptScanResponse(data, 'repo');
}

export function useImportSession() {
  const [stage, setStage] = useState('idle');
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);

  const submit = useCallback(async ({ source, payload }) => {
    setStage('submitting');
    setError(null);
    setResult(null);
    try {
      let next;
      if (source === 'image') next = await submitImage(payload.file);
      else if (source === 'url') next = await submitUrl(payload.url);
      else if (source === 'repo') next = await submitRepo(payload);
      else throw new Error(`Unsupported source: ${source}`);
      setResult(next);
      setStage('success');
    } catch (e) {
      setError(e.message || String(e));
      setStage('error');
    }
  }, []);

  const reset = useCallback(() => {
    setStage('idle');
    setResult(null);
    setError(null);
  }, []);

  return { stage, result, error, submit, reset };
}
