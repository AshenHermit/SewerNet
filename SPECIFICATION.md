# Спецификация SewerNet

## Структура монорепозитория
```
/
├─ apps/
│   ├─ web/           # Веб-клиент: React + Vite + Tailwind + matrix-js-sdk + zustand + lingui
│   ├─ desktop/       # (план) Desktop Tauri wrapper поверх web
│   ├─ backend/       # NestJS, REST proxy к Matrix Client-Server API v3
│   └─ landing/       # Next.js: лендинг + dev log
├─ libs/
│   ├─ ui/            # Proxy UI-компоненты, реестр kits, Storybook
│   ├─ icons/         # Proxy-иконки, реестр icon sets
│   ├─ themes/        # ThemeSettings, CSS-переменные, zustand store
│   ├─ types/         # Общие типы (Matrix DTO, контракты API)
│   └─ utils/         # Общие утилиты (cn и др.)
├─ docs/              # спеки/планы фич (docs/superpowers/{specs,plans}), справочные материалы
├─ scripts/           # (план) вспомогательные и DevOps/CI скрипты
├─ docker/            # (план) Прод-окружение docker-compose
├─ .github/           # (план) GitHub Actions
├─ AGENTS.md          # Процесс разработки
├─ README.md, SPECIFICATION.md, ARCHITECTURE.md, ROADMAP.md
└─ nx.json, package.json, tsconfig.base.json, lingui.config.ts
```

## Утверждённые решения
1. **Nx-монорепо**, npm workspaces; библиотеки non-buildable, потребление через `package.json exports`.
2. **Backend — REST proxy** к Matrix API (GraphQL отклонён на данном этапе; возможен позже отдельным слоем). Web-клиент матриксные роуты не использует: он ходит на homeserver напрямую через `matrix-js-sdk` (CORS).
3. **Локализация — Lingui** (en/ru, `.po` каталоги, macro `@lingui/react/macro`).
4. **Docker-compose — только для production.**
5. **Темизация**: пользователь выбирает UI kit из предложенных (старт — shadcn; позже собственный kit) и настраивает параметры темы (акцентный цвет, шрифт, радиус, режим light/dark/system).
6. **Proxy-компоненты**: UI и иконки рендерятся через proxy по текущему `kitId` из темы; расширение — добавление наборов в реестр.
7. **Storybook** — в `libs/ui` для proxy-компонентов.
8. **Лендинг/dev log** — отдельный Next.js сайт (`apps/landing`).
9. **Этап 1: web + desktop** (Tauri позже); архитектурно учесть mobile.
10. **Кастомные HTML/CSS/JS-обёртки сообщений** — выполняются без iframe/sandbox при появлении сообщения на экране; JS получает вспомогательные API. Помечено как **experimental/на свой риск**, документируется в спеке безопасности.
11. **Приоритет готовых решений/библиотек** при реализации.

## Функциональные требования (MVP) — статус на ноябрь 2026
- [x] Авторизация: OIDC через MAS (SDK oidc-модуль, PKCE) с парольным fallback на homeserver'ах без MAS.
- [x] E2EE (rust-crypto): чтение истории и отправка в шифрованных комнатах.
- [x] Список комнат, история сообщений (с пагинацией), отправка сообщений (m.text) и файлов (m.image/m.file).
- [x] Markdown в сообщениях (react-markdown + remark-gfm).
- [x] Переключение темы и kit'а в настройках, применение без перезагрузки.
- [x] Локализация EN/RU с автоопределением и persist-выбором.
- [ ] Реакции кастомными эмодзи, стикеры, магазин — следующий этап.
- [ ] Desktop-обёртка (Tauri) — следующий этап.

## Безопасность (базовый контур)
- Backend stateless: не хранит токены/креды; клиент передаёт homeserver и Bearer-токен сам. Web-клиент backend-прокси не использует — ходит на homeserver напрямую (CORS, matrix-js-sdk).
- Креды в localStorage (`sewernet_accounts`, активный аккаунт `sewernet_active_account`); refresh-ротация через `tokenRefreshFunction` (OIDC refresher или native `/refresh`).
- Authenticated media: service worker (`apps/web/public/sw.js`) подмешивает `Bearer` к `/_matrix/client/v1/media/*` и срезает `allow_redirect`; сессию в воркер отправляет клиент при resume/refresh.
- E2E-шифрование: rust-crypto (`@matrix-org/matrix-sdk-crypto-wasm`), история и отправка в шифрованных комнатах; верификация устройств и key backup — следующий этап.
- Кастомные скрипты сообщений: без изоляции; запуск только по явному доверию (UI-предупреждение) — проработать CSP/политики на следующем этапе.
