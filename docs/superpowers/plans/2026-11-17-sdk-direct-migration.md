# SDK Direct Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Перевести web-клиент SewerNet с самописного REST-прокси на прямой matrix-js-sdk (браузер → homeserver), с репликацией авторизации wizardchat (OIDC через SDK + парольный fallback), E2EE (rust-crypto), медиа (mxcUrl + SW-прокси).

**Architecture:** Клиент-синглтон matrix-js-sdk в `apps/web/src/client/` (login/resume/logout, tokenRefreshFunction, IndexedDBStore по юзеру, initRustCrypto безусловно). Auth = capability discovery → OIDC через SDK oidc-модуль (PKCE внутри SDK) | пароль. Данные UI — событийно из SDK-сторов (revision-хуки), react-query — только провайдер. Старый `matrix-client.ts` работает через адаптер credentials → AuthSession до фазы 6.

**Tech Stack:** React 19, matrix-js-sdk ^41, @matrix-org/matrix-sdk-crypto-wasm ^18, @tanstack/react-query v5, zustand, vitest, lingui. Новых зависимостей, кроме этих трёх, нет.

**Spec:** `docs/superpowers/specs/2026-11-17-sdk-direct-migration-design.md` (эталон механик — `docs/wizardchat-reference.md`, клон `C:\Users\hermit\webdev\wizardchat-web`).

## Global Constraints

- Новые npm-зависимости только: `matrix-js-sdk`, `@matrix-org/matrix-sdk-crypto-wasm`, `@tanstack/react-query` — только в `apps/web`.
- AGPL: код wizardchat не копируем, механики реплицируем.
- localStorage: `sewernet_accounts` = `Record<userId, MatrixCredentials>`, `sewernet_active_account` = userId; pending OIDC: sessionStorage `sewernet:oidc_pending`; кэш clientId: `sewernet_oidc_client_id_<issuer>|<redirectUri>`. Старый ключ `sewernet:auth` чистится при boot.
- IndexedDB: timeline `sewernet-store-<userId>`, crypto-префикс `sewernet-js-sdk-<userId>`.
- `startClient({initialSyncLimit: 20, lazyLoadMembers: true, clientWellKnownPollPeriod: 86400})`; login с `refresh_token: true`, `initial_device_display_name: 'SewerNet Web'`.
- zustand, proxy-ui-kit правила (весь styling в `libs/ui`), lingui EN/RU — неизменны.
- Бэкенд живёт; web перестаёт вызывать `/api/matrix/*` к фазе 6 (grep по `apps/web` пуст).
- Каждая фаза (после Tasks 7, 9, 11, 12, 14, 15): `npx nx run-many -t typecheck,lint,test,build` зелёный; Conventional Commits.

## Review Focus

1. Homeserver без MAS (discovery → `delegatedAuth: false`) → парольная форма, OIDC-кнопок нет, никакого краша при недоступном homeserver. — Test: Task 6 (`welcome: password-only when no MAS`).
2. `/oidc/callback` с `error`-параметром или невалидным state → экран ошибки, pending очищен, no crash, без сетевых вызовов токена. — Test: Task 7 (`callback error and bad state`).
3. Перезагрузка страницы с живой сессией → `resume()` восстанавливает клиент, RequireAuth проходит `pending→syncing→ready`. — Test: Task 4 (`resume restores client`) + Task 7.
4. Рефреш токенов переживает reload: `tokenRefreshFunction` персистит новые токены в accounts map. — Test: Task 3 (`refresh persists new tokens`).
5. Шифрованная комната: расшифровка при пагинации (`Event.decrypted` доводит событие до UI), отправка после `prepareToEncrypt`. — Test: Task 12.

## File Structure

```
apps/web/src/
├─ client/                          # Фаза 1: bootstrap SDK
│  ├─ accounts.ts                   # MatrixCredentials/OidcSession, accounts map, legacy-чистка
│  └─ init-matrix.ts                # синглтон: createStore, createAuthenticatedClient,
│                                   # tokenRefreshFunction, loginWithPassword, resume, logout
├─ app/
│  ├─ features/auth/
│  │  ├─ oidc.ts                    # discovery, register/redirect/complete/revoke
│  │  └─ require-auth.tsx           # state machine: pending→syncing→ready|unauthenticated|error
│  ├─ hooks/
│  │  ├─ use-matrix-event.ts        # generic client.on/off + ref (фаза 2)
│  │  ├─ use-rooms.ts               # RoomEntry[] + revision bumps (фаза 2)
│  │  └─ use-timeline.ts            # TimelineItem[] + pagination (фаза 3)
│  ├─ screens/
│  │  ├─ welcome-screen.tsx         # замена login-screen (фаза 1)
│  │  ├─ oidc-callback-screen.tsx   # замена callback-screen (фаза 1)
│  │  └─ chat-screen.tsx            # переписывается в фазах 1/2
│  ├─ components/                   # room-list, chat-view — перемотка на хуки (фазы 2/3)
│  └─ stores/
│     ├─ auth-store.ts              # rewrite: zustand persist над accounts map
│     └─ chat-store.ts              # slim: activeRoomId + UI-флаги (фаза 2), снос остатков (фаза 6)
├─ lib/
│  ├─ legacy-session.ts             # адаптер MatrixCredentials → AuthSession (фаза 1, снос фаза 6)
│  ├─ mxc-url.ts                    # фаза 5
│  ├─ matrix-client.ts              # legacy, удаляется в фазе 6
│  └─ oauth-pkce.ts                 # legacy, удаляется в фазе 1
└─ public/sw.js                     # фаза 5: Bearer-инъекция для authenticated media
```

