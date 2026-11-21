import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { MatrixClient, MatrixEvent } from 'matrix-js-sdk';
import { getMatrixClient } from '../../client/init-matrix';
import * as attachmentCrypto from '../../lib/attachment-crypto';
import type { MatrixEncryptedFile } from '../../lib/attachment-crypto';
import { markRoomRead, sendMessageFile, sendMessageText, useTimeline } from './use-timeline';

vi.mock('../../client/init-matrix', () => ({
  getMatrixClient: vi.fn(),
}));

vi.mock('../../platform/runtime', () => ({
  getPlatformKind: vi.fn(() => 'browser'),
  getMediaSession: vi.fn(() => ({
    userId: ME,
    deviceId: 'DEVICE',
    baseUrl: 'https://hs.example',
    accessToken: 'tok',
    epoch: 1,
  })),
  getMediaTransport: vi.fn(() => null),
}));

const ROOM_ID = '!r:h.example';
const ME = '@me:h.example';

function blobBytes(blob: Blob): Promise<ArrayBuffer> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error);
    reader.onload = () => resolve(reader.result as ArrayBuffer);
    reader.readAsArrayBuffer(blob);
  });
}

interface FakeEventInit {
  id: string;
  type?: string;
  sender?: string;
  ts?: number;
  body?: string;
  formatted?: string;
  msgtype?: string;
  url?: string;
  file?: MatrixEncryptedFile;
  info?: { size?: number };
  status?: string | null;
  redacted?: boolean;
}

function fakeEvent(init: FakeEventInit): MatrixEvent {
  return {
    getId: () => init.id,
    getType: () => init.type ?? 'm.room.message',
    getSender: () => init.sender ?? '@other:h.example',
    getTs: () => init.ts ?? 1_000,
    getWireType: () => init.type ?? 'm.room.message',
    isDecryptionFailure: () => false,
    getClearContent: () => init.type === 'm.room.encrypted' ? ({ body: init.body ?? init.id, msgtype: init.msgtype, url: init.url, file: init.file, info: init.info }) : null,
    getContent: () => ({
      body: init.body ?? init.id,
      formatted_body: init.formatted,
      msgtype: init.msgtype ?? 'm.text',
      url: init.url,
      file: init.file,
      info: init.info,
    }),
    isRedacted: () => init.redacted ?? false,
    status: init.status ?? null,
  } as unknown as MatrixEvent;
}

class FakeEventTimeline {
  prev: FakeEventTimeline | null = null;
  next: FakeEventTimeline | null = null;
  constructor(
    public events: MatrixEvent[],
    public token: string | null = 'tok-back',
  ) {}
  getEvents(): MatrixEvent[] {
    return this.events;
  }
  getPaginationToken(dir: string): string | null {
    return dir === 'b' ? this.token : null;
  }
  getNeighbouringTimeline(dir: string): FakeEventTimeline | null {
    return dir === 'b' ? this.prev : this.next;
  }
  setNeighbouringTimeline(tl: FakeEventTimeline, dir: string): void {
    if (dir === 'b') this.prev = tl;
    else this.next = tl;
  }
  getTimelineSet(): { getLiveTimeline: () => FakeEventTimeline } {
    return { getLiveTimeline: () => liveTimeline };
  }
  getRoomId(): string {
    return ROOM_ID;
  }
}

let liveTimeline: FakeEventTimeline;
let client: {
  getUserId: () => string;
  getRoom: (id: string) => unknown;
  sendMessage: ReturnType<typeof vi.fn>;
  sendReadReceipt: ReturnType<typeof vi.fn>;
  uploadContent: ReturnType<typeof vi.fn>;
  getCrypto: ReturnType<typeof vi.fn>;
  paginateEventTimeline: ReturnType<typeof vi.fn>;
  on: ReturnType<typeof vi.fn>;
  off: ReturnType<typeof vi.fn>;
};

