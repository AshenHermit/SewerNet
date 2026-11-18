import type { RoomListHeaderProps } from '../ui-kit';
import { useUiKit } from './ui-kit-provider';

export type ProxyRoomListHeaderProps = RoomListHeaderProps;

/** Renders the room list header of the currently selected UI kit. */
export function ProxyRoomListHeader(props: ProxyRoomListHeaderProps) {
  const kit = useUiKit();
  return <kit.RoomListHeader {...props} />;
}
