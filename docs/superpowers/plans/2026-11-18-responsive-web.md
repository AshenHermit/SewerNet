# Responsive Web Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Сделать существующий Matrix web-клиент SewerNet адаптивным: одна основная панель на compact, три колонки на wide, без потери состояния и дублирования SDK-логики.

**Architecture:** CSS-first каркас в `libs/ui` получает именованные слоты и семантический раздел из приложения. Контроллеры `RoomList` и `ChatView` сохраняют своё место в React-дереве; общий proxy адаптивного слота монтирует только выбранное stateless-представление навигации и контейнера настроек. CSS и внутренний `useSyncExternalStore` используют один breakpoint из CSS-токена; настройки wide используют native modal `<dialog>` без новой зависимости.

**Tech Stack:** React 19, TypeScript, Nx 24/npm, Vite 8, Tailwind CSS 4, Zustand 5, Lingui 6, matrix-js-sdk 41; Vitest/jsdom и Testing Library, Storybook/react-vite.

**Spec:** `docs/superpowers/specs/2026-11-18-responsive-web-design.md` — утверждён пользователем 2026-11-18; независимый builder check уже выполнен, повторять его не требуется.

## Global Constraints

- Compact: ширина меньше `48rem`; wide: ширина от `48rem`, включая точную границу. Единственный источник порога — `libs/ui`.
- Минимальная зона нажатия compact — `44×44 CSS px`; mobile-поля — текст не меньше `16 px`. Пользовательский zoom не запрещать.
- Скрытые основные панели остаются смонтированными, но не участвуют в layout, tab order и accessibility tree. Не использовать только opacity/translate/`aria-hidden`.
- Не сбрасывать draft, query, selection, тему, sending или error при resize/переходе в настройки; resize не отправляет сообщение, read receipt и не переподключает SDK.
- `apps/web` содержит данные, переводы, callbacks и proxy-компоненты, но не оформительские HTML, `className`, `style`, `matchMedia`, resize listeners или UA-sniffing.
- Matrix-клиент остаётся singleton. Сначала очистить credentials, затем вызвать `logoutCurrent()`; не переносить отправку/SDK-хуки в UI kit.
- Не добавлять разделы, URL/browser history, swipe, новые Matrix/Markdown/media-функции, per-room/reload draft persistence, Tauri или изменения лендинга.
- Shared responsive CSS подключается приложением и Storybook из одного источника; существующую палитру/темизацию сохранить.
- `100dvh` не доказывает доступность composer при реальной мобильной клавиатуре. Физические устройства и desktop/emulation отражать отдельно.
- До PR обязательно локальное успешное `npx nx run-many -t typecheck,lint,test,build`; CI пока отсутствует. Работать в `feat/responsive-design`, связать PR с issue, получить core review; не мержить самостоятельно.
- Этот документ — только план. Product code, установка пакетов и выполнение плана начинаются после отдельного согласования плана и способа исполнения.

## Review Focus

1. Незавершённая отправка текста/файла во время resize и открытия настроек: запрос ровно один, pending/error/draft меняются только по существующему результату отправки. Тесты задачи 5.
2. Новые SDK-события в скрытой переписке: не скроллят видимый список/настройки, не инициируют пагинацию или повторный read receipt. Тесты задачи 5.
3. Возврат к комнате, скрытой поиском/удалённой из списка, и Matrix ID с CSS-спецсимволами: фокус безопасно возвращается на заголовок комнат, выбор не очищается. Тесты задачи 5.
4. Resize с фокусом в настройках или исчезающей навигации: только один контейнер, modal не оставляет backdrop/trap, фокус не уходит в скрытый/удалённый control. Тесты задач 4–5.
5. Длинные RU/EN названия, ID, URL/ошибки при короткой высоте и 200% zoom: нет page overflow; нижние действия доступны, touch-target не сжимается. Browser assertions задачи 7.

---

## Решения планировщика и границы файлов

Эти технические решения сделаны исполнителем плана в пределах раздела 11 спеки, а не приписаны пользователю:

- Breakpoint: `@theme static { --breakpoint-sn-wide: 48rem; }` в `layout-tokens.css`. Tailwind использует `sn-wide:*`; TypeScript читает тот же файл через `?raw` и строит media query, не содержит второго числового порога.
- Начальные layout tokens: `--sn-rail-width: 3.5rem`, `--sn-room-list-width: clamp(12rem, 24vw, 19rem)`, `--sn-bottom-nav-height: 3.5rem`, `--sn-bottom-nav-gap: 0.75rem`, `--sn-touch-target: 44px`. Корректировать визуальные размеры можно после браузерной проверки; не менять breakpoint/44px без нового согласования. При 768px остаётся около 520px для чата до safe-area.
- `AdaptiveSlotProps` принимает `ReactNode`, а не data-controller: `fallback` обязателен, `compact`/`wide` необязательны. `undefined` означает fallback, `null` — намеренно пустое представление. Создание React element не означает его монтирование.
- Один navigation-region каркаса выбирает между именованными `rail` и `bottomNavigation` через `ProxyAdaptiveSlot`. Не монтировать два навигационных дерева с последующим сокрытием. Контроллер действий расположен выше обоих слотов.
- Wide-настройки — native modal dialog с backdrop, `showModal()`, Escape/cancel и удержанием фокуса. Compact-настройки — экран. Одна общая controlled-форма внутри выбранного контейнера.
- Список комнат — семантический `ul/li` с обычными кнопками и `aria-current` для выбранной комнаты; не оставлять одиночные `role=option` без полноценного listbox. Обновить существующие тесты роли согласованно.
- Для focus используются внутренние `data-sn-focus`, `data-sn-panel`, `data-sn-action` и `data-room-id` в kit; приложение не ищет DOM для focus и не передаёт оформительские refs. Существующий timeline scroll ref остаётся в контроллере.
- Архитектурный guard — маленький Vitest-тест на TypeScript AST для пяти затронутых app-компонентов, не новый ESLint-проект.

