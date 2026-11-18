import { cn } from '@sewer-net/utils';
import { ProxyIcon } from '@sewer-net/icons';
import type { BottomNavigationProps } from '../../ui-kit';

/**
 * Compact bottom navigation. Two destinations only: the room list (which also
 * owns the chat section, so "Chats" stays current while reading) and settings.
 * The nav is a landmark; the tap targets are full-height buttons. It owns its
 * own safe-area padding so the shell slot only has to hide it on wide.
 */
export function ShadcnBottomNavigation({
  section,
  chatsLabel,
  settingsLabel,
  navigationLabel,
  onRooms,
  onSettings,
  className,
  ...props
}: BottomNavigationProps) {
  const chatsCurrent = section !== 'settings';
  const tabClass =
    'flex h-[var(--sn-bottom-nav-height)] flex-1 flex-col items-center justify-center gap-1 text-[11px] font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-[var(--sn-accent)]';

  return (
    <nav
      {...props}
      aria-label={navigationLabel}
      data-sn-bottom-nav=""
      className={cn(
        'flex shrink-0 items-stretch border-t border-[var(--sn-border)] bg-[var(--sn-surface-1)] px-[var(--sn-bottom-nav-gap)] pb-[calc(var(--sn-bottom-nav-gap)+var(--sn-safe-bottom))]',
        className,
      )}
    >
      <button
        type="button"
        data-sn-action="chats"
        aria-current={chatsCurrent ? 'page' : undefined}
        onClick={onRooms}
        className={cn(
          tabClass,
          chatsCurrent ? 'text-[var(--sn-accent)]' : 'text-[var(--sn-text-muted)]',
        )}
      >
        <ProxyIcon name="chats" size={20} />
        {chatsLabel}
      </button>
      <button
        type="button"
        data-sn-action="settings"
        aria-current={section === 'settings' ? 'page' : undefined}
        onClick={onSettings}
        className={cn(
          tabClass,
          section === 'settings' ? 'text-[var(--sn-accent)]' : 'text-[var(--sn-text-muted)]',
        )}
      >
        <ProxyIcon name="settings" size={20} />
        {settingsLabel}
      </button>
    </nav>
  );
}
