import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ReceiptType } from 'matrix-js-sdk';
import type { MatrixClient, MatrixEvent } from 'matrix-js-sdk';
import { getMatrixClient } from '../../client/init-matrix';
import { useMatrixEvent } from './use-matrix-event';

const PAGINATION_LIMIT = 80;

/**
 * Плоская проекция одного события таймлайна для рендера.
 * pending — статус локального эха (SENDING/QUEUED/ENCRYPTING/NOT_SENT);
 * 'not_sent' превращается в pending-значение, отличие — красный стиль в UI.
 */
export interface TimelineItem {
  eventId: string;
  event: MatrixEvent;
  ts: number;
  sender: string;
  content: { body: string; formattedBody?: string; msgtype?: string };
  own: boolean;
  pending?: 'sending' | 'queued' | 'encrypting' | 'not_sent';
  redacted?: boolean;
}

const RECEIPTABLE_TYPES = ['m.room.message', 'm.room.encrypted', 'm.sticker'];

function isPendingEvent(event: MatrixEvent): boolean {
  return event.status !== null || !!event.getId()?.startsWith('~');
}

/** Последнее событие, по которому можно поставить прочтение. */
function findLastReceiptableEvent(events: MatrixEvent[]): MatrixEvent | null {
  for (let i = events.length - 1; i >= 0; i--) {
    const event = events[i];
    if (event.isRedacted?.()) continue;
    if (isPendingEvent(event)) continue;
    if (RECEIPTABLE_TYPES.includes(event.getType())) {
      return event;
    }
  }
  return null;
}

/**
 * Цепочка linked timelines от самого старого соседа до live.
 * paginateEventTimeline сам линкует новый таймлайн через
 * setNeighbouringTimeline — просто обходим prev-ссылки.
 */
function collectLinkedTimelines(
  live: { getNeighbouringTimeline: (dir: string) => unknown | null } & object,
): Array<Parameters<MatrixClient['paginateEventTimeline']>[0]> {
  const chain: unknown[] = [live];
  let oldest: unknown = live;
  while (true) {
    const prev = (oldest as { getNeighbouringTimeline?: (dir: string) => unknown })
      .getNeighbouringTimeline?.('b');
    if (!prev || chain.includes(prev)) break;
    chain.unshift(prev);
    oldest = prev;
  }
  return chain as Array<Parameters<MatrixClient['paginateEventTimeline']>[0]>;
}

function buildItems(
  events: MatrixEvent[],
  client: MatrixClient | null,
): TimelineItem[] {
  if (!client) return [];
  const myId = client.getUserId() ?? '';
  return events.map((event) => {
    const status = event.status;
    const pending =
      status === 'sending'
        ? 'sending'
        : status === 'queued'
          ? 'queued'
          : status === 'encrypting'
            ? 'encrypting'
            : status === 'not_sent'
              ? 'not_sent'
              : undefined;
    const content = event.getContent() as {
      body?: string;
      formatted_body?: string;
      msgtype?: string;
    };
    const item: TimelineItem = {
      eventId: event.getId() ?? '',
      event,
      ts: event.getTs(),
      sender: event.getSender() ?? '',
      content: {
        body: content.body ?? '',
        formattedBody: content.formatted_body,
        msgtype: content.msgtype,
      },
      own: event.getSender() === myId,
      redacted: event.isRedacted() || undefined,
    };
    if (pending) item.pending = pending;
    return item;
  });
}

/** Возвращает предыдущие item-объекты для неизменённых событий (стабильный identity). */
function mergePreservingIdentity(
  built: TimelineItem[],
  previous: TimelineItem[],
): TimelineItem[] {
  if (previous.length === 0) return built;
  const prevById = new Map<string, TimelineItem>();
  for (const item of previous) prevById.set(item.eventId, item);
  return built.map((item) => {
    const prev = prevById.get(item.eventId);
    if (!prev) return item;
    const sameShape =
      prev.ts === item.ts &&
      prev.sender === item.sender &&
      prev.own === item.own &&
      prev.pending === item.pending &&
      prev.redacted === item.redacted &&
      prev.content.body === item.content.body &&
      prev.content.formattedBody === item.content.formattedBody &&
      prev.content.msgtype === item.content.msgtype;
    return sameShape ? prev : item;
  });
}