### Карта файлов

| Область | Файлы и ответственность |
| --- | --- |
| Общий responsive контракт | Создать `libs/ui/src/layout-tokens.css`, `libs/ui/src/raw-css.d.ts`, `libs/ui/src/lib/responsive/layout-mode.ts`; последнее содержит чистый parser, snapshots/subscription и внутренний hook. |
| Выбор представления | Создать `libs/ui/src/lib/kits/shadcn/adaptive-slot.tsx`, `libs/ui/src/lib/proxy/proxy-adaptive-slot.tsx`; обновить `libs/ui/src/lib/ui-kit.ts`, `libs/ui/src/lib/kits/shadcn/index.ts`, `libs/ui/src/lib/proxy/index.ts`, `libs/ui/src/index.ts`. Эти четыре contract/registry/barrel файла обновляются и при дальнейших новых proxies. |
| Shared styles/build | Изменить `libs/ui/src/styles.css`, `libs/ui/package.json`, `libs/ui/vite.config.mts`, `apps/web/src/styles.css`. UI содержит reset, palette, layout/safe-area rules, sources UI/icons; app stylesheet — один shared import. |
| Навигационная модель | Изменить `apps/web/src/app/stores/chat-store.ts`; `section`, переходы и reset без persist, отдельно от SDK-данных. |
| Каркас/семантика | Изменить shadcn `chat-screen.tsx`, `room-list-panel.tsx`, `room-list-item.tsx`, `room-list-item-content.tsx`, `room-list-search.tsx`, `chat-view-panel.tsx`, `chat-view-header.tsx`, `chat-view-message-list.tsx`, `chat-view-message.tsx`, `chat-view-input-form.tsx`, `chat-view-error.tsx`. Создать shadcn/proxy пары `room-list-header`, `room-list-items`, `room-list-entry`, `chat-view-empty`, `bottom-navigation`. |
| App composition | Изменить `apps/web/src/app/screens/chat-screen.tsx`, `apps/web/src/app/components/{rail,room-list,chat-view,settings-panel}.tsx`; стабильная логика и готовые translated props. |
| Настройки | Изменить `libs/ui/src/lib/kits/shadcn/settings-panel.tsx`; создать рядом `settings-form.tsx`, `settings-screen.tsx`, `settings-dialog.tsx`. Общая форма и два локальных презентационных контейнера, не три новых публичных proxy. |
| Фокус | Создать `libs/ui/src/lib/responsive/panel-focus.ts`; hook каркаса и безопасный выбор focus target. Dialog владеет modal lifecycle и explicit-close return. |
| Auth/status | Изменить `apps/web/index.html`, UI shadcn `login-screen.tsx`, `login-form.tsx`, `status-panel.tsx`; только геометрия, не auth-флоу. |
| Переводы | Изменить `apps/web/src/locales/en.po`, `apps/web/src/locales/ru.po` при добавлении accessible labels. |
| Stories/docs | Изменить `libs/ui/.storybook/preview.tsx`, существующие `chat-screen.stories.tsx`, `settings-panel.stories.tsx`; создать `adaptive-slot.stories.tsx`. Обновить `ARCHITECTURE.md`, `libs/ui/README.md`; создать `docs/superpowers/verification/2026-11-18-responsive-web.md` для фактических результатов. |

Файлы тестов указаны в каждой задаче. Не создавать отдельные mobile-копии `ChatView`, `RoomList`, SDK-hooks или stores.

## Task 1: Единый responsive источник, shared CSS и proxy выбора представления

**Files:**
- Create: `libs/ui/src/layout-tokens.css`, `libs/ui/src/raw-css.d.ts`, `libs/ui/src/lib/responsive/layout-mode.ts`.
- Create: `libs/ui/src/lib/kits/shadcn/adaptive-slot.tsx`, `libs/ui/src/lib/proxy/proxy-adaptive-slot.tsx`.
- Modify: contract/registry/barrels из карты; `libs/ui/src/styles.css`, `libs/ui/package.json`, `libs/ui/vite.config.mts`, `apps/web/src/styles.css`.
- Test: `libs/ui/src/lib/responsive/layout-mode.spec.ts`, `libs/ui/src/lib/proxy/proxy-adaptive-slot.spec.tsx`, `libs/ui/src/lib/responsive/shared-styles.spec.ts`.

**Interfaces:**
- Produces public: `type LayoutMode = 'compact' | 'wide'`; `interface AdaptiveSlotProps { fallback: ReactNode; compact?: ReactNode; wide?: ReactNode }`; `UiKit.AdaptiveSlot: ComponentType<AdaptiveSlotProps>`; `ProxyAdaptiveSlot(props: AdaptiveSlotProps): ReactNode`.
- Produces internal: `readWideMediaQuery(cssText: string): string`, `WIDE_MEDIA_QUERY: string`, `getLayoutModeSnapshot(): LayoutMode`, `getServerLayoutModeSnapshot(): LayoutMode`, `subscribeLayoutMode(onChange: () => void): () => void`, `useLayoutMode(): LayoutMode`. Hook/snapshots не экспортировать из публичного barrel.
- Produces stylesheet export: `@sewer-net/ui/styles.css` → `./src/styles.css`.

- [ ] **Step 1: Записать RED-тесты общего источника и subscription.** В `layout-mode.spec.ts` тесты `reads the CSS breakpoint`, `tracks media changes and cleans listeners`, `returns wide without window`, `rejects ambiguous breakpoint`. Прочитать реальный CSS `?raw`; mock `window.matchMedia` должен выдавать управляемые `matches` и настоящий набор listeners.

