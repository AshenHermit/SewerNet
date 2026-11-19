import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createUpdateController } from './updates';

describe('desktop update lifecycle', () => {
  beforeEach(() => vi.restoreAllMocks());

  it('manual_check_shows_no_update', async () => {
    const controller = createUpdateController({
      isDesktop: () => true,
      loadUpdater: async () => ({ check: async () => null }),
      flush: async () => undefined,
      confirmInstall: () => true,
      requestExit: async () => undefined,
      isDraftPresent: () => false,
    });
    await controller.checkForUpdates(true);
    expect(controller.getState().phase).toBe('up-to-date');
  });

  it('manual_check_loads_official_updater_on_demand', async () => {
    const loadUpdater = vi.fn(async () => ({ check: async () => null }));
    const controller = createUpdateController({
      isDesktop: () => true,
      loadUpdater,
      flush: async () => undefined,
      confirmInstall: () => true,
      requestExit: async () => undefined,
      isDraftPresent: () => false,
    });
    expect(loadUpdater).not.toHaveBeenCalled();
    await controller.checkForUpdates(true);
    expect(loadUpdater).toHaveBeenCalledOnce();
    expect(controller.getState().phase).toBe('up-to-date');
  });

  it('missing_official_updater_is_unavailable', async () => {
    const controller = createUpdateController({
      isDesktop: () => true,
      loadUpdater: async () => null,
      flush: async () => undefined,
      confirmInstall: () => true,
      requestExit: async () => undefined,
      isDraftPresent: () => false,
    });
    await controller.checkForUpdates(true);
    expect(controller.getState().phase).toBe('unavailable');
  });

  it('cancelled_install_does_not_flush_or_download', async () => {
    const download = vi.fn();
    const flush = vi.fn(async () => undefined);
    const controller = createUpdateController({
      isDesktop: () => true,
      loadUpdater: async () => ({ check: async () => ({ version: '2.0.0', downloadAndInstall: download }) }),
      flush,
      confirmInstall: () => false,
      requestExit: async () => undefined,
      isDraftPresent: () => true,
    });
    await controller.checkForUpdates(true);
    await controller.installAvailableUpdate();
    expect(flush).not.toHaveBeenCalled();
    expect(download).not.toHaveBeenCalled();
    expect(controller.getState().phase).toBe('available');
  });

  it('exit_flush_failure_cancels_exit', async () => {
    const requestExit = vi.fn(async () => undefined);
    const controller = createUpdateController({
      isDesktop: () => true,
      loadUpdater: async () => null,
      flush: async () => { throw new Error('flush failed'); },
      confirmInstall: () => true,
      requestExit,
      isDraftPresent: () => false,
    });
    await controller.exitDesktop();
    expect(requestExit).not.toHaveBeenCalled();
    expect(controller.getState().phase).toBe('error');
  });

  it('install_flushes_before_downloading', async () => {
    const order: string[] = [];
    const controller = createUpdateController({
      isDesktop: () => true,
      loadUpdater: async () => ({ check: async () => ({ version: '2.0.0', downloadAndInstall: async () => { order.push('download'); } }) }),
      flush: async () => { order.push('flush'); },
      confirmInstall: () => true,
      requestExit: async () => undefined,
      isDraftPresent: () => false,
    });
    await controller.checkForUpdates(true);
    await controller.installAvailableUpdate();
    expect(order).toEqual(['flush', 'download']);
    expect(controller.getState().phase).toBe('installing');
  });

  it('startup_network_failure_does_not_block_chat', async () => {
    const controller = createUpdateController({
      isDesktop: () => true,
      loadUpdater: async () => ({ check: async () => { throw new Error('network'); } }),
      flush: async () => undefined,
      confirmInstall: () => true,
      requestExit: async () => undefined,
      isDraftPresent: () => false,
    });
    await controller.checkForUpdates(false);
    expect(controller.getState().phase).toBe('error');
  });

  it('CI_unsigned_config_marks_unavailable', async () => {
    const controller = createUpdateController({
      isDesktop: () => true,
      loadUpdater: async () => null,
      flush: async () => undefined,
      confirmInstall: () => true,
      requestExit: async () => undefined,
      isDraftPresent: () => false,
    });
    await controller.checkForUpdates(true);
    expect(controller.getState().phase).toBe('unavailable');
  });

  it('dismiss_before_install_keeps_process', async () => {
    const controller = createUpdateController({
      isDesktop: () => true,
      loadUpdater: async () => ({ check: async () => ({ version: '2.0.0', downloadAndInstall: async () => undefined }) }),
      flush: async () => undefined,
      confirmInstall: () => false,
      requestExit: async () => vi.fn(),
      isDraftPresent: () => true,
    });
    await controller.checkForUpdates(true);
    await controller.installAvailableUpdate();
    expect(controller.getState().phase).toBe('available');
  });

  it('invalid_signature_install_fails', async () => {
    const controller = createUpdateController({
      isDesktop: () => true,
      loadUpdater: async () => ({ check: async () => ({ version: '2.0.0', downloadAndInstall: async () => { throw new Error('invalid signature'); } }) }),
      flush: async () => undefined,
      confirmInstall: () => true,
      requestExit: async () => undefined,
      isDraftPresent: () => false,
    });
    await controller.checkForUpdates(true);
    await controller.installAvailableUpdate();
    expect(controller.getState().phase).toBe('error');
    expect(controller.getState().error).toContain('signature');
  });

  it('flush_failure_cancels_install', async () => {
    const download = vi.fn();
    const controller = createUpdateController({
      isDesktop: () => true,
      loadUpdater: async () => ({ check: async () => ({ version: '2.0.0', downloadAndInstall: download }) }),
      flush: async () => { throw new Error('flush failed'); },
      confirmInstall: () => true,
      requestExit: async () => undefined,
      isDraftPresent: () => false,
    });
    await controller.checkForUpdates(true);
    await controller.installAvailableUpdate();
    expect(download).not.toHaveBeenCalled();
    expect(controller.getState().phase).toBe('error');
  });
});
