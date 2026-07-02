import { describe, it, expect, vi, afterEach } from 'vitest';
import { deepenWithAi } from './aiDeepen.js';

const result = { source: 'url', raw: { meta: { source_url: 'http://x/demo' } } };

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('deepenWithAi', () => {
  it('posts the url and returns an adapted url-result', async () => {
    const serverShape = { tokens: {}, atomics: [{ name: 'Button', confidence: 'high', source: 'rules+ai' }], components: [], patterns: [], meta: { ai_deepened: true } };
    const fetchMock = vi.fn(async () => ({ ok: true, json: async () => serverShape }));
    vi.stubGlobal('fetch', fetchMock);
    const next = await deepenWithAi(result);
    expect(fetchMock).toHaveBeenCalledWith('/api/scan/url/ai', expect.objectContaining({ method: 'POST', body: JSON.stringify({ url: 'http://x/demo' }) }));
    expect(next.source).toBe('url');
    expect(next.raw.meta.ai_deepened).toBe(true);
  });

  it('throws when the server responds with an error', async () => {
    const fetchMock = vi.fn(async () => ({ ok: false, json: async () => ({ error: 'keine Credits' }) }));
    vi.stubGlobal('fetch', fetchMock);
    await expect(deepenWithAi(result)).rejects.toThrow('keine Credits');
  });

  it('throws when no source url is present', async () => {
    await expect(deepenWithAi({ source: 'url', raw: { meta: {} } })).rejects.toThrow(/URL/);
  });
});
