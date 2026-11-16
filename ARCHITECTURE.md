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
6. **Авторизация через MAS (OAuth 2.0)**: frontend ведёт браузер на `authorization_endpoint` (authorization code + PKCE S256, MSC2964/2965/2966); backend stateless проксирует динамическую регистрацию клиента (RFC 7591, без кэша — MAS дедуплицирует по хэшу метаданных), обмен кода и refresh grant (`/api/matrix/oauth/discover|register|token`, OIDC-эндпоинты всегда из `{issuer}/.well-known/openid-configuration`). PKCE/state — на фронте (`sessionStorage sewernet:oauth`); `response_mode`: `query` для loopback http, `fragment` для https; callback читает оба. Access token MAS — обычный Matrix Bearer в существующем proxy; при 401 — один refresh + retry, неудача refresh → logout. Парольный вход сохранён как fallback (homeserver'ы без MAS).

## 7. Правила рендеринга UI (ui-kit)

Клиентское приложение (`apps/web`) не должно содержать inline-стили (классы Tailwind, `className`, атрибут `style`) и голые HTML-элементы для оформления. Вся разметка, стили и темизация живут в ui-kit (`libs/ui`).

1. **`apps/web` — только данные и логика.** Компоненты приложения передают данные через props и обрабатывают события. Никаких `className`, `style`, CSS-переменных `--sn-*` напрямую в разметке приложения, никаких голых `<div>`, `<section>`, `<header>`, `<nav>`, `<form>`, `<button>`, `<input>`, `<label>`, `<span>`, `<h1>`, `<h2>`, `<h3>`, `<p>`, `<ul>`, `<li>` и т.п. для оформления.
2. **`libs/ui` — только разметка и стили.** UI-kit содержит конкретные реализации компонентов (shadcn kit и др.). Всё оформление — Tailwind классы и CSS-переменные `--sn-*` внутри kits.
3. **Compound Components + props.** Для композиции используется паттерн Compound Components: родительский компонент (например, `ProxyChatViewPanel`) принимает дочерние элементы, а дочерние части рендерятся через отдельные компоненты из ui-kit (`ChatViewHeader`, `ChatViewMessageList`, `ChatViewMessage`, `ChatViewError`, `ChatViewInputForm` и т.п.). Данные передаются через props.
4. **Proxy-компоненты.** Каждый компонент из ui-kit имеет соответствующий `Proxy*` компонент, который берёт актуальный kit из `UiKitProvider` и рендерит `kit.<Component>`. Приложение импортирует только `Proxy*` из `@sewer-net/ui`.
5. **forwardRef / callbacks ref.** Где приложению нужен прямой доступ к DOM-узлу (например, `bottomRef` для скролла в `ChatView`), используется `forwardRef` или callback ref, передаваемый через props.
6. **Переводы.** `Trans` / `t()` остаются в `apps/web` (логика приложения), ui-kit компоненты принимают уже готовые строки/ноды через props (`label`, `placeholder`, `title`, `children`).
7. **Исключений нет.** Любой новый экран/компонент в `apps/web` пишется без стилей с первого коммита.

## Загрузка списка комнат

```
web chat-screen
  └─ matrixClient.getSyncedRooms()      → POST /api/matrix/sync/room-list
       └─ NestJS: MatrixService.syncRoomList()
            └─ POST {hs}/_matrix/client/unstable/org.matrix.simplified_msc3575/sync
                 body: conn_id=room-list, ranges=[[0,19]], timeline_limit=1
                 required_state: m.room.name|avatar|topic|canonical_alias|member($ME,$LAZY)
                 → окна по 20 комнат через `pos`, максимум 10 окон (200 комнат)
       └─ mapSyncedRooms(): порядок из lists.all_rooms.ops, имя =
          m.room.name → canonical_alias → собеседник из m.direct → room id
  └─ 400/404 от sliding-sync (старый homeserver) → фолбэк:
       joined_rooms + m.room.name + messages?limit=1 по каждой комнате
```

- Открытие комнаты: пять запросов в одном круге (`/state m.room.name`,
  `/messages?limit=50`, `/members`, `/threads?limit=30`, `/aliases`);
  `/state` и `/messages` обязательны, остальные через `Promise.allSettled` —
  их 403/404 не мешает показать историю. `read_markers` — побочный эффект,
  ошибка не выводится.
- Backend может ходить на homeserver через системный прокси: если задан
  `HTTPS_PROXY`/`HTTP_PROXY` (или в нижнем регистре), `apps/backend/src/main.ts`
  ставит undici `EnvHttpProxyAgent` (`NO_PROXY` соблюдается). Без прокси
  dispatcher не меняется.

## Поток данных
```
web (React)
  ├─ login-screen: normalizeHomeserver → discoverMasAuth → OAuth redirect (PKCE) | password fallback
  ├─ /callback: exchangeOauthCode → whoami → setSession → Navigate /
  ├─ matrix-client.ts  →  /api/matrix/*  →  NestJS proxy  →  Matrix homeserver (/_matrix/client/v3/*)
  │     └─ 401 → refreshOauthToken (refresh grant через backend) → один retry
  ├─ auth-store (persist)  → AuthSession {homeserverUrl, accessToken, userId, deviceId, issuer?, clientId?, refreshToken?, expiresAt?}
  ├─ chat-store            → rooms, activeRoomId, messages
  └─ theme-store (persist) → ThemeSettings → applyTheme() → CSS vars → kits/icons
```

## Фокус прототипа
- web + desktop (Tauri) позже; архитектурный запас под mobile.
- Минимальный parity с Element: login, список комнат, история, отправка сообщений, Markdown.
- Демо-режим без e2e-шифрования на первом этапе (OTK/device-ключи — отдельный этап).
