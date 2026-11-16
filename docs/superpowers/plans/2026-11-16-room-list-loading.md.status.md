# Статус реализации Room list loading (Native)

## Task 1: Types — sliding-sync DTO и расширенный RoomInfo
- [ ] Добавить SlidingSyncRoomListRequest / SlidingSyncRoomListResponse / SyncedRoomInfo в libs/types/src/lib/matrix.ts
- [ ] Добавить avatar?: string, topic?: string в RoomInfo в chat-store.ts
- [ ] Тест types → PASS, коммит

## Task 2: Backend — sliding-sync room-list service + controller
- [ ] Failing тест syncRoomList
- [ ] Реализовать syncRoomList + роут POST /matrix/sync/room-list
- [ ] Тест backend+types → PASS, коммит

## Task 3: Backend — залы: members, threads, aliases, read_markers
- [ ] Failing тесты 4 методов
- [ ] Реализовать 4 метода + 4 роута
- [ ] Тест backend → PASS, коммит

## Task 4: Frontend — matrixClient: getSyncedRooms + залы
- [ ] Failing тест getSyncedRooms
- [ ] Реализовать getSyncedRooms + 4 метода
- [ ] Тест web → PASS, коммит

## Task 5: Frontend — chat-screen: один вызов на список комнат
- [ ] Failing тест chat-screen.spec.tsx
- [ ] Переписать loadRooms на getSyncedRooms
- [ ] Тест web → PASS, коммит

## Task 6: Frontend — chat-view: открытие комнаты с полным набором запросов
- [ ] Failing тест chat-view.spec.tsx
- [ ] Реализовать загрузку залы (6 параллельных запросов)
- [ ] Тест web → PASS, коммит

## Task 7: i18n + финальная проверка
- [ ] extract-i18n + ru.po
- [ ] typecheck,lint,test,build → 8/8 зелёные
- [ ] коммит
