import type { RoomListEmptyProps } from '../ui-kit.js';
import { useUiKit } from './ui-kit-provider.js';

export type ProxyRoomListEmptyProps = RoomListEmptyProps;

/** Renders the room list empty state of the currently selected UI kit. */
export function ProxyRoomListEmpty(props: RoomListEmptyProps) {
  const kit = useUiKit();
  return <kit.RoomListEmpty {...props} />;
}
