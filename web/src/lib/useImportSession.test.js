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

  it('resolves mocked url import to success', async () => {
    vi.useFakeTimers();
    const { result } = renderHook(() => useImportSession());
    let pending;
    act(() => {
      pending = result.current.submit({ source: 'url', payload: { url: 'https://x' } });
    });
    expect(result.current.stage).toBe('submitting');
    await act(async () => {
      vi.advanceTimersByTime(1600);
      await pending;
    });
    expect(result.current.stage).toBe('success');
    expect(result.current.result.mocked).toBe(true);
    vi.useRealTimers();
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
