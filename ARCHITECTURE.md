# Архитектура SewerNet

## Общее описание
SewerNet — кастомный кроссплатформенный Matrix-клиент (web + desktop, позже mobile), ориентированный на расширяемость, кастомизацию, современный UI и простоту поддержки. Монорепозиторий на Nx 24, пакетный менеджер npm workspaces.

## Технологический стек
- **Монорепо**: Nx (генераторы, кэш, run-many), npm workspaces.
- **Клиент**: React 19 + Vite 8, Tailwind CSS v4, zustand persist (тема — `sewernet:theme`; auth-store поверх localStorage-аккаунтов `sewernet_accounts`), react-router-dom 6, react-markdown (+remark-gfm).
- **Matrix**: `matrix-js-sdk` v41 напрямую из браузера (CORS), `@matrix-org/matrix-sdk-crypto-wasm` (rust-crypto), `@tanstack/react-query` (пока только инфраструктура провайдера).
- **Кастомизация UI**: собственная система **proxy-компонентов** (см. ниже).
- **Локализация**: Lingui v6 (macro `@lingui/react/macro`, каталоги `.po`, RU/EN; компиляция каталогов на лету через `@lingui/vite-plugin`, извлечение строк — `nx run web:extract-i18n`, выбор языка — persist-ключ `sewernet:locale`).
- **Backend**: NestJS 11 — stateless REST proxy к Matrix Client-Server API (глобальный префикс `/api`, порт 3000): `login`, `whoami`, `rooms` (joined_rooms), sliding-sync room list (`sync/room-list`), long-poll `sync`, `messages`, `send`, `read_markers`, `members`/`threads`/`aliases`/`state`, плюс MAS-прокси `/api/matrix/oauth/{discover,register,token}`. Web-клиент эти роуты больше не вызывает — `/api/matrix/*` остаются для внешних интеграций/будущих нужд.
- **Лендинг/dev log**: Next.js 16 (App Router), статический пререндер.
- **UI-дока**: Storybook 10 (react-vite) в `libs/ui` (конфиг `libs/ui/.storybook`).
- **Тесты**: vitest + jsdom (`web`, `landing`, `ui`, `icons`, `utils`); jest (`backend`).
- **План**: Tauri (desktop/mobile), GitHub Actions (CI/CD). Prod docker-compose
  подготовлен (HTTP-only стек), но реальный деплой не выполнялся.

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

## Адаптивная оболочка (compact / wide)

1. **Единственный breakpoint — `48rem`.** Он объявлен ровно один раз:
   `libs/ui/src/layout-tokens.css` → `@theme static { --breakpoint-sn-wide: 48rem; }`.
   Tailwind получает из него утилиту `sn-wide:`, а `libs/ui/src/lib/responsive/layout-mode.ts`
   читает тот же файл через `?raw` и строит `WIDE_MEDIA_QUERY` для JS. Второй источник
   правды (свой `768px`, `md:` и т.п.) запрещён.
2. **Сначала CSS, JS только для того, что CSS не умеет.** Видимость панелей, rail, нижней
   навигации и вариантов компонентов настраивается утилитами `sn-wide:` и `hidden`.
   `useLayoutMode()` используется там, где нужно *смонтировать другой компонент* (например,
   settings: экран на compact ↔ нативный `<dialog>` на wide).
3. **`AdaptiveSlot`.** `ProxyAdaptiveSlot` монтирует ровно один вариант для текущего режима:
   `undefined` → `fallback`, `null` → намеренно пусто; активный вариант перемонтируется при
   пересечении breakpoint. Контролируемое состояние (draft, query, selection) обязано жить
   **выше** слота — иначе resize его сбросит.
4. **`ChatScreen` держит все слоты смонтированными** (`rail`, `rooms`, `chat`, `settings`,
   `bottomNavigation`) и лишь переключает атрибут `hidden` на обёртках
   `[data-sn-panel=...]`. Порядок в DOM фиксирован. Resize **никогда** не мутирует store:
   приложение передаёт уже вычисленный `getEffectiveSection(section, activeRoomId)`.
5. **Фокус.** `usePanelFocus(rootRef, section, mode, activeRoomId)` восстанавливает читаемую
   позицию: намеренная смена раздела фокусирует новую панель (выбранную комнату либо
   заголовок `[data-sn-focus="<section>"]`), resize чинит фокус только если элемент исчез
   или стал невидимым, а фокус вне оболочки (нативный dialog, браузер) не трогается. Хук не
   пишет в store, поэтому не может повторно отправить сообщение или пометить прочитанным.
   Разметка помечает цели `data-sn-focus` и действия `data-sn-action`.
