import { describe, it, expect, vi, afterEach } from 'vitest';
import { deepenWithAi } from './aiDeepen.js';

const result = { source: 'url', raw: { meta: { source_url: 'http://x/demo' } } };

afterEach(() => vi.restoreAllMocks());

describe('deepenWithAi', () => {
  it('posts the url and returns an adapted url-result', async () => {
    const serverShape = { tokens: {}, atomics: [{ name: 'Button', confidence: 'high', source: 'rules+ai' }], components: [], patterns: [], meta: { ai_deepened: true } };
    global.fetch = vi.fn(async () => ({ ok: true, json: async () => serverShape }));
    const next = await deepenWithAi(result);
    expect(global.fetch).toHaveBeenCalledWith('/api/scan/url/ai', expect.objectContaining({ method: 'POST' }));
    expect(next.source).toBe('url');
    expect(next.raw.meta.ai_deepened).toBe(true);
  });

  it('throws when the server responds with an error', async () => {
    global.fetch = vi.fn(async () => ({ ok: false, json: async () => ({ error: 'keine Credits' }) }));
    await expect(deepenWithAi(result)).rejects.toThrow('keine Credits');
  });

  it('throws when no source url is present', async () => {
    await expect(deepenWithAi({ source: 'url', raw: { meta: {} } })).rejects.toThrow(/URL/);
  });
});
