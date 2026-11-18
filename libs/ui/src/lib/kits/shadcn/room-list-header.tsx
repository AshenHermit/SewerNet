import { cn } from '@sewer-net/utils';
import type { RoomListHeaderProps } from '../../ui-kit';

/** App title of the room list. The only level-1 heading of the chat screen. */
export function ShadcnRoomListHeader({ title, className, ...props }: RoomListHeaderProps) {
  return (
    <div
      {...props}
      className={cn(
        'flex shrink-0 items-center gap-2 border-b border-[var(--sn-border)] px-4 py-3',
        className,
      )}
    >
      <h1 className="truncate text-base font-semibold text-[var(--sn-text)]">{title}</h1>
    </div>
  );
}
