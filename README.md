# SewerNet

Кастомный кроссплатформенный мессенджер на протоколе [Matrix](https://matrix.org/): web + desktop (позже mobile), с глубокой кастомизацией интерфейса.

## Структура монорепозитория (Nx)

```
apps/
  web/        # веб-клиент: React + Vite + Tailwind + zustand + lingui
  desktop/    # (план) Tauri-обёртка вокруг web-клиента
  backend/    # NestJS REST proxy к Matrix Client-Server API
  landing/    # Next.js сайт: лендинг + dev log
libs/
  ui/         # proxy UI-компоненты, реестр kits (shadcn/...), Storybook
  icons/      # proxy иконки (наборы icon sets по теме)
  themes/     # тема: настройки, CSS-переменные, zustand store
  types/      # общие типы (Matrix API DTO)
  utils/      # общие утилиты (cn и др.)
scripts/      # вспомогательные скрипты
deploy/       # prod docker-compose, Dockerfiles, HTTP-роутер, smoke, README
.github/      # GitHub Actions: ci.yml + переиспользуемый checks.yml
```

## Быстрый старт

Требуется Node.js 24.11.0. pnpm 10.34.9 закреплён в `packageManager` и
активируется через corepack (`corepack enable && corepack prepare pnpm@10.34.9 --activate`).

```bash
pnpm install --frozen-lockfile

# веб-клиент (http://localhost:4200, /api проксируется на :3000)
pnpm nx serve web

# backend proxy (http://localhost:3000/api)
pnpm nx serve backend

# лендинг / dev log
pnpm nx serve landing

# Storybook proxy-компонентов
pnpm nx storybook ui
```

## Проверка воркспейса и CI

Полная JS-проверка воркспейса (те же шаги выполняет Linux CI):

```bash
pnpm nx run-many -t typecheck,lint,test,build
```

- Node-тесты политики CI (workflow YAML, кэши, артефакты):
  `node --test "tools/ci/*.test.mjs"`.
- `.github/workflows/ci.yml` запускается на `pull_request`, push в `master` и
  вручную, права только `contents: read`. Реальный gate живёт в
  переиспользуемом `.github/workflows/checks.yml` (job `javascript`), который
  позже будет вызываться из release-пайплайна.
- Native-проверки (Tauri/Rust/MSVC/WebView2, позже) — **отдельная** команда вне
  `run-many`: JS-gate не требует Windows-toolchain, native и Docker jobs появятся
  в следующих планах.
- Зелёный CI на GitHub пока не подтверждён: первый реальный запуск произойдёт
  после push/PR, до этого обязателен локальный зелёный gate выше.

## Production deployment

Готовый HTTP-only стек: `compose.yaml` + `deploy/` (Dockerfiles, Caddyfile,
smoke). Роутер слушает только loopback `127.0.0.1:${ROUTER_PORT:-8080}`;
публичный HTTPS terminated существующим root Nginx владельца — он не
редактируется и не управляется этим репозиторием. Внешний HTTPS обязателен
для service worker / WebCrypto (E2EE) / OIDC; внутренний HTTP его не заменяет.
Backend приватный (:3000, без published port), доступ — через private
integration / VPN / SSH. Инструкции, env-переменные, два варианта ingress и blockers —
в [deploy/README.md](./deploy/README.md). Реальный деплой и внешний smoke
ещё не выполнялись.

## Авторизация

Вход через **Matrix Authentication Service** (OAuth 2.0, MSC2964/2965/2966) по
образцу Element X и WizardChat: «Продолжить с Matrix» → логин/consent на
issuer'е (для matrix.org — `account.matrix.org`) → возврат на `/oidc/callback`.
Парольная форма остаётся запасным вариантом (для homeserver'ов без MAS).

- OIDC идёт через `matrix-js-sdk` (oidc-модуль: динамическая регистрация
  клиента, PKCE и state внутри SDK); токены обмениваются напрямую с issuer'ом.
- Discovery возможностей homeserver'а: `loginFlows`, register-probe,
  `_matrix/client/v1/auth_metadata` и `.well-known/matrix/client` → при
  `delegatedAuth` показываются OIDC-кнопки, иначе парольная форма.
- Креды лежат в `localStorage` (`sewernet_accounts`, `Record<userId, MatrixCredentials>`);
  refresh — `tokenRefreshFunction` (OIDC refresher или native `/refresh`).

## Matrix-клиент

Web-клиент работает с homeserver напрямую через `matrix-js-sdk` v41 (CORS):
синглтон в `apps/web/src/client/init-matrix.ts` (`resume`, `getMatrixClient`,
`logoutCurrent`), UI читает данные из SDK-сторов хуками `useRooms`/`useTimeline`,
E2EE — rust-crypto, authenticated media — через service worker
(`apps/web/public/sw.js`). Backend-прокси `/api/matrix/*` web больше не
использует.

## Локализация

Интерфейс на en/ru через Lingui. Извлечение строк:

```bash
pnpm nx run web:extract-i18n
```

Каталоги: `apps/web/src/locales/{en,ru}.po`.

## Документы

- [SPECIFICATION.md](./SPECIFICATION.md) — функциональная спецификация.
- [ARCHITECTURE.md](./ARCHITECTURE.md) — архитектура и решения.
- [ROADMAP.md](./ROADMAP.md) — roadmap.
- [AGENTS.md](./AGENTS.md) — процесс разработки.
