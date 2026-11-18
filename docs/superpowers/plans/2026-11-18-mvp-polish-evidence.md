# MVP Polish — Evidence

> Рабочий журнал проверок по индексу `2026-11-18-mvp-polish.md`. Только
> фактические результаты; без логов, секретов и выдуманных запусков.

**Ветка:** `feat/mvp-ci` (этап 1 — [CI baseline](2026-11-18-mvp-ci.md)).
**Проверенный HEAD:** `4d93003` `ci: add reusable workspace checks`.
**Baseline:** Windows 10/11 x64, Node 24.11.0, npm 11.6.1.
**Дата проверок:** 19.11.2026.

## Этап 1: CI baseline

| Проверка | Результат | Доказательство |
|---|---|---|
| Landing typecheck | PASS | commit `1ff3ad2`: Nx target `landing:typecheck` → `tsc --noEmit -p tsconfig.json` (cwd `apps/landing`); Next production build не требуется |
| Policy tests (`node --test "tools/ci/*.test.mjs"`) | 7/7 PASS | на выходном gate; после fix-волны final-review — 8/8 PASS (cache-проверка разделена и привязана к job) |
| `npm ci` с чистого lockfile | exit 0 | предупреждения audit/deprecation — pre-existing |
| Полный gate `npx nx run-many -t typecheck,lint,test,build` (`CI=true`) | exit 0, 25/25 targets | повтор с `--skip-nx-cache`: exit 0, 25/25 succeeded (27.8 s) |
| actionlint 1.7.12 на `ci.yml` и `checks.yml` | exit 0, без диагностики | официальный Windows amd64 release; SHA-256 ZIP сверен с `actionlint_1.7.12_checksums.txt` до распаковки: `6e7241b51e6817ea6a047693d8e6fed13b31819c9a0dd6c5a726e1592d22f6e9` |
| Action pins | сверены по тегам | `git ls-remote` официальных репозиториев (таблица ниже) |

### Action pins

| Action | Tag | Commit SHA |
|---|---|---|
| `actions/checkout` | `v6.1.0` | `d23441a48e516b6c34aea4fa41551a30e30af803` |
| `actions/setup-node` | `v6.5.0` | `249970729cb0ef3589644e2896645e5dc5ba9c38` |
| `actions/cache` | `v5.1.0` | `caa296126883cff596d87d8935842f9db880ef25` |
| `actions/upload-artifact` | `v6.0.0` | `b7c566a772e6b6bfb58ed0dc250532a479d7789f` |

### Политика workflow (что именно гарантируется)

- `ci.yml`: `pull_request`, push в `master`, `workflow_dispatch`; без
  `pull_request_target`, без secrets; `permissions: contents: read` (top-level и
  job-level).
- `checks.yml`: reusable `workflow_call`, единственный job `javascript` на
  `ubuntu-latest`; policy tests идут до полного gate.
- Artifacts: `apps/web/dist`, `apps/landing/.next` (без `.next/cache`,
  `include-hidden-files: true`), test-output только при failure.
- Cache roots ограничены `~/.npm/_cacache` и `.nx/cache`. `.nx/cache` содержит
  unsigned build outputs (landing `.next`, web `dist`), поэтому release
  workflows не должны его восстанавливать. Ни один job не кэширует и не
  публикует packaging/signing outputs (`src-tauri/target`, release bundles,
  инсталляторы, подписи).

## Не доказано (blockers)

- **Реальный зелёный GitHub-run отсутствует:** workflows ещё не выполнялись на
  GitHub; Linux-разрешимость vitest/jest/Nx впервые проверит настоящий запуск.
- Поэтому пункт `ROADMAP.md` «GitHub Actions CI (typecheck,lint,test,build) +
  сборки» остаётся неотмеченным до реального зелёного run **и** появления
  native (Windows) и Docker jobs из следующих планов.
- Desktop/Tauri, prod compose и release/signing пайплайны в этом этапе не
  реализованы.

## Воспроизведение

```bash
npm ci
node --test "tools/ci/*.test.mjs"
actionlint .github/workflows/ci.yml .github/workflows/checks.yml
```

```powershell
$env:CI='true'; npx nx run-many -t typecheck,lint,test,build
```
