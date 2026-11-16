# Дорожная карта SewerNet

## MVP — база (выполнено)

- [x] Nx workspace в корне: apps/{web,backend,landing}, libs/{ui,icons,themes,types,utils}
- [x] NestJS REST proxy к Matrix API: login, whoami, joined_rooms, messages, send
- [x] Веб-клиент: логин, список комнат, история, отправка, Markdown (react-markdown + remark-gfm)
- [x] Lingui EN/RU + автоопределение, каталоги в apps/web/src/locales
- [x] Storybook в libs/ui (proxy Button/Input, темы-переменные)
- [x] Proxy UI-компоненты (ProxyButton/ProxyInput) + реестр kits (shadcn)
- [x] Proxy-иконки (ProxyIcon) + реестр icon sets (lucide)
- [x] Тема: kit/mode/accent/font/radius → CSS-переменные --sn-\*, zustand persist
- [x] Next.js лендинг + dev log (apps/landing)
- [x] Общая проверка: nx run-many -t typecheck,lint,test,build — зелёная
- [x] Авторизация через MAS: OAuth 2.0 authorization code + PKCE S256 (MSC2964/2965/2966), discovery MAS (`auth_metadata` → `.well-known` → fallback), динамическая регистрация клиента, обмен/refresh токенов через backend, callback `/callback` (query+fragment), прозрачный refresh на 401; парольный вход как fallback

## MVP — доводка

- [ ] Tauri desktop-обёртка apps/desktop
- [ ] GitHub Actions CI (typecheck,lint,test,build) + сборки
- [ ] docker-compose для prod (backend + landing + reverse proxy)
- [x] Холодная загрузка списка комнат: один sliding-sync room-list запрос (окна по 20 через `pos`), имена/топик/превью сразу; фолбэк на `joined_rooms` для старых homeserver'ов
- [ ] Синхронизация сообщений: /sync long-poll вместо ручного обновления
- [ ] Пагинация истории (from/pagination tokens)
- [ ] Переключатель языка в UI (сейчас автоопределение + persist)

## Сразу после MVP

- Кастомные стикеры/эмодзи, реакции, магазин стикеров
- Кастомные html/js-обёртки сообщений (базовая helpers API + предупреждения)
- Расширение наборов kits/icons (вторая библиотека, кастомные иконки)
- Groundwork mobile (Tauri mobile / capacitor-подход), e2e-шифрование (vodozemac)

## Будущие направления

- Подсистема плагинов/скриптов, маркет скриптов/эмодзи
- Federation/bridge-функциональность через proxy
- Расширяемый UI registry, динамические темы, конфигуратор тем
- Онлайн-дока на Storybook/examples
