import type { RoomListEntryProps } from '../../ui-kit';

/** One row of the room list; the selection lives in the nested button. */
export function ShadcnRoomListEntry({ children, ...props }: RoomListEntryProps) {
  return <li {...props}>{children}</li>;
}
