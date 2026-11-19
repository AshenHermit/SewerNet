import { invoke } from '@tauri-apps/api/core';
import { flushAccounts } from '../client/accounts';
import { hasUnsavedDraft } from './draft-registry';
import { getPlatformKind } from './runtime';
import type { UpdatePhase } from '@sewer-net/ui';

export type { UpdatePhase } from '@sewer-net/ui';
export interface UpdateState {
  phase: UpdatePhase;
  version?: string;
  progress?: number;
  error?: string;
}

interface NativeUpdate {
  version: string;
  downloadAndInstall: (onProgress?: (progress: number) => void) => Promise<void>;
}
interface NativeUpdater {
  check: () => Promise<NativeUpdate | null>;
}
export interface UpdateControllerOptions {
  isDesktop: () => boolean;
  loadUpdater: () => Promise<NativeUpdater | null>;
  flush: () => Promise<void>;
  beginUpdateExit?: () => Promise<void>;
  confirmInstall: (draftWarning: boolean) => boolean;
  requestExit: () => Promise<void>;
  isDraftPresent: () => boolean;
}

export interface UpdateController {
  getState(): UpdateState;
  subscribe(listener: (state: UpdateState) => void): () => void;
  checkForUpdates(manual: boolean): Promise<void>;
  installAvailableUpdate(): Promise<void>;
  dismissUpdate(): void;
  exitDesktop(): Promise<void>;
}

export function createUpdateController(options: UpdateControllerOptions): UpdateController {
  let state: UpdateState = { phase: 'idle' };
  let updater: NativeUpdater | null = null;
  let available: NativeUpdate | null = null;
  let checkSequence = 0;
  const listeners = new Set<(state: UpdateState) => void>();

  function set(next: UpdateState): void {
    state = next;
    for (const listener of listeners) listener(state);
  }

  async function ensureUpdater(): Promise<NativeUpdater | null> {
    if (!options.isDesktop()) return null;
    if (updater) return updater;
    try {
      updater = await options.loadUpdater();
    } catch {
      updater = null;
    }
    return updater;
  }

  async function checkForUpdates(_manual: boolean): Promise<void> {
    if (!options.isDesktop()) { set({ phase: 'unavailable' }); return; }
    const sequence = ++checkSequence;
    set({ phase: 'checking' });
    const native = await ensureUpdater();
    if (!native) {
      if (sequence === checkSequence) set({ phase: 'unavailable' });
      return;
    }
    try {
      const update = await native.check();
      if (sequence !== checkSequence) return;
      if (!update) { available = null; set({ phase: 'up-to-date' }); return; }
      available = update;
      set({ phase: 'available', version: update.version });
    } catch (error) {
      if (sequence === checkSequence) set({ phase: 'error', error: error instanceof Error ? error.message : String(error) });
    }
  }

  async function installAvailableUpdate(): Promise<void> {
    if (!available) return;
    const draftWarning = options.isDraftPresent();
    if (!options.confirmInstall(draftWarning)) return;
    const update = available;
    try {
      await options.flush();
    } catch (error) {
      set({ phase: 'error', version: update.version, error: error instanceof Error ? error.message : 'Credential flush failed' });
      return;
    }
    try {
      if (options.beginUpdateExit) await options.beginUpdateExit();
    } catch (error) {
      set({ phase: 'error', version: update.version, error: error instanceof Error ? error.message : 'Failed to prepare updater restart' });
      return;
    }
    set({ phase: 'installing', version: update.version, progress: 0 });
    try {
      await update.downloadAndInstall((progress) => set({ phase: 'downloading', version: update.version, progress }));
      set({ phase: 'installing', version: update.version, progress: 100 });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      set({ phase: 'error', version: update.version, error: message });
    }
  }

  async function exitDesktop(): Promise<void> {
    const draftWarning = options.isDraftPresent();
    if (!options.confirmInstall(draftWarning)) return;
    try {
      await options.flush();
    } catch {
      set({ phase: 'error', error: 'Credential flush failed; exit cancelled' });
      return;
    }
    try {
      await options.requestExit();
    } catch (error) {
      set({ phase: 'error', error: error instanceof Error ? error.message : String(error) });
    }
  }

  return {
    getState: () => state,
    subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener); },
    checkForUpdates,
    installAvailableUpdate,
    dismissUpdate() { if (available) set({ phase: 'available', version: available.version }); },
    exitDesktop,
  };
}

let _controller: UpdateController | null = null;

export function getUpdateController(): UpdateController {
  if (_controller) return _controller;
  _controller = createUpdateController({
    isDesktop: () => {
      try { return getPlatformKind() === 'desktop'; }
      catch { return false; }
    },
    loadUpdater: async () => {
      // Empty pubkey is explicitly unavailable: no unsigned install/check UI action.
      try {
        const available = await invoke<boolean>('updater_available');
        if (!available) return null;
        const plugin = await import('@tauri-apps/plugin-updater');
        return {
          check: async () => {
            const update = await plugin.check();
            if (!update) return null;
            return {
              version: update.version,
              downloadAndInstall: async (onProgress) => {
                let contentLength: number | undefined;
                let downloaded = 0;
                await update.downloadAndInstall((event) => {
                  if (event.event === 'Started') contentLength = event.data.contentLength;
                  if (event.event === 'Progress') downloaded += event.data.chunkLength;
                  if (contentLength && onProgress) onProgress(Math.round((downloaded / contentLength) * 100));
                });
              },
            };
          },
        };
      } catch {
        return null;
      }
    },
    flush: () => flushAccounts(),
    beginUpdateExit: async () => { await invoke('begin_update_exit'); },
    confirmInstall: (draftWarning) => {
      if (draftWarning) return window.confirm('You have an unsaved message draft. It may be lost. Continue?');
      return true;
    },
    requestExit: async () => { await invoke('exit_desktop'); },
    isDraftPresent: () => hasUnsavedDraft(),
  });
  return _controller;
}
