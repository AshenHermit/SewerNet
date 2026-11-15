# Спецификация SewerNet

## Структура монорепозитория
```
/
├─ apps/
│   ├─ web/           # Веб-клиент на React + Vite + Tauri bridge
│   ├─ desktop/       # Desktop Tauri wrapper (reuse web)
│   ├─ backend/       # NestJS, Matrix REST proxy, кастомное API
│   └─ landing/       # Next.js: landing page, dev log
├─ libs/
│   ├─ ui/            # Proxy UI-компоненты, темы, иконки, theming engine
│   ├─ icons/         # Proxy-компоненты для иконок
│   ├─ utils/         # Общие утилиты, shared code
│   ├─ types/         # Общие (TS) типы сущностей, контракты API, etc.
│   ├─ themes/        # Пакеты тем, пользовательские настройки
├─ scripts/           # Вспомогательные и DevOps/CI скрипты
├─ .github/           # Github Actions
├─ docker/            # Прод-окружение (docker-compose)
├─ AGENTS.md          # Процесс разработки, правила коммитов, ревью, ветки
├─ README.md
└─ nx.json, workspace.json, package.json, tsconfig.base.json и т.д.
```

## Особенности
- Используется Nx workspace: из коробки поддерживаются разделённые пакеты и отдельные таргеты (build, lint, test).
- Модули для UI и иконок поддерживают расширяемость и подмену (theme switching, proxy).
- Landing/devlog — отдельный Next.js сайт в apps/landing.
- В будущем будет добавлен mobile-пакет.