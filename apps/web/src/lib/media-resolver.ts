import type { MediaSession, MediaSource, MediaTransport } from '../platform/contracts';
import { getMediaSession, getMediaTransport } from '../platform/runtime';
import { decryptAttachment } from './attachment-crypto';
import { subscribeAccounts } from '../client/accounts';

subscribeAccounts(() => {
  clearMediaCache();
});

const MAX_ENTRIES = 32;
const MAX_RETAINED_BYTES = 64 * 1024 * 1024;

interface CacheEntry {
  blob: Blob;
  refs: number;
  lastUsed: number;
  revocableUrl?: string;
}

const cache = new Map<string, CacheEntry>();
const activeRequests = new Map<string, AbortController>();
let clock = 0;

function normalizedBase(baseUrl: string): URL {
  const base = new URL(baseUrl);
  if (base.protocol !== 'https:' || base.username || base.password || base.hash) throw new Error('Invalid homeserver base URL');
  base.search = '';
  base.pathname = base.pathname.replace(/\/+$/, '') || '/';
  return base;
}

export function validateMatrixMediaUrl(url: string, baseUrl: string): URL {
  const base = normalizedBase(baseUrl);
  let parsed: URL;
  try { parsed = new URL(url); } catch { throw new Error('Invalid Matrix media URL'); }
  if (parsed.protocol !== 'https:' || parsed.username || parsed.password || parsed.hash || parsed.searchParams.has('allow_redirect')) {
    throw new Error('Invalid Matrix media URL');
  }
  if (parsed.origin !== base.origin) throw new Error('Matrix media URL crosses homeserver origin');
  const basePath = base.pathname === '/' ? '/' : `${base.pathname}/`;
  if (basePath !== '/' && !parsed.pathname.startsWith(basePath)) throw new Error('Matrix media URL crosses homeserver base path');
  const relative = base.pathname === '/' ? parsed.pathname : parsed.pathname.slice(base.pathname.length);
  if (!/^\/_matrix\/client\/v1\/media\/(download|thumbnail)\/[^/]+\/[^/]+$/u.test(relative)) {
    throw new Error('Invalid Matrix media path');
  }
  for (const segment of parsed.pathname.split('/')) {
    if (!segment) continue;
    let decoded = segment;
    try { decoded = decodeURIComponent(segment); } catch { throw new Error('Invalid Matrix media traversal'); }
    if (decoded === '..' || decoded === '.' || decoded.includes('/') || decoded.includes('\\')) throw new Error('Invalid Matrix media traversal');
  }
  return parsed;
}

