import { useState } from 'react';
import { useLingui } from '@lingui/react/macro';
import { ProxyIcon } from '@sewer-net/icons';
import { useThemeStore, type ThemeMode } from '@sewer-net/themes';
import { useAuthStore } from '../stores/auth-store';
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
    <nav className="flex w-14 shrink-0 flex-col items-center gap-1 border-r border-[var(--sn-border)] bg-[var(--sn-surface-1)] py-3">
      <div className="flex h-9 w-9 items-center justify-center rounded-[var(--sn-radius)] bg-[var(--sn-accent)] text-[var(--sn-accent-contrast)]">
        <ProxyIcon name="message" size={20} />
      </div>

      <div className="mt-4 flex flex-col gap-1">
        {NAV_ITEMS.map((item) => (
          <button
            key={item.icon}
            title={item.label}
            className="flex h-10 w-10 items-center justify-center rounded-[var(--sn-radius)] bg-[var(--sn-accent)]/15 text-[var(--sn-accent)]"
          >
            <ProxyIcon name={item.icon} />
          </button>
        ))}
      </div>

      <div className="mt-auto flex flex-col items-center gap-1">
        <RailButton
          title={
            settings.mode === 'dark'
              ? t`Switch to light theme`
              : t`Switch to dark theme`
          }
          onClick={() => setMode(nextMode[settings.mode])}
          icon={settings.mode === 'dark' ? 'sun' : 'moon'}
        />
        <RailButton
          title={t`Settings`}
          onClick={() => setSettingsOpen((open) => !open)}
          icon="settings"
        />
        <RailButton
          title={t`Log out`}
          onClick={() => clearSession()}
          icon="logout"
        />
      </div>

      {settingsOpen ? (
        <SettingsPanel onClose={() => setSettingsOpen(false)} />
      ) : null}
    </nav>
  );
}

function RailButton({
  icon,
  title,
  onClick,
}: {
  icon: Parameters<typeof ProxyIcon>[0]['name'];
  title: string;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      title={title}
      className="flex h-10 w-10 items-center justify-center rounded-[var(--sn-radius)] text-[var(--sn-text-muted)] hover:bg-[var(--sn-surface-2)] hover:text-[var(--sn-text)]"
    >
      <ProxyIcon name={icon} />
    </button>
  );
}
