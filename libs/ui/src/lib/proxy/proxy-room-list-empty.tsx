import type { RoomListEmptyProps } from '../ui-kit';
import { useUiKit } from './ui-kit-provider';

export type ProxyRoomListEmptyProps = RoomListEmptyProps;

/** Renders the room list empty state of the currently selected UI kit. */
export function ProxyRoomListEmpty(props: RoomListEmptyProps) {
  const kit = useUiKit();
  return <kit.RoomListEmpty {...props} />;
}

