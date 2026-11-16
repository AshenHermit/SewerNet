import { cn } from '@sewer-net/utils';
import type { RoomListEmptyProps } from '../../ui-kit.js';

export function ShadcnRoomListEmpty({
  loading = false,
  loadingLabel,
  emptyLabel,
  className,
  ...props
}: RoomListEmptyProps) {
  return (
    <div
      {...props}
      className={cn('flex-1 overflow-y-auto p-2', className)}
    >
      {loading ? (
        <p className="p-3 text-xs text-[var(--sn-text-dim)]">
          {loadingLabel ?? 'Loading chats…'}
        </p>
      ) : (
        <p className="p-3 text-xs text-[var(--sn-text-dim)]">
          {emptyLabel ?? 'No chats yet'}
        </p>
      )}
    </div>
  );
}
