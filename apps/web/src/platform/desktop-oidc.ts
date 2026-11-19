import { invoke, isTauri } from '@tauri-apps/api/core';

export interface StoredOidcFlow {
  schema: 1;
  state: string;
  issuer: string;
  redirectUri: 'sewernet://oidc/callback';
  sdkStateKey: string;
  sdkState: string;
  createdAt: number;
  context: {
    homeserverUrl: string;
    nonce: string;
    responseMode: 'query';
    action?: 'register';
    revocationEndpoint?: string;
    redirectUri: 'sewernet://oidc/callback';
  };
  status: 'pending' | 'processing';
}

export interface ClaimedOidcCallback {
  flow: StoredOidcFlow;
  callback: { state: string; code?: string; error?: string };
}

const callbackEventName = 'sewernet:oidc-claimed';
let installation: Promise<void> | null = null;

export async function savePendingOidcFlow(flow: StoredOidcFlow): Promise<void> {
  await invoke('oidc_pending_save', { flow });
}

export async function clearPendingOidcFlow(state?: string): Promise<void> {
  await invoke('oidc_pending_clear', { stateValue: state ?? null });
}

async function claimCallback(url: string): Promise<void> {
  try {
    const claimed = await invoke<ClaimedOidcCallback>('oidc_callback_claim', { url });
    window.dispatchEvent(new CustomEvent<ClaimedOidcCallback>(callbackEventName, { detail: claimed }));
  } catch {
    // Native IPC returns safe typed errors; never surface callback material.
  }
}

export function onClaimedOidcCallback(handler: (claim: ClaimedOidcCallback) => void): () => void {
  const listener = (event: Event) => handler((event as CustomEvent<ClaimedOidcCallback>).detail);
  window.addEventListener(callbackEventName, listener);
  return () => window.removeEventListener(callbackEventName, listener);
}

export function installDesktopOidcCallbacks(): Promise<void> {
  if (!installation) {
    installation = (async () => {
      if (!isTauri()) return;
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
