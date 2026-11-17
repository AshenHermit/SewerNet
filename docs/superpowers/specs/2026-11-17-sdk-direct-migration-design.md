# Design: Переход на matrix-js-sdk direct (ветка feat/replicate)

Дата: 2026-11-17. Статус: на утверждение.

## Intent / почему

Сейчас SewerNet ходит в Matrix через самописный REST-клиент
(`apps/web/src/lib/matrix-client.ts`) → NestJS-прокси (`/api/matrix/*`) →
homeserver, с ручным long-poll sync. Это тянет бэкенд в каждую матриксную
взаимодействие, не даёт E2EE, требует собственных реализаций пагинации,
комнат и авторизации, и расходится с эталонными клиентами.

Цель ветки `feat/replicate` — повторить механизмы WizardChat (эталон:
`C:\Users\hermit\webdev\wizardchat-web`, AGPL — **архитектуру повторяем, код
не копируем**): прямой matrix-js-sdk из браузера, SDK-сторы и события,
SDK-модуль OIDC, rust-crypto, authenticated media.

**Бэкенд остаётся** под будущие не-матриксные нужды; его матриксные роуты
`/api/matrix/*` к концу миграции становятся неиспользуемыми.

## Цели

1. matrix-js-sdk ^41 напрямую из браузера (CORS), без `/api/matrix/*`.
2. Точная реплика механизма авторизации wizardchat:
   capability discovery → OIDC через SDK oidc-модуль | парольный fallback.
   (SSO-legacy, QR-логин, регистрация, сброс пароля — позже.)
3. react-query v5 — только для сетевых запросов (профиль, каталог комнат,
   поиск); список комнат/таймлайн — событийно из SDK-сторов.
4. E2EE через `@matrix-org/matrix-sdk-crypto-wasm`: `initRustCrypto`
   безусловно при каждом resume (как wizardchat), свой IndexedDB.
5. Медиа: `mxcUrlToHttp` через SDK + service-worker, подмешивающий Bearer
   к authenticated media (`/_matrix/client/v1/media/*`).
6. Каждая фаза оставляет приложение рабочим; в конце фазы 6 старый
   матриксный код удалён.

## Не-цели (позже)

- SSO-redirect (legacy), QR-логин, UI регистрации, сброс пароля.
- Верификация устройств/key-backup UI (после базового перехода).
- Звонки, виджеты, threads-UI, spaces-иерархия.
- Tauri/mobile, docker-compose, удаление бэкенда.
- Мультиаккаунт (одна активная сессия, но хранилище проектируем под map).

## Анти-цели

- Сломать работающий UI в промежуточных фазах.
- Копировать код wizardchat (AGPL) — лицензия SewerNet не позволяет.
- Оставлять две параллельные реализации Matrix-клиента после фазы 6.

## Ограничения

- Новые npm-зависимости только: `matrix-js-sdk`,
  `@matrix-org/matrix-sdk-crypto-wasm`, `@tanstack/react-query`.
- zustand остаётся для клиентского состояния (тема, локаль, настройки UI);
  proxy-ui-kit правила и i18n (Lingui EN/RU) неизменны.
- Бэкенд живёт; роуты `/api/matrix/*` не удаляются в фазах 1–5, к фазе 6
  web их больше не вызывает (физическое удаление роутов — отдельное решение).
- Хранилище: localStorage-ключи с префиксом `sewernet:`; IndexedDB по юзеру:
  `sewernet-store-<userId>` (timeline store), `sewernet-js-sdk-<userId>`
  (cryptoDatabasePrefix), `sewernet-media-cache-<userId>` (опц.).
- Верификация каждой фазы: `npx nx run-many -t typecheck,lint,test,build`
  зелёный; Conventional Commits.

## Подходы

1. **Вертикальные фазы (выбрано)** — 6 фаз, каждая оставляет приложение
   рабочим, старый прокси используется до соответствующей замены. Плюс:
   инкрементально, каждый шаг верифицируем. Минус: дольше по календарю.
2. Dual-stack за флагом — отклонено: двойная поддержка двух клиентов в
   одном коде; у прототипа нет живых пользователей.
3. Big-bang — отклонено: падение проявится во всех местах сразу,
   чинить труднее.

## Порядок фаз (выбранный вариант)

1. **SDK bootstrap + авторизация.** MatrixCredentials, клиент-синглтон,
   login/resume/logout, OIDC через SDK oidc-модуль + парольный fallback.
2. **Список комнат.** `client.getRooms()` + event-driven ревижены.
3. **Таймлайн.** История, пагинация, отправка, прочтения через SDK.
4. **E2EE.** Крипто-инициализация уже в фазе 1; здесь — расшифровка
   истории, `isEncryptionEnabledInRoom`, prepare-to-encrypt.
5. **Медиа.** mxcUrl-обёртка, SW-прокси, загрузка файлов.
6. **Чистка.** Удаление `matrix-client.ts`, ручного sync, sliding-sync
   room-list, oauth-pkce.ts из web-пути; обновление доков.

## Решённые «как» (реплика wizardchat)

### 1. Credentials и персистентность