UI-kit (фаза 5): `ChatViewHeaderProps.encrypted?/avatarUrl?`, `RoomListItemContentProps.avatarUrl?`, `ChatViewInputFormProps.onAttach?`.

---

## Фаза 1 — SDK bootstrap + авторизация

### Task 1: Зависимости + react-query инфраструктура

**Files:**
- Modify: `apps/web/package.json` (зависимости), `apps/web/src/main.tsx`
- Test: существующие app-спеки (рендер без краша)

**Interfaces:**
- Consumes: —
- Produces: `QueryClient` с дефолтами `{staleTime: 30_000, retry: 2, refetchOnWindowFocus: false}` обёрнут вокруг `<App/>`; установленные пакеты `matrix-js-sdk`, `@matrix-org/matrix-sdk-crypto-wasm`, `@tanstack/react-query`.

- [ ] **Step 1:** `npm install matrix-js-sdk @matrix-org/matrix-sdk-crypto-wasm @tanstack/react-query -w @sewer-net/web`
- [ ] **Step 2:** `main.tsx`: создать `QueryClient` с дефолтами, обернуть `<App/>` в `QueryClientProvider`. В `apps/web/vite.config.ts` добавить `optimizeDeps: { exclude: ['@matrix-org/matrix-sdk-crypto-wasm'] }`.
- [ ] **Step 3:** `npx nx run web:test` → PASS (существующие спеки, новый провайдер не ломает рендер); `npx nx run web:build` → PASS (wasm резолвится).
- [ ] **Step 4:** Commit `feat(web): matrix-js-sdk deps and react-query provider`

### Task 2: accounts.ts + auth-store rewrite + legacy-адаптер

**Files:**
- Create: `apps/web/src/client/accounts.ts`, Test: `apps/web/src/client/accounts.spec.ts`
- Create: `apps/web/src/lib/legacy-session.ts`, Test: `apps/web/src/lib/legacy-session.spec.ts`
- Rewrite: `apps/web/src/app/stores/auth-store.ts`, Test: `apps/web/src/app/stores/auth-store.spec.ts`

**Interfaces:**
- Produces (Task 3–7, 15):
  - `interface OidcSession { issuer: string; clientId: string; redirectUri: string; responseMode: 'query' | 'fragment'; revocationEndpoint?: string; idTokenClaims: Record<string, unknown> }`
  - `interface MatrixCredentials { userId: string; accessToken: string; deviceId: string; homeserverUrl: string; refreshToken?: string; expiresInMs?: number; oidc?: OidcSession }`
  - `upsertAccount(c: MatrixCredentials): void`, `removeAccount(userId: string): void`, `getAccount(userId: string): MatrixCredentials | null`, `listAccounts(): MatrixCredentials[]`, `getActiveAccount(): MatrixCredentials | null`, `setActiveAccount(userId: string): void`, `getActiveUserId(): string | null`, `clearAllAccounts(): void`, `cleanupLegacyStorage(): void` (удаляет `sewernet:auth`)
  - `credentialsToAuthSession(c: MatrixCredentials): AuthSession` (flatten oidc: `issuer`/`clientId` из блока, `expiresAt = Date.now() + expiresInMs`, `refreshToken`)
  - auth-store: `useAuthStore()` → `{ credentials: MatrixCredentials | null, setCredentials(c: MatrixCredentials | null): void }`; persist-хранилище — кастомный `StateStorage` над accounts map (один источник правды).

- [ ] **Step 1:** Failing спеки: `upsert/get/remove/list/setActive` над localStorage (`Record` по userId, активный userId отдельным ключом); `credentialsToAuthSession` — oidc распакован в `issuer`/`clientId`, `expiresAt` из `expiresInMs`; auth-store `setCredentials` пишет в accounts map и обновляет активного юзера, `null` → удаление активного.
- [ ] **Step 2:** `npx nx run web:test` → FAIL
- [ ] **Step 3:** Реализовать `accounts.ts` (единственная точка записи localStorage), `legacy-session.ts` (импортирует тип `AuthSession` из `matrix-client.ts`), auth-store c кастомным storage-адаптером. Вызвать `cleanupLegacyStorage()` в boot (Task 7 подключит, здесь — экспорт).
- [ ] **Step 4:** `npx nx run web:test` → PASS; Commit `feat(web): matrix credentials storage and auth store on accounts map`

