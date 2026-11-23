import type { RoomListPanelProps } from '../ui-kit';
import { useUiKit } from './ui-kit-provider';

export type ProxyRoomListPanelProps = RoomListPanelProps;

/** Renders the room list panel of the currently selected UI kit. */
export function ProxyRoomListPanel(props: RoomListPanelProps) {
  const kit = useUiKit();
  return <kit.RoomListPanel {...props} />;
}