export function mediaUrlForSource(source: MediaSource, session: MediaSession): string {
  if (!/^mxc:\/\//u.test(source.mxc)) throw new Error('Invalid MXC URI');
  const mxc = new URL(source.mxc);
  if (mxc.username || mxc.password || mxc.hash || mxc.port) throw new Error('Invalid MXC URI');
  const server = mxc.hostname;
  const mediaId = mxc.pathname.replace(/^\//, '').replace(/\/+/g, '/').replace(/(^|\/)\.?(?:\.|$)/g, '$1');
  if (!server || !mediaId || mediaId.includes('/') && mediaId.split('/').some((x) => x === '..' || x === '.')) throw new Error('Invalid MXC URI');
  const kind = source.encryptedFile ? 'download' : source.thumbnail ? 'thumbnail' : 'download';
  const base = normalizedBase(session.baseUrl);
  const prefix = base.pathname === '/' ? '' : base.pathname;
  const url = new URL(`${prefix}/_matrix/client/v1/media/${kind}/${encodeURIComponent(server)}/${encodeURIComponent(mediaId)}`, base.origin);
  if (source.thumbnail) {
    const dim = Math.max(1, Math.round(source.thumbnail));
    url.searchParams.set('width', String(dim));
    url.searchParams.set('height', String(dim));
    url.searchParams.set('method', 'scale');
  }
  return validateMatrixMediaUrl(url.href, session.baseUrl).href;
}

function descriptorKey(source: MediaSource, session: MediaSession): string {
  const kind = source.encryptedFile ? `enc:${source.encryptedFile.hashes.sha256}` : 'plain';
  return `${session.userId}|${session.deviceId}|${session.epoch}|${source.mxc}|${source.size ?? 0}|${kind}`;
}

function retainedBytes(): number {
  let total = 0;
  for (const entry of cache.values()) if (entry.refs === 0) total += entry.blob.size;
  return total;
}

function evictUnreferenced(): void {
  const unreferenced = [...cache.entries()].filter(([, entry]) => entry.refs === 0).sort((a, b) => a[1].lastUsed - b[1].lastUsed);
  while (cache.size > MAX_ENTRIES || retainedBytes() > MAX_RETAINED_BYTES) {
    const item = unreferenced.shift();
    if (!item) break;
    const [key, entry] = item;
    cache.delete(key);
    if (entry.revocableUrl) URL.revokeObjectURL(entry.revocableUrl);
  }
}

export async function acquireMedia(source: MediaSource, signal?: AbortSignal): Promise<{ url: string; release(): void }> {
  const session = getMediaSession();
  if (!session) throw new Error('No active media session');
  const transport: MediaTransport | null = getMediaTransport();
  if (!transport) throw new Error('Media transport unavailable');
  if (source.encryptedFile && (!/^mxc:\/\//u.test(source.encryptedFile.url) || source.encryptedFile.url !== source.mxc)) {
    throw new Error('Encrypted media descriptor does not match source');
  }
  if (source.size !== undefined && (!Number.isFinite(source.size) || source.size <= 0)) throw new Error('Invalid media size');

  const key = descriptorKey(source, session);
  const controller = new AbortController();
  const abort = (): void => controller.abort();
  signal?.addEventListener('abort', abort, { once: true });
  activeRequests.set(key, controller);

  try {
    let entry = cache.get(key);
    if (!entry) {
      const url = validateMatrixMediaUrl(mediaUrlForSource(source, session), session.baseUrl);
      const fetched = await transport.fetchBlob(url.href, session, controller.signal);
      if (signal?.aborted || controller.signal.aborted) throw new Error('Media request aborted');
      if (getMediaSession()?.epoch !== session.epoch || getMediaSession()?.userId !== session.userId || getMediaSession()?.deviceId !== session.deviceId) {
        throw new Error('Media session changed');
      }
      let blob = fetched;
      if (source.encryptedFile) {
        try {
          const ciphertext = await fetched.arrayBuffer();
          const plaintext = await decryptAttachment(ciphertext, source.encryptedFile);
          blob = new Blob([plaintext]);
        } catch {
          throw new Error('Encrypted media verification or decryption failed');
        }
      }
      if (blob.size > MAX_RETAINED_BYTES) throw new Error('Media is too large for the retained cache');
      entry = { blob, refs: 0, lastUsed: ++clock };
      cache.set(key, entry);
      evictUnreferenced();
    }
    entry.lastUsed = ++clock;
    entry.refs += 1;
    if (!entry.revocableUrl) entry.revocableUrl = URL.createObjectURL(entry.blob);
    const objectUrl = entry.revocableUrl;
    let released = false;
    return {
      url: objectUrl,
      release: () => {
        if (released) return;
        released = true;
        entry!.refs = Math.max(0, entry!.refs - 1);
        if (entry!.refs === 0) {
          if (entry!.revocableUrl) URL.revokeObjectURL(entry!.revocableUrl);
          entry!.revocableUrl = undefined;
          cache.delete(key);
          evictUnreferenced();
        }
      },
    };
  } finally {
    signal?.removeEventListener('abort', abort);
    activeRequests.delete(key);
  }
}

export function clearMediaCache(): void {
  for (const controller of activeRequests.values()) controller.abort();
  activeRequests.clear();
  for (const entry of cache.values()) {
    if (entry.revocableUrl) URL.revokeObjectURL(entry.revocableUrl);
  }
  cache.clear();
}