6. **Viewport и safe area.** Мета-тег `apps/web/index.html` содержит `viewport-fit=cover` и
   `interactive-widget=resizes-content` и **не** ограничивает zoom. Экраны входа и статусов
   скроллятся страницей (`min-h-dvh`, `.sn-vh-full` с фолбэком `100vh`), используют
   `--sn-safe-*` и переносят длинный текст; `overflow: hidden` оболочки чата на них не
   распространяется. Оболочка чата — фиксированная динамическая высота с внутренней
   прокруткой списка.

### Как добавить новый адаптивный экран

1. Контракт — в `libs/ui/src/lib/ui-kit.ts`: только props с готовыми строками и колбэками.
2. Реализация — в kit (`libs/ui/src/lib/kits/shadcn/…`): стили и разметка, варианты через
   `sn-wide:` или `AdaptiveSlot`.
3. Обёртка `Proxy*` + регистрация в `shadcnKit` и в корневом barrel `libs/ui/src/index.ts`
   (приложение импортирует только оттуда).
4. Данные, переводы и store-действия остаются в `apps/web`; состояние, которое должно
   пережить resize, живёт выше адаптивного слота.
5. Проверка: unit-тесты kit + app, полноэкранная story в
   `libs/ui/src/lib/kits/shadcn/responsive-shell.stories.tsx`, затем матрица из
   `docs/superpowers/verification/2026-11-18-responsive-web.md`.

Команды проверки:

```bash
npx nx run-many -p ui,web -t typecheck,lint,test     # unit + типы + lint
npx nx run ui:build-storybook                        # harness собирается
npx nx storybook ui --port=6006                      # ручная browser-матрица
npx nx serve web                                     # auth/status экраны
```


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
             ├─ items: плоский список по всей цепочке linked timelines
             │         (старые → live); пагинация пачками до 80 событий
             ├─ loadOlder(): client.paginateEventTimeline(backwards, limit 80)
             ├─ пересборка: Room.redaction, Room.localEchoUpdated,
             │              Event.decrypted, Room.timelineReset, sync
             ├─ sendMessageText / sendMessageFile (client.sendMessage)
             ├─ markRoomRead (sendReadReceipt последнего receiptable-события)
             └─ prepareToEncryptThrottled (60 с на комнату) перед отправкой
```

- Имя комнаты: `room.name` → canonical alias → имя собеседника (DM) → room id;
  превью — последнее «показываемое» live-событие; непрочитанные —
  `getUnreadNotificationCount` (Total; highlight — `NotificationCountType.Highlight`).
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

## Production deployment (HTTP-only стек)

`compose.yaml` + `deploy/` собирают три образа: `backend` (NestJS, приватный
:3000, без published port, только сеть `services`), `landing` (статический
Next.js export) и `reverse-proxy` (Caddy с `auto_https off`, запечённый
`deploy/Caddyfile`). Роутер публикует только
`127.0.0.1:${ROUTER_PORT:-8080}:80`; два named vhost
(`${SITE_SUBDOMAIN}.${COMMON_DOMAIN}` → landing,
`${APP_SUBDOMAIN}.${COMMON_DOMAIN}` → SPA из `apps/web/dist`) и catch-all 404.
`/api/*` на публичных хостах отвергается. Backend не имеет публичного роута.

Публичный HTTPS terminated **существующим** root Nginx владельца; compose
никогда не биндит 443, не запускает automatic certificate issuance и не монтирует
сертификаты. Два варианта ingress: host-Nginx (`proxy_pass` на loopback с
сохранением `Host`) и container-Nginx (внешняя сеть `INGRESS_NETWORK`, только
роутер, без host port). Внешний HTTPS обязателен для SW/WebCrypto/OIDC;
внутренний HTTP его не заменяет. Подробности и blockers — `deploy/README.md`.

## Фокус прототипа
- web + desktop (Tauri) позже; архитектурный запас под mobile.
- Минимальный parity с Element: login, список комнат, история, отправка сообщений и файлов, Markdown.
- E2EE: rust-crypto инициализируется на каждом resume, история и отправка
  в шифрованных комнатах работают; верификация устройств, key backup и
  UI управления сессиями — отдельный этап.
