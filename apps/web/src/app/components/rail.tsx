import { useState } from 'react';
import { useLingui } from '@lingui/react/macro';
import { useThemeStore, resolveMode, type ThemeMode } from '@sewer-net/themes';
import { useAuthStore } from '../stores/auth-store';
import { logoutCurrent } from '../../client/init-matrix';
import { ProxyRail, ProxyRailButton } from '@sewer-net/ui';
import { SettingsPanel } from './settings-panel';

const NAV_ITEMS = [
  { icon: 'chats', label: 'Chats', active: true },
] as const;

export function Rail() {
  const [settingsOpen, setSettingsOpen] = useState(false);
  const settings = useThemeStore((state) => state.settings);
  const setMode = useThemeStore((state) => state.setMode);
  const setCredentials = useAuthStore((state) => state.setCredentials);
  const onLogout = () => {
    // Clear credentials first: the chat UI unmounts immediately, so the
    // components below never call getMatrixClient() on a torn-down client.
    setCredentials(null);
    void Promise.resolve(logoutCurrent());
  };
  const { t } = useLingui();

  // Derive the target from the *resolved* theme, not the raw mode: with
  // mode "system" the raw mode never equals "dark", so a naive toggle would
  // set "system" -> "dark" without any visual change (needs a second click).
  const resolvedMode = resolveMode(settings.mode);
  const targetMode: ThemeMode = resolvedMode === 'dark' ? 'light' : 'dark';

  return (
    <ProxyRail
      mode={settings.mode}
      onThemeToggle={() => setMode(targetMode)}
      onSettings={() => setSettingsOpen((open) => !open)}
      onLogout={onLogout}
    >
      {NAV_ITEMS.map((item) => (
        <ProxyRailButton
          key={item.icon}
          icon={item.icon}
          title={item.label}
          active={item.active}
        />
      ))}
      <ProxyRailButton
        title={
          targetMode === 'light'
            ? t`Switch to light theme`
            : t`Switch to dark theme`
        }
        icon={targetMode === 'light' ? 'sun' : 'moon'}
        onClick={() => setMode(targetMode)}
      />
      <ProxyRailButton
        title={t`Settings`}
        icon="settings"
        onClick={() => setSettingsOpen((open) => !open)}
      />
      <ProxyRailButton
        title={t`Log out`}
        icon="logout"
        onClick={onLogout}
      />
      {settingsOpen ? (
        <SettingsPanel onClose={() => setSettingsOpen(false)} />
      ) : null}
    </ProxyRail>
  );
}
