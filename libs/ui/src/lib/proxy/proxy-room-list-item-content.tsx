import type { RoomListItemContentProps } from '../ui-kit';
import { useUiKit } from './ui-kit-provider';

export type ProxyRoomListItemContentProps = RoomListItemContentProps;

/** Renders room list item content of the currently selected UI kit. */
export function ProxyRoomListItemContent(props: RoomListItemContentProps) {
  const kit = useUiKit();
  return <kit.RoomListItemContent {...props} />;
}