function setupRoom(events: MatrixEvent[]) {
  liveTimeline = new FakeEventTimeline(events);
  const room = {
    roomId: ROOM_ID,
    getLiveTimeline: () => liveTimeline,
    getUnfilteredTimelineSet: () => ({ getLiveTimeline: () => liveTimeline }),
  };
  const handlers = new Map<string, Array<(...a: unknown[]) => void>>();
  client = {
    getUserId: () => ME,
    getRoom: (id: string) => (id === ROOM_ID ? room : null),
    sendMessage: vi.fn().mockResolvedValue(undefined),
    sendReadReceipt: vi.fn().mockResolvedValue(undefined),
    uploadContent: vi.fn().mockResolvedValue({ content_uri: 'mxc://hs.example/uploaded' }),
    getCrypto: vi.fn().mockReturnValue({ isEncryptionEnabledInRoom: vi.fn().mockResolvedValue(false) }),
    paginateEventTimeline: vi.fn(async (timeline: FakeEventTimeline, opts: { backwards: boolean; limit: number }) => {
      if (!opts.backwards) return;
      const older = new FakeEventTimeline(
        [
          fakeEvent({ id: 'e0', ts: 500, body: 'old one' }),
          fakeEvent({ id: 'e1', ts: 600, body: 'old two', sender: ME }),
        ],
        null,
      );
      older.next = timeline;
      timeline.prev = older;
    }),
    on: vi.fn((event: string, handler: (...a: unknown[]) => void) => {
      const list = handlers.get(event) ?? [];
      list.push(handler);
      handlers.set(event, list);
    }),
    off: vi.fn((event: string, handler: (...a: unknown[]) => void) => {
      const list = handlers.get(event);
      if (!list) return;
      const idx = list.indexOf(handler);
      if (idx >= 0) list.splice(idx, 1);
    }),
  };
  (client as unknown as { __handlers: typeof handlers }).__handlers = handlers;
  vi.mocked(getMatrixClient).mockReturnValue(client as unknown as MatrixClient);
}

beforeEach(() => {
  vi.clearAllMocks();
  setupRoom([
    fakeEvent({ id: 'e3', ts: 3_000, body: 'third' }),
    fakeEvent({ id: 'e2', ts: 2_000, body: 'second', sender: ME }),
    fakeEvent({ id: 'e1x', ts: 1_000, body: 'first', status: 'sending' }),
  ]);
});

