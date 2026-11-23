import { afterEach, describe, expect, it, vi } from 'vitest';
import { clearSessionFromSw, postSessionToSw, registerServiceWorker } from './sw-session';

type FakeWorker = {
  postMessage: ReturnType<typeof vi.fn>;
  state?: string;
};

function installFakeServiceWorker(worker: FakeWorker, register = vi.fn()) {
  Object.defineProperty(navigator, 'serviceWorker', {
    configurable: true,
    value: {
      ready: new Promise(() => undefined),
      getRegistration: vi.fn().mockResolvedValue({ active: worker }),
      register,
    },
  });
  return register;
}

function removeServiceWorker() {
  Object.defineProperty(navigator, 'serviceWorker', {
    configurable: true,
    value: undefined,
  });
}

afterEach(() => {
  vi.useRealTimers();
  removeServiceWorker();
  vi.restoreAllMocks();
});

describe('postSessionToSw', () => {
  it('posts the access token and homeserver base url to the active worker', async () => {
    const worker: FakeWorker = { postMessage: vi.fn() };
    installFakeServiceWorker(worker);

    await postSessionToSw('token-1', 'https://hs.example');

    expect(worker.postMessage).toHaveBeenCalledWith({
      type: 'setSession',
      accessToken: 'token-1',
      baseUrl: 'https://hs.example',
    });
  });

  it('is a no-op without service worker support', async () => {
    removeServiceWorker();
    await expect(postSessionToSw('token-1', 'https://hs.example')).resolves.toBeUndefined();
  });

  it('is a no-op when the registration has no active worker yet', async () => {
    Object.defineProperty(navigator, 'serviceWorker', {
      configurable: true,
      value: {
        getRegistration: vi.fn().mockResolvedValue({ active: null }),
        register: vi.fn(),
      },
    });
    await expect(postSessionToSw('token-1', 'https://hs.example')).resolves.toBeUndefined();
  });

  it('does not await an inactive worker when ready never settles', async () => {
    Object.defineProperty(navigator, 'serviceWorker', {
      configurable: true,
      value: {
        ready: new Promise(() => undefined),
        getRegistration: vi.fn().mockResolvedValue(undefined),
        register: vi.fn(),
      },
    });

    await expect(postSessionToSw('token-1', 'https://hs.example')).resolves.toBeUndefined();
  });

  it('is a no-op when the registration lookup rejects', async () => {
    Object.defineProperty(navigator, 'serviceWorker', {
      configurable: true,
      value: {
        getRegistration: vi.fn().mockRejectedValue(new Error('blocked')),
        register: vi.fn(),
      },
    });

    await expect(postSessionToSw('token-1', 'https://hs.example')).resolves.toBeUndefined();
  });

  it('bounds a registration lookup that never resolves', async () => {
    vi.useFakeTimers();
    Object.defineProperty(navigator, 'serviceWorker', {
      configurable: true,
      value: {
        getRegistration: vi.fn(() => new Promise(() => undefined)),
        register: vi.fn(),
      },
    });

    const pending = postSessionToSw('token-1', 'https://hs.example');
    await vi.advanceTimersByTimeAsync(5_000);

    await expect(pending).resolves.toBeUndefined();
  });
});

describe('clearSessionFromSw', () => {
  it('posts clearSession to the active worker', async () => {
    const worker: FakeWorker = { postMessage: vi.fn() };
    installFakeServiceWorker(worker);

    await clearSessionFromSw();

    expect(worker.postMessage).toHaveBeenCalledWith({ type: 'clearSession' });
  });

  it('is a no-op when the registration lookup is unavailable', async () => {
    Object.defineProperty(navigator, 'serviceWorker', {
      configurable: true,
      value: { register: vi.fn() },
    });

    await expect(clearSessionFromSw()).resolves.toBeUndefined();
  });
});

describe('registerServiceWorker', () => {
  it('registers /sw.js at the origin root', async () => {
    const worker: FakeWorker = { postMessage: vi.fn() };
    const register = installFakeServiceWorker(worker, vi.fn().mockResolvedValue({}));

    await registerServiceWorker();

    expect(register).toHaveBeenCalledWith('/sw.js', { scope: '/' });
  });

  it('swallows registration errors', async () => {
    const worker: FakeWorker = { postMessage: vi.fn() };
    installFakeServiceWorker(worker, vi.fn().mockRejectedValue(new Error('nope')));

    await expect(registerServiceWorker()).resolves.toBeUndefined();
  });
});
