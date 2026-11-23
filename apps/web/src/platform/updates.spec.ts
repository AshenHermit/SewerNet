import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createUpdateController } from './updates';

describe('desktop update lifecycle', () => {
  beforeEach(() => vi.restoreAllMocks());

  it('empty_native_updater_availability_is_unavailable', async () => {
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

  it('newer_check_result_wins_when_earlier_check_finishes_late', async () => {
    let resolveEarlier!: (value: { version: string; downloadAndInstall: () => Promise<void> } | null) => void;
    let checkCount = 0;
    const controller = createUpdateController({
      isDesktop: () => true,
      loadUpdater: async () => ({
        check: () => {
          checkCount += 1;
          if (checkCount === 1) return new Promise((resolve) => { resolveEarlier = resolve; });
          return Promise.resolve(null);
        },
      }),
      flush: async () => undefined,
      confirmInstall: () => true,
      requestExit: async () => undefined,
      isDraftPresent: () => false,
    });

    const earlierCheck = controller.checkForUpdates(false);
    const laterCheck = controller.checkForUpdates(true);
    await laterCheck;
    resolveEarlier({ version: '1.0.0', downloadAndInstall: async () => undefined });
    await earlierCheck;

    expect(controller.getState().phase).toBe('up-to-date');
  });

  it('new_check_clears_stale_update_before_check_finishes', async () => {
    let resolveNextCheck!: (value: { version: string; downloadAndInstall: () => Promise<void> } | null) => void;
    const download = vi.fn(async () => undefined);
    let checkCount = 0;
    const controller = createUpdateController({
      isDesktop: () => true,
      loadUpdater: async () => ({
        check: () => {
          checkCount += 1;
          if (checkCount === 1) return Promise.resolve({ version: '2.0.0', downloadAndInstall: download });
          return new Promise((resolve) => { resolveNextCheck = resolve; });
        },
      }),
      flush: async () => undefined,
      confirmInstall: () => true,
      requestExit: async () => undefined,
      isDraftPresent: () => false,
    });

    await controller.checkForUpdates(true);
    const nextCheck = controller.checkForUpdates(true);
    await Promise.resolve();
    controller.dismissUpdate();
    expect(controller.getState().phase).toBe('checking');
    await controller.installAvailableUpdate();

    expect(controller.getState().phase).toBe('checking');
    expect(download).not.toHaveBeenCalled();
    resolveNextCheck(null);
    await nextCheck;
    expect(controller.getState().phase).toBe('up-to-date');
  });

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

  it('successful_install_marks_update_exit_before_downloading', async () => {
    const order: string[] = [];
    const controller = createUpdateController({
      isDesktop: () => true,
      loadUpdater: async () => ({ check: async () => ({ version: '2.0.0', downloadAndInstall: async () => { order.push('download'); } }) }),
      flush: async () => { order.push('flush'); },
      beginUpdateExit: async () => { order.push('begin-update-exit'); },
      confirmInstall: () => true,
      requestExit: async () => undefined,
      isDraftPresent: () => false,
    });
    await controller.checkForUpdates(true);
    await controller.installAvailableUpdate();
    expect(order).toEqual(['flush', 'begin-update-exit', 'download']);
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
      requestExit: async () => undefined,
      isDraftPresent: () => true,
    });
    await controller.checkForUpdates(true);
    await controller.installAvailableUpdate();
    expect(controller.getState().phase).toBe('available');
  });

  it('failed_install_resets_update_exit_guard_and_restores_close_behavior', async () => {
    let updateExitInProgress = false;
    const beginUpdateExit = vi.fn(async () => { updateExitInProgress = true; });
    const resetUpdateExit = vi.fn(async () => { updateExitInProgress = false; });
    const controller = createUpdateController({
      isDesktop: () => true,
      loadUpdater: async () => ({ check: async () => ({ version: '2.0.0', downloadAndInstall: async () => { throw new Error('download failed'); } }) }),
      flush: async () => undefined,
      beginUpdateExit,
      resetUpdateExit,
      confirmInstall: () => true,
      requestExit: async () => undefined,
      isDraftPresent: () => false,
    });

    await controller.checkForUpdates(true);
    await controller.installAvailableUpdate();

    expect(beginUpdateExit).toHaveBeenCalledOnce();
    expect(resetUpdateExit).toHaveBeenCalledOnce();
    expect(updateExitInProgress).toBe(false);
    expect(controller.getState().phase).toBe('error');
  });

  it('reports_install_and_guard_reset_failures', async () => {
    const controller = createUpdateController({
      isDesktop: () => true,
      loadUpdater: async () => ({ check: async () => ({ version: '2.0.0', downloadAndInstall: async () => { throw new Error('download failed'); } }) }),
      flush: async () => undefined,
      beginUpdateExit: async () => undefined,
      resetUpdateExit: async () => { throw new Error('guard reset failed'); },
      confirmInstall: () => true,
      requestExit: async () => undefined,
      isDraftPresent: () => false,
    });

    await controller.checkForUpdates(true);
    await controller.installAvailableUpdate();

    expect(controller.getState().phase).toBe('error');
    expect(controller.getState().error).toContain('download failed');
    expect(controller.getState().error).toContain('guard reset failed');
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

  it('cancelled_or_failed_flush_never_marks_update_exit', async () => {
    const beginUpdateExit = vi.fn(async () => undefined);
    const controller = createUpdateController({
      isDesktop: () => true,
      loadUpdater: async () => ({ check: async () => ({ version: '2.0.0', downloadAndInstall: async () => undefined }) }),
      flush: async () => { throw new Error('flush failed'); },
      beginUpdateExit,
      confirmInstall: () => true,
      requestExit: async () => undefined,
      isDraftPresent: () => false,
    });
    await controller.checkForUpdates(true);
    await controller.installAvailableUpdate();
    expect(beginUpdateExit).not.toHaveBeenCalled();
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
