# Дорожная карта SewerNet

## MVP — база (выполнено)

- [x] Nx workspace в корне: apps/{web,backend,landing}, libs/{ui,icons,themes,types,utils}
- [x] NestJS REST proxy к Matrix API: login, whoami, joined_rooms, messages, send; позже расширен (sliding-sync room list, long-poll `/sync`, read markers, members/threads/aliases/state) и дополнен MAS OAuth-прокси `/api/matrix/oauth/{discover,register,token}`
- [x] Веб-клиент: логин, список комнат, история, отправка, Markdown (react-markdown + remark-gfm)
- [x] Lingui EN/RU + автоопределение, каталоги в apps/web/src/locales
- [x] Storybook в libs/ui (proxy Button/Input, темы-переменные)
- [x] Proxy UI-компоненты (ProxyButton/ProxyInput) + реестр kits (shadcn)
- [x] Proxy-иконки (ProxyIcon) + реестр icon sets (lucide)
- [x] Тема: kit/mode/accent/font/radius → CSS-переменные --sn-\*, zustand persist
- [x] Next.js лендинг + dev log (apps/landing)
- [x] Общая проверка: nx run-many -t typecheck,lint,test,build — зелёная
- [x] Авторизация: OIDC через MAS по реплике wizardchat (capability discovery → SDK oidc-модуль с PKCE, динамическая регистрация клиента, `prompt=create` для регистрации) + парольный fallback; `/oidc/callback`, `RequireAuth`; refresh токенов через `tokenRefreshFunction`
- [x] matrix-js-sdk v41 напрямую из браузера: синглтон клиента (`resume`/`logoutCurrent`), rust-crypto (E2EE), IndexedDB-сторы по юзеру
- [x] Список комнат и таймлайн из SDK-сторов: событийные хуки `useRooms`/`useTimeline`, пагинация вверх, отправка, read receipts
- [x] Медиа: `mxcUrlToHttp` + service worker, подмешивающий Bearer к authenticated media; аватары комнат
- [x] Вложения: загрузка файлов (`m.image`/`m.file`) через `uploadContent`
- [x] Чистка: web больше не вызывает `/api/matrix/*` (REST-клиент удалён)

## MVP — доводка

- [ ] Tauri desktop-обёртка apps/desktop
- [ ] GitHub Actions CI (typecheck,lint,test,build) + сборки
- [ ] docker-compose для prod (backend + landing + reverse proxy)
- [x] Холодная загрузка списка комнат с именами/превью сразу (теперь — из SDK после первого sync)
- [x] Синхронизация сообщений: live-обновления через SDK `/sync`
- [x] Пагинация истории (pagination tokens)
- [x] Переключатель языка в UI (EN/RU в настройках)

## Сразу после MVP

- Кастомные стикеры/эмодзи, реакции, магазин стикеров
- Кастомные html/js-обёртки сообщений (базовая helpers API + предупреждения)
- Расширение наборов kits/icons (вторая библиотека, кастомные иконки)
- Groundwork mobile (Tauri mobile / capacitor-подход), верификация устройств и key backup UI
- Поиск/каталог комнат, профиль — первые потребители react-query

## Будущие направления

- Подсистема плагинов/скриптов, маркет скриптов/эмодзи
- Federation/bridge-функциональность через proxy
- Расширяемый UI registry, динамические темы, конфигуратор тем
- Онлайн-дока на Storybook/examples
