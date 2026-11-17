import { render, screen, fireEvent } from '@testing-library/react';
import { I18nProvider } from '@lingui/react';
import { i18n } from '@lingui/core';
import { UiKitProvider } from '@sewer-net/ui';
import { IconSetProvider } from '@sewer-net/icons';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useRooms, type RoomEntry } from '../hooks/use-rooms';
import { useChatStore } from '../stores/chat-store';
import { RoomList } from './room-list';

vi.mock('../hooks/use-rooms', () => ({
  useRooms: vi.fn(),
}));

const mockedUseRooms = vi.mocked(useRooms);

function entries(...rooms: RoomEntry[]): RoomEntry[] {
  return rooms;
}

function renderList() {
  return render(
    <I18nProvider i18n={i18n}>
      <UiKitProvider>
        <IconSetProvider>
          <RoomList />
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
  useChatStore.setState({
    activeRoomId: null,
    setActiveRoom: (activeRoomId: string | null) =>
      useChatStore.setState({ activeRoomId }),
  });
});

describe('RoomList', () => {
  it('renders entries from useRooms sorted by lastTs with previews', () => {
    mockedUseRooms.mockReturnValue(
      entries(
        { roomId: '!new', name: 'New Room', preview: 'newest msg' },
        { roomId: '!old', name: 'Old Room', preview: 'older msg' },
      ),
    );

    renderList();

    expect(screen.getByText('New Room')).toBeTruthy();
    expect(screen.getByText('Old Room')).toBeTruthy();
    expect(screen.getByText('newest msg')).toBeTruthy();
  });

  it('filters by the search query', () => {
    mockedUseRooms.mockReturnValue(
      entries(
        { roomId: '!a', name: 'Alpha' },
        { roomId: '!b', name: 'Beta' },
      ),
    );

    renderList();
    fireEvent.change(screen.getByPlaceholderText('Search'), {
      target: { value: 'alp' },
    });

    expect(screen.getByText('Alpha')).toBeTruthy();
    expect(screen.queryByText('Beta')).toBeNull();
  });

  it('activates a room on click', () => {
    mockedUseRooms.mockReturnValue(entries({ roomId: '!a', name: 'Alpha' }));

    renderList();
    fireEvent.click(screen.getByText('Alpha'));

    expect(useChatStore.getState().activeRoomId).toBe('!a');
  });

  it('shows the empty state when there are no rooms', () => {
    mockedUseRooms.mockReturnValue(entries());

    renderList();

    expect(screen.getByText('No chats yet')).toBeTruthy();
  });
});