export function useTimeline(roomId: string | null): {
  items: TimelineItem[];
  hasMore: boolean;
  loadOlder: () => Promise<void>;
  isLoading: boolean;
} {
  const [revision, setRevision] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const loadingRef = useRef(false);

  const client = roomId ? getMatrixClient() : null;

  // Плоский список событий по всей цепочке linked timelines (старые → live).
  const events = useMemo(() => {
    if (!client || !roomId) return [];
    const room = client.getRoom(roomId);
    const live = room?.getLiveTimeline();
    if (!live) return [];
    const out: MatrixEvent[] = [];
    for (const timeline of collectLinkedTimelines(live)) {
      out.push(...timeline.getEvents());
    }
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [client, roomId, revision]);

  const hasMore = useMemo(() => {
    if (!client || !roomId) return false;
    const live = client.getRoom(roomId)?.getLiveTimeline();
    if (!live) return false;
    const chain = collectLinkedTimelines(live);
    const oldest = chain[0];
    if (!oldest) return false;
    return typeof oldest.getPaginationToken('b') === 'string';
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [client, roomId, revision, events]);

  const prevItemsRef = useRef<TimelineItem[]>([]);
  const items = useMemo(() => {
    const built = buildItems(events, client as MatrixClient);
    const merged = mergePreservingIdentity(built, prevItemsRef.current);
    prevItemsRef.current = merged;
    return merged;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [events]);

  // Новый live-таймлайн при смене комнаты — сброс накопленного.
  useEffect(() => {
    prevItemsRef.current = [];
    setRevision((v) => v + 1);
    setIsLoading(false);
    loadingRef.current = false;
  }, [roomId]);

  const loadOlder = useCallback(async () => {
    if (!client || !roomId || loadingRef.current) return;
    const room = client.getRoom(roomId);
    const live = room?.getLiveTimeline();
    if (!live) return;
    const oldest = collectLinkedTimelines(live)[0];
    if (!oldest) return;
    loadingRef.current = true;
    setIsLoading(true);
    try {
      await client.paginateEventTimeline(oldest, {
        backwards: true,
        limit: PAGINATION_LIMIT,
      });
    } finally {
      loadingRef.current = false;
      setIsLoading(false);
      setRevision((v) => v + 1);
    }
  }, [client, roomId]);

  const scheduleRebuild = useCallback(() => setRevision((v) => v + 1), []);

  useMatrixEvent('Room.redaction', scheduleRebuild);
  useMatrixEvent('Room.localEchoUpdated', scheduleRebuild);
  useMatrixEvent('Event.decrypted', scheduleRebuild);
  useMatrixEvent('Room.timelineReset', scheduleRebuild);
  useMatrixEvent('sync', scheduleRebuild);

  return { items, hasMore, loadOlder, isLoading };
}

export async function sendMessageText(
  roomId: string,
  body: string,
  formattedBody?: string,
): Promise<void> {
  const client = getMatrixClient();
  const content: Record<string, string> = { msgtype: 'm.text', body };
  if (formattedBody !== undefined) {
    content.formatted_body = formattedBody;
    content.format = 'org.matrix.custom.html';
  }
  await client.sendMessage(roomId, content);
}

export function markRoomRead(roomId: string): void {
  const client = getMatrixClient();
  const room = client.getRoom(roomId);
  const live = room?.getLiveTimeline();
  if (!live) return;
  const last = findLastReceiptableEvent(live.getEvents());
  if (!last) return;
  void client.sendReadReceipt(last, ReceiptType.Read, true).catch(() => undefined);
}
