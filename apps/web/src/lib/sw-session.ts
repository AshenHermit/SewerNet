/**
 * Shares the current Matrix access token with the media-proxy service worker.
 * The worker injects it into authenticated media requests (`<img>` cannot send
 * an Authorization header on its own).
 */

async function activeWorker(): Promise<ServiceWorker | null> {
  if (typeof navigator === 'undefined' || !navigator.serviceWorker) {
    return null;
  }
  try {
    const registration = await navigator.serviceWorker.ready;
    return registration.active ?? null;
  } catch {
    return null;
  }
}

export async function postSessionToSw(accessToken: string, baseUrl: string): Promise<void> {
  const worker = await activeWorker();
  worker?.postMessage({ type: 'setSession', accessToken, baseUrl });
}

export async function clearSessionFromSw(): Promise<void> {
  const worker = await activeWorker();
  worker?.postMessage({ type: 'clearSession' });
}

/** Registers the media-proxy worker; failures are non-fatal (media falls back to plain URLs). */
export async function registerServiceWorker(): Promise<void> {
  if (typeof navigator === 'undefined' || !navigator.serviceWorker?.register) {
    return;
  }
  try {
    await navigator.serviceWorker.register('/sw.js');
  } catch {
    // media proxying is optional
  }
}
