import type { SlidingSyncRoomListResponse } from '@sewer-net/types';
import { mapSyncedRooms } from './matrix.controller';

/**
 * Ответ sliding-sync от matrix.org кладёт состояние в `required_state`,
 * а `timeline` — просто массив (не `{ events }`). Эти имена полей —
 * источник регрессий, поэтому фиксируем их тестом.
 */
function makeResponse(): SlidingSyncRoomListResponse {
  return {
    pos: '123/456',
    lists: {
      all_rooms: {
        count: 2,
        ops: [
          {
            op: 'SYNC',
            range: [0, 19],
            room_ids: ['!a:matrix.org', '!b:matrix.org'],
          },
        ],
      },
    },
    rooms: {
      '!a:matrix.org': {
        name: 'Top-level name',
        avatar: 'mxc://example/avatar',
        required_state: [
          {
            type: 'm.room.name',
            state_key: '',
            content: { name: 'Room A' },
          },
          {
            type: 'm.room.topic',
            state_key: '',
            content: { topic: 'Topic A' },
          },
        ],
        timeline: [
          {
            origin_server_ts: 1_500,
            content: { msgtype: 'm.text', body: 'latest message' },
          },
        ],
      },
      '!b:matrix.org': {
        // Без required_state: имя и аватар берём с верхнего уровня.
        // Без timeline: preview/lastTs не определены.
        name: 'Room B',
        avatar: 'mxc://example/b',
      },
    },
    extensions: {},
  } as SlidingSyncRoomListResponse;
}

describe('mapSyncedRooms', () => {
  it('reads state from required_state, not state', () => {
    const rooms = mapSyncedRooms(makeResponse());
    const a = rooms.find((room) => room.room_id === '!a:matrix.org');
    expect(a?.name).toBe('Room A');
    expect(a?.topic).toBe('Topic A');
  });

  it('reads preview and lastTs from the timeline array', () => {
    const rooms = mapSyncedRooms(makeResponse());
    const a = rooms.find((room) => room.room_id === '!a:matrix.org');
    expect(a?.preview).toBe('latest message');
    expect(a?.lastTs).toBe(1_500);
  });

  it('falls back to the top-level name and avatar', () => {
    const rooms = mapSyncedRooms(makeResponse());
    const b = rooms.find((room) => room.room_id === '!b:matrix.org');
    expect(b?.name).toBe('Room B');
    expect(b?.avatar).toBe('mxc://example/b');
    expect(b?.preview).toBeUndefined();
    expect(b?.lastTs).toBeUndefined();
  });

  it('omits rooms missing from the response and sorts by lastTs', () => {
    const rooms = mapSyncedRooms(makeResponse());
    expect(rooms.map((room) => room.room_id)).toEqual([
      '!a:matrix.org',
      '!b:matrix.org',
    ]);
  });
});
