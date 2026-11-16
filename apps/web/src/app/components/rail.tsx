import { useState } from 'react';
import { useLingui } from '@lingui/react/macro';
import { useThemeStore, resolveMode, type ThemeMode } from '@sewer-net/themes';
import { useAuthStore } from '../stores/auth-store';
import { ProxyRail, ProxyRailButton } from '@sewer-net/ui';
import { SettingsPanel } from './settings-panel';

const NAV_ITEMS = [
  { icon: 'chats', label: 'Chats', active: true },
] as const;

export function Rail() {
  const [settingsOpen, setSettingsOpen] = useState(false);
  const settings = useThemeStore((state) => state.settings);
  const setMode = useThemeStore((state) => state.setMode);
  const clearSession = useAuthStore((state) => state.clearSession);
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
      onLogout={() => clearSession()}
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
        onClick={() => clearSession()}
      />
      {settingsOpen ? (
        <SettingsPanel onClose={() => setSettingsOpen(false)} />
      ) : null}
    </ProxyRail>
  );
}
