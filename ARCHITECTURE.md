# Архитектура SewerNet

## Общее описание
SewerNet — кастомный кроссплатформенный Matrix-клиент (web + desktop, позже mobile), ориентированный на расширяемость, кастомизацию, современный UI и простоту поддержки. Монорепозиторий на Nx 24, пакетный менеджер npm workspaces.

## Технологический стек
- **Монорепо**: Nx (генераторы, кэш, run-many), npm workspaces.
- **Клиент**: React 19 + Vite, Tailwind CSS v4, zustand (persist-стор темы/активного аккаунта), react-router, react-markdown (+remark-gfm).
- **Matrix**: `matrix-js-sdk` v41 напрямую из браузера (CORS), `@matrix-org/matrix-sdk-crypto-wasm` (rust-crypto), `@tanstack/react-query` (пока только инфраструктура провайдера).
- **Кастомизация UI**: собственная система **proxy-компонентов** (см. ниже).
- **Локализация**: Lingui v6 (macro `@lingui/react/macro`, каталоги `.po`, RU/EN).
- **Backend**: NestJS — stateless REST proxy к Matrix Client-Server API v3. Web-клиент его матриксные роуты больше не вызывает (`/api/matrix/*` остаются для внешних интеграций/будущих нужд).
- **Лендинг/dev log**: Next.js (App Router), статический пререндер.
- **UI-дока**: Storybook 10 (react-vite) в `libs/ui`.
- **План**: Tauri (desktop/mobile), docker-compose (prod), GitHub Actions (CI/CD).

## Ключевые решения
1. **REST proxy вместо GraphQL** — простая совместимость с Matrix API; GraphQL можно добавить позже как отдельный слой.
2. **Stateless backend**: клиент сам передаёт `homeserverUrl` и `Bearer`-токен в каждом запросе (заголовок `x-matrix-homeserver`); backend не хранит креды и сессии.
3. **Proxy-компоненты**: `ProxyButton`/`ProxyInput`/`ProxyIcon` рендерят реализацию из реестра kits/icon sets, выбранного в теме (`kitId`). Добавление нового UI kit = новый набор компонентов в реестре.
4. **Тема**: `ThemeSettings {kitId, mode, accent, font, radius}` → CSS-переменные `--sn-*` на `documentElement` (`data-theme`). Тема в zustand persist (`sewernet:theme`).
5. **Монорепо-резолюция**: без `tsconfig` paths — через `package.json exports` (`@sewer-net/*`) + npm workspaces + `customConditions: ["@sewer-net/source"]`; библиотеки non-buildable (source-потребление).
6. **Matrix напрямую через matrix-js-sdk**: браузер общается с homeserver сам (CORS); единая точка входа — синглтон `apps/web/src/client/init-matrix.ts` (`resume`, `getMatrixClient`, `logoutCurrent`). UI читает данные из SDK-сторов через событийные хуки (`useRooms`, `useTimeline`), zustand хранит только UI-состояние (активный аккаунт, `activeRoomId`, тема). E2EE — `initRustCrypto` на каждом resume (IndexedDB-префикс `sewernet-js-sdk-<userId>`); authenticated media (`/_matrix/client/v1/media/*`) проксирует service worker (`apps/web/public/sw.js`), подмешивая Bearer из сессии, которую клиент отправляет при resume/refresh.
7. **Авторизация**: capability discovery (`loginFlows`, register-probe, `auth_metadata` + `.well-known`) → при `delegatedAuth` OIDC через SDK oidc-модуль (PKCE внутри SDK, динамическая регистрация клиента с кэшем clientId, `prompt=create` для регистрации), иначе парольный fallback (`loginRequest` с `refresh_token: true`). Креды — `MatrixCredentials` в `sewernet_accounts` (`Record<userId, MatrixCredentials>`); refresh — `tokenRefreshFunction` (OIDC `OidcTokenRefresher` либо native `POST /refresh` v3 с фолбэком v1). `/oidc/callback` обменивает код; `RequireAuth` держит состояния `pending → syncing → ready | unauthenticated | error`.

## Правила рендеринга UI (ui-kit)

Клиентское приложение (`apps/web`) не должно содержать inline-стили (классы Tailwind, `className`, атрибут `style`) и голые HTML-элементы для оформления. Вся разметка, стили и темизация живут в ui-kit (`libs/ui`).

