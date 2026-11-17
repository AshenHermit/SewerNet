import { render, screen } from '@testing-library/react';
import { I18nProvider } from '@lingui/react';
import { i18n } from '@lingui/core';
import { UiKitProvider } from '@sewer-net/ui';
import { IconSetProvider } from '@sewer-net/icons';
import { MemoryRouter } from 'react-router-dom';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { useRooms, type RoomEntry } from '../hooks/use-rooms';
import { matrixClient } from '../../lib/matrix-client';
import { useChatStore } from '../stores/chat-store';
import { ChatScreen } from './chat-screen';

vi.mock('../../lib/matrix-client', () => ({
  matrixClient: {
    getSyncedRooms: vi.fn(),
    getJoinedRooms: vi.fn(),
    getRoomState: vi.fn(),
    getMessages: vi.fn(),
    getRoomMembers: vi.fn(),
    getRoomThreads: vi.fn(),
    getRoomAliases: vi.fn(),
    setReadMarkers: vi.fn(),
    sendMessage: vi.fn(),
    whoami: vi.fn(),
  },
  MatrixApiError: class MatrixApiError extends Error {
    constructor(
      public status: number,
      public errcode: string,
    ) {
      super(errcode);
    }
  },
  refreshOauthToken: vi.fn(),
}));

vi.mock('../hooks/use-rooms', () => ({
  useRooms: vi.fn(),
}));

const mockedUseRooms = vi.mocked(useRooms);
const mockedGetSyncedRooms = vi.mocked(matrixClient.getSyncedRooms);

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
  useChatStore.setState({
    activeRoomId: null,
    error: null,
  });
});

describe('ChatScreen', () => {
  it('renders the room list from the SDK store without any legacy room-list fetch', () => {
    const rooms: RoomEntry[] = [
      { roomId: '!a:h.example', name: 'Alpha', preview: 'first' },
    ];
    mockedUseRooms.mockReturnValue(rooms);

    renderScreen();

    expect(mockedGetSyncedRooms).not.toHaveBeenCalled();
    expect(screen.getByText('Alpha')).toBeTruthy();
    expect(screen.getByText('first')).toBeTruthy();
  });

  it('keeps room selection in the chat store', () => {
    mockedUseRooms.mockReturnValue([]);
    renderScreen();
    expect(useChatStore.getState().activeRoomId).toBeNull();
  });
});
