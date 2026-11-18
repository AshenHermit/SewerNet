import { cn } from '@sewer-net/utils';
import type { RoomListItemsProps } from '../../ui-kit';

/** Scrollable room list. The list, not the panel, owns the vertical scroll. */
export function ShadcnRoomListItems({ children, className, ...props }: RoomListItemsProps) {
  return (
    <ul
      {...props}
      data-sn-scroll="rooms"
      className={cn('min-h-0 flex-1 overflow-y-auto', className)}
    >
      {children}
    </ul>
  );
}