1. **`apps/web` — только данные и логика.** Компоненты приложения передают данные через props и обрабатывают события. Никаких `className`, `style`, CSS-переменных `--sn-*` напрямую в разметке приложения, никаких голых `<div>`, `<section>`, `<header>`, `<nav>`, `<form>`, `<button>`, `<input>`, `<label>`, `<span>`, `<h1>`, `<h2>`, `<h3>`, `<p>`, `<ul>`, `<li>` и т.п. для оформления.
2. **`libs/ui` — только разметка и стили.** UI-kit содержит конкретные реализации компонентов (shadcn kit и др.). Всё оформление — Tailwind классы и CSS-переменные `--sn-*` внутри kits.
3. **Compound Components + props.** Для композиции используется паттерн Compound Components: родительский компонент (например, `ProxyChatViewPanel`) принимает дочерние элементы, а дочерние части рендерятся через отдельные компоненты из ui-kit (`ChatViewHeader`, `ChatViewMessageList`, `ChatViewMessage`, `ChatViewError`, `ChatViewInputForm` и т.п.). Данные передаются через props.
4. **Proxy-компоненты.** Каждый компонент из ui-kit имеет соответствующий `Proxy*` компонент, который берёт актуальный kit из `UiKitProvider` и рендерит `kit.<Component>`. Приложение импортирует только `Proxy*` из `@sewer-net/ui`.
5. **forwardRef / callbacks ref.** Где приложению нужен прямой доступ к DOM-узлу (например, `bottomRef` для скролла в `ChatView`), используется `forwardRef` или callback ref, передаваемый через props.
6. **Переводы.** `Trans` / `t()` остаются в `apps/web` (логика приложения), ui-kit компоненты принимают уже готовые строки/ноды через props (`label`, `placeholder`, `title`, `children`).
7. **Исключений нет.** Любой новый экран/компонент в `apps/web` пишется без стилей с первого коммита.

## Список комнат и таймлайн (SDK-хуки)

```
web (React)
  ├─ RequireAuth: credentials из auth-store → resume(credentials) → ждёт первый sync
  └─ chat-screen
       ├─ RoomList        → useRooms(): client.getRooms() + события SDK
       │     ├─ Room, Room.myMembership, RoomState.events
       │     ├─ Room.timeline / Room.receipt / Room.UnreadNotifications (throttle 200 мс)
       │     └─ sync, accountData, Event.decrypted
       └─ ChatView        → useTimeline(activeRoomId)
             ├─ items: live timeline + paginated timelines, окно ~80 событий
             ├─ loadOlder(): client.paginateEventTimeline(backwards, limit 80)
             ├─ пересборка: Room.redaction, Room.localEchoUpdated,
             │              Event.decrypted, Room.timelineReset, sync
             ├─ sendMessageText / sendMessageFile (client.sendMessage)
             ├─ markRoomRead (sendReadReceipt последнего receiptable-события)
             └─ prepareToEncryptThrottled (60 с на комнату) перед отправкой
```

- Имя комнаты: `room.name` → canonical alias → имя собеседника (DM) → room id;
  превью — последнее live-событие, непрочитанные — `getRoomUnreadCount`.
- Пагинация: `RoomState`/`Event.decrypted` подписки доводят расшифровку
  (шифрованная комната — `attemptDecryption(crypto, {isRetry:true})` пачкой
  после `paginate`), потому что rust-crypto может отдать ключи позже.
- Медиа: `<img>` не умеет Authorization, поэтому service worker
  (`apps/web/public/sw.js`) перехватывает `GET /_matrix/client/v1/media/download|thumbnail`,
  сверяет префикс с baseUrl активного аккаунта, подмешивает `Bearer` и
  срезает `allow_redirect`. Сессию в воркер отправляет `init-matrix.ts`
  при resume и на каждом refresh; до этого media идёт без авторизации.
- Backend живёт отдельно: его `/api/matrix/*` web больше не вызывает.
  Системный прокси (`HTTPS_PROXY`/`HTTP_PROXY` → undici `EnvHttpProxyAgent`
  в `apps/backend/src/main.ts`) касается только бэкенда.

## Поток данных
```
web (React)
  ├─ /welcome: resolveBaseUrl → discoverAuthCapabilities → OIDC (startOidcLogin) | password (loginWithPassword)
  ├─ /oidc/callback: completeOidcLogin → MatrixCredentials → upsertAccount + setActiveAccount → Navigate /
  ├─ client/init-matrix.ts (синглтон)  →  homeserver напрямую (CORS, matrix-js-sdk v41)
  │     ├─ resume: IndexedDBStore + rust-crypto + startClient(initialSyncLimit 20)
  │     └─ tokenRefreshFunction → OidcTokenRefresher | POST /refresh → persist в sewernet_accounts
  ├─ auth-store (persist поверх accounts map) → MatrixCredentials {userId, accessToken, deviceId, homeserverUrl, refreshToken?, expiresInMs?, oidc?}
  ├─ useRooms / useTimeline → данные из SDK-сторов (события client.on/off)
  ├─ chat-store            → activeRoomId, error
  └─ theme-store (persist) → ThemeSettings → applyTheme() → CSS vars → kits/icons
```

## Фокус прототипа
- web + desktop (Tauri) позже; архитектурный запас под mobile.
- Минимальный parity с Element: login, список комнат, история, отправка сообщений, Markdown.
- E2EE: rust-crypto инициализируется на каждом resume, история и отправка
  в шифрованных комнатах работают; верификация устройств, key backup и
  UI управления сессиями — отдельный этап.
