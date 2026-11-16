# Room list loading — sliding-sync + per-room state (WizardChat parity)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Загружать список комнат с названиями и превью одним sliding-sync-запросом, а при открытии комнаты делать /state, /messages, /members, /threads, /aliases, read_markers — как у WizardChat.

**Architecture:** Бэкенд-прокси NestJS делает один POST на `.../simplified_msc3575/sync` (room-list) к homeserver и маппит в `RoomInfo[]`. Фронтенд вызывает один эндпоинт вместо `joined_rooms` + N×(`state` + `messages`). При открытии комнаты фронтенд делает параллельно 6 запросов к бэкенду. Backend остаётся stateless: `x-matrix-homeserver` + `Bearer` с каждым запроса.

**Tech Stack:** NestJS 11, React 19 + Vite, zustand, vitest, global.fetch, `@sewer-net/types`.

**Spec:** `docs/superpowers/specs/2026-11-16-room-list-loading-design.md`

## Global Constraints

- Backend stateless: не хранит токены/сессии; клиент передаёт `homeserverUrl` + `Bearer` с каждым запросом.
- Новых npm-зависимостей нет: только `global.fetch`, `URLSearchParams`, `AbortController`.
- Matrix Client-Server API v3; sliding-sync — `unstable/org.matrix.simplified_msc3575/sync` (MSC3575).
- Локализация через `@lingui/react/macro` (`Trans` / `t`); новые ключи — в `en.po`/`ru.po`, `extract-i18n`.
- Conventional Commits; финальный `git status` чистый; `nx run-many -t typecheck,lint,test,build` зелёный.

## Review Focus

1. Homeserver без sliding-sync (404/400 на `/sync`) → фолбэк на старые эндпоинты (`joined_rooms` + enrichment), не краш.
2. Один сетевой круговой путь на список комнат (проверяется тестом на один вызов fetch).
3. `read_markers` шлёт `{"m.fully_read": "...", "m.read": "..."}` телом JSON.
4. 401 в сессии с refresh → один transparent refresh + retry, не две.
5. `RoomInfo` получает опциональные поля `avatar?`, `topic?`; старый код не ломается.

---

### Task 1: Types — sliding-sync DTO и расширенный RoomInfo

**Files:**
- Modify: `libs/types/src/lib/matrix.ts`

**Interfaces:**
- Consumes: —
- Produces:
  - `SlidingSyncRoomListRequest { conn_id: string; lists: { all_rooms: { ranges: [number, number][]; required_state: string[]; timeline_limit: number; filters: Record<string, unknown> }; extensions: Record<string, unknown> } }`
  - `SlidingSyncRoomListResponse { pos: string; lists: { all_rooms: { count: number; ops: Array<{ op: string; range: [number, number]; room_ids: string[] }> } }; rooms: Record<string, any>; extensions: any }`
  - `SyncedRoomInfo { room_id: string; name?: string; avatar?: string; topic?: string; preview?: string; lastTs?: number }` — маппинг ответа sliding-sync на клиентский вид.
  - `RoomInfo` в `apps/web/src/app/stores/chat-store.ts` получает опциональные `avatar?: string`, `topic?: string`.

- [ ] **Step 1:** Добавить `SlidingSyncRoomListRequest`, `SlidingSyncRoomListResponse`, `SyncedRoomInfo` в `libs/types/src/lib/matrix.ts`; экспортировать из `libs/types/src/index.ts`.
- [ ] **Step 2:** Добавить `avatar?: string; topic?: string` в `RoomInfo` в `apps/web/src/app/stores/chat-store.ts`.
- [ ] **Step 3:** `npx nx run types:test` (или typecheck) → PASS; `git commit -m "feat(types): sliding-sync DTOs and extended RoomInfo"`.

---

### Task 2: Backend — sliding-sync room-list service + controller

**Files:**
- Modify: `apps/backend/src/app/matrix/matrix.service.ts`
- Modify: `apps/backend/src/app/matrix/matrix.controller.ts`
- Modify: `apps/backend/src/app/matrix/matrix.service.spec.ts`

