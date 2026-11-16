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

  // Simple two-state toggle: matches the label/icon, so one click reaches
  // the theme the button promises (system mode still selectable in settings).
  const targetMode: ThemeMode = settings.mode === 'dark' ? 'light' : 'dark';

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
