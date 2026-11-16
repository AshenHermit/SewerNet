import type { UiKit } from '../../ui-kit.js';
import { ShadcnButton } from './button.js';
import { ShadcnInput } from './input.js';
import { ShadcnPanel } from './panel.js';
import { ShadcnRoomListPanel } from './room-list-panel.js';
import { ShadcnRoomListItem } from './room-list-item.js';
import { ShadcnChatViewPanel } from './chat-view-panel.js';
import { ShadcnMessageBubble } from './message-bubble.js';
import { ShadcnChatViewHeader } from './chat-view-header.js';
import { ShadcnChatViewMessageList } from './chat-view-message-list.js';
import { ShadcnChatViewMessage } from './chat-view-message.js';
import { ShadcnChatViewError } from './chat-view-error.js';
import { ShadcnChatViewInputForm } from './chat-view-input-form.js';
import { ShadcnRoomListSearch } from './room-list-search.js';
import { ShadcnRoomListEmpty } from './room-list-empty.js';
import { ShadcnRoomListItemContent } from './room-list-item-content.js';
import { ShadcnRail } from './rail.js';
import { ShadcnRailButton } from './rail-button.js';
import { ShadcnSettingsPanel } from './settings-panel.js';
import { ShadcnKitOption } from './kit-option.js';
import { ShadcnLoginScreen } from './login-screen.js';
import { ShadcnLoginForm } from './login-form.js';
import { ShadcnChatScreen } from './chat-screen.js';

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
  ChatViewHeader: ShadcnChatViewHeader,
  ChatViewMessageList: ShadcnChatViewMessageList,
  ChatViewMessage: ShadcnChatViewMessage,
  ChatViewError: ShadcnChatViewError,
  ChatViewInputForm: ShadcnChatViewInputForm,
  RoomListSearch: ShadcnRoomListSearch,
  RoomListEmpty: ShadcnRoomListEmpty,
  RoomListItemContent: ShadcnRoomListItemContent,
  Rail: ShadcnRail,
  RailButton: ShadcnRailButton,
  SettingsPanel: ShadcnSettingsPanel,
  KitOption: ShadcnKitOption,
  LoginScreen: ShadcnLoginScreen,
  LoginForm: ShadcnLoginForm,
  ChatScreen: ShadcnChatScreen,
};
