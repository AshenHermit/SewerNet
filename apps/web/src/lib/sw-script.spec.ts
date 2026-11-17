import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it, vi } from 'vitest';

function readServiceWorkerSource(): string {
  const candidates = [
    resolve(process.cwd(), 'public/sw.js'),
    resolve(process.cwd(), 'apps/web/public/sw.js'),
  ];
  const found = candidates.find((candidate) => existsSync(candidate));
  if (!found) {
    throw new Error(`service worker not found in ${candidates.join(', ')}`);
  }
  return readFileSync(found, 'utf8');
}

/**
 * Loads the real `public/sw.js` into a sandbox with faked service-worker
 * globals, so the media-proxy handler is tested without a browser.
 */

type Listener = (event: unknown) => void;

class FakeHeaders {
  private readonly values = new Map<string, string>();

  constructor(init?: unknown) {
    if (init instanceof FakeHeaders) {
      init.forEach((value, key) => this.set(key, value));
    } else if (init && typeof init === 'object') {
      for (const [key, value] of Object.entries(init as Record<string, string>)) {
        this.set(key, value);
      }
    }
  }

  set(key: string, value: string): void {
    this.values.set(key.toLowerCase(), value);
  }

  get(key: string): string | null {
    return this.values.get(key.toLowerCase()) ?? null;
  }

  forEach(cb: (value: string, key: string) => void): void {
    this.values.forEach((value, key) => cb(value, key));
  }
}

class FakeResponse {
  readonly status: number;
  readonly body: unknown;
  readonly headers: FakeHeaders;

  constructor(body: unknown, init?: { status?: number; headers?: unknown }) {
    this.body = body;
    this.status = init?.status ?? 200;
    this.headers = new FakeHeaders(init?.headers);
  }

  get ok(): boolean {
    return this.status >= 200 && this.status < 300;
  }
}

function loadServiceWorker() {
  const source = readServiceWorkerSource();
  const listeners = new Map<string, Listener[]>();
  const posted: unknown[] = [];
  const self = {
    addEventListener: (type: string, listener: Listener) => {
      listeners.set(type, [...(listeners.get(type) ?? []), listener]);
    },
    removeEventListener: vi.fn(),
    skipWaiting: vi.fn(),
    location: { origin: 'https://app.example' },
    clients: {
      claim: vi.fn(),
      get: vi.fn(async () => ({ postMessage: (message: unknown) => posted.push(message) })),
    },
  };
  const fetchMock = vi.fn(
    async () => new FakeResponse('media', { status: 200, headers: {} }),
  );
  // The worker script is an IIFE-ish global script, evaluated with `self` injected.
  // eslint-disable-next-line no-new-func
  const run = new Function('self', 'fetch', 'Headers', 'Response', 'URL', source);
  run(self, fetchMock, FakeHeaders, FakeResponse, URL);
  return { listeners, posted, self, fetchMock };
}

type Env = ReturnType<typeof loadServiceWorker>;

function dispatchMessage(env: Env, data: unknown, sourceId = 'client-1'): void {
  for (const listener of env.listeners.get('message') ?? []) {
    listener({ data, source: { id: sourceId } });
  }
}

function request(url: string, headers = new FakeHeaders()) {
  return { url, method: 'GET', headers };
}

async function dispatchFetch(
  env: Env,
  req: ReturnType<typeof request>,
  clientId = 'client-1',
) {
  const respondWith = vi.fn();
  for (const listener of env.listeners.get('fetch') ?? []) {
    listener({ request: req, clientId, respondWith });
  }
  const response = respondWith.mock.calls.length
    ? await (respondWith.mock.calls[0][0] as Promise<FakeResponse>)
    : null;
  return { respondWith, response };
}

const THUMBNAIL_URI =
  'https://hs.example/_matrix/client/v1/media/thumbnail/hs.example/abc?width=48&height=48&allow_redirect=true';

describe('media proxy service worker', () => {
  it('adds the bearer token for authenticated media of the active homeserver', async () => {
    const env = loadServiceWorker();
    dispatchMessage(env, { type: 'setSession', accessToken: 'token-1', baseUrl: 'https://hs.example' });

    const { respondWith, response } = await dispatchFetch(env, request(THUMBNAIL_URI));

    expect(respondWith).toHaveBeenCalledTimes(1);
    expect(env.fetchMock).toHaveBeenCalledWith(
      'https://hs.example/_matrix/client/v1/media/thumbnail/hs.example/abc?width=48&height=48',
      { headers: { Authorization: 'Bearer token-1' }, cache: 'default' },
    );
    expect(response?.status).toBe(200);
  });

  it('ignores non-media requests', async () => {
    const env = loadServiceWorker();
    dispatchMessage(env, { type: 'setSession', accessToken: 'token-1', baseUrl: 'https://hs.example' });

    const { respondWith } = await dispatchFetch(env, request('https://hs.example/_matrix/client/v3/sync'));

    expect(respondWith).not.toHaveBeenCalled();
    expect(env.fetchMock).not.toHaveBeenCalled();
  });

  it('does not attach the token to media of a foreign homeserver', async () => {
    const env = loadServiceWorker();
    dispatchMessage(env, { type: 'setSession', accessToken: 'token-1', baseUrl: 'https://hs.example' });

    const { respondWith } = await dispatchFetch(
      env,
      request('https://other.example/_matrix/client/v1/media/thumbnail/o/abc'),
    );

    expect(respondWith).toHaveBeenCalledTimes(1);
    expect(env.fetchMock).toHaveBeenCalledWith(expect.any(String), { cache: 'no-store' });
  });

  it('passes media through untouched when no session is known', async () => {
    const env = loadServiceWorker();

    const { respondWith } = await dispatchFetch(env, request(THUMBNAIL_URI));

    expect(respondWith).toHaveBeenCalledTimes(1);
    expect(env.fetchMock).toHaveBeenCalledWith(expect.any(String), { cache: 'no-store' });
  });

  it('leaves requests that already carry an authorization header alone', async () => {
    const env = loadServiceWorker();
    dispatchMessage(env, { type: 'setSession', accessToken: 'token-1', baseUrl: 'https://hs.example' });
    const headers = new FakeHeaders({ Authorization: 'Bearer other' });

    const { respondWith } = await dispatchFetch(env, request(THUMBNAIL_URI, headers));

    expect(respondWith).not.toHaveBeenCalled();
  });

  it('drops the session on clearSession', async () => {
    const env = loadServiceWorker();
    dispatchMessage(env, { type: 'setSession', accessToken: 'token-1', baseUrl: 'https://hs.example' });
    dispatchMessage(env, { type: 'clearSession' });

    const { respondWith } = await dispatchFetch(env, request(THUMBNAIL_URI));

    expect(respondWith).toHaveBeenCalledTimes(1);
    expect(env.fetchMock).toHaveBeenCalledWith(expect.any(String), { cache: 'no-store' });
  });
});
