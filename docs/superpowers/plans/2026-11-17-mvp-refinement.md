# MVP Refinement Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Добавить пагинацию истории сообщений, живую синхронизацию через /sync long-poll и переключатель языка RU/EN прямо в интерфейсе.

**Architecture:** Пагинация использует существующий токен `prev` из ответа Matrix `/messages`. Синхронизация — рекурсивный long-poll к новому эндпоинту `GET /api/matrix/sync`, который один раз делает fetch на homeserver и возвращает JSON; фронтенд запускает следующий запрос сразу после получения пачки событий, обновляя `pos`. Переключатель языка — расширение панели настроек с мгновенным применением через `activateLocale()`.

**Tech Stack:** NestJS 11, React 19 + Vite, zustand, vitest, global.fetch, `@sewer-net/types`, lingui macro. Новых npm-зависимостей нет.

**Spec:** `docs/superpowers/specs/2026-11-17-mvp-refinement-design.md`

## Global Constraints

- Backend stateless: не хранит токены/сессии; клиент передаёт `homeserverUrl` + `Bearer` с каждым запросом.
- Новых npm-зависимостей нет: только `global.fetch`, `URLSearchParams`, `AbortController`.
- Локализация через `@lingui/react/macro` (`Trans` / `t`); новые ключи — в `en.po`/`ru.po`, `extract-i18n`.
- Conventional Commits; финальный `git status` чистый; `nx run-many -t typecheck,lint,test,build` зелёный.
- Правила рендеринга ui-kit: `apps/web` содержит только данные и логику, `libs/ui` — разметку и стили; ни одного inline-стиля в компонентах приложения.

## Review Focus

1. Homeserver без `/sync` (404) → frontend graceful disconnect, уже открытый чат продолжает работать; сообщение «Недоступна синхронизация» не показывается (тихий отказ). — Test: Task 5 (`subscribeToSync — disconnect on non-2xx`).
2. При переходе между комнатами предыдущий sync aborts — нет утечек, старое состояние не затирается новым. — Test: Task 5 (`unsubscribe cancels inflight request`).
3. Пагинация: при скролле вверх подгружаются старые сообщения, `prev` токен обновляется, события сортируются по `origin_server_ts`. — Test: Task 2 (`loadMoreMessages prepends and updates prevToken`).
4. Новый язык применяется мгновенно без перезагрузки и сохраняется в localStorage. — Test: Task 4 (`locale persists in localStorage and activates`).
5. Дедупликация: одно и то же событие по `event_id` не добавляется дважды при получении из sync и из начальной загрузки одновременно. — Test: Task 5 (`appendSyncEvents deduplicates by event_id`).

---

### Task 1: Types — MatrixMessagesResponse.prev + MatrixSyncResponse

**Files:**
- Modify: `libs/types/src/lib/matrix.ts`
- Test: (проверка экспортов через `nx run types:typecheck`)

**Interfaces:**
- Consumes: —
- Produces:
  - `MatrixMessagesResponse` получает опциональное поле `prev?: string` (токен для загрузки более старых сообщений).
  - Новый тип `MatrixSyncRoomTimeline { events: MatrixRoomEvent[]; limited?: boolean; prev_batch?: string }`
  - Новый тип `MatrixSyncResponse` с полями `pos: string`, `rooms?: { join?: Record<string, MatrixSyncRoomTimeline> }`, `account_data?, presence?, to_device?`
- Экспортировать всё из `libs/types/src/index.ts`

- [ ] **Step 1:** Проверить текущее состояние типов (уже есть в `libs/types/src/lib/matrix.ts`). Убедиться что `MatrixMessagesResponse` сейчас без `prev`.
- [ ] **Step 2:** Добавить `prev?: string` в `MatrixMessagesResponse`; добавить `MatrixSyncRoomTimeline` и `MatrixSyncResponse`. Экспортировать из index.
- [ ] **Step 3:** `npx nx run types:typecheck` → PASS
- [ ] **Step 4:** `git add libs/types && git commit -m "feat(types): add MatrixSyncResponse and prev token to MatrixMessagesResponse"`