```ts
expect(readWideMediaQuery(tokens)).toBe('(min-width: 48rem)');
expect(WIDE_MEDIA_QUERY).toBe(readWideMediaQuery(tokens));
expect(getServerLayoutModeSnapshot()).toBe('wide');
// matches=false/true проверяются отдельно:
expect(getLayoutModeSnapshot()).toBe('compact');
const stop = subscribeLayoutMode(changed);
media.dispatch(true);
expect(changed).toHaveBeenCalledTimes(1);
expect(getLayoutModeSnapshot()).toBe('wide');
stop();
expect(media.listeners.size).toBe(0);
```

Локальный helper `createMediaMock(matches: boolean)` возвращает `{ matchMedia, dispatch(matches: boolean): void, listeners: Set<() => void> }`; восстановить globals после теста. Отдельно удалить `window` и проверить wide snapshots; parser отклоняет отсутствующий/дублирующий токен понятной ошибкой.

- [ ] **Step 2: Записать RED-тесты slot и подключения CSS.** Проверить compact/wide override, fallback при `undefined`, намеренный `null`, mount/unmount counters (ровно одна активная реализация после каждого change), делегирование custom kit через `UiKitContext.Provider`, SSR `renderToString` без `window`. `shared-styles.spec.ts` проверяет stylesheet export, один import приложения, отсутствие второй палитры, подключение tokens в shared CSS. Использовать `node:fs` для source/package assertions, не считать их доказательством compiled CSS.

```tsx
render(<ProxyAdaptiveSlot fallback={<Probe name="common" />} compact={<Probe name="phone" />} />);
expect(screen.getByText('phone')).toBeTruthy();
expect(screen.queryByText('common')).toBeNull();
act(() => media.dispatch(true));
expect(screen.getByText('common')).toBeTruthy();
expect(screen.queryByText('phone')).toBeNull();
expect(activeMounts).toBe(1);
```

- [ ] **Step 3: Проверить RED.** Run: `npx nx test ui --run`. Expected: новые тесты FAIL из-за отсутствующих responsive exports/файлов; зафиксировать причину, не чинить случайные unrelated failures вслепую.
- [ ] **Step 4: Реализовать интерфейсы и подключение.** Ленивый `matchMedia(WIDE_MEDIA_QUERY)`, `useSyncExternalStore`, детерминированный server snapshot wide, no-window/no-matchMedia fallback, корректный `removeEventListener`. Выбирать node через `variant !== undefined`, не через `||`. Добавить declaration `*.css?raw`. Перенести существующий app reset/palette в UI, оставить app `@import '@sewer-net/ui/styles.css';`; explicit Tailwind sources UI/icons, приложение сохраняет обнаружение своих источников. Добавить `@tailwindcss/vite` к UI Vite plugins для Storybook, не дублировать plugin в другом config.
- [ ] **Step 5: Проверить GREEN.** Run: `npx nx run-many -p ui,web -t typecheck,lint,test`; затем `npx nx run ui:build-storybook`. Expected: exit 0, все новые тесты PASS, Storybook собирает shared CSS/`?raw`. У `ui` нет standalone `build` target.
- [ ] **Step 6: Commit.** Stage только файлы задачи. `git commit -m "feat: add responsive UI foundation"`.

## Task 2: Неперсистентная модель разделов

**Files:**
- Modify: `apps/web/src/app/stores/chat-store.ts`, `libs/ui/src/lib/ui-kit.ts`, `libs/ui/src/index.ts`.
- Test: `apps/web/src/app/stores/chat-store.spec.ts`.

**Interfaces:**
- Produces public UI type: `type ChatSection = 'rooms' | 'chat' | 'settings'`.
- Produces `ChatState`: существующие `activeRoomId`, `error`, `setError`; новые `section: ChatSection`, `showRooms(): void`, `showSettings(): void`, `closeSettings(): void`, `resetUi(): void`.
- Retains `setActiveRoom(roomId: string | null): void`: непустой ID атомарно устанавливает ID и `section='chat'`; null устанавливает null/rooms. Back использует `showRooms()`, не этот null-путь.
- Produces pure exported app helper `getEffectiveSection(section: ChatSection, activeRoomId: string | null): ChatSection`: chat+null → rooms, остальные неизменны; принимает не ширину, а состояние.

- [ ] **Step 1: Записать RED-тесты переходов.** Тесты `starts in rooms`, `selects a room and opens chat`, `back preserves selection`, `settings close returns to rooms`, `chat without selection falls back`, `navigation preserves errors`, `reset does not persist UI`. Каждый тест начинает с `resetUi()`, не заменяет store actions через `setState`.

```ts
const state = () => useChatStore.getState();
expect(state().section).toBe('rooms');
state().setActiveRoom('!a:hs');
expect([state().activeRoomId, state().section]).toEqual(['!a:hs', 'chat']);
state().showRooms();
expect([state().activeRoomId, state().section]).toEqual(['!a:hs', 'rooms']);
state().showSettings();
expect(state().section).toBe('settings');
state().closeSettings();
expect([state().activeRoomId, state().section]).toEqual(['!a:hs', 'rooms']);
expect(getEffectiveSection('chat', null)).toBe('rooms');
expect(getEffectiveSection('settings', null)).toBe('settings');
```

Отдельные тесты: переходы сохраняют существующую error; reset возвращает null/null/rooms; state не содержит width/mode и не создаёт persist storage entry. Изменение matchMedia не меняет state.

- [ ] **Step 2: Проверить RED.** Run: `npx nx test web --run src/app/stores/chat-store.spec.ts`. Expected: FAIL на новых действиях/полях.
- [ ] **Step 3: Реализовать store и helper указанными сигнатурами.** Не поднимать draft/query в глобальный store; они остаются в своих стабильных контроллерах. Не импортировать SDK или storage в навигационную модель.
- [ ] **Step 4: Проверить GREEN.** Run: `npx nx test web --run src/app/stores/chat-store.spec.ts`; `npx nx run-many -p ui,web -t typecheck,lint`. Expected: PASS/exit 0.
- [ ] **Step 5: Commit.** `git commit -m "feat: add chat section transitions"`.

