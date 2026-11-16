# Статус реализации Room list loading (Native)

Ветка: `0.1.0`. Проверено 2026-11-16 в текущей сессии: `npx nx run-many -t test --skip-nx-cache`
→ 6 проектов зелёные (backend: 3 suites / 27 тестов), `nx run-many -t typecheck,lint,test,build`
→ 24/24.

## Task 1: Types — sliding-sync DTO и расширенный RoomInfo — DONE (87e674c)
- [x] SlidingSyncRoomListRequest / SlidingSyncRoomListResponse / SyncedRoomInfo в `libs/types/src/lib/matrix.ts`
- [x] avatar?: string, topic?: string в `RoomInfo` (`apps/web/src/app/stores/chat-store.ts`)
- [x] typecheck types → PASS
- Примечание: `required_state` принимает `(string | [string, string])[]`; бэкенд шлёт кортежи
  `[type, state_key]` — MSC3575-формат, matrix.org иначе отвечает M_INVALID_PARAM.

## Task 2: Backend — sliding-sync room-list service + controller — DONE (274a76f, фикс 73df4f4)
- [x] Тест `syncRoomList` (один fetch на `.../simplified_msc3575/sync`, тело `room-list`, 404/400 → HttpException)
- [x] `MatrixService.syncRoomList` + `POST /matrix/sync/room-list` + `mapSyncedRooms` (`matrix.controller.ts`)
- [x] backend+types тесты → PASS
- Таймаут 30 000 мс (`timeoutMs`), таймаут/сетевые ошибки маппятся в 504/502.

## Task 3: Backend — залы: members, threads, aliases, read_markers — DONE (34512c0)
- [x] Тесты 4 методов (URL, Authorization, тело read_markers)
- [x] 4 метода в сервисе + 4 роута в контроллере
- [x] backend тесты → PASS

## Task 4: Frontend — matrixClient: getSyncedRooms + залы — DONE (a6c3d9b)
- [x] Тест `getSyncedRooms` (один fetch с Authorization + x-matrix-homeserver)
- [x] `getSyncedRooms` + `getRoomMembers/Threads/Aliases` + `setReadMarkers`
- [x] `getJoinedRooms` сохранён для фолбэка
- [x] web тесты → PASS

## Task 5: Frontend — chat-screen: один вызов на список комнат — DONE (c701e1e)
- [x] `chat-screen.spec.tsx`: один вызов `getSyncedRooms`, комнаты с именами в сторе, ошибка → `setError`
- [x] `loadRooms()` на `getSyncedRooms`, сортировка по `lastTs`, `enrichRoom` удалён
- [x] web тесты → PASS

## Task 6: Frontend — chat-view: открытие комнаты с полным набором запросов — DONE (5eac17c)
- [x] `chat-view`: `/state` (m.room.name), `/messages?limit=50`, `/members`, `/threads?limit=30`, `/aliases`
      параллельно, затем `read_markers` с последним event_id
- [x] Имя из `m.room.name` применяется к заголовку, не дожидаясь истории
- [x] web тесты → PASS

## Task 7: i18n + финальная проверка — DONE (798a712)
- [x] `extract-i18n` прогнан, `ru.po` заполнен
- [x] `typecheck,lint,test,build` → зелёные

---

## Осталось (добирается в этой сессии)

## Task 8: Фолбэк при отсутствии sliding-sync (Review Focus #1)
- [ ] Failing тест: sync → 404/400 ⇒ `joined_rooms` + обогащение (`m.room.name` + `messages?limit=1`), ошибки нет
- [ ] Реализовать фолбэк в `chat-screen.tsx` (только 404/400, остальные ошибки — как раньше)
- [ ] Коммит `feat(web): fall back to joined_rooms when sliding-sync is unavailable`

## Task 9: Превью комнаты из `topic` (RoomInfo.topic в списке)
- [ ] Failing тест ui-kit/app: при пустом `preview` вторая строка показывает `topic`
- [ ] `RoomListItemContent` получает `topic`; `room-list.tsx` передаёт `room.topic`
- [ ] Аватары (`mxc://`) отложены: нет media-proxy на бэкенде — отдельная задача.

## Task 10: Открытие комнаты не должно падать из-за опциональных запросов
- [ ] Failing тест: `/threads`/`/aliases` → 403/404, история всё равно загружается
- [ ] `Promise.all` → `Promise.allSettled` для опциональных запросов в `chat-view.tsx`
- [ ] Финальный прогон `typecheck,lint,test,build` + коммит
