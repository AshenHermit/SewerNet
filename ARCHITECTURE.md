# Архитектура SewerNet

## Общее описание
SewerNet — кастомный кроссплатформенный Matrix-клиент (web + desktop, позже mobile), ориентированный на расширяемость, кастомизацию, современный UI и простоту поддержки. Монорепозиторий на Nx 24, пакетный менеджер npm workspaces.

## Технологический стек
- **Монорепо**: Nx (генераторы, кэш, run-many), npm workspaces.
- **Клиент**: React 19 + Vite, Tailwind CSS v4, zustand (persist-стор user'а/чата/темы), react-router, react-markdown (+remark-gfm).
- **Кастомизация UI**: собственная система **proxy-компонентов** (см. ниже).
- **Локализация**: Lingui v6 (macro `@lingui/react/macro`, каталоги `.po`, RU/EN).
- **Backend**: NestJS — stateless REST proxy к Matrix Client-Server API v3.
- **Лендинг/dev log**: Next.js (App Router), статический пререндер.
- **UI-дока**: Storybook 10 (react-vite) в `libs/ui`.
- **План**: Tauri (desktop/mobile), docker-compose (prod), GitHub Actions (CI/CD).

## Ключевые решения
1. **REST proxy вместо GraphQL** — простая совместимость с Matrix API; GraphQL можно добавить позже как отдельный слой.
2. **Stateless backend**: клиент сам передаёт `homeserverUrl` и `Bearer`-токен в каждом запросе (заголовок `x-matrix-homeserver`); backend не хранит креды и сессии.
3. **Proxy-компоненты**: `ProxyButton`/`ProxyInput`/`ProxyIcon` рендерят реализацию из реестра kits/icon sets, выбранного в теме (`kitId`). Добавление нового UI kit = новый набор компонентов в реестре.
4. **Тема**: `ThemeSettings {kitId, mode, accent, font, radius}` → CSS-переменные `--sn-*` на `documentElement` (`data-theme`). Тема в zustand persist (`sewernet:theme`).
5. **Монорепо-резолюция**: без `tsconfig` paths — через `package.json exports` (`@sewer-net/*`) + npm workspaces + `customConditions: ["@sewer-net/source"]`; библиотеки non-buildable (source-потребление).

## Поток данных
```
web (React)
  ├─ matrix-client.ts  →  /api/matrix/*  →  NestJS proxy  →  Matrix homeserver (/_matrix/client/v3/*)
  ├─ auth-store (persist)  → AuthSession {homeserverUrl, accessToken, userId, deviceId}
  ├─ chat-store            → rooms, activeRoomId, messages
  └─ theme-store (persist) → ThemeSettings → applyTheme() → CSS vars → kits/icons
```

## Фокус прототипа
- web + desktop (Tauri) позже; архитектурный запас под mobile.
- Минимальный parity с Element: login, список комнат, история, отправка сообщений, Markdown.
- Демо-режим без e2e-шифрования на первом этапе (OTK/device-ключи — отдельный этап).