describe('useTimeline', () => {
  it('preserves media URL and encrypted descriptor in timeline item', () => {
    const descriptor = {
      v: 'v2' as const, url: 'mxc://hs.example/cipher',
      key: { alg: 'A256CTR', ext: true, k: 'x', key_ops: ['decrypt'], kty: 'oct' }, iv: 'iv', hashes: { sha256: 'hash' },
    };
    setupRoom([fakeEvent({ id: '$media', body: 'photo.png', msgtype: 'm.image', url: descriptor.url, file: descriptor, info: { size: 12 } })]);

    const { result } = renderHook(() => useTimeline(ROOM_ID));
    expect(result.current.items[0]?.content).toMatchObject({
      url: descriptor.url, msgtype: 'm.image', info: { size: 12 }, file: { v: 'v2' },
    });
  });

  it('decrypted_attachment_descriptor_survives_projection', () => {
    const descriptor = {
      v: 'v2' as const, url: 'mxc://hs.example/cipher',
      key: { alg: 'A256CTR', ext: true, k: 'x', key_ops: ['decrypt'], kty: 'oct' }, iv: 'iv', hashes: { sha256: 'hash' },
    };
    setupRoom([fakeEvent({ id: '$media', body: 'photo.png', msgtype: 'm.image', url: descriptor.url, file: descriptor, info: { size: 12 } })]);

    const { result } = renderHook(() => useTimeline(ROOM_ID));
    expect(result.current.items[0]?.content.file).toEqual(descriptor);
  });

  it('descriptor_change_invalidates_item_identity', () => {
    let descriptor = { v: 'v2' as const, url: 'mxc://hs.example/one', key: {} as JsonWebKey, iv: 'iv', hashes: { sha256: 'one' } };
    const message = fakeEvent({ id: '$media', msgtype: 'm.image', url: descriptor.url, file: descriptor });
    vi.spyOn(message, 'getContent').mockImplementation(() => ({ body: '$media', msgtype: 'm.image', url: descriptor.url, file: descriptor }));
    vi.spyOn(message, 'getClearContent').mockImplementation(() => null);
    setupRoom([message]);
    const { result } = renderHook(() => useTimeline(ROOM_ID));
    const original = result.current.items[0];
    descriptor = { ...descriptor, url: 'mxc://hs.example/two', hashes: { sha256: 'two' } };
    act(() => {
      const handlers = (client as unknown as { __handlers: Map<string, Array<(...a: unknown[]) => void>> }).__handlers;
      handlers.get('sync')?.forEach((handler) => handler('SYNCING'));
    });
    expect(result.current.items[0]).not.toBe(original);
    expect(result.current.items[0]?.content.file).toEqual(descriptor);
  });

  it('derives items from the live timeline with own/pending flags', () => {
    const { result } = renderHook(() => useTimeline(ROOM_ID));

    expect(result.current.items).toHaveLength(3);
    const [third, second, first] = result.current.items;
    expect(third?.eventId).toBe('e3');
    expect(third?.content.body).toBe('third');
    expect(third?.own).toBe(false);
    expect(second?.own).toBe(true);
    expect(first?.pending).toBe('sending');
    expect(result.current.hasMore).toBe(true);
  });

  it('returns nothing for a null room', () => {
    const { result } = renderHook(() => useTimeline(null));
    expect(result.current.items).toEqual([]);
    expect(result.current.hasMore).toBe(false);
  });

  it('loadOlder paginates backwards and prepends older events', async () => {
    const { result } = renderHook(() => useTimeline(ROOM_ID));

    await act(async () => {
      await result.current.loadOlder();
    });

    expect(client.paginateEventTimeline).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ backwards: true, limit: 80 }),
    );
    expect(result.current.items.map((i) => i.eventId)).toEqual(['e0', 'e1', 'e3', 'e2', 'e1x']);
    expect(result.current.hasMore).toBe(false);
  });

  it('rebuilds on Room.redaction and Room.timelineReset', async () => {
    const { result } = renderHook(() => useTimeline(ROOM_ID));
    expect(result.current.items).toHaveLength(3);

    const handlers = (client as unknown as { __handlers: Map<string, Array<(...a: unknown[]) => void>> }).__handlers;
    // SDK applies redaction to the live event itself; the handler only
    // signals a rebuild. Emulate by patching the stored event.
    const target = liveTimeline.events.find((e) => e.getId() === 'e3');
    expect(target).toBeTruthy();
    if (target) vi.spyOn(target, 'isRedacted').mockReturnValue(true);
    act(() => {
      handlers.get('Room.redaction')?.forEach((h) => h(target));
    });

    await waitFor(() => {
      const item = result.current.items.find((i) => i.eventId === 'e3');
      expect(item?.redacted).toBe(true);
    });

    act(() => {
      handlers.get('Room.timelineReset')?.forEach((h) => h());
    });
    expect(result.current.items).toHaveLength(3);
  });

  it('keeps item identity for unchanged events across rebuilds', () => {
    const { result } = renderHook(() => useTimeline(ROOM_ID));
    const before = result.current.items[0];

    const handlers = (client as unknown as { __handlers: Map<string, Array<(...a: unknown[]) => void>> }).__handlers;
    act(() => {
      handlers.get('sync')?.forEach((h) => h('SYNCING'));
    });

    expect(result.current.items[0]).toBe(before);
  });

  it('hasMore is false when the oldest timeline has no back token', () => {
    liveTimeline.token = null;
    const { result } = renderHook(() => useTimeline(ROOM_ID));
    expect(result.current.hasMore).toBe(false);
  });
});

describe('sendMessageText', () => {
  it('sends m.text with optional formatted body', async () => {
    await sendMessageText(ROOM_ID, 'plain', '<b>bold</b>');
    expect(client.sendMessage).toHaveBeenCalledWith(ROOM_ID, {
      msgtype: 'm.text',
      body: 'plain',
      formatted_body: '<b>bold</b>',
      format: 'org.matrix.custom.html',
    });

    await sendMessageText(ROOM_ID, 'no format');
    expect(client.sendMessage).toHaveBeenLastCalledWith(ROOM_ID, {
      msgtype: 'm.text',
      body: 'no format',
    });
  });
});