## Task 3: Именованный каркас, proxy-семантика и адаптация комнат/переписки

**Files:**
- Modify: каркас/семантика UI из карты, contract/registry/barrels, shared styles; app `chat-screen.tsx`, `room-list.tsx`, `chat-view.tsx`.
- Create: shadcn/proxy пары `room-list-header`, `room-list-items`, `room-list-entry`, `chat-view-empty`, `bottom-navigation`.
- Modify stories: `libs/ui/src/lib/kits/shadcn/chat-screen.stories.tsx` для нового props-контракта уже в этой задаче, чтобы не оставлять сломанную сборку.
- Test: `libs/ui/src/lib/proxy/proxy-chat-screen.spec.tsx`, `libs/ui/src/lib/proxy/proxy-responsive-parts.spec.tsx`; существующие `proxy-room-list-item.spec.tsx`, `proxy-room-list-panel.spec.tsx`, app `room-list.spec.tsx`, `chat-view.spec.tsx`, `chat-screen.spec.tsx`.

**Interfaces:**
- Consumes: `ChatSection`, `LayoutMode`, `ProxyAdaptiveSlot`, store переходы задачи 2.
- Produces `ChatScreenProps extends Omit<HTMLAttributes<HTMLDivElement>, 'children'> { section: ChatSection; activeRoomId: string | null; rail: ReactNode; rooms: ReactNode; chat: ReactNode; settings: ReactNode; bottomNavigation: ReactNode }`.
- Produces `RoomListHeaderProps { title: string }`, `RoomListItemsProps { children: ReactNode }`, `RoomListEntryProps { children: ReactNode }`, `ChatViewEmptyProps { icon?: ReactNode; label: ReactNode }` и одноимённые `UiKit` entries/`Proxy*` exports.
- Produces `BottomNavigationProps { section: ChatSection; chatsLabel: string; settingsLabel: string; navigationLabel: string; onRooms: () => void; onSettings: () => void }`; `UiKit.BottomNavigation`, `ProxyBottomNavigation`.
- Extends `ChatViewInputFormProps` optional `messageLabel?: string`, `sendLabel?: string`; `ChatViewMessageListProps` optional `loadingLabel?: ReactNode`, `emptyLabel?: ReactNode`, `loadMoreLabel?: string`. App передаёт все переводы; сохранять defaults для существующих standalone stories.

- [ ] **Step 1: Записать RED UI-тесты именованных слотов/делегирования.** Тесты `delegates named slots`, `keeps room and chat controllers mounted`, `hides inactive panels semantically`, `switches navigation without duplicate mounts`, `uses semantic room buttons`. Custom kit получает slots и section как props, а не children. Реальный shadcn: контроллеры-счётчики в rooms/chat монтируются один раз при rooms→chat→settings и media changes; hidden ancestors не содержат доступных ролей в Testing Library. Compact chat не имеет доступной навигации; wide имеет rail, rooms и chat; compact получает нормализованный section из app helper. Fallback chat+null отдельно проверить в `chat-screen.spec.tsx` на уровне приложения. Новые semantic proxies делегируют выбранному kit; список — `ul/li/button`, selected button имеет `aria-current='true'` и `data-room-id`.

```tsx
expect(roomMounts).toBe(1);
expect(chatMounts).toBe(1);
expect(screen.queryByRole('button', { name: 'Send' })).toBeNull(); // compact rooms
// После selection/section=chat:
expect(screen.getByRole('button', { name: 'Send' })).toBeTruthy();
expect(screen.queryByRole('navigation')).toBeNull();
```

Счётчики относятся к data-controller children, не к заменяемым презентациям. CSS-геометрию здесь не утверждать.

- [ ] **Step 2: Проверить RED.** Run: `npx nx test ui --run`; `npx nx test web --run`. Expected: новые slot/semantic assertions FAIL; existing failures только от изменяемого контракта.
- [ ] **Step 3: Реализовать каркас и semantic proxies.** Постоянные wrappers `data-sn-panel='rooms'/'chat'/'settings'`, неизменный порядок/keys rooms/chat. UI hook задаёт `hidden` неактивным основным панелям; scoped CSS `[hidden] { display: none !important; }` исключает переопределение display utilities. Wide grid: rail-token, room-token, `minmax(0,1fr)`; compact одна panel. Навигационный region через один `ProxyAdaptiveSlot` выбирает rail/fallback и compact bottomNavigation, скрывается только в compact chat. Settings controller остаётся в постоянном slot. Передавать уже вычисленный effective section, не мутировать store на resize.
- [ ] **Step 4: Перевести app markup на proxies.** `ChatScreen` передаёт именованные слоты, section/activeRoomId; пока `settings={null}` и `bottomNavigation={null}` допустимы до подключения задачи 4. `RoomList` добавляет заголовок SewerNet, заменяет native ul/li; selection использует действующий store action. `ChatView` использует empty proxy, убирает className, Back вызывает showRooms. Существующие SDK-хуки, local draft/sending и цепочка scroll sentinel→parent сохраняются. В `room-list.spec.tsx` убрать переопределение setActiveRoom, reset данных не должен заменять actions. Обновить assertions option→button во всех найденных UI tests.
- [ ] **Step 5: Адаптировать внутреннюю геометрию UI.** Header/composer — shrink-0, title/ID/badge могут переноситься/сжиматься без потери кнопок; Back использует `sn-wide:hidden`, не `md:hidden`. Min-width/min-height 0 по цепочке, таймлайн/список — внутренние scroll regions, bubble/sender/error — `overflow-wrap:anywhere`; существующие широкие pre/table/media ограничить/локально скроллить, не добавляя renderer. Composer input min-width 0/font16, действия не сжимаются и >=44px compact; сохранить file input и callbacks. Safe-area bottom composer; room/settings scroll clearance = nav height + 2 gaps + bottom inset, без двойного inset в shell. Добавить переводы новых названий через app Lingui props и extract-i18n, заполнить RU/EN.
- [ ] **Step 6: Проверить GREEN.** Run: `npx nx run web:extract-i18n`; `npx nx run-many -p ui,web -t typecheck,lint,test`; `npx nx run ui:build-storybook`. Expected: exit 0; no dropped send/encryption/pagination tests, updated stories compile. Не заявлять CSS приёмку до задачи 7.
- [ ] **Step 7: Commit.** `git commit -m "feat: add responsive chat shell"`.

