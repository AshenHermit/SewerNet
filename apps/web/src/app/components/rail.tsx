import { useLingui } from '@lingui/react/macro';
import { useThemeStore, resolveMode, type ThemeMode } from '@sewer-net/themes';
import type { ChatSection } from '@sewer-net/ui';
import { ProxyRail } from '@sewer-net/ui';

interface RailProps {
  section: ChatSection;
  onRooms: () => void;
  onSettings: () => void;
  onLogout: () => void;
}

/**
 * Wide navigation rail. It owns only the appearance quick-toggle; the active
 * section comes from the chat store, so the highlight follows the same state
 * as the compact navigation.
 */
export function Rail({ section, onRooms, onSettings, onLogout }: RailProps) {
  const settings = useThemeStore((state) => state.settings);
  const setMode = useThemeStore((state) => state.setMode);
  const { t } = useLingui();

  // Derive the target from the *resolved* theme, not the raw mode: with
  // mode "system" the raw mode never equals "dark", so a naive toggle would
  // set "system" -> "dark" without any visual change (needs a second click).
  const resolvedMode = resolveMode(settings.mode);
  const targetMode: ThemeMode = resolvedMode === 'dark' ? 'light' : 'dark';

  return (
    <ProxyRail
      section={section}
      navigationLabel={t`Main navigation`}
      roomsLabel={t`Chats`}
      onRooms={onRooms}
      settingsLabel={t`Settings`}
      onSettings={onSettings}
      logoutLabel={t`Log out`}
      onLogout={onLogout}
      themeToggleLabel={
        targetMode === 'light' ? t`Switch to light theme` : t`Switch to dark theme`
      }
      themeIcon={targetMode === 'light' ? 'sun' : 'moon'}
      onThemeToggle={() => setMode(targetMode)}
    />
  );
}
