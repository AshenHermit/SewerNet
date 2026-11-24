# Процесс разработки для SewerNet

## Общие правила

1. **Флоу задач**: Используйте GitHub для управления задачами: Issues → Feature/bug branch → PR обязательно через review.
2. **Формат коммитов**: Используйте [Conventional commits](https://www.conventionalcommits.org/):
   - `feat:` – новая функциональность;
   - `fix:` – исправление багов;
   - `docs:` – изменения в документации;
   - `ci:` – изменения в CI/CD;
   - `chore:` – мелкие изменения.
3. **Каждый PR**:
   - Линтинг (`nx lint`), тесты (`nx test`), сборка (`nx build`) в CI;
   - Мерж разрешен только с зелёной CI;
   - Связывайте issues с PR;
   - Обязательный code review (одобрить хотя бы одному core-разработчику).
   - CI scaffold есть (`.github/workflows/ci.yml` → reusable `checks.yml`: полный JS gate + policy tests); зелёный GitHub-run ещё не подтверждён, native/Docker jobs добавят следующие планы. До зелёного CI локальный `pnpm nx run-many -t typecheck,lint,test,build` обязателен перед PR.
4. **Структура веток**:
   - `main` – стабильная версия;
   - `feat/xxx`, `bugfix/xxx` – для задач и багов.
5. **Чейнджлог и версионирование**:
   - Используйте semver (x.y.z);
   - Автогенерация changelog с помощью стандартных инструментов.
   - Выпуск релизов через GitHub Actions по тегам.
6. **Документация**:
   - README: в корне и в каждой библиотеке `libs/*`;
   - Storybook для proxy-компонентов (`libs/ui`, `pnpm nx storybook ui`);
   - Спеки и планы фич — `docs/superpowers/{specs,plans}`;
   - Лендинг/dev log — `apps/landing`.

## Текущее состояние (ноябрь 2026)

- Web-клиент (MVP) общается с homeserver напрямую через `matrix-js-sdk`:
  OIDC/MAS-логин (SDK oidc-модуль, PKCE) + парольный fallback, E2EE
  (rust-crypto), список комнат, история с пагинацией, отправка текста и
  файлов, Markdown, proxy-компоненты/темы, EN/RU (подробности — ARCHITECTURE.md).
- NestJS backend (`/api/matrix/*`) web-клиентом не используется — остаётся
  stateless-прокси для внешних интеграций и будущих нужд.
- CI scaffold: `ci.yml` вызывает reusable `checks.yml` (полный JS workspace gate
  + CI policy tests); реальный зелёный GitHub-run не подтверждён, native/Docker
  jobs — из следующих планов.
- Не готово: desktop-обёртка (Tauri), docker-compose prod.

## Команды разработки

```bash
pnpm nx serve web       # веб-клиент: http://localhost:4200 (/api проксируется на :3000)
pnpm nx serve backend   # REST-прокси: http://localhost:3000/api
pnpm nx serve landing   # лендинг / dev log (Next.js)
pnpm nx storybook ui    # Storybook proxy-компонентов

pnpm nx run-many -t typecheck,lint,test,build   # полная проверка воркспейса
pnpm nx run web:extract-i18n                    # извлечение строк Lingui в locales/*.po
```

- Тесты: vitest + jsdom (`web`, `landing`, `ui`, `icons`, `utils`); jest (`backend`).
- Правила рендеринга UI (proxy-компоненты, `apps/web` без стилей) — см. ARCHITECTURE.md.

## Архитектура
Ключевые принципы:
- Клиент общается с homeserver напрямую (matrix-js-sdk, CORS); NestJS backend — отдельный stateless REST-прокси;
- Фокус на масштабируемости, кастомизации и удобно читаемом, поддерживаемом коде;
- Используйте готовые решения, но будьте готовы их скорректировать для специфичных подзадач.
