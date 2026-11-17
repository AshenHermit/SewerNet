import type {
  ButtonHTMLAttributes,
  ComponentType,
  HTMLAttributes,
  InputHTMLAttributes,
  ReactNode,
} from 'react';
import type { AppLocale } from '@sewer-net/types';
import type { MatrixRoomEvent } from '@sewer-net/types';
import type { FontId, ThemeMode } from '@sewer-net/themes';

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

export interface RoomListItemProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'onSelect'> {
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

/** Заголовок чата: кнопка "назад", иконка комнаты, название, ID комнаты. */
export interface ChatViewHeaderProps extends HTMLAttributes<HTMLDivElement> {
  onBack?: () => void;
  backLabel?: ReactNode;
  avatar?: ReactNode;
  /** Готовая HTTP-ссылка на аватар комнаты (рендерится, если нет `avatar`). */
  avatarUrl?: string;
  title: string;
  subtitle?: string;
  /** E2EE включён в комнате — показать бейдж «Encrypted». */
  encrypted?: boolean;
  /** Подпись бейджа шифрования (готовая строка). */
  encryptedLabel?: string;
}

/** Список сообщений: состояние загрузки / пусто / список событий. */
export interface ChatViewMessageListProps extends HTMLAttributes<HTMLDivElement> {
  events: MatrixRoomEvent[];
  loading?: boolean;
  /** ID текущего пользователя, чтобы вычислять own для каждого сообщения. */
  currentUserId?: string;
  /** Ссылка на sentinel-элемент в конце списка (для скролла вниз). */
  bottomRef?: React.RefObject<HTMLDivElement>;
  /** Наличие более старых сообщений: если true — показать кнопку загрузки. */
  hasMore?: boolean;
  /** Обработчик кнопки «загрузить ещё» при скролле вверх или клике по кнопке. */
  onLoadMore?: () => void;
}

/** Одно сообщение в списке чата. */
export interface ChatViewMessageProps extends HTMLAttributes<HTMLLIElement> {
  event: MatrixRoomEvent;
  own?: boolean;
}

/** Блок ошибки чата. */
export interface ChatViewErrorProps extends HTMLAttributes<HTMLDivElement> {
  error?: string;
}

/** Форма ввода сообщения. */
export interface ChatViewInputFormProps extends Omit<HTMLAttributes<HTMLFormElement>, 'onChange'> {
  draft: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
  sending?: boolean;
  /** Выбор файла для вложения; при отсутствии кнопка вложения не рендерится. */
  onAttach?: (file: File) => void;
  /** Готовая подпись кнопки вложения (перевод — в apps/web). */
  attachLabel?: string;
}

/** Поле поиска в списке комнат. */
export interface RoomListSearchProps extends Omit<HTMLAttributes<HTMLDivElement>, 'onChange'> {
  query: string;
  onChange: (value: string) => void;
  placeholder?: string;
}

/** Пустое состояние списка комнат (загрузка / нет чатов). */
export interface RoomListEmptyProps extends HTMLAttributes<HTMLDivElement> {
  loading?: boolean;
  loadingLabel?: ReactNode;
  emptyLabel?: ReactNode;
}

/** Содержимое элемента списка комнат: иконка, имя, превью. */
export interface RoomListItemContentProps extends HTMLAttributes<HTMLDivElement> {
  icon?: ReactNode;
  /** Готовая HTTP-ссылка на аватар комнаты (приоритетнее `icon`). */
  avatarUrl?: string;
  name: string;
  preview?: string;
  /** Тема комнаты — показывается вместо превью, пока нет сообщений. */
  topic?: string;
  unread?: number;
}

/** Левая навигационная панель (кнопки: тема, настройки, выход). */
export interface RailProps extends HTMLAttributes<HTMLDivElement> {
  mode?: ThemeMode;
  onThemeToggle?: () => void;
  onSettings?: () => void;
  onLogout?: () => void;
}

/** Кнопка навигации на рельсе. */
export interface RailButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  icon: string;
  title: string;
  active?: boolean;
}

/** Панель внешнего вида (кит, режим, акцент, шрифт, радиус).
 *  Весь пользовательский текст приходит через props (переводы — в apps/web). */
