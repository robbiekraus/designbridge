const API = 'https://api.github.com';
const CODELOAD = 'https://codeload.github.com';
const MAX_BYTES = 50 * 1024 * 1024;

async function fetchWithTimeout(url, fetchImpl, timeoutMs, accept) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    return await fetchImpl(url, {
      signal: ctrl.signal,
      headers: {
        'User-Agent': 'DesignBridge/0.1 (+repo-ingester)',
        ...(accept ? { Accept: accept } : {}),
      },
    });
  } finally {
    clearTimeout(t);
  }
}

// GitHub-API ohne Token: 60 Requests/Stunde. 403/429 → null (Aufrufer probiert main/master).
export async function resolveDefaultBranch(owner, repo, { fetchImpl = fetch, timeoutMs = 10000 } = {}) {
  const res = await fetchWithTimeout(`${API}/repos/${owner}/${repo}`, fetchImpl, timeoutMs, 'application/vnd.github+json');
  if (res.status === 404) throw new Error('Repository nicht gefunden (oder privat).');
  if (res.status === 403 || res.status === 429) return null;
  if (!res.ok) throw new Error(`GitHub-API-Fehler (HTTP ${res.status}).`);
  const data = await res.json();
  return data.default_branch || null;
}

export async function downloadRepoTarball(
  { owner, repo, branch = null },
  { fetchImpl = fetch, timeoutMs = 20000, maxBytes = MAX_BYTES } = {}
) {
  let candidates;
  let rateLimited = false;
  if (branch) {
    candidates = [branch];
  } else {
    const def = await resolveDefaultBranch(owner, repo, { fetchImpl, timeoutMs });
    if (def) candidates = [def];
    else {
      rateLimited = true;
      candidates = ['main', 'master'];
    }
  }

  for (const cand of candidates) {
    const segments = cand.split('/');
    // encodeURIComponent lässt '.' und '..' durch → Pfad-Ausbruch aus der codeload-URL
    if (segments.some((s) => !s || s === '.' || s === '..')) {
      throw new Error('Ungültiger Branch-Name.');
    }
    const ref = segments.map(encodeURIComponent).join('/');
    const url = `${CODELOAD}/${owner}/${repo}/tar.gz/refs/heads/${ref}`;
    const res = await fetchWithTimeout(url, fetchImpl, timeoutMs);
    if (res.status === 404) continue;
    if (!res.ok) throw new Error(`Download fehlgeschlagen (HTTP ${res.status}).`);
    const len = Number(res.headers?.get?.('content-length') || 0);
    if (len > maxBytes) throw new Error('Repository ist zu groß (max. 50 MB).');
    const buffer = Buffer.from(await res.arrayBuffer());
    if (buffer.byteLength > maxBytes) throw new Error('Repository ist zu groß (max. 50 MB).');
    return { buffer, branch: cand };
  }

  throw new Error(
    rateLimited
      ? 'GitHub-Rate-Limit erreicht — bitte in ein paar Minuten erneut versuchen oder Branch angeben.'
      : 'Repository oder Branch nicht gefunden (oder privat).'
  );
}
