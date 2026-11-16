import { useState } from 'react';
import { useLingui } from '@lingui/react/macro';
import { useThemeStore, type ThemeMode } from '@sewer-net/themes';
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

  const nextMode: Record<ThemeMode, ThemeMode> = {
    light: 'dark',
    dark: 'system',
    system: 'light',
  };

  return (
    <ProxyRail
      mode={settings.mode}
      onThemeToggle={() => setMode(nextMode[settings.mode])}
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
          settings.mode === 'dark'
            ? t`Switch to light theme`
            : t`Switch to dark theme`
        }
        icon={settings.mode === 'dark' ? 'sun' : 'moon'}
        onClick={() => setMode(nextMode[settings.mode])}
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
