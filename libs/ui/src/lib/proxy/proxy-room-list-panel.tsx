import type { RoomListPanelProps } from '../ui-kit.js';
import { useUiKit } from './ui-kit-provider.js';

export type ProxyRoomListPanelProps = RoomListPanelProps;

/** Renders the room list panel of the currently selected UI kit. */
export function ProxyRoomListPanel(props: RoomListPanelProps) {
  const kit = useUiKit();
  return <kit.RoomListPanel {...props} />;
}
