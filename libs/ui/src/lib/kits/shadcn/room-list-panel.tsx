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
        'flex flex-col h-full rounded-[var(--sn-radius)] bg-[var(--sn-surface-2)] border border-[var(--sn-border)] max-w-sm overflow-hidden',
        className,
      )}
    >
      {children}
    </div>
  );
}
