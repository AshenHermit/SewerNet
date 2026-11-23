import { renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useMatrixEvent } from './use-matrix-event';
import { getMatrixClient } from '../../client/init-matrix';

vi.mock('../../client/init-matrix', () => ({
  getMatrixClient: vi.fn(),
}));

type Listener = (...args: unknown[]) => void;

function fakeClient() {
  const handlers = new Map<string, Set<Listener>>();
  return {
    on: vi.fn((event: string, handler: Listener) => {
      if (!handlers.has(event)) handlers.set(event, new Set());
      handlers.get(event)?.add(handler);
    }),
    off: vi.fn((event: string, handler: Listener) => {
      handlers.get(event)?.delete(handler);
    }),
    emit: (event: string, ...args: unknown[]) => {
      handlers.get(event)?.forEach((h) => h(...args));
    },
  };
}

beforeEach(() => {
  vi.mocked(getMatrixClient).mockReset();
});

describe('useMatrixEvent', () => {
  it('subscribes once and unsubscribes on unmount', () => {
    const client = fakeClient();
    vi.mocked(getMatrixClient).mockReturnValue(client as never);
    const handler = vi.fn();

    const { unmount } = renderHook(() => useMatrixEvent('Room.timeline', handler));

    expect(client.on).toHaveBeenCalledTimes(1);
    client.emit('Room.timeline', { id: 'e1' });
    expect(handler).toHaveBeenCalledWith({ id: 'e1' });
    unmount();
    expect(client.off).toHaveBeenCalledTimes(1);
  });

  it('always invokes the latest handler without resubscribing', () => {
    const client = fakeClient();
    vi.mocked(getMatrixClient).mockReturnValue(client as never);
    const first = vi.fn();
    const second = vi.fn();

    const { rerender } = renderHook(
      ({ handler }: { handler: () => void }) => useMatrixEvent('sync', handler),
      { initialProps: { handler: first } },
    );
    rerender({ handler: second });
    expect(client.on).toHaveBeenCalledTimes(1);

    client.emit('sync', 'PREPARED');
    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledWith('PREPARED');
  });
});