## Task 4: Реальные adaptive navigation/settings, logout и modal lifecycle

**Files:**
- Modify: app `chat-screen.tsx`, `rail.tsx`, `settings-panel.tsx`; UI `settings-panel.tsx`, `rail.tsx`, `rail-button.tsx`, contract/registry/barrels/styles.
- Create: UI `settings-form.tsx`, `settings-screen.tsx`, `settings-dialog.tsx` в shadcn kit.
- Modify: `libs/ui/src/lib/kits/shadcn/settings-panel.stories.tsx`; app en.po/ru.po.
- Test: `libs/ui/src/lib/kits/shadcn/settings-panel.spec.tsx`, `apps/web/src/app/screens/chat-screen.spec.tsx`.

**Interfaces:**
- Consumes: named shell slots, bottom nav and adaptive slot задачи 3, shared store actions.
- App `Rail(props: { section: ChatSection; onRooms: () => void; onSettings: () => void; onLogout: () => void }): ReactNode`; theme store/resolved-theme toggle остаётся здесь, локального settingsOpen больше нет.
- App `SettingsPanel(props: { open: boolean; onClose: () => void; onLogout: () => void }): ReactNode` — stable controller theme/locale; всегда находится в shell slot.
- Extends public UI `SettingsPanelProps` required `open: boolean`, `settingsLabel: string`, `logoutLabel: string`, `onLogout: () => void`, сохраняя остальные controlled fields/callbacks.
- Internal `SettingsFormProps = Pick<SettingsPanelProps, 'appearanceLabel' | 'interfaceLabel' | 'colorSchemeLabel' | 'accentLabel' | 'fontLabel' | 'radiusLabel' | 'resetLabel' | 'kitId' | 'kitLabel' | 'onKitChange' | 'mode' | 'onModeChange' | 'modeOptions' | 'accent' | 'onAccentChange' | 'accentPresets' | 'font' | 'onFontChange' | 'fontOptions' | 'radius' | 'onRadiusChange' | 'locale' | 'onLocaleChange' | 'localeOptions' | 'onReset'>`.
- Internal `ShadcnSettingsForm(props: SettingsFormProps): ReactNode`; `ShadcnSettingsScreen(props: SettingsPanelProps): ReactNode`; `ShadcnSettingsDialog(props: SettingsPanelProps): ReactNode`.

- [ ] **Step 1: Записать RED-тесты settings/layout/logout.** Тесты `renders one compact settings form`, `opens and cancels the wide dialog`, `preserves controlled settings on resize`, `clears credentials before logout` (compact/wide table cases), `returns focus on explicit close`. Compact settings — один form, title/close/logout доступны и callbacks работают; wide — только dialog/form, доступное имя settingsLabel, Escape вызывает onClose один раз. Resize открытых настроек не меняет theme/locale и не создаёт duplicate IDs. Закрытие wide возвращает focus к trigger; закрытие modal/backdrop проверяется настоящим браузером в задаче 7.

```ts
fireEvent.click(screen.getByRole('button', { name: 'Settings' }));
expect(useChatStore.getState().section).toBe('settings');
fireEvent.click(screen.getByRole('button', { name: 'Close' }));
expect(useChatStore.getState().section).toBe('rooms');
expect(useChatStore.getState().activeRoomId).toBe('!a:hs');
// Logout mock проверяет порядок внутри своего вызова:
expect(useAuthStore.getState().credentials).toBeNull();
expect(logoutCurrent).toHaveBeenCalledTimes(1);
```

Logout mock assertion выполняется при вызове `logoutCurrent`, не только после click. Повторить для wide rail и compact settings. В jsdom дать узкий mock showModal/close с open-state; не выдавать mock за доказательство native focus trap.

- [ ] **Step 2: Проверить RED.** Run: `npx nx test ui --run src/lib/kits/shadcn/settings-panel.spec.tsx`; `npx nx test web --run src/app/screens/chat-screen.spec.tsx`. Expected: FAIL на отсутствии контейнеров/навигации/logout.
- [ ] **Step 3: Подключить общие действия приложения.** В `ChatScreen` готовые переводы/callbacks для rail и bottomNavigation; общие settings open/close и logout. Logout: `setCredentials(null)`, `resetUi()`, затем `void Promise.resolve(logoutCurrent())` в прежнем безопасном порядке. Unauthorized handler сохраняет распознавание SDK 401/M_UNKNOWN_TOKEN и очищает UI после credentials; новый вход стартует rooms без старого selection. Theme quick-toggle wide сохраняет resolvedMode, а compact меняет схему в настройках. Rail active/aria-current реагирует на section; Chats и Settings получают переведённые accessible names.
- [ ] **Step 4: Разделить общую форму и adaptive контейнеры.** `ShadcnSettingsPanel` выбирает screen/dialog через `ProxyAdaptiveSlot`, только одна форма mounted. Screen: открытая panel с focusable heading/close, внутренний scroll, compact logout, clearance под tabs. Form: сохранить все существующие поля/reset; range связывается с label через useId, selected choices получают aria-pressed, compact controls >=44px и visible focus. Не менять persist keys/theme semantics.
- [ ] **Step 5: Реализовать native dialog lifecycle.** `showModal()` только при open; `close()` на закрытие/cleanup, guard по `.open`, label ID через useId, backdrop, viewport-limited width/height и внутренний scroll. Native cancel предотвращает default и вызывает onClose один раз. Начальный focus внутри, Tab/Shift+Tab остаются в modal; explicit close возвращает focus на connected visible opener. Responsive unmount закрывает dialog, но не возвращает focus насильно в удалённый/скрытый trigger; дальнейший fallback принадлежит задаче 5. Без псевдомодального absolute popover. Не пересоздавать dialog при изменении controlled полей.
- [ ] **Step 6: Проверить GREEN.** Run: `npx nx run web:extract-i18n`; `npx nx run-many -p ui,web -t typecheck,lint,test`; `npx nx run ui:build-storybook`. Expected: exit 0, в обоих режимах logout доступен, только одна form; заполненные RU/EN. Native modal поведение дополнительно проверить в задаче 7.
- [ ] **Step 7: Commit.** `git commit -m "feat: adapt navigation and settings"`.