- `MatrixCredentials {userId, accessToken, deviceId, homeserverUrl,
  refreshToken?, expiresInMs?, oidc?: OidcSession}` — plain-объект,
  **не** текущий `AuthSession` (переименование/переезд в фазе 1).
- `OidcSession {issuer, clientId, redirectUri, responseMode,
  revocationEndpoint?, idTokenClaims}`.
- localStorage: `sewernet_accounts` = `Record<userId, MatrixCredentials>`,
  `sewernet_active_account` = активный userId. Один файл-модуль
  `accounts.ts` (upsert/remove/get/list) — единственная точка записи.
- Auth-стор zustand переписывается на обёртку над этой map (как
  `atomWithStorage` у wizardchat): React-состояние и хранилище — один
  источник правды.
- Pending OIDC-флоу: sessionStorage `sewernet:oidc_pending`
  `{homeserverUrl, nonce, responseMode, action}`.

### 2. Клиент-синглтон (`apps/web/src/client/`)

- `initMatrix.ts`: module-level `_client: MatrixClient | null`,
  `getMatrixClient()` (throw если нет), `normalizeUrl`.
- `createAuthenticatedClient({baseUrl, userId, accessToken, deviceId,
  store, refreshToken, oidc})` → `createClient({ ..., timelineSupport:
  true, cryptoCallbacks: {}, fallbackICEServerAllowed: true })`.
- `tokenRefreshFunction`: OIDC-сессия → `OidcTokenRefresher` из
  `matrix-js-sdk/lib/oidc`; native refresh → POST `/refresh`
  (prefix v3, фолбэк v1 при `M_UNRECOGNIZED`). Каждый успешный рефреш →
  персист в accounts map.
- `login(username, password, homeserverUrl)`: throwaway-клиент →
  `loginRequest({type:'m.login.password', ..., refresh_token: true,
  initial_device_display_name:'SewerNet Web'})`; базовый URL берём из
  `well_known.m.homeserver.base_url` ответа. Затем persist + request
  persistent storage. Аутентифицированный клиент строит только `resume()`.
- `resume(credentials, onFirstSync?)`: guard (тот же юзер + sync не
  STOPPED → существующий клиент), дедупликация параллельных resume.
  Порядок build: IndexedDBStore → createAuthenticatedClient →
  параллельно `store.startup()` + `initAsync()` crypto-wasm →
  `initRustCrypto({cryptoDatabasePrefix})` → one-shot обработчик
  `PREPARED|CATCHUP` → `startClient({lazyLoadMembers: true,
  initialSyncLimit: 20, clientWellKnownPollPeriod: 86400})`.
- `logout`: `Promise.race([client.logout(true), 10s])` → OIDC revocation
  (RFC 7009, form-encoded) → чистка IndexedDB (timeline, crypto, media) +
  localStorage → фолбэк/сброс.
- Хуки-подписки: generic `useMatrixEvent(client, eventName, handler)` —
  `client.on/off`, handler в ref.

### 3. Авторизация (реплика wizardchat)

- **Discovery**: `resolveBaseUrl` (`.well-known/matrix/client` →
  `m.homeserver.base_url`, SDK `AutoDiscovery.findClientConfig`) +
  `discoverAuthCapabilities` через `Promise.allSettled([loginFlows(),
  registerRequest({}), getAuthMetadata()])` → `AuthCapabilities
  {resolvedBaseUrl, hasPasswordLogin, ssoFlow, registerStatus,
  delegatedAuth, authMetadata}`. Дебаунс 300 мс на вводе homeserver.
- **OIDC**: `getOidcRedirectUri()` = `<origin>/oidc/callback`;
  динамическая регистрация `registerOidcClient(metadata, clientMetadata)`
  (clientName SewerNet, applicationType web, redirectUris) с кэшем
  clientId в localStorage `sewernet_oidc_client_id_<issuer>|<redirectUri>`;
  `generateOidcAuthorizationUrl({metadata, clientId, redirectUri,
  homeserverUrl, nonce, prompt, responseMode})` — **PKCE/state целиком
  внутри SDK oidc-модуля** (наш `oauth-pkce.ts` выпадает); pending-флоу в
  sessionStorage; `prompt='create'` только для действия «register» и при
  наличии в `prompt_values_supported`.
- **Callback `/oidc/callback`** (замена текущего `/callback`):
  дедупликация in-flight code; `error`-параметр → экран ошибки + очистка
  pending; иначе `completeAuthorizationCodeGrant(code, state,
  responseMode)` → tokenResponse + homeserver из id_token claim →
  `whoami` (user_id/device_id; device fallback — regex из scope
  `urn:matrix:org.matrix.msc2967.client:device:<id>`) → build
  MatrixCredentials → persist → navigate `/`.
- **Парольный fallback**: показывается, только когда `!delegatedAuth` и
  (discovery failed или `hasPasswordLogin`). MAS-homeserver → OIDC-only.
- RequireAuth-машина состояний: `pending → syncing → ready |
  unauthenticated | error`; ждёт first sync.
