import { render, screen, fireEvent } from '@testing-library/react';
import { I18nProvider } from '@lingui/react';
import { i18n } from '@lingui/core';
import { UiKitProvider } from '@sewer-net/ui';
import { IconSetProvider } from '@sewer-net/icons';
import { MemoryRouter } from 'react-router-dom';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { useRooms, type RoomEntry } from '../hooks/use-rooms';
import { useChatStore } from '../stores/chat-store';
import { ChatScreen } from './chat-screen';

vi.mock('../hooks/use-rooms', () => ({
  useRooms: vi.fn(),
}));

// ChatView derives its timeline from the SDK singleton; chat-screen tests
// only cover the layout, so the timeline hook is stubbed.
vi.mock('../hooks/use-timeline', () => ({
  useTimeline: vi.fn(() => ({
    items: [],
    hasMore: false,
    loadOlder: vi.fn(),
    isLoading: false,
  })),
  useRoomEncrypted: vi.fn(() => false),
  prepareToEncryptThrottled: vi.fn(),
  sendMessageText: vi.fn(),
  sendMessageFile: vi.fn(),
  markRoomRead: vi.fn(),
}));

const mockedUseRooms = vi.mocked(useRooms);

function renderScreen() {
  return render(
    <I18nProvider i18n={i18n}>
      <UiKitProvider>
        <IconSetProvider>
          <MemoryRouter initialEntries={['/']}>
            <ChatScreen />
          </MemoryRouter>
        </IconSetProvider>
      </UiKitProvider>
    </I18nProvider>,
  );
}

beforeAll(() => {
  i18n.loadAndActivate({ locale: 'en', messages: {} });
});

beforeEach(() => {
  vi.clearAllMocks();
  useChatStore.setState({ activeRoomId: null, section: 'rooms', error: null });
});

describe('ChatScreen', () => {
  it('renders the room list from the SDK store', () => {
    const rooms: RoomEntry[] = [
      { roomId: '!a:h.example', name: 'Alpha', preview: 'first' },
    ];
    mockedUseRooms.mockReturnValue(rooms);

    renderScreen();

    expect(screen.getByText('Alpha')).toBeTruthy();
    expect(screen.getByText('first')).toBeTruthy();
  });

  it('keeps room selection in the chat store', () => {
    mockedUseRooms.mockReturnValue([]);
    renderScreen();
    expect(useChatStore.getState().activeRoomId).toBeNull();
  });

  it('falls back to the room list when the chat section has no room', () => {
    mockedUseRooms.mockReturnValue([]);
    useChatStore.setState({ activeRoomId: null, section: 'chat' });

    const { container } = renderScreen();

    const shell = container.querySelector('[data-sn-section]');
    expect(shell?.getAttribute('data-sn-section')).toBe('rooms');
    expect(container.querySelector('[data-sn-panel="rooms"]')?.hasAttribute('hidden')).toBe(false);
    expect(container.querySelector('[data-sn-panel="chat"]')?.hasAttribute('hidden')).toBe(true);
  });

  it('opens the chat section when a room is selected', () => {
    mockedUseRooms.mockReturnValue([{ roomId: '!a:h.example', name: 'Alpha' }]);

    const { container } = renderScreen();
    fireEvent.click(screen.getByText('Alpha'));

    const shell = container.querySelector('[data-sn-section]');
    expect(shell?.getAttribute('data-sn-section')).toBe('chat');
    expect(container.querySelector('[data-sn-panel="chat"]')?.hasAttribute('hidden')).toBe(false);
  });

  it('keeps the room search query across section changes', () => {
    mockedUseRooms.mockReturnValue([
      { roomId: '!a:h.example', name: 'Alpha' },
      { roomId: '!b:h.example', name: 'Beta' },
    ]);

    renderScreen();
    fireEvent.change(screen.getByPlaceholderText('Search'), { target: { value: 'alp' } });
    fireEvent.click(screen.getByText('Alpha'));
    expect(useChatStore.getState().section).toBe('chat');

    fireEvent.click(screen.getByRole('button', { name: 'Chats' }));

    const search = screen.getByPlaceholderText('Search') as HTMLInputElement;
    expect(search.value).toBe('alp');
    expect(screen.queryByText('Beta')).toBeNull();
  });
});