**Interfaces:**
- Consumes: `MatrixService.proxy(homeserver, path, options)` — уже существует.
- Produces:
  - `MatrixService.syncRoomList(homeserver, token): Promise<SlidingSyncRoomListResponse>` — один `fetch` на `{hs}/_matrix/client/unstable/org.matrix.simplified_msc3575/sync` с телом `room-list` (как у WizardChat: `conn_id: "room-list"`, `lists.all_rooms.ranges: [[0,19]]`, `required_state` с `m.room.name`/`avatar`/`topic`/`member`/`$LAZY`/`$ME`/…`, `timeline_limit: 1`, extensions account_data/receipts/typing). Таймаут больше обычного (слабые homeserver'ы).
  - `MatrixController.getSyncedRoomList(headers homeserver, authorization)` → `POST /matrix/sync/room-list` → проксирует `syncRoomList`, маппит `SyncedRoomInfo[]` (`room_id`, `name`, `avatar`, `topic`, `preview`, `lastTs` из `timeline.events[0]`).

- [ ] **Step 1:** Failing тест в `matrix.service.spec.ts`: `syncRoomList` делает один `fetch` на `.../sync` с правильным телом `room-list` и возвращает спарсенный ответ; на 404/400 кидает `HttpException`.
- [ ] **Step 2:** `npx nx run backend:test` → FAIL (метода нет).
- [ ] **Step 3:** Реализовать `syncRoomList` в `MatrixService` + роут `POST /matrix/sync/room-list` в `MatrixController`.
- [ ] **Step 4:** `npx nx run-many -t test,typecheck,lint --projects=backend,types` → PASS; `git commit -m "feat(backend): sliding-sync room-list endpoint"`.

---

### Task 3: Backend — залы: members, threads, aliases, read_markers

**Files:**
- Modify: `apps/backend/src/app/matrix/matrix.service.ts`
- Modify: `apps/backend/src/app/matrix/matrix.controller.ts`
- Modify: `apps/backend/src/app/matrix/matrix.service.spec.ts`

**Interfaces:**
- Consumes: `MatrixService.proxy` — уже существует.
- Produces:
  - `MatrixService.getRoomMembers(homeserver, roomId, token)` → `GET /_matrix/client/v3/rooms/:roomId/members`.
  - `MatrixService.getRoomThreads(homeserver, roomId, token)` → `GET /_matrix/client/v1/rooms/:roomId/threads?limit=30`.
  - `MatrixService.getRoomAliases(homeserver, roomId, token)` → `GET /_matrix/client/v3/rooms/:roomId/aliases`.
  - `MatrixService.setReadMarkers(homeserver, roomId, token, body)` → `POST /_matrix/client/v3/rooms/:roomId/read_markers` с JSON-телом `{"m.fully_read": "...", "m.read": "..."}`.
  - Роуты в `MatrixController`: `GET /rooms/:roomId/members`, `GET /rooms/:roomId/threads`, `GET /rooms/:roomId/aliases`, `POST /rooms/:roomId/read_markers`.

- [ ] **Step 1:** Failing тесты в `matrix.service.spec.ts` для 4 новых методов (URL, headers Authorization, тело read_markers).
- [ ] **Step 2:** `npx nx run backend:test` → FAIL.
- [ ] **Step 3:** Реализовать 4 метода в сервисе + 4 роута в контроллере.
- [ ] **Step 4:** `npx nx run-many -t test,typecheck,lint --projects=backend` → PASS; `git commit -m "feat(backend): room members/threads/aliases/read_markers endpoints"`.

---

### Task 4: Frontend — matrixClient: getSyncedRooms + залы

**Files:**
- Modify: `apps/web/src/lib/matrix-client.ts`
- Modify: `apps/web/src/lib/matrix-client.spec.ts`

**Interfaces:**
- Consumes: `request<T>(path, {session, ...})` — уже существует.
- Produces:
  - `matrixClient.getSyncedRooms(session): Promise<SyncedRoomInfo[]>` — один `POST /api/matrix/sync/room-list` с `session`, возвращает комнаты с `name`/`avatar`/`topic`/`preview`/`lastTs`.
  - `matrixClient.getRoomMembers(session, roomId)`, `getRoomThreads(session, roomId)`, `getRoomAliases(session, roomId)`, `setReadMarkers(session, roomId, body)` — обёртки над существующими роутами.
  - `getJoinedRooms` оставить для фолбэка (не удалять).

- [ ] **Step 1:** Failing тест в `matrix-client.spec.ts`: `getSyncedRooms` делает один `fetch` на `/api/matrix/sync/room-list` с `Authorization` + `x-matrix-homeserver` и возвращает массив комнат с именами.
- [ ] **Step 2:** `npx nx run web:test` → FAIL.
- [ ] **Step 3:** Реализовать `getSyncedRooms` + 4 метода залы в `matrix-client.ts`.
- [ ] **Step 4:** `npx nx run-many -t test,typecheck,lint --projects=web` → PASS; `git commit -m "feat(web): getSyncedRooms and room endpoints in matrix-client"`.

---

### Task 5: Frontend — chat-screen: один вызов на список комнат

**Files:**
- Modify: `apps/web/src/app/screens/chat-screen.tsx`
- Modify: `apps/web/src/app/screens/chat-screen.spec.tsx` (создать)

**Interfaces:**
- Consumes: `matrixClient.getSyncedRooms(session)`, `useChatStore.setRooms`, `setLoadingRooms`, `setError`.
- Produces: `loadRooms()` вызывает `getSyncedRooms` один раз, сортирует по `lastTs`, кладёт в стор. Обработка ошибки через `handleAuthError` + `setError`. Убирается `enrichRoom` с N+1 запросами.

- [ ] **Step 1:** Failing тест `chat-screen.spec.tsx`: при montировании с сессией вызывается `getSyncedRooms` один раз, комнаты с именами попадают в стор; при ошибке — `setError`.
- [ ] **Step 2:** `npx nx run web:test` → FAIL.
- [ ] **Step 3:** Переписать `loadRooms` в `chat-screen.tsx` на `getSyncedRooms`.
- [ ] **Step 4:** `npx nx run-many -t test,typecheck,lint --projects=web` → PASS; `git commit -m "feat(web): load room list with names in one sliding-sync call"`.

---

### Task 6: Frontend — chat-view: открытие комнаты с полным набором запросов

**Files:**
- Modify: `apps/web/src/app/components/chat-view.tsx`
- Modify: `apps/web/src/app/components/chat-view.spec.tsx` (создать)

**Interfaces:**
- Consumes: `matrixClient.getRoomState`, `getMessages`, `getRoomMembers`, `getRoomThreads`, `getRoomAliases`, `setReadMarkers`, `useChatStore`.
- Produces: при `activeRoomId` параллельно выполняются `/state`, `/messages?limit=50`, `/members`, `/threads?limit=30`, `/aliases`, `read_markers` (отмечает прочитанным последнее событие). Имя комнаты берется из `/state` `m.room.name`, не дожидается истории.

- [ ] **Step 1:** Failing тест `chat-view.spec.tsx`: при смене `activeRoomId` делаются 6 параллельных запросов; имя из `m.room.name` применяется к заголовку.
- [ ] **Step 2:** `npx nx run web:test` → FAIL.
- [ ] **Step 3:** Реализовать загрузку залы в `chat-view.tsx` (эффект на `activeRoomId`, 6 запросов, `setReadMarkers` с последним event_id).
- [ ] **Step 4:** `npx nx run-many -t test,typecheck,lint --projects=web` → PASS; `git commit -m "feat(web): open room with state/messages/members/threads/aliases/read_markers"`.

---

### Task 7: i18n + финальная проверка

**Files:**
- Modify: `apps/web/src/locales/en.po`, `apps/web/src/locales/ru.po`

**Interfaces:**
- Consumes: —
- Produces: новые ключи локали (если добавлены строки UI), `extract-i18n` прогнан.

- [ ] **Step 1:** `npx nx run web:extract-i18n`; заполнить новые ключи в `ru.po`.
- [ ] **Step 2:** `npx nx run-many -t typecheck,lint,test,build` → 8/8 зелёные.
- [ ] **Step 3:** `git add -A; git commit -m "chore: i18n for room list loading"`.

---

## Self-Review

- Spec coverage: sliding-sync список комнат (Task 2,4,5), залы /state/messages/members/threads/aliases/read_markers (Task 3,4,6), фолбэк при отсутствии sliding-sync — оставить на builder'е (Task 2 отмечает как опциональный), i18n (Task 7).
- Step scan: каждый шаг — одно действие с проверяемым результатом.
- Type consistency: `SyncedRoomInfo` ↔ `RoomInfo` поля совпадают (`id`/`room_id`, `name`, `avatar`, `topic`, `preview`, `lastTs`).
- Review Focus: все 5 пунктов имеют тесты в своих тасках.

План сохранен в `docs/superpowers/plans/2026-11-16-room-list-loading.md`. Пожалуйста, проверьте план —捕捉 ли он то, что вы хотите? Какой метод выполнения предпочитаете:

- **Subagent-driven** — каждый таск отдельным саб-агентом с ревью перед следующим; надёжнее, дольше.
- **Native** — я выполняю все таски сам в этой сессии, затем один ревью всей ветки; быстрее.

Рекомендую **Native**, так как таски тесно связаны через общие интерфейсы (`SyncedRoomInfo`, `matrixClient` методы, роуты бэкенда) и ошибка в одном таске ломает последующие.