- Роуты: `/welcome/:homeserver?` (публичный), `/oidc/callback`, всё
  остальное — за RequireAuth. Старые `/callback` и `/welcome`-логика
  переписываются, не удаляются до фазы 2.
- Существующие бэкенд-роуты `/api/matrix/oauth/*` и `oauth-pkce.ts`
  остаются в репо до фазы 6, web их не вызывает.

### 4. Список комнат (фаза 2)

- Hook по образцу `useRooms`: `client.getRooms()` (membership join) +
  локальный revision-счётчик; подписки: `Room`, `Room.timeline` (throttle
  200 мс), `Room.myMembership`, `RoomState.events`, `Room.receipt`
  (throttle), `Room.UnreadNotifications` (throttle), `Event.decrypted`
  (throttle), `sync`, `accountData` (порядок комнат).
- Запись списка: имя (name → canonical alias → DM-участник), avatarMxc,
  unread через `getRoomUnreadCount`, превью последнего события из
  live timeline.
- Существующие `ProxyRoomList*` компоненты остаются; меняется источник
  данных (из chat-store sliding-sync → hook).

### 5. Таймлайн (фаза 3)

- Derivation по образцу `useTimeline`: live timeline + paginated
  timelines, окно ~80 событий, `client.paginateEventTimeline(timeline,
  {backwards, limit: 80})`; пересборка на `Room.redaction`,
  `Room.localEchoUpdated`, `Event.decrypted`, `Room.timelineReset`, `sync`.
- Отправка: `client.sendMessage(roomId, content)`; Markdown →
  `formatted_body` как сейчас; optimistic-статусы из `event.status`
  (SENDING/QUEUED/ENCRYPTING/NOT_SENT); локальный эхо-апдейт.
- Прочтения: `client.sendReadReceipt(lastReceiptableEvent,
  ReceiptType.Read, true)` по образцу `markAsRead.ts`.
- Скролл-правила сохраняются (вниз, если юзер был внизу).

### 6. E2EE (инициализация в фазе 1, фича в фазе 4)

- Фаза 1: `import('@matrix-org/matrix-sdk-crypto-wasm')` + `initAsync()`
  (prewarm на welcome + в resume), `initRustCrypto({cryptoDatabasePrefix:
  'sewernet-js-sdk-<userId>'})` безусловно.
- Фаза 4: расшифровка истории (`attemptDecryption({isRetry:true})` при
  пагинации в шифрованной комнате), `getCrypto()?.isEncryptionEnabledInRoom`,
  `prepareToEncrypt` (throttle 60 с) перед отправкой, бейджи
  шифрования в UI.
- Верификация устройств / key-backup UI — вне этого перехода.

### 7. Медиа (фаза 5)

- `mxcUrlToHttp`-обёртка (по образцу `src/util/matrix/mxcUrl.ts`):
  делегирует `client.mxcUrlToHttp` (authenticated media при
  `useAuthentication`), выравнивает ширина/высота, full-size фолбэк.
- **SW-прокси** `public/sw.js`: перехват GET authenticated media без
  Authorization → подмешивает Bearer из сессии, которую клиент постил
  (`{type:'setSession', accessToken, baseUrl}`) и обновляет при каждом
  рефреше; префикс URL валидируется по baseUrl. Аватары комнат/юзеров,
  превью — через это.
- Загрузка: `client.uploadContent(file, {progressHandler})` (фаза 5 —
  без шифрования вложений; MSC3090-шифрование вложений — позже).
- Медиа-кэш (IndexedDB blob-кэш) — опционально, позже.

### 8. react-query

- `QueryClient` по умолчанию: `staleTime: 30_000, retry: 2,
  refetchOnWindowFocus: false`.
- Применение: профиль (`['profile', userId]`), публичный каталог комнат,
  поисковые запросы. Инвалидация после мутаций.
- Список комнат/таймлайн — **не** query (событийная модель SDK).

## Что остаётся билдеру

- Имена хуков/модулей и структура `apps/web/src/client/`, `lib/`.
  (Ориентир — карта wizardchat в `docs/wizardchat-reference.md`.)
- Разбивка фаз на таски, тесты на каждую (паттерн: мок `global.fetch`
  для discovery/whoami; SDK-вызовы — vi.mock или обёртки).
- Адаптация props существующих proxy-компонентов под новые данные
  (Room entry вместо SyncedRoomInfo и т.п.).
- i18n-ключи всех новых строк.
- Момент удаления `/callback`/старого login-флоу (после working
  `/oidc/callback`).
- Судьба Legacy `mx_credentials`-аналогов (чистка старых ключей
  `sewernet:auth` при миграции).

## Критерии приёма

- `npx nx run-many -t typecheck,lint,test,build` зелёный на каждой фазе.
- Логин MAS на matrix.org через `/oidc/callback` (SDK PKCE), парольный
  fallback на homeserver без MAS.
- Список комнат с именами/превью после первого sync (SDK-события).
- История: открытие комнаты, пагинация вверх, отправка, прочтения.
- Шифрованные комнаты расшифровываются; отправка в них работает.
- Аватары грузятся через SW-прокси authenticated media.
- В web нет ни одного вызова `/api/matrix/*`.
