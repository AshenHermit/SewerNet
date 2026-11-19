import { useEffect, useSyncExternalStore } from 'react';
import { useLingui } from '@lingui/react/macro';
import { listen } from '@tauri-apps/api/event';
import { getUpdateController, type UpdateState } from '../../platform/updates';
import { ProxyUpdatePanel } from '@sewer-net/ui';
import { hasUnsavedDraft } from '../../platform/draft-registry';
import { getPlatformKind } from '../../platform/runtime';

const controller = getUpdateController();
const serverSnapshot: UpdateState = { phase: 'unavailable' };

export function useUpdateState(): UpdateState {
  return useSyncExternalStore(
    (listener) => controller.subscribe(listener),
    () => controller.getState(),
    () => serverSnapshot,
  );
}

export function UpdateLifecycle() {
  useEffect(() => {
    try {
      if (getPlatformKind() !== 'desktop') return;
    } catch { return; }
    void controller.checkForUpdates(false);
    let unlistenCheck: (() => void) | undefined;
    let unlistenExit: (() => void) | undefined;
    void listen('update-check-requested', () => void controller.checkForUpdates(true)).then((fn) => { unlistenCheck = fn; });
    void listen('app-exit-requested', () => void controller.exitDesktop()).then((fn) => { unlistenExit = fn; });
    return () => { unlistenCheck?.(); unlistenExit?.(); };
  }, []);
  return null;
}

export function UpdateControls() {
  const { t } = useLingui();
  const state = useUpdateState();
  const controller = getUpdateController();
  const statusLabel = state.phase === 'up-to-date'
    ? t`You are up to date`
    : state.phase === 'unavailable'
      ? t`Updates unavailable`
      : state.phase === 'checking'
        ? t`Checking for updates`
        : state.phase === 'available'
          ? t`A new version is available`
          : state.phase === 'downloading'
            ? t`Downloading update`
            : state.phase === 'installing'
              ? t`Installing update`
              : state.error ?? t`Check for updates`;
  return (
    <ProxyUpdatePanel
      phase={state.phase}
      version={state.version}
      progress={state.progress}
      error={state.error}
      title={t`Software updates`}
      statusLabel={statusLabel}
      checkLabel={t`Check for updates`}
      installLabel={t`Install and restart`}
      dismissLabel={t`Later`}
      draftWarningLabel={t`Unsaved message draft may be lost`}
      draftWarning={hasUnsavedDraft()}
      onCheck={() => void controller.checkForUpdates(true)}
      onInstall={() => void controller.installAvailableUpdate()}
      onDismiss={() => controller.dismissUpdate()}
    />
  );
}
