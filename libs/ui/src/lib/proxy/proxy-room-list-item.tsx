import type { RoomListItemProps } from '../ui-kit.js';
import { useUiKit } from './ui-kit-provider.js';

export type ProxyRoomListItemProps = RoomListItemProps;

/** Renders a room list item of the currently selected UI kit. */
export function ProxyRoomListItem(props: RoomListItemProps) {
  const kit = useUiKit();
  return <kit.RoomListItem {...props} />;
}
