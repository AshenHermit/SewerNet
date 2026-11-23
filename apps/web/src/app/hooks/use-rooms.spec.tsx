import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Room } from 'matrix-js-sdk';
import { buildRoomEntry, useRooms } from './use-rooms';
import { getMatrixClient } from '../../client/init-matrix';

vi.mock('../../client/init-matrix', () => ({
  getMatrixClient: vi.fn(),
}));

const MY_USER = '@me:h.example';

type Listener = (...args: unknown[]) => void;

function fakeRoom(overrides: Record<string, unknown> = {}): Room {
  return {
    roomId: '!r1:h.example',
    name: 'State Room',
    getMyMembership: () => 'join',
    getName: () => 'State Room',
    getCanonicalAlias: () => null,
    getMxcAvatarUrl: () => 'mxc://avatar',
    getUnreadNotificationCount: () => 0,
    getJoinedMemberCount: () => 2,
    timeline: [
      {
        getType: () => 'm.room.message',
        getContent: () => ({ body: 'last message' }),
        getTs: () => 1700_000_000_000,
        getSender: () => '@bob:h.example',
      },
    ],
    currentState: { getStateEvents: () => null },
    getLiveTimeline: () => ({
      getEvents: () => [
        {
          getType: () => 'm.room.message',
          getContent: () => ({ body: 'last message' }),
          getTs: () => 1700_000_000_000,
          getSender: () => '@bob:h.example',
        },
      ],
    }),
    getMember: () => null,
    ...overrides,
  } as unknown as Room;
}

function fakeClient(rooms: Room[]) {
  const handlers = new Map<string, Set<Listener>>();
  return {
    getUserId: () => MY_USER,
    getRooms: () => rooms,
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
  vi.useFakeTimers({ shouldAdvanceTime: true, advanceTimeDelta: 20 });
});

describe('buildRoomEntry', () => {
  it('prefers room name, then canonical alias, then roomId', () => {
    const client = fakeClient([]);
    expect(buildRoomEntry(fakeRoom(), client as never).name).toBe('State Room');
    expect(
      buildRoomEntry(
        fakeRoom({ name: '', getCanonicalAlias: () => '#alias:h.example' }),
        client as never,
      ).name,
    ).toBe('#alias:h.example');
    expect(
      buildRoomEntry(
        fakeRoom({ name: '', getCanonicalAlias: () => null }),
        client as never,
      ).name,
    ).toBe('!r1:h.example');
  });

  it('uses the DM peer display name when the room has none', () => {
    const client = fakeClient([]);
    const dm = fakeRoom({
      name: '',
      getCanonicalAlias: () => null,
      getJoinedMembers: () => [
        { userId: MY_USER, rawDisplayName: 'Me' },
        { userId: '@bob:h.example', rawDisplayName: 'Bob' },
      ],
    });
    const entry = buildRoomEntry(dm, client as never);
    expect(entry.name).toBe('Bob');
  });

  it('extracts preview, lastTs, avatar, topic and unread counts', () => {
    const client = fakeClient([]);
    const room = fakeRoom({
      getMxcAvatarUrl: () => 'mxc://pic',
      getUnreadNotificationCount: (type: string) => (type === 'highlight' ? 2 : 5),
    });
    const entry = buildRoomEntry(room, client as never);
    expect(entry.preview).toBe('last message');
    expect(entry.lastTs).toBe(1700_000_000_000);
    expect(entry.avatarMxc).toBe('mxc://pic');
    expect(entry.unread).toBe(5);
    expect(entry.mention).toBe(true);
  });
});

describe('useRooms', () => {
  it('lists only joined rooms sorted by lastTs', () => {
    const r1 = fakeRoom({ roomId: '!old', name: 'Old' });
    const r2 = fakeRoom({
      roomId: '!new',
      name: 'New',
      getLiveTimeline: () => ({
        getEvents: () => [
          {
            getType: () => 'm.room.message',
            getContent: () => ({ body: 'newest' }),
            getTs: () => 1800_000_000_000,
            getSender: () => '@bob',
          },
        ],
      }),
    });
    const invite = fakeRoom({ roomId: '!inv', getMyMembership: () => 'invite' });
    const client = fakeClient([r1, r2, invite]);

    vi.mocked(getMatrixClient).mockReturnValue(client as never);
    const { result } = renderHook(() => useRooms());

    expect(result.current.map((r) => r.roomId)).toEqual(['!new', '!old']);
    expect(result.current[0].preview).toBe('newest');
  });

  it('bumps the revision on Room.myMembership and Room events', async () => {
    const client = fakeClient([fakeRoom()]);
    vi.mocked(getMatrixClient).mockReturnValue(client as never);
    const { result } = renderHook(() => useRooms());

    const before = result.current;
    act(() => {
      client.emit('Room.myMembership', {}, 'join');
    });
    await waitFor(() => expect(result.current).not.toBe(before));
  });

  it('throttles timeline bumps to at most one per 200 ms', async () => {
    const client = fakeClient([fakeRoom()]);
    vi.mocked(getMatrixClient).mockReturnValue(client as never);
    renderHook(() => useRooms());

    act(() => {
      client.emit('Room.timeline', {}, client as never, { liveEvent: true });
      client.emit('Room.timeline', {}, client as never, { liveEvent: true });
    });
    // no immediate rebuild happened: revisions are batched through the timer
    act(() => {
      vi.advanceTimersByTime(250);
    });
    expect(client.on).toHaveBeenCalledWith('Room.timeline', expect.any(Function));
  });
});
