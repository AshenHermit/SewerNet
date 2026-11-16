import type { UiKit } from '../../ui-kit.js';
import { ShadcnButton } from './button.js';
import { ShadcnInput } from './input.js';
import { ShadcnPanel } from './panel.js';
import { ShadcnRoomListPanel } from './room-list-panel.js';
import { ShadcnRoomListItem } from './room-list-item.js';
import { ShadcnChatViewPanel } from './chat-view-panel.js';
import { ShadcnMessageBubble } from './message-bubble.js';

export const shadcnKit: UiKit = {
  id: 'shadcn',
  name: 'shadcn/ui',
  Button: ShadcnButton,
  Input: ShadcnInput,
  Panel: ShadcnPanel,
  RoomListPanel: ShadcnRoomListPanel,
  RoomListItem: ShadcnRoomListItem,
  ChatViewPanel: ShadcnChatViewPanel,
  MessageBubble: ShadcnMessageBubble,
};
