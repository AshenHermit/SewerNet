import { cn } from '@sewer-net/utils';
import type { RoomListItemProps } from '../../ui-kit';

/**
 * A room row is a real button, so it is reachable and activatable by keyboard
 * and by assistive technology. The current room is exposed through
 * `aria-current` (this is navigation, not a listbox selection) and
 * `data-room-id` gives the app a stable hook without relying on text.
 */
export function ShadcnRoomListItem({
  id,
  active = false,
  unread,
  onSelect,
  className,
  children,
  ...props
}: RoomListItemProps) {
  return (
    <button
      type="button"
      aria-current={active ? 'true' : undefined}
      data-room-id={id}
      data-unread={unread ? String(unread) : undefined}
      onClick={() => onSelect?.(id)}
      className={cn(
        'flex w-full min-w-0 items-center gap-3 px-3 py-2 text-left text-sm transition-colors',
        'focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-[var(--sn-accent)]',
        active
          ? 'bg-[var(--sn-surface-3)] text-[var(--sn-text)] border-l-3 border-l-[var(--sn-accent)]'
          : 'text-[var(--sn-text-muted)] hover:bg-[var(--sn-surface-3)] hover:text-[var(--sn-text)]',
        unread ? 'font-medium text-[var(--sn-accent)]' : '',
        className,
      )}
      {...props}
    >
      {children}
      {unread ? (
        <span
          className="ml-auto flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[var(--sn-accent)] text-[10px] font-bold text-[var(--sn-accent-contrast)]"
        >
          {unread}
        </span>
      ) : null}
    </button>
  );
}
