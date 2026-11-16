# Спецификация: загрузка списка комнат с именами и превью сразу (одним запросом)

Дата: 2026-11-16. Статус: на утверждение.

## Intent / почему

Пользователь открывает клиент и хочет увидеть список своих комнат с названиями и превью последнего сообщения сразу, без открытия чата. Сейчас SewerNet грузит комнаты через `joined_rooms`, а затем для каждой комнаты отдельно дергает `state/m.room.name` и `messages?limit=1` (N+1 запроса). Это медленно, обрывается по таймауту бэкенда (`ConnectTimeoutError`, 10 с на homeserver), и названия в списке появляются поздно или не появляются вообще.

WizardChat делает иначе: один sliding-sync-запрос `room-list` с `required_state` (`m.room.name`, `m.room.avatar`, `m.room.topic`, `m.room.member` и т.д.) возвращает все комнаты с именами за один круговой путь. При открытии комнаты уже отдельные `/state`, `/messages`, `/members`, `/threads`, `/aliases`. Homeserver вызывается напрямую (CORS fetch), а не через бэкенд-прокси на каждый чих.

## Цели

1. Список комнат отображает nombre (имя), аватар и превью последнего сообщения сразу после входа, без открытия чата.
2. Один сетевой круговой путь на загрузку всего списка комнат (не N+1).
3. Убрать dependence на медленный бэкенд-прокси для каждого вызова состояния комнаты — прямой fetch к homeserver или единый бэкенд-эンドпоинт sliding-sync.
4. Сохранить существующую архитектуру: stateless backend, `x-matrix-homeserver`, Bearer-токен клиентом, `AuthSession` с `homeserverUrl`/`accessToken`.
5. Не ломать существующие экраны (`chat-screen`, `chat-view`, `room-list`) и не добавлять npm-зависимостей.

## Не-цели (позже)

- E2E-шифрование, device keys, crypto.
- Полноценный long-poll `/sync` для новых сообщений (вroadmap, отдельный этап).
- Spaces/иерархия комнат (в MVP только flat список joined).
- Tauri/мобильные редиректы.

## Ограничения

- Backend stateless: не хранит токены/сессии; клиент передаёт `homeserverUrl` + `Bearer` с каждым запросом.
- Новых npm-зависимостей нет: только `global.fetch`, `URLSearchParams`, `AbortController`.
- Matrix Client-Server API v3; sliding-sync — `unstable/org.matrix.simplified_msc3575/sync` (MSC3575), поддерживается matrix.org и др.
- Локализация через `@lingui/react/macro` (`Trans` / `t`); новые ключи — в `en.po`/`ru.po`, `extract-i18n`.

## Поведение эталона (WizardChat, зафиксировано по сети)

Cold load списка комнат:
```
POST /_matrix/client/unstable/org.matrix.simplified_msc3575/sync?timeout=0
{
  "conn_id": "room-list",
  "lists": {
    "all_rooms": {
      "ranges": [[0, 19]],
      "required_state": [
        "m.room.name", "m.room.encryption", "m.room.member", "$LAZY",
        "m.room.member", "$ME", "m.room.topic", "m.room.avatar",
        "m.room.canonical_alias", "m.room.power_levels",
        "org.matrix.msc3401.call.member", "*", "m.room.join_rules",
        "m.room.tombstone", "m.room.create", "m.room.history_visibility",
        "io.element.functional_members", "m.space.parent", "*",
        "m.space.child", "*", "org.matrix.msc3672.beacon_info", "*",
        "org.matrix.msc1763.retention", ""
      ],
      "timeline_limit": 1,
      "filters": {}
    }
  },
  "extensions": {
    "account_data": {"enabled": true},
    "receipts": {"enabled": true, "rooms": ["*"]},
    "typing": {"enabled": true},
    "org.matrix.msc4262.profiles": {"enabled": true}
  }
}
```
Ответ: `pos`, `lists.all_rooms { count, ops: [{op:"SYNC", range, room_ids}] }`, `rooms` (пусто при кэше), `extensions`. Имена уже известны клиенту из `required_state` — отсюда список отображает названия сразу.

Открытие комнаты `!roomId`:
```
GET /_matrix/client/v3/rooms/:roomId/state          → все события состояния комнаты
GET /_matrix/client/v3/rooms/:roomId/messages?from=… → история (пагинация)
GET /_matrix/client/v3/rooms/:roomId/members         → участники
GET /_matrix/client/v3/rooms/:roomId/threads?limit=30
GET /_matrix/client/v3/rooms/:roomId/aliases
POST /_matrix/client/v3/rooms/:roomId/read_markers   → {"m.fully_read": "…", "m.read": "…"}
POST .../simplified_msc3575/sync?pos=…               → обновление позиции списка
```
Все запросы идут напрямую на homeserver (CORS), не через бэкенд `app.wizardchat.org`.

## Текущее состояние SewerNet (что меняем)

- `apps/web/src/app/screens/chat-screen.tsx` `loadRooms()`:
  1. `GET /api/matrix/rooms` → `joined_rooms: string[]`
  2. Для каждой комнаты: `GET /api/matrix/rooms/:id/state/m.room.name` + `GET /api/matrix/rooms/:id/messages?limit=1` — параллельно, но N+1 запросов через бэкенд.
