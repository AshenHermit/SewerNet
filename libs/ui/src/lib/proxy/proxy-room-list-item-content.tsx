import type { RoomListItemContentProps } from '../ui-kit.js';
import { useUiKit } from './ui-kit-provider.js';

export type ProxyRoomListItemContentProps = RoomListItemContentProps;

/** Renders room list item content of the currently selected UI kit. */
export function ProxyRoomListItemContent(props: RoomListItemContentProps) {
  const kit = useUiKit();
  return <kit.RoomListItemContent {...props} />;
}
