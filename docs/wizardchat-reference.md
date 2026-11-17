# WizardChat Web — reference clone для feat/replicate

**Задача ветки `feat/replicate`:** повторять механизмы WizardChat, не изобретая
core-логику заново, но с учётом особенностей SewerNet (stateless backend-proxy,
zustand, proxy-компоненты ui-kit).

## Где лежит клон

- Локальный shallow-клон: `C:\Users\hermit\webdev\wizardchat-web`
- Источник: https://gitlab.com/wizardchat/wizardchat-web
- Клон вне репозитория SewerNet — намеренно (не мусорит git-статус,
  ripgrep не режет его .gitignore'ом SewerNet).

## Как агенту читать репозиторий

1. **Семантический поиск**: репозиторий добавлен как knowledge base
   (`.opencode/codebase-index.json`, индекс полностью построен, ~7.8k чанков).
   Поиск через `codebase_search` находит код в обоих репо сразу.
2. **Точный поиск**: `grep` / `glob` с параметром `path` =
   `C:\Users\hermit\webdev\wizardchat-web` (или подпапкой).
3. **Чтение**: `read` по абсолютному пути внутри клона.
4. **История/теги**: клон shallow (`--depth 1`) — истории нет; для истории
   использовать https://gitlab.com/wizardchat/wizardchat-web/-/commits.

## ⚠️ Лицензия

WizardChat — **AGPL-3.0**. Правило: **повторяем логику/архитектуру, код не
копируем**. Перенос кода wizardchat → SewerNet означал бы обязанность открывать
исходники SewerNet по AGPL. Всё пишем с нуля под лицензию SewerNet.

## Карта репозитория wizardchat-web

```
src/
├─ app/
│  ├─ pages/            # экраны
│  │  ├─ auth/          # LoginForm, RegisterForm, OidcCallback, SsoCallback
│  │  └─ client/        # RoomListPanel, ThreadPanel, MembersSidebar,
│  │                    # UserPanel, markAsRead, GlobalModals, ClientLayout
│  ├─ features/         # доменная логика по фичам
│  │  ├─ auth, oidc, sso, qrLogin, device, profile
│  │  ├─ room, roomSearch, roomSwitcher, dm, explore, inbox, space
│  │  ├─ timeline/      # composer (+ editor/slate), message, utils
│  │  ├─ calls/         # livekit: stage, desktopPicker, watchTogether
│  │  ├─ settings/      # appearance, language, notifications, privacy,
│  │  │                 # sessions, encryption, keybackup, emojis, keybinds
│  │  └─ globalSearch, contextMenu, keyboardShortcuts, whatsNew, widget
│  ├─ components/       # generic-UI: Modal, Popover, Toast, Avatar, Slider...
│  ├─ store/atoms/      # jotai-атомы: auth, rooms, settings, presence,
│  │                    # notifications, userProfile, ui, call, widgets
│  └─ util/, hooks/
├─ client/              # matrix-js-sdk: initMatrix, accounts, settingsSync
├─ util/matrix/         # mxcUrl (mxc:// → http резолв)
├─ types/, const/, theme/ (vanilla-extract), i18n/
```

Стек wizardchat: React 19 + matrix-js-sdk + jotai + react-query +
vanilla-extract + slate (composer). Прямой fetch к homeserver (CORS), E2EE через
matrix-sdk-crypto-wasm, медиа через mxcUrl.

## Сопоставление с SewerNet

| WizardChat | SewerNet |
|---|---|
| matrix-js-sdk (direct) | свой REST-клиент → NestJS proxy → homeserver |
| jotai atoms | zustand stores (auth/chat/theme) |
| vanilla-extract css | Tailwind v4 + `--sn-*` + proxy-kits |
| features/ | screens/ + components/ + stores |
| OidcCallback/SsoCallback | `/callback` (MAS OAuth + PKCE) |
| markAsRead.ts | `setReadMarkers` |

## Процесс работы по ветке

1. Выбрать механизм (например: загрузка истории, мarkdown-рендер, room list).
2. Найти реализацию в клоне (knowledge base / grep).
3. Составить план-доку в `docs/superpowers/` (spec → plan), затем реализация
   с тестами, обычный процесс SewerNet (AGENTS.md).
