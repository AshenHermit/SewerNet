import { render, screen } from '@testing-library/react';
import { useEffect } from 'react';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { i18n } from '@lingui/core';
import { I18nProvider } from '@lingui/react';
import type { ChatScreenProps, UiKit } from '../ui-kit';
import { UiKitContext } from './ui-kit-context';
import { ProxyChatScreen } from './proxy-chat-screen';

function Probe({ name, onMount }: { name: string; onMount?: () => void }) {
  useEffect(() => {
    onMount?.();
  }, [onMount]);
  return <span>{name}</span>;
}

function renderScreen(props: Partial<ChatScreenProps> = {}) {
  return render(
    <ProxyChatScreen
      section="rooms"
      activeRoomId={null}
      rail={<Probe name="rail" />}
      rooms={<Probe name="rooms" />}
      chat={<Probe name="chat" />}
      settings={<Probe name="settings" />}
      bottomNavigation={<Probe name="bottom-nav" />}
      {...props}
    />,
  );
}

beforeAll(() => {
  i18n.loadAndActivate({ locale: 'en', messages: {} });
});

describe('ProxyChatScreen', () => {
  it('renders every named slot once', () => {
    renderScreen();
    expect(screen.getByText('rail')).toBeTruthy();
    expect(screen.getByText('rooms')).toBeTruthy();
    expect(screen.getByText('chat')).toBeTruthy();
    expect(screen.getByText('settings')).toBeTruthy();
    expect(screen.getByText('bottom-nav')).toBeTruthy();
  });

  it('marks the active section panel and hides the rest semantically', () => {
    const { container } = renderScreen({ section: 'chat', activeRoomId: '!a:hs' });
    const rooms = container.querySelector('[data-sn-panel="rooms"]');
    const chat = container.querySelector('[data-sn-panel="chat"]');
    expect(rooms?.hasAttribute('hidden')).toBe(true);
    expect(chat?.hasAttribute('hidden')).toBe(false);
  });

  it('keeps controllers mounted while sections change', () => {
    const roomMounts = vi.fn();
    const chatMounts = vi.fn();
    const { rerender } = render(
      <ProxyChatScreen
        section="rooms"
        activeRoomId={null}
        rail={null}
        rooms={<Probe name="rooms" onMount={roomMounts} />}
        chat={<Probe name="chat" onMount={chatMounts} />}
        settings={null}
        bottomNavigation={null}
      />,
    );
    rerender(
      <ProxyChatScreen
        section="chat"
        activeRoomId="!a:hs"
        rail={null}
        rooms={<Probe name="rooms" onMount={roomMounts} />}
        chat={<Probe name="chat" onMount={chatMounts} />}
        settings={null}
        bottomNavigation={null}
      />,
    );
    rerender(
      <ProxyChatScreen
        section="settings"
        activeRoomId="!a:hs"
        rail={null}
        rooms={<Probe name="rooms" onMount={roomMounts} />}
        chat={<Probe name="chat" onMount={chatMounts} />}
        settings={null}
        bottomNavigation={null}
      />,
    );
    expect(roomMounts).toHaveBeenCalledTimes(1);
    expect(chatMounts).toHaveBeenCalledTimes(1);
  });

  it('keeps the settings container mounted and hidden when closed', () => {
    const { container } = renderScreen();
    const settings = container.querySelector('[data-sn-panel="settings"]');
    expect(settings).toBeTruthy();
    expect(settings?.hasAttribute('hidden')).toBe(true);
  });

  it('delegates the whole shell to the active kit', () => {
    const Custom = ({ section }: ChatScreenProps) => <span>{`kit:${section}`}</span>;
    const kit = { ChatScreen: Custom } as unknown as UiKit;
    render(
      <I18nProvider i18n={i18n}>
        <UiKitContext.Provider value={kit}>
          <ProxyChatScreen
            section="settings"
            activeRoomId={null}
            rail={null}
            rooms={null}
            chat={null}
            settings={null}
            bottomNavigation={null}
          />
        </UiKitContext.Provider>
      </I18nProvider>,
    );
    expect(screen.getByText('kit:settings')).toBeTruthy();
  });

  /**
   * Regression: the compact navigation slot used to share the row with the
   * panels, so it rendered as a third column beside the list instead of below
   * it. Panels and the bar must not be siblings on the cross axis.
   */
  it('places the compact navigation below the panels, not beside them', () => {
    const { container } = renderScreen();
    const bottomNav = container.querySelector('[data-sn-nav="bottom"]');
    const panel = container.querySelector('[data-sn-panel="rooms"]');
    expect(bottomNav).toBeTruthy();
    expect(panel).toBeTruthy();
    // The panel row must not contain the bar: same flex container would make
    // the bar a column beside the list.
    const row = panel?.parentElement ?? null;
    expect(row).not.toBeNull();
    expect(row?.contains(bottomNav ?? null)).toBe(false);
    expect(row?.parentElement?.contains(bottomNav ?? null)).toBe(true);
  });

  it('shows only the requested panel on compact', () => {
    const media = { matches: false, listeners: new Set<() => void>() };
    window.matchMedia = ((query: string) => ({
      get matches() {
        return media.matches;
      },
      media: query,
      onchange: null,
      addEventListener: (_t: string, l: () => void) => media.listeners.add(l),
      removeEventListener: (_t: string, l: () => void) => media.listeners.delete(l),
      addListener: (l: () => void) => media.listeners.add(l),
      removeListener: (l: () => void) => media.listeners.delete(l),
      dispatchEvent: () => true,
    })) as unknown as typeof window.matchMedia;

    const { container, rerender } = renderScreen({ section: 'rooms' });
    expect(container.querySelector('[data-sn-panel="rooms"]')?.hasAttribute('hidden')).toBe(false);
    expect(container.querySelector('[data-sn-panel="chat"]')?.hasAttribute('hidden')).toBe(true);

    rerender(
      <ProxyChatScreen
        section="chat"
        activeRoomId="!a:hs"
        rail={<Probe name="rail" />}
        rooms={<Probe name="rooms" />}
        chat={<Probe name="chat" />}
        settings={<Probe name="settings" />}
        bottomNavigation={<Probe name="bottom-nav" />}
      />,
    );
    expect(container.querySelector('[data-sn-panel="chat"]')?.hasAttribute('hidden')).toBe(false);
  });
});
