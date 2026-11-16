# План рефактора UI: вынос разметки и стилей в ui-kit

**Цель:** в `apps/web` не осталось inline-стилей (Tailwind классы, `className`, `style`) и голых HTML-элементов для оформления. Вся разметка и стили живут в `libs/ui` (ui-kit). Связь — через `Proxy*` компоненты и props.

## Состав изменений

### 1. Расширить интерфейс ui-kit (`libs/ui/src/lib/ui-kit.ts`)
Добавить проп-интерфейсы для composite-компонентов:
- `ChatViewHeaderProps` — заголовок чата (кнопка "назад", иконка комнаты, название, ID комнаты)
- `ChatViewMessageListProps` — список сообщений (состояние загрузки/пусто/список)
- `ChatViewMessageProps` — одно сообщение (event, own)
- `ChatViewErrorProps` — ошибка (текст)
- `ChatViewInputFormProps` — форма ввода (draft, onChange, onSubmit, sending, attach/send actions)
- `RoomListSearchProps` — поиск (query, onChange, placeholder)
- `RoomListEmptyProps` — пустой список (загрузка / нет чатов)
- `RoomListItemContentProps` — содержимое элемента списка комнат (иконка, имя, превью)
- `RailProps` — левая навигационная панель (кнопки: тема, настройки, выход)
- `RailButtonProps` — кнопка навигации (иконка, title, onClick)
- `SettingsPanelProps` — панель внешнего вида (onClose, наборы настроек)
- `KitOptionProps` — вариант выбора UI-kit
- `LoginScreenProps` — экран входа
- `LoginFormProps` — форма входа по паролю
- `ChatScreenProps` — общий экран чата

Добавить поля в `UiKit`:
`ChatViewHeader`, `ChatViewMessageList`, `ChatViewMessage`, `ChatViewError`, `ChatViewInputForm`, `RoomListSearch`, `RoomListEmpty`, `RoomListItemContent`, `Rail`, `RailButton`, `SettingsPanel`, `KitOption`, `LoginScreen`, `LoginForm`, `ChatScreen`.

### 2. Добавить proxy-компоненты (`libs/ui/src/lib/proxy/`)
Для каждого нового компонента создать `Proxy<Name>.tsx` (по образцу `proxy-chat-view-panel.tsx`):
- `proxy-chat-view-header.tsx`, `proxy-chat-view-message-list.tsx`, `proxy-chat-view-message.tsx`, `proxy-chat-view-error.tsx`, `proxy-chat-view-input-form.tsx`
- `proxy-room-list-search.tsx`, `proxy-room-list-empty.tsx`, `proxy-room-list-item-content.tsx`
- `proxy-rail.tsx`, `proxy-rail-button.tsx`
- `proxy-settings-panel.tsx`, `proxy-kit-option.tsx`
- `proxy-login-screen.tsx`, `proxy-login-form.tsx`, `proxy-chat-screen.tsx`

Каждый берёт `kit` через `useUiKit()` и рендерит `kit.<Name> {...props}`.

### 3. Добавить shadcn-реализации (`libs/ui/src/lib/kits/shadcn/`)
Для каждого нового компонента создать `Shadcn<Name>.tsx` (по образцу `shadcn/chat-view-panel.tsx`):
- `chat-view-header.tsx`, `chat-view-message-list.tsx`, `chat-view-message.tsx`, `chat-view-error.tsx`, `chat-view-input-form.tsx`
- `room-list-search.tsx`, `room-list-empty.tsx`, `room-list-item-content.tsx`
- `rail.tsx`, `rail-button.tsx`
- `settings-panel.tsx`, `kit-option.tsx`
- `login-screen.tsx`, `login-form.tsx`, `chat-screen.tsx`

Перенести в них всю разметку и Tailwind-стили из `apps/web`. Использовать CSS-переменные `--sn-*`. Добавить `.stories.tsx` для Storybook.

Зарегистрировать все в `kits/shadcn/index.ts` и `kits/index.ts` (в `shadcnKit` и `UI_KITS` — по модели существующих).

### 4. Рефакторить компоненты `apps/web` (ноль стилей)

По порядку (от листьев к корню):

**4.1 `apps/web/src/app/components/message-bubble.tsx`**
- Удалить `<li>`, `<p>` с sender/timestamp, `className` внутри `ProxyMessageBubble`.
- Оставить только данные (`event`, `own`) и вызов `ProxyMessageBubble` (или новый `ProxyChatViewMessage`).
- Время/имя отправителя передать в ui-kit через props.

**4.2 `apps/web/src/app/components/room-list.tsx`**
- Вынести search, пустое состояние, содержимое элемента списка в `ProxyRoomListSearch`, `ProxyRoomListEmpty`, `ProxyRoomListItemContent`.
- Оставить логику фильтрации, состояния `query`, `setActiveRoom`.

**4.3 `apps/web/src/app/components/rail.tsx`**
- Вынести `RailButton` и содержимое навигации в `ProxyRail` / `ProxyRailButton`.
- Оставить состояние `settingsOpen`, переключение режима, `clearSession`.

**4.4 `apps/web/src/app/components/settings-panel.tsx`**
- Вынести всю разметка настроек (внешний вид, режим, акцент, шрифт, радиус) в `ProxySettingsPanel` / `ProxyKitOption`.
- Оставить store-хуки (`useThemeStore`) и обработчики.

**4.5 `apps/web/src/app/components/chat-view.tsx`**
- Вынести заголовок, список сообщений, ошибку, форму ввода в `ProxyChatViewHeader`, `ProxyChatViewMessageList`, `ProxyChatViewMessage`, `ProxyChatViewError`, `ProxyChatViewInputForm`.
- `bottomRef` — передать через `forwardRef`/callback ref в `ProxyChatViewMessageList` (или оставить в приложении и передать DOM-узел через prop).
- Оставить логику загрузки истории, отправки, состояний stores.

**4.6 `apps/web/src/app/screens/chat-screen.tsx`**
- Вынести обёртку `<div className="flex h-full ...">` с `Rail`/`RoomList`/`ChatView` в `ProxyChatScreen`.
- Оставить загрузку комнат и `handleAuthError`.

**4.7 `apps/web/src/app/screens/login-screen.tsx`**
- Вынести форму пароля, экран входа в `ProxyLoginScreen` / `ProxyLoginForm`.
- Оставить OAuth/PKCE логику, `discover`, `startOAuth`, store-хуки.

### 5. Проверка
- `nx lint apps/web libs/ui`
- `nx test apps/web libs/ui`
- `nx build apps/web libs/ui`
- Storybook для ui-kit (опционально, для визуальной проверки kit'ов)

## Порядок коммитов
Каждый этап — отдельный коммит по conventional commits (`feat(ui): ...`):
1. Расширить ui-kit.ts интерфейсами composite-компонентов
2. Добавить proxy-компоненты
3. Добавить shadcn-реализации
4. Рефакторить message-bubble + room-list
5. Рефакторить rail + settings-panel
6. Рефакторить chat-view
7. Рефакторить chat-screen + login-screen
8. Проверить lint/test/build, обновить ARCHITECTURE.md (уже сделано)

## Ответственный за принятие решений
Выбор nomiнгов пропсов и детальной сигнатуры composite-компонентов остаётся за реализатором, но должно соответствовать существующему стилю ui-kit (`ButtonProps`, `InputProps` и т.п.).
