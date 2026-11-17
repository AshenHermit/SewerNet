import { cn } from '@sewer-net/utils';
import { ProxyIcon } from '@sewer-net/icons';
import type { RoomListItemContentProps } from '../../ui-kit';

export function ShadcnRoomListItemContent({
  icon,
  avatarUrl,
  name,
  preview,
  topic,
  unread,
  className,
  ...props
}: RoomListItemContentProps) {
  return (
    <div
      {...props}
      className={cn('min-w-0', className)}
    >
      {avatarUrl ? (
        <img
          src={avatarUrl}
          alt=""
          className="h-10 w-10 shrink-0 rounded-full object-cover"
        />
      ) : (
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[var(--sn-surface-3)] text-[var(--sn-text-muted)]">
          {icon ?? <ProxyIcon name="room" size={18} />}
        </span>
      )}
      <span className="min-w-0">
        <span className="block truncate text-sm font-medium text-[var(--sn-text)]">
          {name}
        </span>
        <span className="block truncate text-xs text-[var(--sn-text-dim)]">
          {preview ?? topic ?? '\u00A0'}
        </span>
      </span>
      {unread ? (
        <span
          className="ml-auto h-5 w-5 rounded-full bg-[var(--sn-accent)] text-[var(--sn-accent-contrast)] text-[10px] font-bold flex items-center justify-center"
        >
          {unread}
        </span>
      ) : null}
    </div>
  );
}

