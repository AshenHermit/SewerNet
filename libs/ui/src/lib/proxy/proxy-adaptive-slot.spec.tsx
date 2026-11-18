import { act, render, screen } from '@testing-library/react';
import { renderToString } from 'react-dom/server';
import React, { useRef } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AdaptiveSlotProps, UiKit } from '../ui-kit';
import { UiKitContext } from './ui-kit-context';
import { ProxyAdaptiveSlot } from './proxy-adaptive-slot';

interface MediaMock {
  matchMedia: typeof window.matchMedia;
  dispatch: (matches: boolean) => void;
  listeners: Set<() => void>;
  queries: string[];
}

function createMediaMock(matches: boolean): MediaMock {
  let current = matches;
  const listeners = new Set<() => void>();
  const queries: string[] = [];
  const matchMedia = ((query: string) => {
    queries.push(query);
    return {
      get matches() {
        return current;
      },
      media: query,
      onchange: null,
      addEventListener: (_type: string, listener: () => void) => listeners.add(listener),
      removeEventListener: (_type: string, listener: () => void) => listeners.delete(listener),
      addListener: (listener: () => void) => listeners.add(listener),
      removeListener: (listener: () => void) => listeners.delete(listener),
      dispatchEvent: () => true,
    };
  }) as unknown as typeof window.matchMedia;
  return {
    matchMedia,
    dispatch: (next: boolean) => {
      current = next;
      for (const listener of [...listeners]) listener();
    },
    listeners,
    queries,
  };
}

function Probe({ name, onMount }: { name: string; onMount?: () => void }) {
  const counted = useRef(false);
  if (!counted.current) {
    counted.current = true;
    onMount?.();
  }
  return <span>{name}</span>;
}

const originalMatchMedia = window.matchMedia;

describe('ProxyAdaptiveSlot', () => {
  let media: MediaMock;

  beforeEach(() => {
    media = createMediaMock(false);
    window.matchMedia = media.matchMedia;
    vi.resetModules();
  });

  afterEach(() => {
    window.matchMedia = originalMatchMedia;
    vi.restoreAllMocks();
    vi.resetModules();
  });

  it('activates a single variant for the single shared breakpoint', () => {
    let activeMounts = 0;
    render(
      <ProxyAdaptiveSlot
        fallback={<Probe name="common" />}
        compact={<Probe name="phone" onMount={() => activeMounts++} />}
      />,
    );
    expect(screen.getByText('phone')).toBeTruthy();
    expect(screen.queryByText('common')).toBeNull();
    expect(activeMounts).toBe(1);
    expect(media.queries).toEqual(['(min-width: 48rem)']);

    act(() => media.dispatch(true));
    expect(screen.getByText('common')).toBeTruthy();
    expect(screen.queryByText('phone')).toBeNull();
    expect(activeMounts).toBe(1);

    act(() => media.dispatch(false));
    expect(screen.getByText('phone')).toBeTruthy();
    expect(activeMounts).toBe(2);
    expect(media.listeners.size).toBe(1);
  });

  it('uses the fallback when a variant is undefined', () => {
    render(<ProxyAdaptiveSlot fallback={<Probe name="common" />} compact={undefined} />);
    expect(screen.getByText('common')).toBeTruthy();
  });

  it('honours an intentional null variant', () => {
    render(<ProxyAdaptiveSlot fallback={<Probe name="common" />} wide={null} />);
    act(() => media.dispatch(true));
    expect(screen.queryByText('common')).toBeNull();
  });

  it('delegates to the active kit implementation', () => {
    const Custom = ({ fallback }: AdaptiveSlotProps) => (
      <span>{`kit:${React.isValidElement(fallback) ? String(fallback.type) : 'none'}`}</span>
    );
    const kit = { AdaptiveSlot: Custom } as unknown as UiKit;
    render(
      <UiKitContext.Provider value={kit}>
        <ProxyAdaptiveSlot fallback={<Probe name="common" />} compact={<Probe name="phone" />} />
      </UiKitContext.Provider>,
    );
    expect(screen.getByText(/^kit:/)).toBeTruthy();
  });

  it('renders wide on the server without window', () => {
    const restore = vi.spyOn(globalThis, 'window', 'get').mockReturnValue(undefined as never);
    try {
      const html = renderToString(
        <ProxyAdaptiveSlot fallback={<Probe name="common" />} wide={<Probe name="desk" />} />,
      );
      expect(html).toContain('desk');
      expect(html).not.toContain('common');
    } finally {
      restore.mockRestore();
    }
  });
});
