import { useCallback, useMemo, useState } from 'react';
import type { MatrixClient, MatrixEvent, Room } from 'matrix-js-sdk';
import { NotificationCountType } from 'matrix-js-sdk';
import { getMatrixClient } from '../../client/init-matrix';
import { useMatrixEvent } from './use-matrix-event';

export interface RoomEntry {
  roomId: string;
  name: string;
  avatarMxc?: string;
  topic?: string;
  preview?: string;
  lastTs?: number;
  unread?: number;
  mention?: boolean;
}

/** Последний event живого таймлайна с текстовым body (для превью). */
function lastPreviewableEvent(room: Room): MatrixEvent | undefined {
  const events =
    typeof room.getLiveTimeline === 'function'
      ? (room.getLiveTimeline()?.getEvents() ?? [])
      : [];
  for (let i = events.length - 1; i >= 0; i -= 1) {
    const event = events[i];
    const body = event.getContent()?.body;
    if (typeof body === 'string' && body.length > 0) {
      return event;
    }
  }
  return undefined;
}

function roomTopic(room: Room): string | undefined {
  const event = room.currentState?.getStateEvents('m.room.topic', '');
  const topic = event?.getContent()?.topic;
  return typeof topic === 'string' && topic.length > 0 ? topic : undefined;
}

function dmPeerName(room: Room, client: MatrixClient): string | undefined {
  const me = client.getUserId();
  const members = room.getJoinedMembers?.() ?? [];
  const peer = members.find((member) => member.userId !== me);
  return peer?.rawDisplayName ?? peer?.name ?? peer?.userId;
}

/** Имя: SDK-имя → canonical alias → собеседник DM → roomId. */
export function buildRoomEntry(room: Room, client: MatrixClient): RoomEntry {
  const name =
    room.name ||
    room.getCanonicalAlias() ||
    dmPeerName(room, client) ||
    room.roomId;

  const previewEvent = lastPreviewableEvent(room);

  return {
    roomId: room.roomId,
    name,
    avatarMxc:
      typeof room.getMxcAvatarUrl === 'function'
        ? (room.getMxcAvatarUrl() ?? undefined)
        : undefined,
    topic: roomTopic(room),
    preview: previewEvent ? (previewEvent.getContent()?.body as string) : undefined,
    lastTs: previewEvent ? previewEvent.getTs() : undefined,
    unread:
      typeof room.getUnreadNotificationCount === 'function'
        ? room.getUnreadNotificationCount(NotificationCountType.Total) || undefined
        : undefined,
    mention:
      typeof room.getUnreadNotificationCount === 'function'
        ? room.getUnreadNotificationCount(NotificationCountType.Highlight) > 0
        : false,
  };
}

/**
 * Список комнат из SDK: getRooms() пересобирается по ревижену, события
 * SDK-клиента бампают счётчик. Ленточные события (timeline/receipt/...)
 * дедуцируются через throttle 200 мс.
 */
export function useRooms(): RoomEntry[] {
  const client = getMatrixClient();
  const [revision, setRevision] = useState(0);
  const bump = useCallback(() => setRevision((n) => n + 1), []);

  const timers = useMemo(() => new Map<string, ReturnType<typeof setTimeout>>(), []);
  const throttledBump = useCallback(
    (key: string) => {
      if (timers.has(key)) return;
      const timer = setTimeout(() => {
        timers.delete(key);
        bump();
      }, 200);
      timers.set(key, timer);
    },
    [timers, bump],
  );

  useMatrixEvent('Room', bump);
  useMatrixEvent('Room.myMembership', bump);
  useMatrixEvent('RoomState.events', bump);
  useMatrixEvent('sync', bump);
  useMatrixEvent('accountData', () => throttledBump('accountData'));
  useMatrixEvent('Room.timeline', () => throttledBump('timeline'));
  useMatrixEvent('Room.receipt', () => throttledBump('receipt'));
  useMatrixEvent('Room.UnreadNotifications', () => throttledBump('unread'));
  useMatrixEvent('Event.decrypted', () => throttledBump('decrypted'));

  const entries = useMemo(
    () =>
      client
        .getRooms()
        .filter((room) => room.getMyMembership() === 'join')
        .map((room) => buildRoomEntry(room, client))
        .sort((a, b) => (b.lastTs ?? 0) - (a.lastTs ?? 0)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [client, revision],
  );

  return entries;
}