### Task 3: init-matrix.ts — createClient, loginWithPassword, tokenRefreshFunction

**Files:**
- Create: `apps/web/src/client/init-matrix.ts`, Test: `apps/web/src/client/init-matrix.spec.ts`

**Interfaces:**
- Consumes: `MatrixCredentials`, `upsertAccount` (Task 2), SDK `createClient` из `matrix-js-sdk`, `OidcTokenRefresher` из `matrix-js-sdk/lib/oidc`.
- Produces (Task 4–7):
  - `getMatrixClient(): MatrixClient` (throw если нет), `hasActiveClient(): boolean`
  - `loginWithPassword(username: string, password: string, homeserverInput: string): Promise<MatrixCredentials>` — throwaway-клиент → `loginRequest({type:'m.login.password', identifier:{type:'m.id.user',user}, password, device_id: crypto.randomUUID(), refresh_token: true, initial_device_display_name:'SewerNet Web'})`; baseUrl из `well_known.m.homeserver.base_url` при наличии; `upsertAccount` + `navigator.storage.persist?.()`.
  - `createAuthenticatedClient(creds, store): MatrixClient` — `createClient({baseUrl, userId, accessToken, deviceId, store, cryptoCallbacks: {}, timelineSupport: true, fallbackICEServerAllowed: true, refreshToken, tokenRefreshFunction})`.
  - `tokenRefreshFunction(accessToken: string, refreshToken?: string): Promise<{accessToken, refreshToken?, expires_in?}>` — OIDC-сессия → `new OidcTokenRefresher(issuer, clientId, redirectUri, deviceId, idTokenClaims).doRefreshAccessToken(...)`; иначе native POST `/refresh` (prefix `/_matrix/client/v3`, фолбэк `/_matrix/client/v1` при `M_UNRECOGNIZED`); успешный рефреш → `upsertAccount` обновлёнными токенами.
  - `createStore(userId: string): IndexedDBStore` — `dbName: 'sewernet-store-<userId>'`.

- [ ] **Step 1:** Failing спеки (vi.mock `matrix-js-sdk`, `matrix-js-sdk/lib/oidc`): `loginWithPassword` шлёт правильное тело, берёт baseUrl из well-known, персистит credentials; `tokenRefreshFunction` для oidc-сессии вызывает refresher и персистит; для native — POST v3, при `M_UNRECOGNIZED` ретрай v1; `createAuthenticatedClient` передаёт все флаги в `createClient`.
- [ ] **Step 2:** `npx nx run web:test` → FAIL
- [ ] **Step 3:** Реализовать (синглтон `_client`, `getMatrixClient`).
- [ ] **Step 4:** `npx nx run web:test` → PASS; Commit `feat(web): authenticated matrix client construction, password login, token refresh`

### Task 4: init-matrix.ts — resume, logout, prewarm crypto

**Files:**
- Modify: `apps/web/src/client/init-matrix.ts`, Test: `apps/web/src/client/init-matrix.spec.ts` (дополнить)

**Interfaces:**
- Consumes: Task 3 весь; `import('@matrix-org/matrix-sdk-crypto-wasm').initAsync()`.
- Produces (Task 7): `resume(credentials: MatrixCredentials, onFirstSync?: () => void): Promise<MatrixClient>`; `logoutCurrent(): Promise<void>`; `prewarmCrypto(): Promise<void>`.

- [ ] **Step 1:** Failing спеки: `resume` при том же юзере и активном sync возвращает существующий клиент; параллельные resume дедуплицируются (одна Promise); порядок build — `store.startup()` ∥ `initAsync()` → `initRustCrypto({cryptoDatabasePrefix: 'sewernet-js-sdk-<userId>'})` → one-shot `PREPARED|CATCHUP` → `startClient({initialSyncLimit: 20, lazyLoadMembers: true, clientWellKnownPollPeriod: 86400})` → `onFirstSync` вызван; `logoutCurrent` — `Promise.race([client.logout(true), 10s])` + очистка IndexedDB (`deleteDatabase` всех трёх баз) + `removeAccount`.
- [ ] **Step 2:** `npx nx run web:test` → FAIL
- [ ] **Step 3:** Реализовать.
- [ ] **Step 4:** `npx nx run web:test` → PASS; Commit `feat(web): client resume, logout and rust-crypto prewarm`

### Task 5: features/auth/oidc.ts — discovery и OIDC через SDK

**Files:**
- Create: `apps/web/src/app/features/auth/oidc.ts`, Test: `apps/web/src/app/features/auth/oidc.spec.ts`

