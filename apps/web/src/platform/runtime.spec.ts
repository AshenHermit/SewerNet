import { beforeEach, describe, expect, it, vi } from 'vitest';

const ACCOUNTS_KEY = 'sewernet_accounts';
const ACTIVE_KEY = 'sewernet_active_account';

describe('runtime', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.resetModules();
    vi.doMock('@tauri-apps/api/core', () => ({ isTauri: () => true }));
  });

  it('native_detection_never_loads_browser_credentials', async () => {
    const { initializePlatform, getPlatformKind } = await import('./runtime');

    await expect(initializePlatform()).rejects.toThrow('desktop adapter unavailable');
    expect(getPlatformKind()).toBe('desktop');

    // Browser storage should remain empty despite native detection
    expect(localStorage.getItem(ACCOUNTS_KEY)).toBeNull();
    expect(localStorage.getItem(ACTIVE_KEY)).toBeNull();
  });
});
