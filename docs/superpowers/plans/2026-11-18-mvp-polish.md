# MVP Polish Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Закрыть Windows desktop, CI/сборки и prod-compose из `ROADMAP.md`, включая secure credentials, OIDC и encrypted attachments.

**Architecture:** Один утверждённый дизайн, пять отдельно проверяемых subsystem plans. Общий React/Matrix UI сохраняется; Tauri добавляет Rust capabilities и адаптеры. Релизы и HTTP-only deployment не меняют homeserver/MAS пользователя.

**Tech Stack:** Nx 24, npm 11.6.1, Node 24.11.0, React 19, Vite 8, Matrix SDK 41.9, Tauri 2, Rust/MSVC, GitHub Actions, Docker Compose, Caddy.

**Spec:** `docs/superpowers/specs/2026-11-18-mvp-polish-design.md` — одобрен целиком 2026-11-18.

## Global Constraints

- Только Windows 10/11 x64, `x86_64-pc-windows-msvc`, current-user NSIS `.exe`; callback `sewernet://oidc/callback`.
- Общий web UI, Matrix SDK напрямую к homeserver; `apps/web` без оформления, новые визуальные части через `libs/ui`, строки EN/RU Lingui.
- Desktop access/refresh tokens, OIDC claims и PKCE — Rust Windows credential blobs; не localStorage/plaintext и не silent fallback.
- Updater: Tauri Plugin, HTTPS, обязательная подпись, установка по согласию; endpoint `https://github.com/AshenHermit/SewerNet/releases/latest/download/latest.json`.
- Compose: Caddy HTTP-only; внешний TLS — существующий Nginx; backend приватный. Не менять чужой сервер и не добавлять публичный generic proxy.
- Issue → isolated feature branch → PR с обязательным review. Реальная default branch `master`; merge, ключи/защита repo и публикация требуют владельца.
- Ни `CREDENTIALS.md`, ни `.env`, signing keys, callback URLs/codes/tokens не попадают в Git, логи или artifacts.
- Установка workspace dependencies — командами npm, не обходами через tsconfig aliases. Nx targets изучать через `nx show project --json`; генераторы — через `nx-generate` при исполнении.

## Review Focus

1. Refresh завершился после logout/account switch: старый клиент не восстанавливает credentials — shared-platform Task 2.
2. Crash между chunks/index/pending commits: загрузка не показывает частичный аккаунт и не повторяет code grant — desktop Tasks 2–3.
3. Encrypted event появился раньше файла или с испорченным descriptor: UI не отдаёт plaintext/недоверенный HTML — shared-platform Tasks 3–4.
4. Tag содержит другую версию или draft потерял asset: updater manifest не публикуется — release Tasks 1–2.
5. Nginx передал неизвестный Host или пришёл `/api/matrix/*`: Caddy не отдаёт сервис/приватный backend — deployment Task 3.

---

## Планы и порядок

| Этап | План | Зависимости | Самостоятельный результат |
|---|---|---|---|
| 1 | [CI baseline](2026-11-18-mvp-ci.md) | Нет | Полный JS gate, explicit landing typecheck, безопасные CI artifacts |
| 2 | [Shared platform и attachments](2026-11-18-mvp-shared-platform.md) | CI | Browser работает с async persistence; encrypted send/receive и media hooks |
| 3 | [Windows desktop](2026-11-18-mvp-desktop.md) | Shared platform | NSIS, keyring, cold/warm OIDC, scoped media, tray и updater UI |
| 4 | [Desktop releases](2026-11-18-mvp-release.md) | CI + desktop | Проверяемая signed release pipeline и процедура A → B |
| 5 | [Production compose](2026-11-18-mvp-deployment.md) | CI; shared-platform для итоговой web-сборки | Образы и HTTP host-routing за внешним Nginx |

Deployment можно выполнять независимо от native storage после фиксации frontend build paths. Все планы читают spec и этот индекс; имена общих интерфейсов фиксирует shared-platform plan. Перед началом каждого этапа предыдущие зависимые этапы должны быть зелёными.

## Task 0: Подготовить управляемую ветку

**Files:** данный индекс, пять связанных планов и утверждённая спека; product files не менять.

**Interfaces:** Consumes — одобренный дизайн и выбранный пользователем режим исполнения. Produces — Issue URL, isolated branch/worktree и docs commit, доступные каждому исполнителю.

- [ ] Проверить `git status --short`, существующие Issues через `gh issue list --state open`; использовать подходящую Issue или создать одну про этот согласованный объём. Не включать секреты в issue body.
- [ ] Через `using-git-worktrees` создать `feat/mvp-polish` от текущей `feat/mvp-step-2`, сохранив её незакоммиченные пользовательские изменения. Перенести только эти design/plan files в новый worktree; установить workspace через `npm ci`. Не сбрасывать исходную ветку.
- [ ] Записать Issue URL и baseline-команды/результаты в `docs/superpowers/plans/2026-11-18-mvp-polish-evidence.md`; это рабочий журнал, не dump логов. Commit docs: `docs: plan MVP polish`.

## Финальный gate

- [ ] На актуальном HEAD выполнить `npx nx run-many -t typecheck,lint,test,build`; отдельно Windows-команды из desktop plan и compose smoke из deployment plan. Отмечать результаты с commit SHA, OS/tool versions, без секретов.
- [ ] Пройти packaged acceptance: OIDC `unredacted.org` warm/cold, restart/keyring, Matrix sync/E2EE/history, encrypted attachments SewerNet ↔ Element, logout и update A → B. Для login/2FA владельца запросить участие; не считать mock за реальную приёмку.
- [ ] Пройти внешний Nginx/DNS/TLS web callback smoke с владельцем. Не выполнять production deployment без отдельного запроса.
- [ ] Обновить `README.md`, `ARCHITECTURE.md`, `AGENTS.md` (только фактическое состояние), `ROADMAP.md` и evidence. Незавершённую native/update/deployment приёмку оставить blocker, соответствующие пункты ROADMAP не отмечать.
- [ ] Выполнить независимый whole-branch review через `requesting-code-review`, исправить подтверждённые findings и повторить затронутые проверки. PR связывает Issue, перечисляет blockers и evidence; обязательное одобрение core-разработчика. Автоматического merge нет.

## Self-review плана

- [x] Spec sections 4–7 → shared-platform/desktop; 8 → desktop/release; 9 → CI/release; 10 → deployment; 11 → automated gates и evidence.
- [x] Интерфейсы persistence, pending OIDC, media и updater определены в owning tasks; downstream plans ссылаются на них.
- [x] Review Focus закреплён конкретными tests, не только ручным checklist.
- [x] Owner-only действия и отсутствие Docker/ключей/packaged тестов не подменяются утверждением о готовности.

Статус: планы написаны и self-reviewed; ожидают проверки пользователя и выбора режима исполнения. Product implementation не начата.