**Interfaces:**
- Consumes: SDK `AutoDiscovery`, oidc-модуль (`registerOidcClient`, `generateOidcAuthorizationUrl`, `completeAuthorizationCodeGrant`), Task 3 `createClient`.
- Produces (Task 6–7):
  - `resolveBaseUrl(input: string): Promise<string>` — `AutoDiscovery.findClientConfig` → `m.homeserver.base_url`, фолбэк `https://<input>`.
  - `interface AuthCapabilities { resolvedBaseUrl: string; hasPasswordLogin: boolean; ssoFlow: boolean; delegatedAuth: boolean; authMetadata: OidcClientConfig | null }`
  - `discoverAuthCapabilities(baseUrl: string): Promise<AuthCapabilities>` — `Promise.allSettled([loginFlows(), registerRequest({}), getAuthMetadata()])` на throwaway-клиенте; register-probe: 401 → доступна, 403 → нет; ошибки discovery → `hasPasswordLogin: false, delegatedAuth: false` (не throw).
  - `getOrRegisterClientId(metadata, redirectUri): Promise<string>` — метаданные `{clientName:'SewerNet', clientUri: origin, applicationType:'web', redirectUris:[redirectUri], contacts: []}`; кэш `sewernet_oidc_client_id_<issuer>|<redirectUri>`.
  - `startOidcLogin(metadata, clientId, redirectUri, homeserverUrl, action?: 'register'): Promise<void>` — nonce (crypto), `generateOidcAuthorizationUrl({..., responseMode: 'query', prompt: 'create' — только для action='register' и при `prompt_values_supported`})`; pending в sessionStorage `sewernet:oidc_pending` `{homeserverUrl, nonce, responseMode, action}`; `location.href = url`.
  - `getOidcRedirectUri(): string` — `<origin>/oidc/callback`.
  - `completeOidcLogin(code: string, state: string): Promise<MatrixCredentials>` — `completeAuthorizationCodeGrant(code, state, responseMode)` → tokenResponse + homeserver из результата → whoami (temp-клиент `whoami()`; device fallback regex `urn:matrix:org.matrix.msc2967.client:device:(\S+)` из idTokenClaims.scope) → `MatrixCredentials` (expiresInMs = expires_in*1000, oidc-блок с revocationEndpoint) → `upsertAccount` + `setActiveAccount`.
  - `revokeOidcSession(oidc: OidcSession, accessToken: string): Promise<void>` — POST `revocation_endpoint`, form-encoded `{token, token_type_hint:'access_token', client_id}`, `AbortSignal.timeout(10_000)`.
  - `clearPendingOidcFlow(): void`, `getPendingOidcFlow(): PendingOidcFlow | null`.

- [ ] **Step 1:** Failing спеки (vi.mock oidc-модуля и SDK-клиентов): discovery — auth_metadata ок → `delegatedAuth: true`; всё падает → `hasPasswordLogin: false, delegatedAuth: false`, без throw; register-probe 401/403; `getOrRegisterClientId` кэширует; `startOidcLogin` строит URL (responseMode query, prompt только для register+supported) и пишет pending; `completeOidcLogin` — токен обмен → whoami → credentials персист; `revokeOidcSession` — form-encoded тело.
- [ ] **Step 2:** `npx nx run web:test` → FAIL
- [ ] **Step 3:** Реализовать.
- [ ] **Step 4:** `npx nx run web:test` → PASS; Commit `feat(web): MAS capability discovery and OIDC flow via SDK oidc module`

### Task 6: Welcome-экран (замена login-screen)

**Files:**
- Create: `apps/web/src/app/screens/welcome-screen.tsx`, Test: `apps/web/src/app/screens/welcome-screen.spec.tsx`
- Delete: `apps/web/src/app/screens/login-screen.tsx`, `login-screen.spec.tsx`
- Modify: `apps/web/src/locales/en.po`, `ru.po`

**Interfaces:**
- Consumes: Task 5 весь (`discoverAuthCapabilities`, `startOidcLogin`, `getOrRegisterClientId`), Task 3 `loginWithPassword`, ui-kit proxy-компоненты (как в старом login-screen).
- Produces: роут `/welcome/:homeserver?` — публичный экран входа.

- [ ] **Step 1:** Failing спеки (vi.mock oidc.ts/init-matrix):
  - ввод homeserver → discovery с дебаунсом 300 мс; повторный ввод отменяет устаревший ответ (seq-гард);
  - `delegatedAuth` → кнопки «Продолжить с Matrix» и «Создать аккаунт», парольная форма скрыта;
  - `!delegatedAuth && hasPasswordLogin` → парольная форма видна, OIDC-кнопок нет;
  - `!delegatedAuth && !hasPasswordLogin` (discovery failed) → парольная форма видна;
  - сабмит пароля → `loginWithPassword` → navigate `/`;
  - клик OIDC → `startOidcLogin` с `<origin>/oidc/callback`.