---

### Task 2: Пагинация — ChatViewMessageList + Scroll-to-top load

**Files:**
- Modify: `libs/ui/src/lib/ui-kit.ts`
- Modify: `libs/ui/src/lib/proxy/proxy-chat-view-message-list.tsx`
- Modify: `libs/ui/src/lib/kits/shadcn/chat-view-message-list.tsx`
- Modify: `apps/web/src/app/components/chat-view.tsx`
- Modify: `apps/web/src/app/components/chat-view.spec.tsx`

**Interfaces:**
- Consumes: `ChatViewMessageListProps` (расширяемый интерфейс), `matrixClient.getMessages(session, roomId, { limit, from })`.
- Produces:
  - `ChatViewMessageListProps.hasMore?: boolean; onLoadMore?: () => void`
  - Shadcn-реализация: кнопка/сепаратор сверху списка при `hasMore`.
  - В `chat-view.tsx`: local state `paginationTokens: Record<roomId, { prev?: string }>`, функция `loadMore(roomId)` вызывает `getMessages({ limit: 50, from: token?.prev })`, prepend к messages[roomId], обновляет токен.
  - Скролл к верху (`scrollTop === 0` + `hasMore`) → автотриггер `loadMore`.

- [ ] **Step 1:** Failing тест `chat-view.spec.tsx`: при монтировании с `activeRoomId` и наличием `prev` токена в ответе `/messages` — компонент должен показать кнопку «Load more» (или состояние hasMore = true). Проверить, что `onLoadMore` вызван при скролле вверх ( scrollTop === 0). Мокнуть `matrixClient.getMessages` через vi.mock.
- [ ] **Step 2:** `npx nx run web:test` → FAIL
- [ ] **Step 3:** Расширить `ChatViewMessageListProps` в `ui-kit.ts` полем `hasMore?` и `onLoadMore?`. Обновить shadcn-реализацию (`chat-view-message-list.tsx`): добавить кнопку/сепаратор сверху списка. Обновить `proxy-chat-view-message-list.tsx` (передаёт props дальше).
- [ ] **Step 4:** Реализовать в `chat-view.tsx`: локальный state `prevToken: Record<string, string | undefined>`; эффект на `events.length` (scroll detection через ref); функция `loadMore(roomId)`; прокидывать `hasMore` и `onLoadMore` в `ProxyChatViewMessageList`. Проверить prepend (новые события идут ДО существующих, сохраняя порядок по `origin_server_ts`).
- [ ] **Step 5:** `npx nx run web:test` → PASS; `git commit -m "feat(web): paginate message history with load-more button"`

---

### Task 3: Переключатель языка в настройках

**Files:**
- Modify: `libs/ui/src/lib/ui-kit.ts`
- Modify: `libs/ui/src/lib/kits/shadcn/settings-panel.tsx`
- Modify: `apps/web/src/app/components/settings-panel.tsx`
- Modify: `apps/web/src/app/screens/chat-screen.tsx`
- Create: `apps/web/src/app/components/settings-panel.spec.tsx`

**Interfaces:**
- Consumes: `SettingsPanelProps` расширить полями `locale: AppLocale`, `onLocaleChange: (AppLocale) => void`, `localeOptions: { value: AppLocale; label: string }[]`.
- Produces: новая секция «Language» с кнопками EN/RU в shadcn SettingsPanel; `chat-screen.tsx` вызывает `activateLocale(locale)` при onChange; persist в localStorage (уже есть в `i18n.ts`).

