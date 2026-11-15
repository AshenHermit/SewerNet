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
docker/       # (план) prod docker-compose
.github/      # (план) GitHub Actions
```

## Быстрый старт

Требуется Node.js (LTS) и npm.

```bash
npm install

# веб-клиент (http://localhost:4200, /api проксируется на :3000)
npx nx serve web

# backend proxy (http://localhost:3000/api)
npx nx serve backend

# лендинг / dev log
npx nx serve landing

# Storybook proxy-компонентов
npx nx storybook ui
```

Проверка всего воркспейса:

```bash
npx nx run-many -t typecheck,lint,test,build
```

## Локализация

Интерфейс на en/ru через Lingui. Извлечение строк:

```bash
npx nx run web:extract-i18n
```

Каталоги: `apps/web/src/locales/{en,ru}.po`.

## Документы

- [SPECIFICATION.md](./SPECIFICATION.md) — функциональная спецификация.
- [ARCHITECTURE.md](./ARCHITECTURE.md) — архитектура и решения.
- [ROADMAP.md](./ROADMAP.md) — roadmap.
- [AGENTS.md](./AGENTS.md) — процесс разработки.
