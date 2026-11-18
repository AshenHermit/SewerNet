import { cn } from '@sewer-net/utils';
import type { RoomListPanelProps } from '../../ui-kit';

export function ShadcnRoomListPanel({
  children,
  className,
  ...props
}: RoomListPanelProps) {
  return (
    <div
      {...props}
      className={cn(
        'flex h-full min-h-0 w-full flex-col overflow-hidden rounded-[var(--sn-radius)] border border-[var(--sn-border)] bg-[var(--sn-surface-2)]',
        className,
      )}
    >
      {children}
    </div>
  );
}
