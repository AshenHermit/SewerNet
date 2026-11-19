import type { UiKit } from '../../ui-kit';
import { ShadcnButton } from './button';
import { ShadcnInput } from './input';
import { ShadcnPanel } from './panel';
import { ShadcnRoomListPanel } from './room-list-panel';
import { ShadcnRoomListItem } from './room-list-item';
import { ShadcnChatViewPanel } from './chat-view-panel';
import { ShadcnMessageBubble } from './message-bubble';
import { ShadcnChatViewHeader } from './chat-view-header';
import { ShadcnChatViewMessageList } from './chat-view-message-list';
import { ShadcnChatViewMessage } from './chat-view-message';
import { ShadcnMessageAttachment } from './message-attachment';
import { ShadcnChatViewError } from './chat-view-error';
import { ShadcnChatViewInputForm } from './chat-view-input-form';
import { ShadcnRoomListSearch } from './room-list-search';
import { ShadcnRoomListEmpty } from './room-list-empty';
import { ShadcnRoomListItemContent } from './room-list-item-content';
import { ShadcnRail } from './rail';
import { ShadcnRailButton } from './rail-button';
import { ShadcnSettingsPanel } from './settings-panel';
import { ShadcnKitOption } from './kit-option';
import { ShadcnLoginScreen } from './login-screen';
import { ShadcnLoginForm } from './login-form';
import { ShadcnChatScreen } from './chat-screen';
import { ShadcnAdaptiveSlot } from './adaptive-slot';
import { ShadcnStatusPanel } from './status-panel';
import { ShadcnRoomListHeader } from './room-list-header';
import { ShadcnRoomListItems } from './room-list-items';
import { ShadcnRoomListEntry } from './room-list-entry';
import { ShadcnChatViewEmpty } from './chat-view-empty';
import { ShadcnBottomNavigation } from './bottom-navigation';

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
  MessageAttachment: ShadcnMessageAttachment,
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
  AdaptiveSlot: ShadcnAdaptiveSlot,

  StatusPanel: ShadcnStatusPanel,
  RoomListHeader: ShadcnRoomListHeader,
  RoomListItems: ShadcnRoomListItems,
  RoomListEntry: ShadcnRoomListEntry,
  ChatViewEmpty: ShadcnChatViewEmpty,
  BottomNavigation: ShadcnBottomNavigation,
};
