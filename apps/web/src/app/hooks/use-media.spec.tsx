import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useMedia } from './use-media';
import * as resolver from '../../lib/media-resolver';

vi.mock('../../lib/media-resolver', () => ({
  acquireMedia: vi.fn(),
  clearMediaCache: vi.fn(),
}));

beforeEach(() => vi.clearAllMocks());
afterEach(() => vi.restoreAllMocks());

describe('useMedia', () => {
  it('deferred account-A response after account-B switch never reaches hook state', async () => {
    let resolveA!: (lease: { url: string; release(): void }) => void;
    let resolveB!: (lease: { url: string; release(): void }) => void;
    vi.mocked(resolver.acquireMedia)
      .mockImplementationOnce(() => new Promise((r) => { resolveA = r; }))
      .mockImplementationOnce(() => new Promise((r) => { resolveB = r; }));
    const { result, rerender } = renderHook(({ source }) => useMedia(source), {
      initialProps: { source: { mxc: 'mxc://home/a' } },
    });
    rerender({ source: { mxc: 'mxc://home/b' } });
    await act(async () => resolveA({ url: 'blob:a', release: vi.fn() }));
    void resolveB;
    expect(result.current.url).not.toBe('blob:a');
  });

  it('retries failed media resolution on demand', async () => {
    vi.mocked(resolver.acquireMedia)
      .mockRejectedValueOnce(new Error('verification failed'))
      .mockResolvedValueOnce({ url: 'blob:retry', release: vi.fn() });
    const { result } = renderHook(() => useMedia({ mxc: 'mxc://home/a' }));
    await waitFor(() => expect(result.current.error).toBe('verification failed'));
    await act(async () => result.current.retry());
    await waitFor(() => expect(result.current.url).toBe('blob:retry'));
    expect(resolver.acquireMedia).toHaveBeenCalledTimes(2);
  });

  it('revokes object URL on unmount', async () => {
    const release = vi.fn();
    vi.mocked(resolver.acquireMedia).mockResolvedValue({ url: 'blob:active', release });
    const { result, unmount } = renderHook(() => useMedia({ mxc: 'mxc://home/a' }));
    await waitFor(() => expect(result.current.url).toBe('blob:active'));
    unmount();
    expect(release).toHaveBeenCalledTimes(1);
  });
});