- [ ] **Step 2:** `npx nx run web:test` → FAIL
- [ ] **Step 3:** Реализовать экран (разметка через proxy-компоненты, стили — только `--sn-*`/Tailwind в `libs/ui`); удалить старый login-screen; `npx nx run web:extract-i18n`, переводы в `ru.po`.
- [ ] **Step 4:** `npx nx run web:test` → PASS; Commit `feat(web): welcome screen with capability discovery, OIDC buttons and password fallback`

### Task 7: /oidc/callback + RequireAuth + маршруты

**Files:**
- Create: `apps/web/src/app/screens/oidc-callback-screen.tsx`, Test: `apps/web/src/app/screens/oidc-callback-screen.spec.tsx`
- Create: `apps/web/src/app/features/auth/require-auth.tsx`, Test: `apps/web/src/app/features/auth/require-auth.spec.tsx`
- Modify: `apps/web/src/app/app.tsx` (роуты), `apps/web/src/app/screens/chat-screen.tsx` (новый auth-store + адаптер), `main.tsx` (`cleanupLegacyStorage()`)
- Delete: `apps/web/src/app/screens/callback-screen.tsx` (+spec), `apps/web/src/lib/oauth-pkce.ts` (+spec)

**Interfaces:**
- Consumes: Task 2 (`getActiveAccount`, auth-store), Task 4 (`resume`, `prewarmCrypto`, `logoutCurrent`), Task 5 (`getPendingOidcFlow`, `completeOidcLogin`, `clearPendingOidcFlow`), Task 2 `credentialsToAuthSession`.
- Produces: роуты: `/oidc/callback` (публичный), `/welcome/...` (публичный), `/` за `<RequireAuth>`; RequireAuth — `{children}`, состояния `pending → syncing → ready | unauthenticated | error`.

- [ ] **Step 1:** Failing спеки callback: query-параметры; `error` → текст ошибки, `clearPendingOidcFlow`, без вызова token; успешный code/state → `completeOidcLogin` → navigate `/`; нет pending → ошибка. Failing спеки RequireAuth: нет credentials → `unauthenticated` (redirect `/welcome`); с credentials → `resume` → ждёт first sync → `ready`; resume throw → `error` с кнопками retry/logout.
- [ ] **Step 2:** `npx nx run web:test` → FAIL
- [ ] **Step 3:** Реализовать экраны/роуты; chat-screen/chat-view переходят с `AuthSession` на `credentialsToAuthSession(useAuthStore(...).credentials!)` — `matrix-client.ts` работает как раньше (Review Focus 3: сессия жива после reload); `main.tsx` вызывает `cleanupLegacyStorage()`.
- [ ] **Step 4:** `npx nx run web:test` → PASS; `npx nx run-many -t typecheck,lint,test,build` → зелёный. Commit `feat(web): oidc callback, require-auth gate and session resume wiring`

---

## Фаза 2 — Список комнат

### Task 8: useMatrixEvent + useRooms

**Files:**
- Create: `apps/web/src/app/hooks/use-matrix-event.ts`, Test: `apps/web/src/app/hooks/use-matrix-event.spec.ts`
- Create: `apps/web/src/app/hooks/use-rooms.ts`, Test: `apps/web/src/app/hooks/use-rooms.spec.ts`

**Interfaces:**
- Consumes: `getMatrixClient` (Task 3/4).
- Produces (Task 9):
  - `useMatrixEvent<T extends keyof MatrixEmittedEvents>(event: T, handler: (payload) => void): void` — подписка стабильна, handler в ref.
  - `interface RoomEntry { roomId: string; name: string; avatarMxc?: string; topic?: string; preview?: string; lastTs?: number; unread?: number; mention?: boolean; }`
  - `buildRoomEntry(room: Room): RoomEntry` — имя: `room.name` → canonical alias → имя собеседника (DM); preview из последнего live-события; unread `getRoomUnreadCount`.
  - `useRooms(): RoomEntry[]` — только join-комнаты; подписки: `Room`, `Room.timeline` (throttle 200 мс), `Room.myMembership`, `RoomState.events`, `Room.receipt` (throttle), `Room.UnreadNotifications` (throttle), `Event.decrypted` (throttle), `sync`, `accountData`.

- [ ] **Step 1:** Failing спеки: useMatrixEvent — handler заменён без переподписки; useRooms — фейковый client (vi.mock getMatrixClient): `getRooms()` фильтрует join; `buildRoomEntry` — name/alias/DM-фолбэк, preview, unread; throttle — revision bumps не чаще 200 мс (fake timers); `Room.myMembership` → пересборка.
- [ ] **Step 2:** `npx nx run web:test` → FAIL
- [ ] **Step 3:** Реализовать (throttle-хелпер общий для обоих хуков).
- [ ] **Step 4:** `npx nx run web:test` → PASS; Commit `feat(web): event-driven room list hooks over sdk stores`

