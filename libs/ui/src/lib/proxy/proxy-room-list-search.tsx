import type { RoomListSearchProps } from '../ui-kit';
import { useUiKit } from './ui-kit-provider';

export type ProxyRoomListSearchProps = RoomListSearchProps;

/** Renders the room list search of the currently selected UI kit. */
export function ProxyRoomListSearch(props: RoomListSearchProps) {
  const kit = useUiKit();
  return <kit.RoomListSearch {...props} />;
}

