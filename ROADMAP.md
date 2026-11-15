# Дорожная карта SewerNet

## MVP (1-2 спринта):
- Nx workspace, базовая структура (+shared types/utils/ui)
- Простейший NestJS backend: public REST proxy для Matrix API (auth, send/receive messages)
- Веб-клиент: базовый layout, авторизация, комната, чат, отправка/приём md сообщений через Matrix REST
- Подключённая lingui-локализация
- Storybook (libs/ui)
- Кастомизация темы (цвет/шрифт из настроек)
- Switchable UI библиотека (shadcn starter)
- Next.js landing/devlog scaffold

## Сразу после MVP:
- Кастомные стикеры/эмодзи, reactions
- Магазин стикеров, интеграция кастомизированных emoji
- База для proxy icons
- Docker-compose для продакшна
- CI для github actions (build web/desktop, publish landing)
- Начальный groundwork для мобильного клиента
- Система кастомных html/js-обёрток в сообщениях (базовая, helpers API, предупреждения по безопасности)
- AGENTS.md, стандарт PR/release/issue процессов, подробная дока

## Будущие направления
- Подсистема плагинов/скриптов для расширения клиента, полноценный маркет скриптов/эмодзи
- Прокси над Matrix API для federation/bridge функциональности
- Расширяемый UI registry
- Динамические темы, конфигуратор тем (color schemes, акценты, кастомный css)
- Склад онлайн-документации со Storybook/examples.