### Task 9: room-list + chat-screen на SDK-хуки, chat-store slim

**Files:**
- Modify: `apps/web/src/app/components/room-list.tsx`, `apps/web/src/app/components/room-list.spec.tsx` (если есть), `apps/web/src/app/screens/chat-screen.tsx`, `apps/web/src/app/screens/chat-screen.spec.tsx`, `apps/web/src/app/stores/chat-store.ts`, `apps/web/src/app/stores/chat-store.spec.ts`
- Modify: `libs/ui` (props `RoomListItemContentProps` при необходимости — preview/имя уже есть)

**Interfaces:**
- Consumes: Task 8 `useRooms`, Task 2 auth-store, Task 7 RequireAuth-ready.
- Produces: chat-store slim — `{ activeRoomId: string | null, setActiveRoom, loadingRooms?, error? }` (поля rooms/messages/прочие удаляются на фазе 6, здесь только источники данных переключаются); room-list рендерит `RoomEntry` (ProxyRoomListItemContent: icon, name, preview).

- [ ] **Step 1:** Failing спеки: chat-screen больше не вызывает `getSyncedRooms`/`loadRoomList` (моки отсутствуют); room-list строит список из `useRooms` — имена/превью/сортировка по `lastTs`; клик → `setActiveRoom(roomId)`.
- [ ] **Step 2:** `npx nx run web:test` → FAIL
- [ ] **Step 3:** Переписать room-list/chat-screen; chat-store: убрать вызовы, добавить `loadingRooms`-переход (уже есть); sliding-sync-код web-пути больше не вызывается (файл `matrix-client.ts` остаётся до фазы 6 для chat-view).
- [ ] **Step 4:** `npx nx run web:test` → PASS; `npx nx run-many -t typecheck,lint,test,build` → зелёный. Commit `feat(web): room list from sdk rooms with event-driven updates`

---

## Фаза 3 — Таймлайн

### Task 10: use-timeline.ts

**Files:**
- Create: `apps/web/src/app/hooks/use-timeline.ts`, Test: `apps/web/src/app/hooks/use-timeline.spec.ts`

**Interfaces:**
- Consumes: `getMatrixClient`, Task 8 `useMatrixEvent`.
- Produces (Task 11–12):
  - `interface TimelineItem { eventId: string; event: MatrixEvent; ts: number; sender: string; content: {body: string; formattedBody?: string; msgtype?: string}; own: boolean; pending?: 'sending'|'queued'|'encrypting'|'not_sent'; redacted?: boolean }`
  - `useTimeline(roomId: string | null): { items: TimelineItem[]; hasMore: boolean; loadOlder(): Promise<void>; isLoading: boolean }` — live timeline + paginated, окно ~80; `paginateEventTimeline(timeline, {backwards: true, limit: 80})`; подписки: `Room.redaction`, `Room.localEchoUpdated`, `Event.decrypted`, `Room.timelineReset`, `sync`; identity элементов стабильна между пересборками (для списков).
  - `sendMessageText(roomId: string, body: string, formattedBody?: string): Promise<void>` — `client.sendMessage(roomId, {msgtype:'m.text', body, formatted_body?, format?})`.
  - `markRoomRead(roomId: string): void` — `client.sendReadReceipt(lastReceiptableEvent(timeline), ReceiptType.Read, true)` (рецептабельные: m.room.message/m.room.encrypted/m.sticker; пропуская local echoes `~`).

- [ ] **Step 1:** Failing спеки (fake room): items выводятся из live timeline; `loadOlder` вызывает paginate backwards и дописывает старые (порядок ts); `Room.timelineReset`/`Room.redaction` пересобирают; identity сохраняется для неизменённых элементов; `sendMessageText` — правильный content; `markRoomRead` — последний рецептабельный, без local echoes; pending-статусы из `event.status`.
- [ ] **Step 2:** `npx nx run web:test` → FAIL
- [ ] **Step 3:** Реализовать.
- [ ] **Step 4:** `npx nx run web:test` → PASS; Commit `feat(web): timeline derivation and pagination over sdk live timelines`

### Task 11: chat-view на use-timeline (история, отправка, прочтения)

**Files:**
- Modify: `apps/web/src/app/components/chat-view.tsx`, `apps/web/src/app/components/chat-view.spec.tsx`, `apps/web/src/app/stores/chat-store.ts` (убрать messages-путь)

**Interfaces:**
- Consumes: Task 10 весь, chat-store `activeRoomId`, Task 7 адаптер (если ещё нужен для старых вызовов getRoomState — после этого не нужен).
- Produces: chat-view без прямых вызовов `matrix-client.ts` (история/отправка/прочтения/пагинация через Task 10; имя комнаты из live room state `room.name`/`m.room.name` live-события).

