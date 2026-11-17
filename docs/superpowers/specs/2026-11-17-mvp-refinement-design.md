# Design: MVP-доводка — пагинация, /sync, переключатель языка

Дата: 2026-11-17. Статус: на утверждение.

## Зачем

Клиент статичен: история загружается один раз при открытии комнаты (50 последних сообщений), новых сообщений нет до ручного обновления, язык меняется только через перезагрузку. Это базовый UX-разрыв с эталоном (WizardChat и другими клиентами).

Три независимых таска в рамках MVP-доводки:
1. **Пагинация** — «загрузить ещё старше» при скролле вверх.
2. **/sync long-poll** — живые обновления сообщений без перезагрузки.
3. **Переключатель языка** — выбор RU/EN прямо в интерфейсе (сейчас автоопределение + persist).

---

## Подходы к синхронизации (выбор решается здесь)

### А. Backend SSE-прокси (рекомендуется)
Backend открывает один long-poll `/sync` к homeserver и транслирует события через Server-Sent Events во фронтенд. Фронт подключается к `GET /api/matrix/sync?timeout=30000&pos=...` через `EventSource`. При закрытии комнаты — `eventSource.close()`. При 2xx с телом `{"events":[...]}` — обычный REST; если homeserver держит соединение — SSE поток.

Плюсы: один HTTP-канал, стандартный механизм, не нужно таймерное коллback-хождение. Минусы: требуется `@nestjs/sse` (уже есть в NestJS core), клиент должен обрабатывать SSE-поток.

### Б. Клиентский polling
Фронт каждые N секунд делает `POST /api/matrix/sync` с текущим `pos`. Проще в понимании, но больше запросов и сложнее正确处理 gaps при потере соединения.

### В. Прямой fetch от клиента (как WizardChat)
Нарушает правило "все Matrix-запросы через бэкенд", токен в открытом виде, CORS проблемы. Отклонено.

**Выбран подход А (SSE).** Его проще тестировать (EventSource стандартный), он соответствует stateless-архитектуре и не требует дополнительных npm-зависимостей (`@nestjs/core` уже имеет `@Sse()` декоратор).

---

## Таск 1: Пагинация истории

### Что меняется
- `MatrixMessagesResponse` получает поле `prev?: string` (токен для загрузки более старых сообщений).
- `chat-view.tsx`: при скролле к верху списка (`scrollTop === 0`) и наличии `prevToken` — подгружает следующий чанк (`dir='b', from=prevToken`).
- В `chat-store` добавляется состояние `paginationTokens: Record<roomId, { prev?: string; next?: string }>` или локальное состояние в `chat-view` (выбираю локальное, чтобы не расширять стор лишний раз).
- Кнопка "Load older messages" при `prevToken` доступна всегда, даже без скролла.

### Интерфейс
- `ChatViewMessageListProps` расширяется полем `hasMore?: boolean` и `onLoadMore?: () => void`.
- Shadcn-реализация показывает кнопку/сепаратор сверху списка при `hasMore`.

### Не-цель
- Пагинация "вниз" (newer messages) — опускается как edge-case (при отправке сообщения скролл всё равно вниз).

---

## Таск 2: Синхронизация сообщений (/sync SSE)

### Бэкенд (`apps/backend/src/app/matrix`)
Новый эндпоинт:
```
GET /api/matrix/sync?timeout=30000&pos=<token>
Headers: x-matrix-homeserver, Authorization: Bearer <token>
```
Возвращает SSE-поток (`text/event-stream`). Каждое событие — JSON:
```json
{"type":"events","data":{"events":[{"type":"m.room.message","sender":"..."}],"pos":"T429 ..."}}
{"type":"error","data":{"errcode":"M_UNKNOWN_POSITION"}}
```

Реализация: `MatrixService.syncStream(homeserver, token, timeoutMs, pos?)` использует fetch с `keepalive`, читает `response.body` по частям или делает один long-poll и парсит `chunked` ответ Matrix. На практике Matrix `/sync` возвращает **один JSON после таймаута**, поэтому проще реализовать как long-poll HTTP (не настоящий стриминг): метод возвращает `Observable<SyncBatch>` через NestJS HTTP agent или `async generator`. Для простоты — один long-poll запрос за пачку событий, фронт вызывает его рекурсивно с обновлённым `pos`. Это называется **long-polling**, а не SSE, но работает идентично для MVP.

**Уточнение:** используем long-polling через `fetch` с `timeout`. Если homeserver молчит → таймаут, фронт сразу шлёт новый запрос с `pos`. Метод `matrixClient.subscribeToSync(session, handler)` управляет цепочкой вызовов.

