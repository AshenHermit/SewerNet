import { beforeEach, describe, expect, it, vi } from 'vitest';

const { invoke } = vi.hoisted(() => ({ invoke: vi.fn() }));
vi.mock('@tauri-apps/api/core', () => ({ invoke }));

import { DesktopPersistence } from './desktop';

describe('DesktopPersistence', () => {
  beforeEach(() => invoke.mockReset());

  it('maps account operations to exact native IPC names', async () => {
    const persistence = new DesktopPersistence();
    await persistence.load();
    await persistence.upsertAccount({ userId: '@a:example.org', accessToken: 'test-token', deviceId: 'DEV', homeserverUrl: 'https://example.org' });
    await persistence.beginOperation('@a:example.org', 'DEV', 'refresh');
    await persistence.removeAccount('@a:example.org');
    await persistence.setActiveAccount('@a:example.org');
    await persistence.clear();
    await persistence.flush();

    expect(invoke.mock.calls.map(([name]) => name)).toEqual([
      'accounts_load', 'account_upsert', 'account_begin_operation', 'account_remove',
      'account_set_active', 'accounts_clear', 'storage_flush',
    ]);
  });
});
