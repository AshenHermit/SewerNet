import type {
  ButtonHTMLAttributes,
  ComponentType,
  HTMLAttributes,
  InputHTMLAttributes,
} from 'react';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';
export type ButtonSize = 'sm' | 'md' | 'lg' | 'icon';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
}

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  invalid?: boolean;
}

export type PanelPadding = 'none' | 'sm' | 'md' | 'lg';

export interface PanelProps extends HTMLAttributes<HTMLDivElement> {
  p?: PanelPadding;
  bordered?: boolean;
}

export type RoomListPanelProps = HTMLAttributes<HTMLDivElement>;

export interface RoomListItemProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  id: string;
  active?: boolean;
  unread?: number;
  onSelect?: (id: string) => void;
}

export type ChatViewPanelProps = HTMLAttributes<HTMLDivElement>;

export interface MessageBubbleProps extends HTMLAttributes<HTMLDivElement> {
  own?: boolean;
  text: string;
}

/**
 * A UI kit is a set of concrete component implementations.
 * Proxy components render the kit that is currently selected in the theme settings,
 * so the whole interface can switch between shadcn, custom registries, etc.
 */
export interface UiKit {
  id: string;
  name: string;
  Button: ComponentType<ButtonProps>;
  Input: ComponentType<InputProps>;
  Panel: ComponentType<PanelProps>;
  RoomListPanel: ComponentType<RoomListPanelProps>;
  RoomListItem: ComponentType<RoomListItemProps>;
  ChatViewPanel: ComponentType<ChatViewPanelProps>;
  MessageBubble: ComponentType<MessageBubbleProps>;
}
