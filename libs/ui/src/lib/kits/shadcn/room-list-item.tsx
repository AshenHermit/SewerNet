import { cn } from '@sewer-net/utils';
import type { RoomListItemProps } from '../../ui-kit';

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
      role="option"
      aria-selected={active}
      data-unread={unread ? String(unread) : undefined}
      onClick={() => onSelect?.(id)}
      className={cn(
        'flex w-full items-center gap-3 px-3 py-2 text-sm text-left transition-colors',
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
          className="ml-auto h-5 w-5 rounded-full bg-[var(--sn-accent)] text-[var(--sn-accent-contrast)] text-[10px] font-bold flex items-center justify-center"
        >
          {unread}
        </span>
      ) : null}
    </button>
  );
}

