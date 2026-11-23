/**
 * Shares the current Matrix access token with the media-proxy service worker.
 * The worker injects it into authenticated media requests (`<img>` cannot send
 * an Authorization header on its own).
 *
 * Every function here is best-effort and bounded: the durable session path must
 * never wait on a worker that is absent, blocked or still installing.
 */

const REGISTRATION_LOOKUP_TIMEOUT_MS = 2_000;
let sessionMessageVersion = 0;

/**
 * Races a lookup against a timer. `navigator.serviceWorker.ready` never settles
 * when no worker is active, so no lookup may be awaited unbounded.
 */
async function boundedLookup<T>(lookup: () => Promise<T> | undefined): Promise<T | null> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const pending = Promise.resolve()
      .then(() => lookup())
      .then<T | null>((value) => value ?? null);
    const timeout = new Promise<null>((resolve) => {
      timer = setTimeout(() => resolve(null), REGISTRATION_LOOKUP_TIMEOUT_MS);
    });
    return await Promise.race([pending, timeout]);
  } catch {
    return null;
  } finally {
    if (timer) {
      clearTimeout(timer);
    }
  }
}

async function activeWorker(): Promise<ServiceWorker | null> {
  if (typeof navigator === 'undefined' || !navigator.serviceWorker) {
    return null;
  }
  const serviceWorker = navigator.serviceWorker;
  // `getRegistration()` resolves immediately (undefined when nothing is
  // registered) instead of waiting for an activation that may never happen.
  const registration = await boundedLookup(() => serviceWorker.getRegistration?.());
  return registration?.active ?? null;
}

export async function postSessionToSw(accessToken: string, baseUrl: string): Promise<void> {
  const version = ++sessionMessageVersion;
  const worker = await activeWorker();
  if (version !== sessionMessageVersion) {
    return;
  }
  try {
    worker?.postMessage({ type: 'setSession', accessToken, baseUrl });
  } catch {
    // a dead worker must not fail the caller's durable write
  }
}

export async function clearSessionFromSw(): Promise<void> {
  const version = ++sessionMessageVersion;
  const worker = await activeWorker();
  if (version !== sessionMessageVersion) {
    return;
  }
  try {
    worker?.postMessage({ type: 'clearSession' });
  } catch {
    // teardown is best-effort
  }
}

/** Registers the media-proxy worker; failures are non-fatal (media falls back to plain URLs). */
export async function registerServiceWorker(): Promise<void> {
  if (typeof navigator === 'undefined' || !navigator.serviceWorker?.register) {
    return;
  }
  try {
    const { getPlatformKind } = await import('../platform/runtime');
    if (getPlatformKind() !== 'browser') return;
  } catch {
    // Platform may not be initialized yet; main.tsx also has no reason to await it.
  }
  try {
    await navigator.serviceWorker.register('/sw.js', { scope: '/' });
  } catch {
    // media proxying is optional
  }
}