export interface SettingsPanelProps extends HTMLAttributes<HTMLDivElement> {
  onClose: () => void;
  closeAriaLabel: string;
  appearanceLabel: string;
  interfaceLabel: string;
  colorSchemeLabel: string;
  accentLabel: string;
  fontLabel: string;
  radiusLabel: string;
  resetLabel: string;
  kitId: string;
  kitLabel: string;
  onKitChange: (kitId: string) => void;
  mode: ThemeMode;
  onModeChange: (mode: ThemeMode) => void;
  modeOptions: { value: ThemeMode; label: string }[];
  accent: string;
  onAccentChange: (accent: string) => void;
  accentPresets: { id: string; label: string; value: string }[];
  font: FontId;
  onFontChange: (font: FontId) => void;
  fontOptions: { id: FontId; label: string }[];
  radius: number;
  onRadiusChange: (radius: number) => void;
  locale: AppLocale;
  onLocaleChange: (locale: AppLocale) => void;
  localeOptions: { value: AppLocale; label: string }[];
  onReset: () => void;
}

/** Вариант выбора UI-kit. */
export interface KitOptionProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'onSelect'> {
  kitId: string;
  label: string;
  active: boolean;
  onSelect: (kitId: string) => void;
}

/** Форма входа по паролю. */
export interface LoginFormProps extends HTMLAttributes<HTMLFormElement> {
  usernameLabel: ReactNode;
  passwordLabel: ReactNode;
  submitLabel: ReactNode;
  onSubmit: () => void;
  user: string;
  onUserChange: (value: string) => void;
  password: string;
  onPasswordChange: (value: string) => void;
  invalid: boolean;
  error?: string;
  loading: boolean;
}

/** Экран входа. Весь пользовательский текст приходит через props. */
export interface LoginScreenProps extends HTMLAttributes<HTMLDivElement> {
  appName: string;
  subtitle: string;
  homeserverUrl: string;
  homeserverLabel: string;
  usernameLabel: ReactNode;
  passwordLabel: ReactNode;
  signInLabel: ReactNode;
  onHomeserverChange: (value: string) => void;
  onHomeserverBlur: () => void;
  /** Homeserver advertises delegated (MAS/OIDC) auth — OAuth buttons instead of the password form. */
  oidc?: boolean;
  resolving: boolean;
  starting: boolean;
  error: string | null;
  onContinueWithMatrix: (prompt?: string) => void;
  continueLabel: string;
  createAccountLabel: string;
  onTogglePasswordForm: () => void;
  passwordFormLabel: ReactNode;
  user: string;
  onUserChange: (value: string) => void;
  password: string;
  onPasswordChange: (value: string) => void;
  passwordLoading: boolean;
  passwordError: string | null;
  onSignIn: () => void;
}

/** Общий экран чата (рельса + список комнат + вид чата). */
export type ChatScreenProps = HTMLAttributes<HTMLDivElement>;

/**
 * Центрированная статус-карточка (callback-экраны, экраны ошибок):
 * заголовок, опциональный detail и опциональная кнопка действия.
 */
export interface StatusPanelProps extends Omit<HTMLAttributes<HTMLDivElement>, 'title'> {
  title: ReactNode;
  detail?: ReactNode;
  actionLabel?: ReactNode;
  onAction?: () => void;
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
  ChatViewHeader: ComponentType<ChatViewHeaderProps>;
  ChatViewMessageList: ComponentType<ChatViewMessageListProps>;
  ChatViewMessage: ComponentType<ChatViewMessageProps>;
  ChatViewError: ComponentType<ChatViewErrorProps>;
  ChatViewInputForm: ComponentType<ChatViewInputFormProps>;
  RoomListSearch: ComponentType<RoomListSearchProps>;
  RoomListEmpty: ComponentType<RoomListEmptyProps>;
  RoomListItemContent: ComponentType<RoomListItemContentProps>;
  Rail: ComponentType<RailProps>;
  RailButton: ComponentType<RailButtonProps>;
  SettingsPanel: ComponentType<SettingsPanelProps>;
  KitOption: ComponentType<KitOptionProps>;
  LoginScreen: ComponentType<LoginScreenProps>;
  LoginForm: ComponentType<LoginFormProps>;
  ChatScreen: ComponentType<ChatScreenProps>;
  StatusPanel: ComponentType<StatusPanelProps>;
}