### Фронтенд (`apps/web/src/lib/matrix-client.ts`)
```ts
subscribeToSync(
  session: AuthSession,
  roomId: string | null,
  onEvents: (events: MatrixRoomEvent[]) => void,
): () => void
```
- `roomId = null` → подписка не активна (комната не выбрана).
- `roomId !== null` → запускается цикл: `fetch /api/matrix/sync?timeout=30000&pos=...` → по получению пачки: фильтруем события только по `room_id === roomId`, прогоняем через `onEvents`, обновляем `pos`, повторяем.
- Возвращает cleanup-функцию:停止 цикл, отменяет незавершённый fetch.
- При 401 → триггерит refresh + retry одного подключения (не бесконечный цикл).
- Дедупликация: `onEvents` внутри `chat-view` фильтрует по `event_id` (Set хранит виденные).

### Store (`chat-store.ts`)
Добавляем:
```ts
interface ChatState {
  // ... существующее
  syncedPos: Record<string, string>;  // roomId -> last known pos
  setSyncedPos: (roomId: string, pos: string) => void;
}
```

При получении новых событий из sync:
1. Фильтрация по `room_id === activeRoomId`.
2. Сортировка по `origin_server_ts`.
3. Апдейт `messages[activeRoomId]` с вставкой новых событий (без дубликатов по `event_id`).
4. `setSyncedPos(roomId, newPos)`.
5. Скролл вниз (только если пользователь уже был внизу).

### Комната при switch
При переключении комнаты (`activeRoomId` меняется):
1. Останавливаем предыдущий sync (`cleanup()`).
2. Запускаем новый с актуальным `pos` из стора (если был ранее — продолжаем, иначе — с начала).
3. Одновременно делаем полный `loadRoom()` (state + messages) как сейчас.

### Типы (`libs/types`)
```ts
export interface MatrixSyncResponse {
  rooms: {
    join: Record<string, {
      timeline: { events: MatrixRoomEvent[]; limited: boolean; prev_batch?: string };
      unread_notifications?: { unread_count?: number };
      unread_thread_notifications?: Record<string, { unread_count?: number }>;
    }>;
  };
  account_data: { events: MatrixRoomEvent[] };
  presence: { events: MatrixRoomEvent[] };
  to_device: { events: MatrixRoomEvent[] };
  org_matrix_msc3773_call_events?: { events: MatrixRoomEvent[] };
  pos: string;
  filters?: unknown;
  unused?: unknown;
}
```

---

## Таск 3: Переключатель языка в UI

### Где появится
В панели настроек (`SettingsPanel`), секция "Interface" после выбора UI kit. Новый блок "Language" с кнопками EN / RU.

### Изменения
- `SettingsPanelProps` получает новые поля:
  ```ts
  locale: AppLocale;
  onLocaleChange: (locale: AppLocale) => void;
  localeOptions: { value: AppLocale; label: string }[];
  ```
- `settings-panel.tsx` (apps/web) передаёт эти props в `ProxySettingsPanel`.
- `ShadcnSettingsPanel` рендерит их в новую секцию.
- `Rail` или `ChatScreen` вызывает `activateLocale(locale)` при изменении.
- `ui-kit.ts`: расширение `SettingsPanelProps`.

### Не-цель
- Автоопределение сохраняется как fallback (никогда не переопределяется вручную).
- Более двух языков (только RU/EN, как сейчас).

---

## Что остаётся builder'у

- Точный формат SSE vs long-poll для `/sync` ( builder решает после изучения Matrix spec — рекомендация: long-poll recursion проще и надёжнее на слабых homeserver'ах).
- Поведение скролла при появлении нового сообщения (always scroll down vs only if user was already at bottom).
- Обработка случая, когда sync пришёл раньше старого message chunk (race condition).
- i18n ключи для всех новых текстов.

---

## Критерии приёма

- `npx nx run-many -t typecheck,lint,test,build` — зелёный.
- Пагинация: при скролле вверх загружаются старые сообщения, счётчик элементов увеличивается, `prev` токен обновляется.
- Синк: при открытии комнаты появляются новые сообщения в реальном времени (через 5–30 с в зависимости от активности в комнате).
- Язык: переключение кнопки меняет весь UI мгновенно, persist в localStorage.
- Backward compat: старый homeserver без `/sync` отвечает 404 — frontend graceful disconnect, список комнат по-прежнему работает.

---

## Оценка сложности

| Таск | Сложность | Зависит от |
|------|-----------|------------|
| Пагинация | Низкая | только chat-view + types |
| Язык | Низкая | только settings-panel + ui-kit |
| /sync | Средняя-высокая | новый бэкенд-эндпоинт + новый клиентский хук + store |

Рекомендуемый порядок: пагинация → язык → /sync (от простого к сложному, каждый коммит самодостаточен).