## Task 5: Focus transitions, стабильное состояние и отсутствие SDK-побочных эффектов

**Files:**
- Create: `libs/ui/src/lib/responsive/panel-focus.ts`, `libs/ui/src/lib/responsive/panel-focus.spec.ts`.
- Modify: UI `chat-screen.tsx`, `room-list-header.tsx`, `room-list-item.tsx`, `chat-view-header.tsx`, settings containers; app `chat-view.tsx` (только guard внутреннего scroll), если требуется UI `chat-view-message-list.tsx`.
- Create tests: `apps/web/src/app/screens/chat-screen.responsive.spec.tsx`, `apps/web/src/app/screens/chat-screen.architecture.spec.ts`.
- Modify tests: app `chat-view.spec.tsx`, UI `proxy-chat-screen.spec.tsx`.

**Interfaces:**
- Consumes: stable named shell/controllers, store transitions и settings lifecycle предыдущих задач.
- Internal focus API: `findPanelFocusTarget(root: HTMLElement, section: ChatSection, activeRoomId: string | null): HTMLElement | null`; `usePanelFocus(rootRef: RefObject<HTMLDivElement | null>, section: ChatSection, mode: LayoutMode, activeRoomId: string | null): void`.
- Kit markers: `data-sn-focus='rooms'/'chat'/'settings'` на headings с `tabIndex=-1`, `data-room-id` на button, `data-sn-action='settings'` на trigger. Поиск room ID — сравнение dataset, не необработанная интерполяция CSS selector.
- Guard scrolling не добавляет mode hook в приложение: использовать видимость sentinel/scroll parent (`checkVisibility` с безопасным fallback по hidden ancestors), либо semantic visibility callback UI. Выбранное минимальное решение здесь: локальная проверка `bottomRef.current?.closest('[hidden]')` перед scrollIntoView и обработкой scroll; скрытие гарантирует shell hidden из задачи 3.

- [ ] **Step 1: Записать RED focus-тесты.** Тесты `focuses the opened panel`, `returns to selected room or heading`, `handles special room IDs`, `keeps focus in visible composer`, `repairs focus after view replacement`, `does not override dialog return`. Rooms→chat/settings фокусирует соответствующий heading/control; back/close compact — selected visible button, иначе rooms heading. Matrix ID `!a.b[room]:hs` не вызывает selector error. Если выбранная комната отфильтрована/исчезла, selection остаётся, фокус на heading. Resize не трогает focus в ещё видимом composer; resize с focus на исчезнувшем rail/bottom control или settings replacement переводит focus на доступный target. Wide explicit-close return остаётся trigger, не переопределяется shell hook.
- [ ] **Step 2: Записать RED интеграционные тесты сохранения состояния.** Тесты `preserves draft query selection across navigation and resize`, `does not resend pending text`, `does not reupload pending file`, `keeps failed draft and error`, `does not scroll or paginate a hidden timeline`, `does not reconnect or repeat receipts`. Использовать существующие I18n/UI/Icon providers и SDK fakes из `chat-view.spec.tsx`, а не новые controllers. Test-local `setCompact(compact: boolean): void` dispatch media change внутри act; deferred send mock управляет promise. Проверить в одном цикле select→draft→rooms/search→settings→wide→compact→chat: draft/query/room/theme неизменны. Отдельно проверить pending text, pending file, failed send: один вызов соответствующей SDK-функции, ошибка не очищается на resize, draft очищается только при успешном send.

```ts
expect(sendMessageText).toHaveBeenCalledTimes(1);
expect(sendMessageFile).toHaveBeenCalledTimes(1); // отдельный file test
expect(useChatStore.getState().activeRoomId).toBe('!a:hs');
expect(messageInput.value).toBe('unfinished draft');
expect(searchInput.value).toBe('Alpha');
expect(useChatStore.getState().error).toBe('network failed'); // отдельный failure test
```

Ссылки `messageInput`/`searchInput` получают внутри named tests до переходов; после resize дополнительно проверить `isSameNode` для этих стабильных inputs. Hidden timeline event test изменяет mocked hook events, rerender: `scrollIntoView`, `loadOlder` и `markRoomRead` не получают новых вызовов; возвращение в chat не дублирует отправку/receipt. Mount counters RoomList/ChatView остаются 1; getMatrixClient/singleton не перезапускается.

