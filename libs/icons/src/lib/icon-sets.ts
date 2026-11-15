import {
  Check,
  ChevronLeft,
  Hash,
  LogOut,
  Menu,
  MessageCircle,
  Mic,
  Moon,
  MoreVertical,
  Paperclip,
  Plus,
  Search,
  Send,
  Settings,
  Smile,
  Sun,
  Users,
  X,
  type LucideIcon,
} from 'lucide-react';

export type IconName =
  | 'chats'
  | 'search'
  | 'settings'
  | 'users'
  | 'send'
  | 'plus'
  | 'menu'
  | 'logout'
  | 'smile'
  | 'paperclip'
  | 'mic'
  | 'moon'
  | 'sun'
  | 'check'
  | 'close'
  | 'back'
  | 'more'
  | 'room'
  | 'message';

export interface IconProps {
  name: IconName;
  size?: number;
  strokeWidth?: number;
  className?: string;
}

export type IconSet = Record<IconName, LucideIcon>;

const lucideIcons: IconSet = {
  chats: MessageCircle,
  search: Search,
  settings: Settings,
  users: Users,
  send: Send,
  plus: Plus,
  menu: Menu,
  logout: LogOut,
  smile: Smile,
  paperclip: Paperclip,
  mic: Mic,
  moon: Moon,
  sun: Sun,
  check: Check,
  close: X,
  back: ChevronLeft,
  more: MoreVertical,
  room: Hash,
  message: MessageCircle,
};

/**
 * Icon sets are selected together with the UI kit, so a theme can bring
 * its own iconography (shadcn registry, custom packs, ...).
 */
export const ICON_SETS: Record<string, IconSet> = {
  shadcn: lucideIcons,
};

export const DEFAULT_ICON_SET = lucideIcons;
