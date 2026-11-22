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
- [x] Вложения в незашифрованных комнатах: загрузка файлов (`m.image`/`m.file`) через `uploadContent`
- [x] Вложения v2 в зашифрованных комнатах: шифрование до upload, проверка hash и расшифровка после получения; plaintext fallback запрещён
- [x] Чистка: web больше не вызывает `/api/matrix/*` (REST-клиент удалён)

## MVP — доводка

### Реализовано
- [x] Windows desktop-обёртка `apps/desktop` на Tauri 2: общий web UI, tray, deep links, secure credential storage и updater lifecycle; локальные native tests и production build проходят
- [x] GitHub Actions scaffold: workspace JS gates, Windows native tests и unsigned desktop bundle; signed desktop release workflow подготовлен
- [x] Холодная загрузка списка комнат с именами/превью сразу (теперь — из SDK после первого sync)
- [x] Синхронизация сообщений: live-обновления через SDK `/sync`
- [x] Пагинация истории (pagination tokens)
- [x] Переключатель языка в UI (EN/RU в настройках)

### Осталось до завершения MVP
- [ ] Desktop acceptance на установленной сборке: OIDC cold/warm callback, восстановление аккаунта после перезапуска, E2EE и encrypted media/attachments, смена аккаунта/logout и Tray Exit
- [ ] Signed updater A→B smoke: consent, сохранение credential state, установка и перезапуск; отрицательный тест с повреждённой/неверно подписанной сборкой
- [ ] Подтвердить реальный зелёный GitHub Actions run для актуального commit/tag; локальные gates не заменяют удалённый CI
- [ ] Production `docker-compose` для backend + landing + reverse proxy: HTTP-only стек подготовлен (`compose.yaml`, `deploy/`, Caddy Host-роутинг, smoke, docs), **но не проверен** — Docker CLI/compose и caddy локально отсутствуют, сборка образов, реальный Caddy smoke, зелёный GitHub-run, внешний HTTPS/Host/Nginx smoke и OIDC callback на app-поддомене не выполнялись; деплой и изменения сервера — только по отдельному разрешению владельца

### Последний локальный gate
- JS `typecheck,lint,test,build`: PASS (9 проектов; Nx отметил один flaky task)
- Desktop `native-test`: PASS (24 unit, 8 lifecycle integration, 3 storage tests; 1 native smoke test намеренно ignored)
- Desktop/policy и frozen-prototype regression tests: PASS (12/12)
- Tauri production build (`npx tauri build --no-bundle`): PASS
- Эти проверки не подтверждают установленный desktop acceptance, подписанный A→B update, удалённый GitHub run или production deployment.

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
