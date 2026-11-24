# pnpm migration design (2026-11-24)

## Intent

`npm ci` в CI падает с `EUSAGE`: `package-lock.json` не совпадает с
`package.json` (не хватает опциональных `@emnapi/core` и `@emnapi/runtime`,
транзитивных зависимостей `@swc/core`). Разовая регенерация лока уже
проделывалась и не помогла — ошибка вернулась. Переходим на pnpm с
`--frozen-lockfile`, чтобы расхождение лока и манифеста было жёсткой ошибкой
и не зависело от версии npm на раннере.

## Goals

- Единый пакетный менеджер во всём репозитории: локальная разработка, CI,
  Docker-сборки, desktop-скрипты.
- `pnpm install --frozen-lockfile` во всех местах установки зависимостей.
- Зелёный полный гейт: `node --test tools/ci/*.test.mjs`,
  `pnpm nx run-many -t typecheck,lint,test,build`, Docker smoke.
- Деплой на сервер работает без изменений топологии (compose, сети, порты).

## Non-goals / anti-goals

- Не обновляем версии зависимостей (сохраняем range из `package.json` как есть).
- Не меняем топологию: compose-файлы, сети `sewernet`/`shared-net`, порты,
  `deploy.yml` (триггер `master`) остаются как есть.
- Не трогаем `if:` у джоба `desktop-native` в `checks.yml`.
- Не добавляем внешние GitHub Actions: `workflow-policy.test.mjs` разрешает
  только официальные `actions/*` с SHA-пином.

## Constraints

- Node 24.11.0, corepack 0.34.0 в комплекте → pnpm активируется через
  `corepack enable && corepack prepare pnpm@10.34.9 --activate`.
- pnpm **10.34.9** (последний 10.x; Nx 24 явно поддерживает prune-lockfile
  для pnpm 10 и ниже).
- `patch-package` + `patches/matrix-widget-api+1.20.0.patch` должны
  продолжать применяться через root `postinstall`. Для совместимости с
  патчем и симлинковым layout добавляем `.npmrc` с `node-linker=hoisted`.
- `pnpm-workspace.yaml` обязателен: pnpm не поддерживает поле
  `workspaces` в `package.json`.

## Approaches

- **A (выбран):** полная миграция на pnpm. Один lockfile, воспроизводимая
  установка, CI и Docker говорят на одном языке. Цена — правки в ~12 файлах
  и обязательный полный гейт + Docker smoke.
- **B (отклонён):** оставить npm, перегенерировать lock и добавить тест
  синхронизации. Меньше правок, но не соответствует запросу пользователя
  и не устраняет чувствительность к версии npm.
- **C (отклонён):** pnpm в CI + npm в Docker. Два lockfile, риск
  рассинхрона — ровно та проблема, от которой уходим.

## Decisions (how it gets built)

1. **Манифест и workspace.** `package.json`: `packageManager:
   "pnpm@10.34.9"`, удалить `workspaces`, оставить `postinstall:
   patch-package`. Добавить `pnpm-workspace.yaml` с `packages: ['apps/*',
   'libs/*']` и `.npmrc` (`node-linker=hoisted`). Удалить
   `package-lock.json`, закоммитить `pnpm-lock.yaml`.
2. **Workflows.** В `checks.yml`, `deploy.yml`, `release-desktop.yml`:
   `npm ci` → `pnpm install --frozen-lockfile`; `npx nx` → `pnpm nx`;
   `npm run desktop:test` → `pnpm run desktop:test`; шаг пина npm заменить
   на активацию pnpm через corepack; ключи кэша и `hashFiles` перевести на
   `pnpm-lock.yaml`. `npx --yes conventional-changelog-cli@5.0.0` оставить
   как есть (одноразовый запуск инструмента, не зависимость воркспейса).
3. **Docker.** `deploy/Dockerfile.{backend,router,landing}`: копировать
   `pnpm-lock.yaml`, `pnpm-workspace.yaml`, `.npmrc`; активировать pnpm
   через corepack; `pnpm install --frozen-lockfile`. Runtime-слой backend
   использует pruned `pnpm-lock.yaml` из Nx 24 (`prune-lockfile` уже
   умеет pnpm) и `pnpm install --frozen-lockfile --prod`.
   `tools/ci/prune-backend-manifest.mjs` переписать под pnpm lockfile
   (или удалить, если prune output уже самодостаточен — проверить на
   Docker smoke).
4. **Пolicy-тесты.** `workflow-policy.test.mjs`, `docker-policy.test.mjs`,
   `desktop-policy.test.mjs`, `deployment-build.test.mjs` обновить под
   pnpm-команды и `pnpm-lock.yaml`. Добавить инвариант: ни один workflow
   или Dockerfile не содержит `npm ci` / `npx nx`, `package-lock.json`
   отсутствует в репозитории.
5. **Desktop.** `apps/desktop/project.json` и `tauri.conf.json`:
   `npm run ...` → `pnpm run ...`; обновить ожидания в
   `desktop-policy.test.mjs`.
6. **Доки.** Обновить упоминания `npm ci` / `npx nx` / `npm install` в
   `AGENTS.md`, `README.md`, `deploy/README.md` и других найденных файлах.

## Verification

- `pnpm install --frozen-lockfile` (чистый install с пустым `node_modules`).
- `node --test tools/ci/*.test.mjs tools/release/*.test.mjs`.
- `pnpm nx run-many -t typecheck,lint,test,build`.
- `pnpm run desktop:test` и `pnpm nx run desktop:native-test` (где применимо).
- `docker compose -f compose.yaml -f deploy/compose.smoke.yaml build/up`
  (CI docker job) — проверка, что backend runtime устанавливается из
  pnpm-pruned lockfile.
- Error-кейс: намеренно изменить `package.json` без регенерации лока и
  убедиться, что `--frozen-lockfile` падает (ручной smoke, не в CI).

## Risks and mitigations

| Риск | Митигация |
| --- | --- |
| pnpm symlink-layout ломает patch-package / Tauri | `node-linker=hoisted` в `.npmrc`; проверить `postinstall` при чистом install |
| Nx prune для pnpm отличается от npm | Проверить сгенерированный `pnpm-lock.yaml`, прогнать Docker smoke |
| workflow-policy запрещает pnpm action | Использовать corepack — это не action, а часть Node |
| Потеря воспроизводимости из-за `npx --yes` | Оставить только для одноразового changelog-CLI, зафиксировать версию `5.0.0` |

## What is left to the builder

Определить при реализации, нужен ли `tools/ci/prune-backend-manifest.mjs`
после перехода на pnpm-pruned lockfile, и точный вид `.npmrc`. Остальное
полностью описано выше.
