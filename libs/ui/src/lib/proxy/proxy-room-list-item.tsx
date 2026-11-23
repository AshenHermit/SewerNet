import type { RoomListItemProps } from '../ui-kit';
import { useUiKit } from './ui-kit-provider';

export type ProxyRoomListItemProps = RoomListItemProps;

/** Renders a room list item of the currently selected UI kit. */
export function ProxyRoomListItem(props: RoomListItemProps) {
  const kit = useUiKit();
  return <kit.RoomListItem {...props} />;
}