- [ ] **Step 1:** Failing тест `settings-panel.spec.tsx`: при передаче `locale='en'` и клике на кнопку `ru` — вызывается `onLocaleChange('ru')`. Проверить, что `activateLocale` вызван извне (мок через vi.mock('./i18n', ...)).
- [ ] **Step 2:** `npx nx run web:test` → FAIL
- [ ] **Step 3:** Расширить `SettingsPanelProps` в `ui-kit.ts`. Добавить новую секцию в `shadcn/settings-panel.tsx`. В `settings-panel.tsx` (web) передать `locale={currentLocale}`, `onLocaleChange={activateLocale}`, `localeOptions={[{value:'en',label:'English'},{value:'ru',label:'Русский'}]}`. Использовать `useLingui().i18n.locale` или Zustand store для текущего locale (предпочтительнее добавить локаль в zustand theme-store, или использовать отдельный hook).
- [ ] **Step 4:** Проверить что `activateLocale` из `i18n.ts` пишет в `localStorage.setItem(LOCALE_STORAGE_KEY, locale)` — проверяется фактом работы, теста достаточно для UI.
- [ ] **Step 5:** `npx nx run web:test` → PASS; `git commit -m "feat(web): add language switcher to settings panel"`

---

### Task 4: Backend — /sync long-poll endpoint

**Files:**
- Modify: `apps/backend/src/app/matrix/matrix.service.ts`
- Modify: `apps/backend/src/app/matrix/matrix.controller.ts`
- Modify: `apps/backend/src/app/matrix/matrix.service.spec.ts`

**Interfaces:**
- Consumes: `MatrixService.proxy(homeserver, path, options)` — уже существует.
- Produces:
  - `MatrixService.sync(homeserver, token, timeoutMs, pos?)` → `Promise<MatrixSyncResponse>` — один HTTP fetch на `{hs}/_matrix/client/v3/sync?timeout=${timeoutMs}&pos=${pos || ''}` с заголовками Authorization и Content-Type application/json. На ошибку 4xx/5xx — прокидывает через proxy (HttpException).
  - `POST /matrix/sync` в контроллере → принимает query params `timeout` и `pos` (из URL), headers `x-matrix-homeserver` и `Authorization`. Возвращает `MatrixSyncResponse`.
- Таймаут по умолчанию 30 000 мс (как у room-list).

- [ ] **Step 1:** Failing тест в `matrix.service.spec.ts`: `sync` делает один fetch на `.../_matrix/client/v3/sync?timeout=30000&pos=` с правильными заголовками, возвращает парсенный `MatrixSyncResponse` с `pos` и `rooms.join[roomId].timeline.events`. На 404 от homeserver — выбрасывает `HttpException` c upstream статусом.
- [ ] **Step 2:** `npx nx run backend:test` → FAIL
- [ ] **Step 3:** Реализовать метод `sync(homeserver, token, timeoutMs = 30000, pos?)` в сервисе + роут `POST /matrix/sync` в контроллере. Извлечь token из заголовка Authorization так же как в других роутах.
- [ ] **Step 4:** `npx nx run-many -t test,typecheck --projects=backend,types` → PASS; `git commit -m "feat(backend): add /sync endpoint for live message updates"`

---

### Task 5: Frontend — subscribeToSync + appendSyncEvents

**Files:**
- Modify: `apps/web/src/lib/matrix-client.ts`
- Modify: `apps/web/src/lib/matrix-client.spec.ts`
- Modify: `apps/web/src/app/stores/chat-store.ts`
- Modify: `apps/web/src/app/components/chat-view.tsx`
- Modify: `apps/web/src/app/components/chat-view.spec.tsx`

**Interfaces:**
- Consumes: `matrixClient.sync(session, { timeout, pos })`, `MatrixSyncResponse` (Task 1), `AuthSession`.
- Produces:
  - `matrixClient.subscribeToSync(session, roomId, onEvents): () => void` — запускает цикл long-poll: `sync(session, { timeout: 30000, pos })` → по получению: фильтрует события по `room_id === roomId`, вызывает `onEvents(events)`, обновляет `pos`, повторяет. AbortController для отмены. При 401 — refresh токена и retry одного подключения (не бесконечный цикл). Return cleanup function.
  - `chat-store.appendSyncEvents(roomId: string, events: MatrixRoomEvent[]): void` — дедупликация по `event_id`, вставка новых событий в массив (сортировка по `origin_server_ts`), обновление `syncedPos[roomId]`.
  - В `chat-view.tsx`: `useEffect` на `activeRoomId` запускает `subscribeToSync` с вызовом `appendSyncEvents`; останавливает при уходе из комнаты. Auto-scroll вниз при новом сообщении только если пользователь был внизу.

