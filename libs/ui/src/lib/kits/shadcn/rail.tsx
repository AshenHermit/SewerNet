import { cn } from '@sewer-net/utils';
import { ProxyIcon, type IconName } from '@sewer-net/icons';
import type { RailProps } from '../../ui-kit';

/** Rail actions are at least 44x44 px, so the wide rail is touch friendly too. */
const ACTION =
  'flex h-11 w-11 shrink-0 items-center justify-center rounded-[var(--sn-radius)] transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--sn-accent)]';
const ACTION_OFF =
  'text-[var(--sn-text-muted)] hover:bg-[var(--sn-surface-2)] hover:text-[var(--sn-text)]';
const ACTION_ON = 'bg-[var(--sn-accent)] text-[var(--sn-accent-contrast)]';

/**
 * Wide navigation rail: client mark, the two destinations and the
 * appearance/session actions. Destinations are navigation (`aria-current`),
 * actions are plain buttons; `children` still renders extra kit buttons.
 */
export function ShadcnRail({
  section,
  navigationLabel,
  roomsLabel,
  onRooms,
  settingsLabel,
  onSettings,
  logoutLabel,
  onLogout,
  themeToggleLabel,
  themeIcon,
  onThemeToggle,
  className,
  children,
  ...props
}: RailProps) {
  return (
    <nav
      {...props}
      aria-label={navigationLabel}
      data-sn-rail=""
      className={cn(
        'flex w-[var(--sn-rail-width)] shrink-0 flex-col items-center gap-1 border-r border-[var(--sn-border)] bg-[var(--sn-surface-1)] pt-[calc(0.75rem+var(--sn-safe-top))] pb-[calc(0.75rem+var(--sn-safe-bottom))]',
        className,
      )}
    >
      <div className="mb-2 flex h-9 w-9 shrink-0 items-center justify-center rounded-[var(--sn-radius)] bg-[var(--sn-accent)] text-[var(--sn-accent-contrast)]">
        <ProxyIcon name="message" size={20} />
      </div>

      <div className="flex flex-1 flex-col items-center gap-1">
        {onRooms && roomsLabel ? (
          <button
            type="button"
            title={roomsLabel}
            onClick={onRooms}
            aria-current={section === 'settings' ? undefined : 'page'}
            className={cn(ACTION, section === 'settings' ? ACTION_OFF : ACTION_ON)}
          >
            <ProxyIcon name="chats" />
          </button>
        ) : null}
        {children}
      </div>

      <div className="flex shrink-0 flex-col items-center gap-1">
        {onThemeToggle && themeToggleLabel && themeIcon ? (
          <button
            type="button"
            title={themeToggleLabel}
            onClick={onThemeToggle}
            className={cn(ACTION, ACTION_OFF)}
          >
            <ProxyIcon name={themeIcon as IconName} />
          </button>
        ) : null}
        {onSettings && settingsLabel ? (
          <button
            type="button"
            title={settingsLabel}
            onClick={onSettings}
            aria-current={section === 'settings' ? 'page' : undefined}
            className={cn(ACTION, section === 'settings' ? ACTION_ON : ACTION_OFF)}
          >
            <ProxyIcon name="settings" />
          </button>
        ) : null}
        {onLogout && logoutLabel ? (
          <button
            type="button"
            title={logoutLabel}
            onClick={onLogout}
            className={cn(ACTION, ACTION_OFF)}
          >
            <ProxyIcon name="logout" />
          </button>
        ) : null}
      </div>
    </nav>
  );
}
