import type { RoomListItemsProps } from '../ui-kit';
import { useUiKit } from './ui-kit-provider';

export type ProxyRoomListItemsProps = RoomListItemsProps;

/** Renders the room list of the currently selected UI kit. */
export function ProxyRoomListItems(props: ProxyRoomListItemsProps) {
  const kit = useUiKit();
  return <kit.RoomListItems {...props} />;
}
