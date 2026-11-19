import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { MediaSession } from '../platform/contracts';
import { getMediaSession, getMediaTransport, setMediaTransport } from '../platform/runtime';
import { acquireMedia, clearMediaCache, validateMatrixMediaUrl } from './media-resolver';

vi.mock('../platform/runtime', () => ({
  getMediaSession: vi.fn(),
  getMediaTransport: vi.fn(),
  setMediaTransport: vi.fn(),
}));

const RealURL = globalThis.URL;

const session: MediaSession = {
  userId: '@alice:example.org',
  deviceId: 'DEVICE-A',
  baseUrl: 'https://home.test/matrix',
  accessToken: 'secret-token',
  epoch: 1,
};

function mediaTransport(fetchBlob: MediaSession extends never ? never : (...args: any[]) => Promise<Blob>) {
  return { fetchBlob };
}

function mxc(mxcUrl = 'mxc://media.example/synthetic') {
  return { mxc: mxcUrl };
}

beforeEach(() => {
  vi.mocked(getMediaSession).mockReturnValue(session);
  vi.mocked(setMediaTransport).mockReset();
  vi.stubGlobal('URL', Object.assign(function MockURL(input: string | URL, base?: string | URL) {
    return new RealURL(input as string, base as string | undefined);
  }, {
    createObjectURL: vi.fn(() => 'blob:media-1'),
    revokeObjectURL: vi.fn(),
  }));
  vi.mocked(getMediaTransport).mockReturnValue(mediaTransport(vi.fn().mockResolvedValue(new Blob(['image']))));
  setMediaTransport(mediaTransport(vi.fn().mockResolvedValue(new Blob(['image']))));
});

afterEach(() => {
  clearMediaCache();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('validateMatrixMediaUrl', () => {
  it('accepts Matrix authenticated media on the configured origin and base path', () => {
    expect(validateMatrixMediaUrl(
      'https://home.test/matrix/_matrix/client/v1/media/download/server/id',
      session.baseUrl,
    ).href).toBe('https://home.test/matrix/_matrix/client/v1/media/download/server/id');
  });

  it('bearer_never_crosses_origin_path_or_redirect', () => {
    expect(() => validateMatrixMediaUrl('https://evil.test/_matrix/client/v1/media/download/a/b', session.baseUrl)).toThrow();
    expect(() => validateMatrixMediaUrl('https://home.test/elsewhere/_matrix/client/v1/media/download/a/b', session.baseUrl)).toThrow();
    expect(() => validateMatrixMediaUrl('https://user:pass@home.test/matrix/_matrix/client/v1/media/download/a/b', session.baseUrl)).toThrow();
    expect(() => validateMatrixMediaUrl('https://home.test/matrix/_matrix/client/v1/media/download/a/%2e%2e/b', session.baseUrl)).toThrow();
    expect(() => validateMatrixMediaUrl('https://home.test/matrix/_matrix/client/v1/media/download/a/b#fragment', session.baseUrl)).toThrow();
  });
});

describe('acquireMedia', () => {
  it('refreshed_token_used_for_new_request', async () => {
    const fetchBlob = vi.fn().mockResolvedValue(new Blob(['fresh']));
    setMediaTransport(mediaTransport(fetchBlob));
    vi.mocked(getMediaTransport).mockReturnValue(mediaTransport(fetchBlob));
    vi.mocked(getMediaSession).mockReturnValue({ ...session, accessToken: 'rotated-token' });

    const lease = await acquireMedia(mxc());

    expect(fetchBlob).toHaveBeenCalledWith(expect.any(String), expect.objectContaining({ accessToken: 'rotated-token' }), expect.any(AbortSignal));
    lease.release();
  });

  it('account_switch_during_fetch_discards_blob', async () => {
    let complete!: (blob: Blob) => void;
    const fetchBlob = vi.fn(() => new Promise<Blob>((resolve) => { complete = resolve; }));
    setMediaTransport(mediaTransport(fetchBlob));
    vi.mocked(getMediaTransport).mockReturnValue(mediaTransport(fetchBlob));
    const pending = acquireMedia(mxc());
    vi.mocked(getMediaSession).mockReturnValue({ ...session, userId: '@bob:example.org', deviceId: 'DEVICE-B', epoch: 2 });
    complete(new Blob(['private A data']));

    await expect(pending).rejects.toThrow();
    expect(URL.createObjectURL).not.toHaveBeenCalled();
  });

  it('last_release_and_logout_revoke_urls', async () => {
    const lease = await acquireMedia(mxc());
    lease.release();

    expect(URL.revokeObjectURL).toHaveBeenCalledWith(lease.url);
    expect(URL.revokeObjectURL).toHaveBeenCalledTimes(1);
  });

  it('encrypted_source_uses_download_not_thumbnail and decrypts only after verified fetch', async () => {
    const encryptedFile = {
      v: 'v2' as const,
      url: 'mxc://media.example/ciphertext',
      key: { alg: 'A256CTR', ext: true, k: 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA', key_ops: ['decrypt'], kty: 'oct' },
      iv: 'AAAAAAAAAAAAAAAAAAAAAA==',
      hashes: { sha256: 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=' },
    };
    const fetchBlob = vi.fn().mockResolvedValue(new Blob(['ciphertext']));
    setMediaTransport(mediaTransport(fetchBlob));
    vi.mocked(getMediaTransport).mockReturnValue(mediaTransport(fetchBlob));

    await expect(acquireMedia({ mxc: encryptedFile.url, size: 64, encryptedFile })).rejects.toThrow();
    expect(fetchBlob).toHaveBeenCalledWith(expect.stringContaining('/download/'), expect.anything(), expect.anything());
    expect(URL.createObjectURL).not.toHaveBeenCalled();
  });

  it('rejects unsupported transport and does not expose a URL', async () => {
    setMediaTransport(null as never);
    vi.mocked(getMediaTransport).mockReturnValue(null);
    await expect(acquireMedia(mxc())).rejects.toThrow();
    expect(URL.createObjectURL).not.toHaveBeenCalled();
  });
});