- [ ] **Step 1:** Failing спеки: открытие комнаты — items из live timeline (без fetch `/messages`); `scrollTop === 0` + `hasMore` → `loadOlder`; отправка → `sendMessageText` + optimistic эхо (status) + скролл вниз, если юзер был внизу; смена комнаты → `markRoomRead`; new event из `Room.timeline` → авто-скролл только если внизу.
- [ ] **Step 2:** `npx nx run web:test` → FAIL
- [ ] **Step 3:** Переписать chat-view; из chat-store выпадают `messages`, `paginationTokens`, `syncedPos` (файл ещё живёт для activeRoomId).
- [ ] **Step 4:** `npx nx run web:test` → PASS; `npx nx run-many -t typecheck,lint,test,build` → зелёный. Commit `feat(web): chat view over sdk timeline with optimistic send and read receipts`

---

## Фаза 4 — E2EE фича

### Task 12: Расшифровка истории, бейдж, prepare-to-encrypt

**Files:**
- Modify: `apps/web/src/app/hooks/use-timeline.ts`, `apps/web/src/app/components/chat-view.tsx` (+spec)
- Modify: `libs/ui/src/lib/ui-kit.ts` (`ChatViewHeaderProps.encrypted?: boolean`), `libs/ui/src/lib/kits/shadcn/chat-view-header.tsx` (+story)

**Interfaces:**
- Consumes: `client.getCrypto()` (initRustCrypto уже сделан в Task 4), Task 10 items.
- Produces: при `loadOlder` в шифрованной комнате — `event.attemptDecryption(cryptoBackend, {isRetry: true})` для нерасшифрованных; заголовок — бейдж «Encrypted» при `isEncryptionEnabledInRoom(roomId)`; перед отправкой — `getCrypto()?.prepareToEncrypt(room)` throttle 60 с.

- [ ] **Step 1:** Failing спеки: paginate в шифрованной комнате → attemptDecryption вызван для encrypted-событий (isRetry); `Event.decrypted` → пересборка items (уже подписка) — decrypted body появляется; бейдж в заголовке при `isEncryptionEnabledInRoom`; prepareToEncrypt не чаще 60 с.
- [ ] **Step 2:** `npx nx run web:test` → FAIL
- [ ] **Step 3:** Реализовать; `extract-i18n`, `ru.po` (бейдж «Зашифровано»).
- [ ] **Step 4:** `npx nx run web:test` → PASS; `npx nx run-many -t typecheck,lint,test,build` → зелёный. Commit `feat(web): e2ee history decryption, encryption badge and prepare-to-encrypt`

---

## Фаза 5 — Медиа

### Task 13: mxc-url + SW media proxy + аватары

**Files:**
- Create: `apps/web/src/lib/mxc-url.ts`, Test: `apps/web/src/lib/mxc-url.spec.ts`
- Create: `apps/web/public/sw.js`
- Create: `apps/web/src/lib/sw-session.ts`, Test: `apps/web/src/lib/sw-session.spec.ts`
- Modify: `apps/web/src/main.tsx` (регистрация SW), `apps/web/src/client/init-matrix.ts` (postSession после build/refresh, clear при logout)
- Modify: `libs/ui/src/lib/ui-kit.ts` (`ChatViewHeaderProps.avatarUrl?`, `RoomListItemContentProps.avatarUrl?`), shadcn-реализации (+stories)

**Interfaces:**
- Consumes: `getMatrixClient`, Task 4 resume/logout.
- Produces:
  - `mxcUrlToHttp(client, mxcUrl, width?, height?, useAuthentication?): string | null` — делегирует `client.mxcUrlToHttp`; выравнивает w/h (одна задана → квадрат); без размеров → full-size (`/download/`, без width/height/method).
  - `postSessionToSw(accessToken: string, baseUrl: string): void`, `clearSessionFromSw(): void` — postMessage на `/sw.js`-регистрацию.
  - `sw.js`: перехват GET `/_matrix/client/v1/media/download|thumbnail` без Authorization → подмешивает Bearer из сессии (ключ по client id, baseUrl-валидация префикса), `allow_redirect` срезается; без сессии → passthrough.
  - avatarUrl в списке комнат и заголовке (thumbnail 48/64px), рендер `<img>` в shadcn.

- [ ] **Step 1:** Failing спеки: mxc-url — делегация, квадратизация, full-size фолбэк; sw-session — postMessage с правильным payload, clear; sw.js — unit-тест обработчика (fetch event mock): добавляет `Authorization: Bearer`, валидирует префикс baseUrl, не трогает чужие URL.
- [ ] **Step 2:** `npx nx run web:test` → FAIL
- [ ] **Step 3:** Реализовать; init-matrix: `postSessionToSw` после resume и внутри tokenRefreshFunction persist, `clearSessionFromSw` в logout; room-list/chat-view header получают `avatarUrl` (thumbnail).
- [ ] **Step 4:** `npx nx run web:test` → PASS; `npx nx run-many -t typecheck,lint,test,build` → зелёный. Commit `feat(web): mxc media urls, service-worker bearer proxy and room avatars`