- `apps/web/src/app/components/chat-view.tsx`: при открытии комнаты `GET /api/matrix/rooms/:id/messages?limit=50` — отдельно.
- Проблема: медленные homeserver'ы вызывают `ConnectTimeoutError` на бэкенде, фронтенд виснет, названия в списке не грузятся.

## Подходы (варианты реализации)

### А. Бэкенд-эンドпоинт sliding-sync (рекомендуется)
Добавить в NestJS бэкенд роут `GET /api/matrix/sync/room-list` (или `POST /api/matrix/sync`), который проксирует один sliding-sync-запрос `room-list` к homeserver с `required_state` и возвращает клиенту комнаты уже с `name`/`avatar`/`topic`/`preview`. Фронтенд делает один вызов вместо N+1.
- Плюсы: единая точка auth/заголовков `x-matrix-homeserver`/`Authorization`, соответствие существующей архитектуре stateless proxy, можно добавить таймауты/ретраи в одном месте.
- Минусы: нужно писать новый бэкенд-роут и маппинг ответа sliding-sync → `RoomInfo[]`.

### Б. Прямой fetch от фронтенда к homeserver (как WizardChat)
Фронтенд вызывает `https://<homeserver>/_matrix/client/unstable/org.matrix.simplified_msc3575/sync` напрямую с `Authorization: Bearer <token>` и `required_state`, парсит комнаты.
- Плюсы: минимально изменений на бэкенде, поведение identical WizardChat, один круговой путь.
- Минусы: CORS на некоторых homeserver'ах может блокировать (зафиксировано на matrix.org при чистом профиле), нарушает правило "все Matrix-запросы через бэкенд-прокси", токен светится в браузере (уже так, но через прокси лучше).

### В. Гибрид: бэкенд sliding-sync + fallback на N+1
Если homeserver не поддерживает sliding-sync (404/400), fallback на старый `joined_rooms` + enrichment.
- Плюсы: надёжность на старых homeserver'ах.
- Минусы: больше кода, два пути поддержки.

## Решение

Идём по **подходу А** (бэкенд sliding-sync) как первичному, с **фолбэком В** (старые эндпоинты) если sliding-sync недоступен. Подход Б оставляем как альтернативу, если CORS окажется проблемой на целевых homeserver'ах.

## Что делает builder (после aprovда спецификации)

1. **Бэкенд** (`apps/backend`):
   - Новый роут `GET /matrix/sync/room-list` (или `POST`) в `MatrixController`.
   - Метод `MatrixService.syncRoomList(homeserver, token)`: один `fetch` на `{hs}/_matrix/client/unstable/org.matrix.simplified_msc3575/sync` с телом `room-list` (как у WizardChat: `conn_id: "room-list"`, `lists.all_rooms.ranges: [[0,19]]`, `required_state` с `m.room.name`/`avatar`/`topic`/`member`, `timeline_limit: 1`, extensions account_data/receipts/typing).
   - Маппинг ответа в `{ rooms: [{id, name, avatar?, topic?, preview?, lastTs?}] }`.
   - Таймаут запроса больше, чем у обычных (слабые homeserver'ы), обработать 404/400 → фолбэк на `joined_rooms` (опционально, задача builder'а).
   - Тест: `matrix.service.spec.ts` + `matrix.controller.spec.ts` на sliding-sync payload.

2. **Фронтенд** (`apps/web`):
   - `matrixClient.getSyncedRooms(session)` → один вызов к бэкенду, возвращает `RoomInfo[]` с именами/превью.
   - `chat-screen.tsx` `loadRooms()` вызывает `getSyncedRooms`, вместо `getJoinedRooms` + `enrichRoom` N+1.
   - `chat-view.tsx` при открытии комнаты оставляет `/messages` (история), но названия уже из списка.
   - `room-list.tsx` отображает `room.avatar`/`room.topic` если пришли.
   - `chat-store.ts` `RoomInfo` расширить полями `avatar?: string`, `topic?: string`.
   - Новые строки UI через `Trans`/`t`, `extract-i18n`, `ru.po`.
   - Тесты: `matrix-client.spec.ts` (один вызов sliding-sync), `chat-screen.spec.tsx` (загрузка списка с именами).

3. **Документация**: `ARCHITECTURE.md` — раздел потока загрузки комнат; `ROADMAP.md` — отметить выполнено "Синхронизация сообщений: /sync".

## Что остаётся builder'у (открытые вопросы)

- Точный путь бэкенд-роута (`/matrix/sync/room-list` vs `/matrix/rooms/sync`) — решение builder'а.
- Нужно ли кешировать ответ sliding-sync на бэкенде — нет (stateless), кеш на фронте.
- Порог переключения на фолбэк N+1 — builder Solutions.
- Обработка homeserver'ов без sliding-sync — builder Solutions.

## Критерии приёма

- `npx nx run-many -t typecheck,lint,test,build` — зелёный.
- После входа список комнат показывает названия и превью без открытия чата.
- Один сетевой круговой путь на загрузку списка комнат (проверено по сети).
- Нет `ConnectTimeoutError` каскада на медленных homeserver'ах при загрузке списка.

---

Эта спецификация не реализуется до aprovда подхода. Если agree — пиши, и я запущу `superpowers:writing-plans`, затем таски по порядку.