- [ ] **Step 3: Записать RED architecture guard.** TypeScript `createSourceFile` + AST traversal для app `ChatScreen`, `Rail`, `RoomList`, `ChatView`, `SettingsPanel`: нет JSX intrinsic элементов, атрибутов className/style. Guard проверяет сам себя на строках `<div />`, `<ProxyPanel className="x" />`, `<ProxyPanel style={{}} />` (отклонены) и `<ProxyPanel />` (принят). Чтение пяти source files через node:fs; comments/строки не дают false positives. Не распространять запрет автоматически на весь app/landing.
- [ ] **Step 4: Проверить RED.** Run: `npx nx test ui --run`; `npx nx test web --run`. Expected: новые focus/hidden-scroll assertions FAIL; если guard уже проходит, его намеренные fixture assertions всё равно доказывают работоспособность.
- [ ] **Step 5: Реализовать focus hook и scroll guard.** В UI отслеживать focusin внутри root и последний сфокусированный element, чтобы обнаружить удалённую adaptive-презентацию после commit. Layout effect: intentional section transition переводит focus; resize делает это только когда прежний focus стал скрытым/disconnected. Не отбирать focus у доступного input или у элемента вне shell. Wide с settings open не фокусирует background rooms: приоритет dialog; native dialog управляет explicit-close return. Initial compact focus — rooms heading. В `ChatView` guard пропускает hidden auto-scroll/auto-pagination, не меняя dependencies read-receipt эффекта `[activeRoomId]` и бизнес-логику отправки.
- [ ] **Step 6: Проверить GREEN.** Run: `npx nx run-many -p ui,web -t typecheck,lint,test`. Expected: exit 0; existing SDK/encryption/scroll tests сохранены, новые state/focus/guard tests PASS. Если tests разоблачили unrelated bug, остановиться и согласовать отдельный scope, не переписывать SDK.
- [ ] **Step 7: Commit.** `git commit -m "fix: preserve state and focus on reflow"`.

## Task 6: Viewport-safe вход и статусные экраны

**Files:**
- Modify: `apps/web/index.html`, shared UI styles; shadcn `login-screen.tsx`, `login-form.tsx`, `status-panel.tsx`.
- Test: `libs/ui/src/lib/kits/shadcn/viewport-screens.spec.tsx`, `libs/ui/src/lib/responsive/shared-styles.spec.ts`.
- Preserve existing auth tests: `apps/web/src/app/screens/welcome-screen.spec.tsx`, `oidc-callback-screen.spec.tsx`.

**Interfaces:**
- Consumes shared layout/safe-area tokens; existing `LoginScreenProps`, `LoginFormProps`, `StatusPanelProps` unchanged. No new auth state/actions.
- Produces meta `width=device-width, initial-scale=1.0, viewport-fit=cover, interactive-widget=resizes-content` (не добавлять maximum-scale/user-scalable=no).

- [ ] **Step 1: Записать RED-тесты контракта viewport и auth controls.** Тесты `enables safe area and keyboard resize without disabling zoom`, `keeps OIDC and password controls working`, `preserves status action`, `shares dynamic viewport fallback`. Source assertion meta содержит viewport-fit/interactive-widget и не ограничивает zoom. Render login OIDC+password fallback и status с длинным detail; callbacks, labels и controlled values остаются прежними. Source CSS assertions фиксируют fallback `100vh` перед `100dvh` и shared safe-area variables; реальное отсутствие обрезания проверяется в задаче 7, не через jsdom dimensions.
- [ ] **Step 2: Проверить RED.** Run: `npx nx test ui --run`. Expected: новые meta/CSS assertions FAIL, auth contract tests остаются зелёными.
- [ ] **Step 3: Адаптировать UI оболочки и meta.** Login/status используют min-height viewport и целиковую вертикальную прокрутку, safe padding, max-width относительно viewport, auto margins вместо обязательного vertical center с clipping на малой высоте. Fields font16, основные compact кнопки >=44px, ошибки/URL wrap. Chat shell фиксированной динамической высоты остаётся с внутренней прокруткой; не применять его overflow:hidden к auth/status. Не менять OIDC/PKCE/password handlers.
- [ ] **Step 4: Проверить GREEN.** Run: `npx nx run-many -p ui,web -t typecheck,lint,test`. Expected: exit 0, существующие auth tests PASS.
- [ ] **Step 5: Commit.** `git commit -m "fix: fit auth screens to mobile viewport"`.

## Task 7: Fullscreen stories, browser evidence и контракт для будущих экранов

**Files:**
- Modify: `libs/ui/.storybook/preview.tsx`, UI proxy stories `chat-screen.stories.tsx`, `settings-panel.stories.tsx`.
- Create: `libs/ui/src/lib/kits/shadcn/adaptive-slot.stories.tsx`, `docs/superpowers/verification/2026-11-18-responsive-web.md`.
- Modify: `ARCHITECTURE.md`, `libs/ui/README.md`, shared CSS/затронутые UI-компоненты только при найденных layout дефектах.

**Interfaces:**
- Consumes все публичные contracts предыдущих задач; fullscreen stories — презентационные fixtures, без Matrix SDK/реальных credentials.
- Stories экспортируют `Rooms`, `OpenChat`, `Settings`, `NoSelection`, `LongContent`; story meta `layout: 'fullscreen'`. Demo shell держит section/roomId/draft/query над adaptive views, поддерживает клики/resize без reload.
- Verification report фиксирует browser/version, viewport/zoom/theme/locale, команды и результаты, screenshots/evidence paths, defects/fixes, отдельно mobile devices и непроверенные условия.