describe('sendMessageFile', () => {
  it('uploads the file and sends it as an m.image for images', async () => {
    setupRoom([]);
    const file = new File(['png-bytes'], 'photo.png', { type: 'image/png' });

    await sendMessageFile(ROOM_ID, file);

    expect(client.uploadContent).toHaveBeenCalledWith(file, expect.anything());
    expect(client.sendMessage).toHaveBeenCalledWith(ROOM_ID, {
      msgtype: 'm.image',
      body: 'photo.png',
      filename: 'photo.png',
      url: 'mxc://hs.example/uploaded',
      info: { size: file.size, mimetype: 'image/png' },
    });
  });

  it('sends non-image files as m.file', async () => {
    setupRoom([]);
    const file = new File(['%PDF'], 'notes.pdf', { type: 'application/pdf' });

    await sendMessageFile(ROOM_ID, file);

    expect(client.sendMessage).toHaveBeenCalledWith(ROOM_ID, {
      msgtype: 'm.file',
      body: 'notes.pdf',
      filename: 'notes.pdf',
      url: 'mxc://hs.example/uploaded',
      info: { size: file.size, mimetype: 'application/pdf' },
    });
  });

  it('encrypted_room_uploads_ciphertext_without_original_metadata', async () => {
    setupRoom([]);
    client.getCrypto.mockReturnValue({ isEncryptionEnabledInRoom: vi.fn().mockResolvedValue(true) });
    const ciphertext = new Uint8Array([9, 8, 7]).buffer;
    vi.spyOn(attachmentCrypto, 'encryptAttachment').mockResolvedValue({
      ciphertext,
      descriptor: {
        v: 'v2',
        key: { kty: 'oct', alg: 'A256CTR', ext: true, key_ops: ['encrypt', 'decrypt'], k: 'AA' },
        iv: 'AAAAAAAAAAAAAAAAAAAAAA==',
        hashes: { sha256: 'hash' },
      },
    });
    const file = new File(['secret contents'], 'secret-photo.png', { type: 'image/png' });

    await sendMessageFile(ROOM_ID, file);

    const [uploaded, options] = client.uploadContent.mock.calls[0] as [Blob, { type: string; onlyContentUri?: boolean }];
    expect(await blobBytes(uploaded)).toEqual(ciphertext);
    expect(uploaded).not.toBe(file);
    expect(uploaded.type).toBe('application/octet-stream');
    expect(uploaded).not.toHaveProperty('name');
    expect(options.type).toBe('application/octet-stream');
    expect(options).not.toHaveProperty('name');
    const [, content] = client.sendMessage.mock.calls[0] as [string, Record<string, unknown>];
    expect(content).toMatchObject({
      msgtype: 'm.image', body: 'secret-photo.png', filename: 'secret-photo.png',
      file: {
        v: 'v2', url: 'mxc://hs.example/uploaded',
        key: { kty: 'oct', alg: 'A256CTR', ext: true, key_ops: ['encrypt', 'decrypt'] },
        iv: expect.any(String), hashes: { sha256: expect.any(String) },
      },
      info: { size: file.size, mimetype: 'image/png' },
    });
    expect(content).not.toHaveProperty('url');
    expect(content).toHaveProperty('file');
  });

  it('crypto_failure_never_uploads_plaintext', async () => {
    setupRoom([]);
    client.getCrypto.mockReturnValue({ isEncryptionEnabledInRoom: vi.fn().mockResolvedValue(true) });
    vi.spyOn(attachmentCrypto, 'encryptAttachment').mockRejectedValue(new Error('crypto failed'));

    await expect(sendMessageFile(ROOM_ID, new File(['secret'], 'secret.txt', { type: 'text/plain' }))).rejects.toThrow('crypto failed');
    expect(client.uploadContent).not.toHaveBeenCalled();
  });

  it('preserves media URL and encrypted descriptor in timeline item', async () => {
    setupRoom([fakeEvent({
      id: '$media', body: 'photo.png', msgtype: 'm.image', url: 'mxc://hs.example/cipher',
      file: { v: 'v2', url: 'mxc://hs.example/cipher', key: { alg: 'A256CTR', ext: true, k: 'x', key_ops: ['decrypt'], kty: 'oct' }, iv: 'iv', hashes: { sha256: 'hash' } },
      info: { size: 12 },
    })]);

    const { result } = renderHook(() => useTimeline(ROOM_ID));
    await waitFor(() => expect(result.current.items).toHaveLength(1));
    expect(result.current.items[0].content).toMatchObject({
      url: 'mxc://hs.example/cipher', msgtype: 'm.image', info: { size: 12 }, file: { v: 'v2' },
    });
  });

  it('does not send a plaintext reference if room becomes encrypted during upload', async () => {
    setupRoom([]);
    const crypto = { isEncryptionEnabledInRoom: vi.fn().mockResolvedValue(false) };
    client.getCrypto.mockReturnValue(crypto);
    client.uploadContent.mockImplementation(async () => {
      crypto.isEncryptionEnabledInRoom.mockResolvedValueOnce(true);
      return { content_uri: 'mxc://hs.example/uploaded' };
    });

    await expect(sendMessageFile(ROOM_ID, new File(['secret'], 'secret.txt'))).rejects.toThrow();
    expect(client.uploadContent).toHaveBeenCalledTimes(1);
    expect(client.sendMessage).not.toHaveBeenCalled();
  });

  it('encrypted_room_without_crypto_fails', async () => {
    setupRoom([]);
    client.getCrypto.mockReturnValue(null);

    await expect(sendMessageFile(ROOM_ID, new File(['secret'], 'secret.txt'))).rejects.toThrow();
    expect(client.uploadContent).not.toHaveBeenCalled();
  });

  it('unencrypted_file_is_unchanged', async () => {
    setupRoom([]);
    const file = new File(['%PDF'], 'notes.pdf', { type: 'application/pdf' });

    await sendMessageFile(ROOM_ID, file);

    expect(client.uploadContent).toHaveBeenCalledWith(file, expect.objectContaining({ type: 'application/pdf' }));
    expect(client.sendMessage).toHaveBeenCalledWith(ROOM_ID, {
      msgtype: 'm.file', body: 'notes.pdf', filename: 'notes.pdf',
      url: 'mxc://hs.example/uploaded', info: { size: file.size, mimetype: 'application/pdf' },
    });
  });

  it('reports upload progress as a zero-to-one fraction', async () => {
    setupRoom([]);
    client.uploadContent.mockImplementation(
      async (_file: File, opts: { progressHandler?: (p: { loaded: number; total: number }) => void }) => {
        opts.progressHandler?.({ loaded: 5, total: 10 });
        opts.progressHandler?.({ loaded: -1, total: 10 });
        opts.progressHandler?.({ loaded: 20, total: 10 });
        return { content_uri: 'mxc://hs.example/uploaded' };
      },
    );
    const onProgress = vi.fn();
    const file = new File(['data'], 'clip.mp4', { type: 'video/mp4' });

    await sendMessageFile(ROOM_ID, file, onProgress);

    expect(onProgress).toHaveBeenNthCalledWith(1, 0.5);
    expect(onProgress).toHaveBeenNthCalledWith(2, 0);
    expect(onProgress).toHaveBeenNthCalledWith(3, 1);
    expect(onProgress.mock.calls.every(([progress]) => progress >= 0 && progress <= 1)).toBe(true);
  });
});

describe('markRoomRead', () => {
  it('sends a read receipt for the last receiptable event, skipping pending echoes', () => {
    setupRoom([
      fakeEvent({ id: 'e-topic', type: 'm.room.topic', body: '' }),
      fakeEvent({ id: 'e-red', redacted: true }),
      fakeEvent({ id: 'e-echo', body: 'pending', status: 'sending' }),
      fakeEvent({ id: 'e-msg', body: 'read me' }),
    ]);
    markRoomRead(ROOM_ID);
    expect(client.sendReadReceipt).toHaveBeenCalledTimes(1);
    const [event, receiptType, explicit] = (client.sendReadReceipt as ReturnType<typeof vi.fn>).mock.calls[0];
    expect((event as MatrixEvent).getId()).toBe('e-msg');
    expect(receiptType).toBe('m.read');
    expect(explicit).toBe(true);
  });

  it('does nothing when no receiptable event exists', () => {
    setupRoom([fakeEvent({ id: 'e-topic', type: 'm.room.topic', body: '' })]);
    markRoomRead(ROOM_ID);
    expect(client.sendReadReceipt).not.toHaveBeenCalled();
  });
});
