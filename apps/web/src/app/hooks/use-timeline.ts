import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ReceiptType } from 'matrix-js-sdk';
import type { RoomMessageEventContent } from 'matrix-js-sdk/lib/@types/events';
import type { MatrixClient, MatrixEvent } from 'matrix-js-sdk';
import type { MatrixEncryptedFile } from '../../lib/attachment-crypto';
import { getMatrixClient } from '../../client/init-matrix';
import { encryptAttachment } from '../../lib/attachment-crypto';
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
  content: { body: string; formattedBody?: string; msgtype?: string; url?: string; file?: MatrixEncryptedFile; info?: { size?: number } };
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
  live: { getNeighbouringTimeline(dir: string): unknown | null },
): Array<Parameters<MatrixClient['paginateEventTimeline']>[0]> {
  const chain: unknown[] = [live];
  let oldest: unknown = live;
  while (true) {
    const prev = (oldest as {
      getNeighbouringTimeline?(dir: string): unknown | null;
    }).getNeighbouringTimeline?.('b');
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
      url?: string;
      file?: MatrixEncryptedFile;
      info?: { size?: number };
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
        url: content.url,
        file: content.file,
        info: content.info,
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
      prev.content.msgtype === item.content.msgtype &&
      prev.content.url === item.content.url &&
      prev.content.file === item.content.file &&
      prev.content.info === item.content.info;
    return sameShape ? prev : item;
  });
}

/**
 * Повторная расшифровка undecrypted-событий после подгрузки истории:
 * paginateEventTimeline не трогает шифрование — rust-crypto хранит ключи
 * сессий, но расшифровку старых событий надо запросить вручную.
 */
function retryDecryption(
  client: MatrixClient,
  live: { getNeighbouringTimeline(dir: string): unknown | null },
): void {
  const crypto = client.getCrypto?.();
  if (!crypto) return;
  for (const timeline of collectLinkedTimelines(live)) {
    const events = timeline.getEvents() as Array<{
      shouldAttemptDecryption?: () => boolean;
      attemptDecryption?: (crypto: unknown, opts?: { isRetry?: boolean }) => Promise<void>;
    }>;
    for (const event of events) {
      if (!event.shouldAttemptDecryption?.()) continue;
      void event.attemptDecryption?.(crypto, { isRetry: true }).catch(() => undefined);
    }
  }
}

const PREPARE_ENCRYPT_INTERVAL_MS = 60_000;
const lastPrepareAt = new Map<string, number>();

/**
 * prepareToEncrypt перед отправкой — не чаще раза в минуту на комнату
 * (rust-crypto сам догружает ключи, дроссель только экономит CPU).
 */
export function prepareToEncryptThrottled(roomId: string): void {
  try {
    const client = getMatrixClient();
    const crypto = client.getCrypto();
    if (!crypto) return;
    const now = Date.now();
    const last = lastPrepareAt.get(roomId) ?? 0;
    if (now - last < PREPARE_ENCRYPT_INTERVAL_MS) return;
    const room = client.getRoom(roomId);
    if (!room) return;
    lastPrepareAt.set(roomId, now);
    crypto.prepareToEncrypt(room);
  } catch {
    // no active client — nothing to prepare
  }
}

/** Бейдж «Зашифровано»: комната анонсирует m.room.encryption и крипто включено. */
export function useRoomEncrypted(roomId: string | null): boolean {
  const [encrypted, setEncrypted] = useState(false);
  useEffect(() => {
    if (!roomId) {
      setEncrypted(false);
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const crypto = getMatrixClient().getCrypto();
        if (!crypto) return;
        const enabled = await crypto.isEncryptionEnabledInRoom(roomId);
        if (!cancelled) setEncrypted(enabled);
      } catch {
        // no client / crypto — treat as unencrypted
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [roomId]);
  return encrypted;
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
    return typeof (oldest as { getPaginationToken(dir: string): unknown }).getPaginationToken('b') === 'string';
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
      retryDecryption(client, live);
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
  const content: {
    msgtype: string;
    body: string;
    formatted_body?: string;
    format?: string;
  } = { msgtype: 'm.text', body };
  if (formattedBody !== undefined) {
    content.formatted_body = formattedBody;
    content.format = 'org.matrix.custom.html';
  }
  await client.sendMessage(roomId, content as unknown as RoomMessageEventContent);
}

/**
 * Uploads a file and sends it as `m.image` (images) or `m.file`.
 * `onProgress` receives a 0..1 fraction while the upload runs.
 */
async function readFileBytes(file: File): Promise<ArrayBuffer> {
  if (typeof file.arrayBuffer === 'function') return file.arrayBuffer();
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error ?? new Error('Unable to read attachment'));
    reader.onload = () => {
      if (reader.result instanceof ArrayBuffer) resolve(reader.result);
      else reject(new Error('Unable to read attachment'));
    };
    reader.readAsArrayBuffer(file);
  });
}

export async function sendMessageFile(
  roomId: string,
  file: File,
  onProgress?: (progress: number) => void,
): Promise<void> {
  const client = getMatrixClient();
  const getEncryptionState = async (): Promise<boolean> => {
    const currentRoom = client.getRoom(roomId);
    const currentCrypto = client.getCrypto();
    if (!currentRoom || !currentCrypto) throw new Error('Cannot determine room encryption state');
    return currentCrypto.isEncryptionEnabledInRoom(roomId);
  };
  const encrypted = await getEncryptionState();
  const mimetype = file.type || 'application/octet-stream';
  const upload = async (payload: Blob, type: string) => client.uploadContent(payload, {
    type,
    progressHandler: (progress: { loaded: number; total: number }) => {
      if (onProgress) {
        const fraction = progress.total > 0 ? progress.loaded / progress.total : 0;
        onProgress(Math.min(1, Math.max(0, fraction)));
      }
    },
  });

  if (encrypted) {
    const { ciphertext, descriptor } = await encryptAttachment(await readFileBytes(file));
    const encryptedBlob = new Blob([ciphertext], { type: 'application/octet-stream' });
    const uploaded = await upload(encryptedBlob, 'application/octet-stream');
    // Re-check at send time: never publish a plaintext MXC reference if room changed state.
    if (!(await getEncryptionState())) {
      throw new Error('Room encryption state changed during attachment upload');
    }
    const content = {
      msgtype: mimetype.startsWith('image/') ? 'm.image' : 'm.file',
      body: file.name,
      filename: file.name,
      file: { ...descriptor, url: uploaded.content_uri },
      info: { size: file.size, mimetype },
    };
    await client.sendMessage(roomId, content as unknown as RoomMessageEventContent);
    return;
  }

  const uploaded = await upload(file, mimetype);
  // Re-check immediately before publishing plaintext MXC reference.
  if (await getEncryptionState()) {
    throw new Error('Room encryption state changed during attachment upload');
  }
  const isImage = mimetype.startsWith('image/');
  const content: {
    msgtype: string;
    body: string;
    filename: string;
    url: string;
    info: { size: number; mimetype: string };
  } = {
    msgtype: isImage ? 'm.image' : 'm.file',
    body: file.name,
    filename: file.name,
    url: uploaded.content_uri,
    info: { size: file.size, mimetype },
  };
  await client.sendMessage(roomId, content as unknown as RoomMessageEventContent);
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