- [ ] **Step 1: Подготовить stories как воспроизводимый acceptance harness.** Fullscreen decorator не добавляет общий p4/centered wrapper; обычные компонентные stories сохраняют прежние defaults/providers. Добавить 80 комнат, длинные имена/ID/неразрывные URL и сообщения, длинную ошибку, настройки, interactive send counter. RU/EN fixture strings выбираются story args (не подключать SDK); theme mode через существующий provider. AdaptiveSlot story показывает общий fallback, альтернативы и сохранение controlled value выше slot. Обновить docs-контракт одновременно с harness: именованные slots, подключение CSS, единый48rem, CSS/container adaptation против replacement, state ownership/эфемерный reset, пример нового adaptive view, команды проверки.
- [ ] **Step 2: Проверить сборку harness.** Run: `npx nx run ui:build-storybook`; `npx nx run web:build`. Expected: exit 0. Затем `npx nx storybook ui --port=6006` для browser-проверки; long-running server запускать background, не polling. При отсутствии browser relay передать пользователю nextStep и ждать, не подменять проверку screenshot предположениями.
- [ ] **Step 3: Выполнить browser матрицу геометрии.** В Storybook iframe проверить Rooms/OpenChat/Settings/NoSelection/LongContent при ширинах `320, 390, 767, 768, 1024, 1440` CSS px, обычной высоте800 и landscape390×320, light/dark, RU/EN. Проверить также auth/status в web preview/dev. Результаты занести в report, а не только устно. JS assertions внутри iframe:

```js
const page = document.documentElement;
console.assert(page.scrollWidth <= page.clientWidth, 'page horizontal overflow');
const expectedWide = innerWidth >= 768; // assertion при стандартном root, не production источник
console.assert(matchMedia('(min-width: 48rem)').matches === expectedWide);
// Для каждого видимого compact back/tab/attach/send/close/settings control:
const rect = control.getBoundingClientRect();
console.assert(rect.width >= 44 && rect.height >= 44, 'compact touch target');
```

Сравнить actual layout (rail/list/chat visibility + computed display) с `matchMedia` на767/768, не только JS mode. Прокрутить список и настройки до конца: последний item/logout полностью видны над nav; header/composer не уходят; shell не имеет второй вертикальной прокрутки. Narrow chat внутри wide тоже переносит long content. Если renderer уже содержит pre/table/media, проверить локальное ограничение; не добавлять их поддержку ради fixture. Сохранить screenshots boundary/short-height и evidence доступности нижних controls.
- [ ] **Step 4: Выполнить browser interaction/focus и zoom.** Без reload повторять767→768→390→1440→320 с draft/query/selection/theme, во время pending demo send и открытых настроек. Проверить Tab hidden-panels exclusion, Back/Chats/Settings focus, Escape+return, native dialog Tab/Shift+Tab trap/backdrop, resize открытого dialog без остаточного modal. Browser zoom200% при исходных768/1440, подтвердить reflow и отсутствие overflow; не путать zoom с одним resize. Keyboard focus visible; поле не теряет value. Исправления делать только в UI/shared contract и повторять тест, который выявил дефект.
- [ ] **Step 5: Проверить мобильную клавиатуру/safe-area либо явно отметить gap.** Если доступны iOS Safari/Android Chrome: composer/send/attach при открытой keyboard, scrolling и tabs относительно safe-area, отсутствие iOS input auto-zoom. Если физических устройств нет, report явно говорит «не проверено на физических устройствах» отдельно от desktop/emulation. Только если наблюдён реальный keyboard defect, добавить общий UI visualViewport helper без UA-sniffing, отдельный unit RED/GREEN цикл и повторную mobile проверку; не добавлять профилактическую подписку в app.
- [ ] **Step 6: Выполнить финальную локальную проверку.** Run: `npx nx run-many -t typecheck,lint,test,build`; затем `npx nx run ui:build-storybook`; затем `git diff --check`. Expected: все команды exit0; report содержит фактический результат/дату и отмеченные gaps. Любой красный target блокирует PR, не объявлять весь workspace зелёным по одному web build. Просмотреть diff на app styles/HTML, новые зависимости, SDK duplication и чужие изменения.
- [ ] **Step 7: Commit и handoff на обязательный whole-branch review.** `git commit -m "docs: verify responsive UI contract"` (если задача содержит реальные UI fixes, выбрать соответствующий Conventional Commit отдельно). Связать issue и будущий PR, передать spec/plan/report и результаты проверок reviewer; не выполнять merge. Успешная desktop/emulation проверка не равна успешной physical-mobile проверке.

## Покрытие и порядок исполнения

| Требование спеки | Задачи |
| --- | --- |
| Режимы48rem, layout tokens, shared CSS, SSR/cleanup, единый CSS/JS источник | 1, browser доказательство7 |
| Именованные slots, stable controllers, semantic hidden panels, новые proxies | 3 |
| Реальная замена navigation/settings, одна форма/навигация, fallback | 1, 3–4 |
| Переходы rooms/chat/settings, back без очистки, wide overlay, logout | 2, 4 |
| Draft/query/error/selection/sending/Matrix side effects и focus | 5 |
| Длинный контент, safe-area, scroll chains,44px/16px, auth/status | 3–4, 6–7 |
| Архитектурный запрет app markup/styles | 3–5 |
| Stories,767/768,200%zoom, RU/EN/themes, реальные devices/gaps | 7 |
| ARCHITECTURE/UI README, локальная полная проверка, PR review | 7 |

Порядок: 1→2→3→4→5→6→7. Не параллелить изменения `ui-kit.ts`/barrels, каркаса и app composition: задачи делят эти файлы и опираются на предыдущие интерфейсы. Каждый commit — independently testable deliverable; промежуточные shell slots null в задаче3 исчезают в задаче4 до приёмки.

## Самопроверка плана

- [x] Каждое обязательное требование спеки сопоставлено задаче; scope exclusions сохранены.
- [x] Шаги имеют конкретный test/interface/command, RED/GREEN и Conventional Commit; нет полного transcript реализации.
- [x] Типы/имена props и store actions согласованы между задачами; public hook определения ширины в app не добавлен.
- [x] Все пять Review Focus имеют owning tests/browser assertions; jsdom не представлен доказательством CSS/native dialog/mobile keyboard.
- [x] Конфигурация Nx проверена через resolved targets: `ui` non-buildable, для него `build-storybook`; full workspace command сохранена.
- [x] Независимый дизайн-review не повторяется; сам план проверен автором, product code не изменён.
- [ ] Пользователь согласовал этот план и выбрал execution method.
