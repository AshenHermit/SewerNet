import { invoke, isTauri } from '@tauri-apps/api/core';
import type { ClaimedOidcCallback, StoredOidcFlow } from './oidc-contract';
export type { ClaimedOidcCallback, StoredOidcFlow } from './oidc-contract';

const callbackEventName = 'sewernet:oidc-claimed';
let installation: Promise<void> | null = null;
const handlerSet = new Set<(url: string) => void>();
let latestCallbackUrl: string | null = null;
const callbackQueue: string[] = [];

export async function savePendingOidcFlow(flow: StoredOidcFlow): Promise<void> {
  await invoke('oidc_pending_save', { flow });
}

export async function clearPendingOidcFlow(state?: string): Promise<void> {
  await invoke('oidc_pending_clear', { stateValue: state ?? null });
}

async function claimCallback(url: string): Promise<void> {
  latestCallbackUrl = url;
  callbackQueue.push(url);
  for (const handler of handlerSet) handler(url);
}

export function takeLatestCallbackUrl(): string | null {
  if (callbackQueue.length) {
    const url = callbackQueue.shift()!;
    latestCallbackUrl = callbackQueue.at(-1) ?? null;
    return url;
  }
  const url = latestCallbackUrl;
  latestCallbackUrl = null;
  return url;
}

export function onClaimedOidcCallback(handler: (claim: ClaimedOidcCallback) => void): () => void {
  const listener = (event: Event) => handler((event as CustomEvent<ClaimedOidcCallback>).detail);
  window.addEventListener(callbackEventName, listener);
  return () => window.removeEventListener(callbackEventName, listener);
}

export function listenDesktopCallbacks(handler: (url: string) => void): () => void {
  handlerSet.add(handler);
  return () => handlerSet.delete(handler);
}

export function installDesktopOidcCallbacks(): Promise<void> {
  if (!installation) {
    installation = (async () => {
      if (!isTauri()) return;
      const { listen } = await import('@tauri-apps/api/event');
      await listen<string>('sewernet://oidc-callback', (event) => { void claimCallback(event.payload); });
      const deepLink = await import('@tauri-apps/plugin-deep-link');
      await deepLink.onOpenUrl((urls) => {
        for (const url of urls) void claimCallback(url);
      });
      const initialUrls = await deepLink.getCurrent();
      for (const url of initialUrls ?? []) void claimCallback(url);
    })().catch(() => {
      installation = null;
      throw new Error('desktop callback setup failed');
    });
  }
  return installation;
}
