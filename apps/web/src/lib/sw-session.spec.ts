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
      ready: Promise.resolve({ active: worker }),
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
      value: { ready: Promise.resolve({ active: null }), register: vi.fn() },
    });
    await expect(postSessionToSw('token-1', 'https://hs.example')).resolves.toBeUndefined();
  });
});

describe('clearSessionFromSw', () => {
  it('posts clearSession to the active worker', async () => {
    const worker: FakeWorker = { postMessage: vi.fn() };
    installFakeServiceWorker(worker);

    await clearSessionFromSw();

    expect(worker.postMessage).toHaveBeenCalledWith({ type: 'clearSession' });
  });
});

describe('registerServiceWorker', () => {
  it('registers /sw.js at the origin root', async () => {
    const worker: FakeWorker = { postMessage: vi.fn() };
    const register = installFakeServiceWorker(worker, vi.fn().mockResolvedValue({}));

    await registerServiceWorker();

    expect(register).toHaveBeenCalledWith('/sw.js');
  });

  it('swallows registration errors', async () => {
    const worker: FakeWorker = { postMessage: vi.fn() };
    installFakeServiceWorker(worker, vi.fn().mockRejectedValue(new Error('nope')));

    await expect(registerServiceWorker()).resolves.toBeUndefined();
  });
});
