import type { RoomListEntryProps } from '../ui-kit';
import { useUiKit } from './ui-kit-provider';

export type ProxyRoomListEntryProps = RoomListEntryProps;

/** Renders one room list row of the currently selected UI kit. */
export function ProxyRoomListEntry(props: ProxyRoomListEntryProps) {
  const kit = useUiKit();
  return <kit.RoomListEntry {...props} />;
}
