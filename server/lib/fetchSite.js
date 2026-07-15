import postcss from 'postcss';

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
  const chunks = [];

  for (const m of html.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/gi)) chunks.push(m[1]);
  // Nur echte style=-Attribute: data-style="a" o. ä. wurde sonst zu `.inline { a }`
  // und brachte postcss zum Absturz (Live-Fund linear.app 15.07.).
  for (const m of html.matchAll(/[\s"']style\s*=\s*"([^"]*)"/gi)) chunks.push(`.inline { ${m[1]} }`);

  for (const tag of html.match(/<link\b[^>]*>/gi) ?? []) {
    if (!/rel\s*=\s*["']?stylesheet/i.test(tag)) continue;
    const href = /href\s*=\s*["']([^"']+)["']/i.exec(tag)?.[1];
    if (!href) continue;
    const cssUrl = new URL(href, base).href;
    try {
      chunks.push(await fetchText(cssUrl, fetchImpl, timeoutMs));
    } catch {
      /* skip broken/blocked stylesheet */
    }
  }

  // Jeder Block einzeln validiert — ein unparsebares Stylesheet darf nicht
  // den gesamten Import abbrechen, sondern wird übersprungen und gezählt.
  let skippedStylesheets = 0;
  const valid = chunks.filter((c) => {
    try {
      postcss.parse(c);
      return true;
    } catch {
      skippedStylesheets++;
      return false;
    }
  });

  return { html, css: valid.map((c) => '\n' + c).join(''), baseUrl: base.href, skippedStylesheets };
}