- [ ] **Step 1:** Failing тесты в `matrix-client.spec.ts`:
  - `subscribeToSync` делает первый fetch на `/api/matrix/sync?timeout=30000` с авторизацией; при ответе с `rooms.join['!r'].timeline.events = [{ event_id: '$1' }]` — вызывает `onEvents` один раз; потом делает второй fetch с `pos=<response.pos>`.
  - Вызов cleanup функции отменяет незавершённый fetch и прекращает цикл.
  - Ответ 401 → делает один refresh через `refreshOauthToken`, затем повторяет запрос с новым токеном; далее цикл продолжается.
- [ ] **Step 2:** `npx nx run web:test` → FAIL
- [ ] **Step 3:** Расширить `ChatState` в `chat-store.ts`: добавить `syncedPos: Record<string, string>` и `appendSyncEvents(roomId, events): void` (dedup + insert sorted by ts).
- [ ] **Step 4:** Реализовать `subscribeToSync` в `matrix-client.ts`: цикл внутри async IIFE, AbortController, обработка 401 через единый `inflightRefresh` (уже есть). Return cleanup = `abortController.abort()`.
- [ ] **Step 5:** Интегрировать в `chat-view.tsx`: эффект на `activeRoomId` → start/stop `subscribeToSync`; при новых событиях → `appendSyncEvents` + авто-скролл вниз (только если пользователь внизу). Добавить проверку в тесте `chat-view.spec.tsx`: при появлении нового события из sync — оно добавляется в стор и список рендерится.
- [ ] **Step 6:** `npx nx run-many -t test,typecheck,lint --projects=web,types` → PASS; `git commit -m "feat(web): add /sync long-poll subscription for live messages"`

---

### Task 6: i18n + финальная проверка

**Files:**
- Modify: `apps/web/src/locales/en.po`, `apps/web/src/locales/ru.po`
- Modify: `ROADMAP.md` (отметить выполненные пункты)

**Interfaces:**
- Consumes: —
- Produces: все новые строки UI локализованы (`t`/`Trans`), `extract-i18n` прогнан, `ru.po` заполнен.

- [ ] **Step 1:** `npx nx run web:extract-i18n`; заполнить новые ключи в `ru.po` (кнопка "Load older messages", Language секция в настройках, текст ошибки при недоступном sync — если добавляли).
- [ ] **Step 2:** `npx nx run-many -t typecheck,lint,test,build` → 8/8 зелёные
- [ ] **Step 3:** `git add -A; git commit -m "chore: i18n and roadmap update for MVP refinement"`

---

## Self-Review

- Spec coverage: пагинация (Task 2), /sync long-poll (Tasks 4,5), language switcher (Task 3), types (Task 1), i18n (Task 6) — покрыто.
- Step scan: каждый шаг — одно действие с проверяемым результатом.
- Type consistency: `MatrixSyncResponse`, `MatrixMessagesResponse.prev`, `ChatViewMessageListProps.hasMore/onLoadMore`, `SettingsPanelProps.locale/onLocaleChange/localeOptions` — используются в одинаковых именах во всех тасках.
- Review Focus: все 5 пунктов имеют тесты в своих тасках (T1→Task 5, T2→Task 5, T3→Task 2, T4→Task 3, T5→Task 5).
- Пропорция: план ~ 1.5× spec, bodies only for algorithms not determined by signatures (prepend-sort, dedup).

План сохранён в `docs/superpowers/plans/2026-11-17-mvp-refinement.md`.
