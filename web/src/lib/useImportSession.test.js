import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { useImportSession } from './useImportSession.js';

beforeEach(() => {
  global.fetch = vi.fn();
});

describe('useImportSession', () => {
  it('starts in idle stage', () => {
    const { result } = renderHook(() => useImportSession());
    expect(result.current.stage).toBe('idle');
    expect(result.current.result).toBeNull();
    expect(result.current.error).toBeNull();
  });

  it('transitions to success on image submit', async () => {
    global.fetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        tokens: { colors: [{ hex: '#fff', confidence: 'high' }] },
        atomics: [], components: [], patterns: [],
      }),
    });

    const { result } = renderHook(() => useImportSession());
    await act(async () => {
      await result.current.submit({ source: 'image', payload: { file: new File(['x'], 'a.png') } });
    });

    expect(result.current.stage).toBe('success');
    expect(result.current.result.source).toBe('image');
    expect(result.current.result.categories.find(c => c.key === 'colors').count).toBe(1);
  });

  it('transitions to error on image submit failure', async () => {
    global.fetch.mockResolvedValue({ ok: false, json: async () => ({ error: 'boom' }) });

    const { result } = renderHook(() => useImportSession());
    await act(async () => {
      await result.current.submit({ source: 'image', payload: { file: new File(['x'], 'a.png') } });
    });

    expect(result.current.stage).toBe('error');
    expect(result.current.error).toBe('boom');
  });

  it('resolves url import to success', async () => {
    global.fetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        tokens: { colors: [{ hex: '#fff', confidence: 'high' }] },
        atomics: [], components: [], patterns: [],
      }),
    });

    const { result } = renderHook(() => useImportSession());
    await act(async () => {
      await result.current.submit({ source: 'url', payload: { url: 'https://example.com' } });
    });

    expect(result.current.stage).toBe('success');
    expect(result.current.result.source).toBe('url');
    expect(result.current.result.categories.find(c => c.key === 'colors').count).toBe(1);
  });

  it('resolves repo import to success via POST /api/scan/repo', async () => {
    global.fetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        tokens: { colors: [{ hex: '#022d2c', confidence: 'high' }] },
        atomics: [{ name: 'Button', confidence: 'high', source: 'rules' }],
        components: [], patterns: [],
        meta: { model: 'repo-ingest', source_url: 'https://github.com/a/b', branch: 'main', ai_deepened: false },
      }),
    });

    const { result } = renderHook(() => useImportSession());
    await act(async () => {
      await result.current.submit({ source: 'repo', payload: { url: 'https://github.com/a/b', branch: '' } });
    });

    expect(global.fetch).toHaveBeenCalledWith('/api/scan/repo', expect.objectContaining({ method: 'POST' }));
    expect(result.current.stage).toBe('success');
    expect(result.current.result.source).toBe('repo');
    expect(result.current.result.mocked).toBe(false);
  });

  it('surfaces the german server error for repo imports', async () => {
    global.fetch.mockResolvedValue({
      ok: false,
      json: async () => ({ error: 'Repository nicht gefunden (oder privat).' }),
    });
    const { result } = renderHook(() => useImportSession());
    await act(async () => {
      await result.current.submit({ source: 'repo', payload: { url: 'https://github.com/a/b' } });
    });
    expect(result.current.stage).toBe('error');
    expect(result.current.error).toMatch(/nicht gefunden/);
  });

  it('reset returns to idle', async () => {
    global.fetch.mockResolvedValue({
      ok: true,
      json: async () => ({ tokens: {}, atomics: [], components: [], patterns: [] }),
    });
    const { result } = renderHook(() => useImportSession());
    await act(async () => {
      await result.current.submit({ source: 'image', payload: { file: new File(['x'], 'a.png') } });
    });
    act(() => result.current.reset());
    expect(result.current.stage).toBe('idle');
    expect(result.current.result).toBeNull();
  });
});