### Task 14: Загрузка файлов (attach → m.file/m.image)

**Files:**
- Modify: `libs/ui/src/lib/ui-kit.ts` (`ChatViewInputFormProps.onAttach?: (file: File) => void`), `libs/ui/src/lib/kits/shadcn/chat-view-input-form.tsx` (+story)
- Modify: `apps/web/src/app/components/chat-view.tsx` (+spec), `apps/web/src/app/hooks/use-timeline.ts` (`sendMessageFile`)
- Modify: `apps/web/src/locales/en.po`, `ru.po`

**Interfaces:**
- Consumes: `client.uploadContent(file, {progressHandler})`, Task 10 composer-интерфейс.
- Produces: `sendMessageFile(roomId: string, file: File, onProgress?: (p: number) => void): Promise<void>` — upload → mxc → отправка события `m.image`/`m.file` с `{url, info: {size, mimetype}}`; кнопка attach в форме ввода (ui-kit), выбор файла → `onAttach`.

- [ ] **Step 1:** Failing спеки: `sendMessageFile` — uploadContent вызван, событие `m.image` с url/info; attach-кнопка триггерит input file → `onAttach(File)`; форма не ломает существующий текстовый сабмит.
- [ ] **Step 2:** `npx nx run web:test` → FAIL
- [ ] **Step 3:** Реализовать; `extract-i18n`, `ru.po` (attach-титл, «Файл», «Фото»).
- [ ] **Step 4:** `npx nx run web:test` → PASS; `npx nx run-many -t typecheck,lint,test,build` → зелёный. Commit `feat(web): file attachments via uploadcontent and composer attach button`

---

## Фаза 6 — Чистка

### Task 15: Удаление legacy-пути + доки

**Files:**
- Delete: `apps/web/src/lib/matrix-client.ts` (+spec), `apps/web/src/lib/legacy-session.ts` (+spec), `apps/web/src/lib/oauth-pkce.ts` (если пережил Task 7)
- Modify: `apps/web/src/app/stores/chat-store.ts` (финальный снос мёртвых полей: messages/rooms/syncedPos/paginationTokens), `apps/web/src/app/components/chat-view.tsx` (остатки getRoomState), `apps/backend` роуты НЕ трогаем
- Modify: `ARCHITECTURE.md`, `ROADMAP.md`, `docs/wizardchat-reference.md` (статус)
- Test: `npx nx run-many -t typecheck,lint,test,build --skip-nx-cache`

**Interfaces:**
- Consumes: всё предыдущее.
- Produces: в `apps/web` ноль обращений к `/api/matrix/*`; единственный вход в Matrix — `getMatrixClient()`.

- [ ] **Step 1:** Grep `api/matrix` по `apps/web/src` → удалить все хвосты (импорты, типы из `@sewer-net/types` в web-коде — заменить на локальные/SDK).
- [ ] **Step 2:** Финальный снос chat-store мёртвых полей; прогнать `npx nx run-many -t typecheck,lint,test,build --skip-nx-cache` → 8/8 зелёные.
- [ ] **Step 3:** Обновить доки (поток данных: SDK-синглтон, RequireAuth, useRooms/useTimeline; ROADMAP — отметить переход).
- [ ] **Step 4:** Commit `feat(web): remove legacy matrix rest client path` + `docs: sdk direct migration in architecture/roadmap`

---

## Self-Review

- **Spec coverage:** фаза 1 (T1–T7: deps, storage, client, login/refresh, resume/logout, OIDC, welcome, callback+RequireAuth), фаза 2 (T8–T9), фаза 3 (T10–T11), фаза 4 (T12), фаза 5 (T13–T14), фаза 6 (T15), react-query инфраструктура (T1), адаптер совместимости (T2/T7, снос T15) — покрыто.
- **Step scan:** каждый шаг — одно действие с проверяемым результатом; тела только для нетривиальных алгоритмов (токен-рефреш, discovery-гейтинг, buildRoomEntry, timeline-derivation — заданы сигнатурами и тестами).
- **Type consistency:** `MatrixCredentials`/`OidcSession` (T2) ↔ используются в T3–T7; `RoomEntry` (T8) ↔ T9; `TimelineItem`/`loadOlder`/`sendMessageText`/`markRoomRead` (T10) ↔ T11–T12; `mxcUrlToHttp`/`postSessionToSw` (T13) ↔ init-matrix и ui-kit props.
- **Review Focus:** 1 → T6, 2 → T7, 3 → T4+T7, 4 → T3, 5 → T12 — тесты есть.
- **Proportion:** план ~2.5× спека — приемлемо для перехода на 6 фаз; тела не транскрибируются.
