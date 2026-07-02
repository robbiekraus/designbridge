async function fetchText(url, fetchImpl, timeoutMs) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetchImpl(url, {
      signal: ctrl.signal,
      headers: { 'User-Agent': 'DesignBridge/0.1 (+ingester)' },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status} bei ${url}`);
    return await res.text();
  } finally {
    clearTimeout(t);
  }
}

export async function fetchSite(url, { fetchImpl = fetch, timeoutMs = 10000 } = {}) {
  const html = await fetchText(url, fetchImpl, timeoutMs);
  const base = new URL(url);
  let css = '';

  for (const m of html.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/gi)) css += '\n' + m[1];
  for (const m of html.matchAll(/style\s*=\s*"([^"]*)"/gi)) css += `\n.inline { ${m[1]} }`;

  for (const tag of html.match(/<link\b[^>]*>/gi) ?? []) {
    if (!/rel\s*=\s*["']?stylesheet/i.test(tag)) continue;
    const href = /href\s*=\s*["']([^"']+)["']/i.exec(tag)?.[1];
    if (!href) continue;
    const cssUrl = new URL(href, base).href;
    try {
      css += '\n' + (await fetchText(cssUrl, fetchImpl, timeoutMs));
    } catch {
      /* skip broken/blocked stylesheet */
    }
  }

  return { html, css, baseUrl: base.href };
}
