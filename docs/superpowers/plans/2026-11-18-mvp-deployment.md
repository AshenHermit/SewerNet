# Production HTTP Routing and Compose Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Воспроизводимый prod-compose для private backend, static landing и web за HTTP-only Caddy и существующим TLS Nginx.

**Architecture:** Multi-stage Nx builds; Nest runtime с generated/pruned production manifest, landing static export в отдельном static server, router содержит web dist. Caddy обслуживает только два точных Host; никаких public API маршрутов/ACME. Default ingress loopback на хосте, альтернативно явно заданная container ingress network.

**Tech Stack:** Nx 24, Node 24.11.0/npm 11.6.1, Next 16 static export, Nest 11, Docker Compose v2, Caddy 2, Node tests + HTTP smoke.

**Spec:** `docs/superpowers/specs/2026-11-18-mvp-polish-design.md`, section 10–11; dependency — CI baseline, shared-platform для итогового web smoke.

## Global Constraints

- Caddy HTTP-only: `auto_https off`, без сертификатов/ACME/TLS volumes/443/HTTPS redirect. Внешний HTTPS — существующий root Nginx пользователя, его не редактировать.
- Host routes `${SITE_SUBDOMAIN}.${COMMON_DOMAIN}` и `${APP_SUBDOMAIN}.${COMMON_DOMAIN}`; examples `sewer-net`, `sewer-net-app`; default `127.0.0.1:${ROUTER_PORT}:80`.
- Backend без published port/host route, только private сервис :3000; private integrations VPN/SSH/network. Не объявлять текущие arbitrary upstream URL безопасными публично.
- `COMMON_DOMAIN`, `SITE_SUBDOMAIN`, `APP_SUBDOMAIN`, `ROUTER_PORT` в `.env.example`, без credentials/ACME/signing keys. Web external secure context нужен WebCrypto/SW/OIDC; updater остаётся HTTPS.
- Docker context исключает `.env*` кроме examples, CREDENTIALS, Git/node_modules/caches, signing keys, агентские файлы. Build/runtime dependencies pinned root lockfile, image tags + verified digests.

## Review Focus

1. Backend dist требует hidden dev/root node_modules — Tasks 1–2 проверяют isolated runtime.
2. Next prerender принят за export или потерян dev-log route — Task 1 проверяет `out`/route files.
3. Unknown Host или `/api/matrix/*` через app Host — Task 3 не проксирует backend.
4. Containerized Nginx получает доступ к backend напрямую — Task 3 ingress network только router.
5. HTTP-only internal routing приняли за HTTPS-capable browser deployment — Task 4 документирует TLS/Host/secure-context и реальные blockers.

---

### Task 1: Deployable landing export и stateless backend health/runtime

**Files:** Modify `apps/landing/next.config.js`, `apps/landing/package.json`, `apps/backend/webpack.config.js`, `apps/backend/package.json`, `apps/backend/src/main.ts`, `apps/backend/src/app/app.module.ts`; Create `apps/backend/src/app/health.controller.ts`, `.spec.ts`, `tools/ci/deployment-build.test.mjs`; Modify CI artifact policy.

**Interfaces:** `landing:build` → `apps/landing/out` через `output:'export'`; dev target остаётся Next dev, production `start` больше не притворяется Next server (`serve-static` target обслуживает export). `backend:prune` → `apps/backend/dist/{main.js,package.json,package-lock.json,workspace_modules?}`. `GET /api/health` → `200 { status: 'ok' }`, без homeserver/network/token; `HOST` default `0.0.0.0`, `PORT` default `3000`.

- [ ] Написать `landing_build_outputs_real_export`, `landing_cache_tracks_out`, `backend_generated_manifest_contains_runtime_only`, `health_is_unauthenticated_and_does_not_call_matrix`. Health controller unit/Nest test assert exact response; output tests проверяют build files/generated dependencies, не заставляют Node tests незаметно запускать повторную полную сборку.
  ```ts
  expect(await new HealthController().check()).toEqual({ status: 'ok' });
  expect(matrixRequest).not.toHaveBeenCalled();
  ```
- [ ] Выполнить backend health test и Node build policy после существующих builds. Expected: FAIL — health/export/runtime manifest absent.
- [ ] Реализовать landing export и согласовать resolved Nx output/serve targets (inspect `nx show project --json`, не считать `.next` export). Backend `generatePackageJson:true` + prune/copy workspace targets, standalone production deps по root lockfile; dev-only Nx ready-signal не тянет `nx`/typescript в production manifest (conditional compilation/production import exclusion). Runtime build не копирует весь dev node_modules. Bind HOST/PORT и зарегистрировать health controller без Matrix service calls.
- [ ] Выполнить `npx nx run-many -p backend,landing -t typecheck,lint,test,build`, `npx nx run backend:prune`, Node build tests. В чистом temp runtime directory `npm ci --omit=dev` из dist lockfile и Node main health smoke, без корневого node_modules. Проверить root/dev-log export routes; CI artifacts заменены на `out`.
- [ ] Commit: `feat: prepare deployable app outputs`.

### Task 2: Reproducible images и safe Docker context

**Files:** Create `.dockerignore`, `deploy/Dockerfile.backend`, `deploy/Dockerfile.landing`, `deploy/Dockerfile.router`, `deploy/Caddyfile.landing`, `tools/ci/docker-policy.test.mjs`.

**Interfaces:** Backend image runs `node main.js`, non-root, :3000, health через Node fetch `/api/health`; landing image Caddy static export :8080; router image Caddy :80 с `/srv/web` из Vite web build и будущим mounted routing config. Build args не содержат secrets; exact base image digests фиксируются после проверки официальных Node/Caddy images.

- [ ] Написать `context_excludes_credentials_env_keys_and_agents`, `runtime_has_no_dev_dependencies`, `backend_runs_nonroot_with_healthcheck`, `landing_and_router_copy_only_export_or_dist`. Для dockerignore match test fixture paths включают `CREDENTIALS.md`, `.env`, `.env.production`, `.git/`, `apps/desktop/src-tauri/target`, `*.key`, `*.pem`, signing temp overlay; `.env.example` разрешён.
  ```js
  for (const p of ['CREDENTIALS.md', '.env.production', '.git/config', 'signing.key']) assert.equal(inDockerContext(p), false);
  assert.equal(inDockerContext('.env.example'), true);
  assert.match(backendDockerfile, /USER node/);
  ```
  `inDockerContext` — тестовый evaluator dockerignore patterns, проверенный также curated COPY/image smoke.
- [ ] Выполнить Node policy test. Expected: FAIL — Dockerfiles/context rules отсутствуют.
- [ ] Реализовать multistage root npm ci/Nx builders с curated COPY и .dockerignore; отдельные final images без credentials/caches/dev node_modules. Backend pruned runtime install `npm ci --omit=dev`, `USER node`, HOST/PORT/health. Static landing Caddy HTTP `:8080`, `try_files {path} {path}.html {path}/index.html` для export routes (не SPA fallback). Router содержит только web build и Caddy runtime; signed desktop/agent dirs не нужны image build. По возможности runtime read-only + tmpfs через compose следующего task.
- [ ] Выполнить `docker build -f deploy/Dockerfile.backend -t sewernet-backend:test .`, аналогично landing/router. Запустить isolated backend container без env secrets; health 200 и no root/development dependencies. Записать image digests/состав allowlisted paths, не dump всего filesystem.
- [ ] Commit: `feat: build minimal production images`.

### Task 3: HTTP Host routing, compose и automated smoke

**Files:** Create `compose.yaml`, `.env.example`, `deploy/Caddyfile`, `deploy/compose.smoke.yaml`, `deploy/compose.ingress.yaml`, `deploy/smoke.mjs`, `tools/ci/compose-policy.test.mjs`; Modify `.github/workflows/checks.yml`.

**Interfaces:** Services `backend`, `landing`, `reverse-proxy`; router ports только loopback default, backend/landing `expose` без ports. Compose service network `services` private by exposure, backend egress для внешнего Matrix возможен (не `internal:true`, блокирующий нужный egress). Optional external `ingress` network только reverse-proxy, variable `INGRESS_NETWORK`; overlay удаляет host ports. Smoke command `node deploy/smoke.mjs --base-url http://127.0.0.1:8080 --domain example.test` использует Host headers; shared `docker` job calls compose build/up/smoke/down.

- [ ] Написать `router_is_http_only_no_acme_or_443`, `only_two_exact_host_routes`, `backend_has_no_public_ports_or_routes`, `ingress_attaches_only_router`, `smoke_overlay_needs_no_secrets`; assert resolved `docker compose config --format json` с synthetic env. HTTP smoke assertions: site `/` 200, app `/welcome`/`/oidc/callback` SPA 200, `/sw.js` JS/no-cache, discovered hashed JS и WASM правильный MIME/cache, unknown Host 404, `/api/matrix/*` никогда не backend JSON и app route отклонён 404, no redirect на HTTPS; backend health проверяется внутри compose через `docker compose exec -T backend node ...`.
  ```js
  assert.equal(compose.services.backend.ports, undefined);
  assert.deepEqual(Object.keys(compose.services.backend.networks), ['services']);
  assert.equal((await request('/', 'unknown.example.test')).status, 404);
  assert.equal((await request('/api/matrix/login', 'sewer-net-app.example.test')).status, 404);
  ```
  `request(path, host)` smoke fixture calls real Caddy через test base URL и Host header.
- [ ] Выполнить policy tests и compose config. Expected: FAIL — configs absent.
- [ ] Реализовать `auto_https off`, explicit `http://<site host>` и `http://<app host>` на :80; site reverse_proxy landing:8080, app file_server с SPA fallback и отдельным `/api/*` reject. Hashed `/assets/*` immutable; `/sw.js`, index/app shell no-cache; JS/WASM MIME; unknown Host explicit 404. Restart/healthchecks без Matrix login, no TLS volumes/80-443 outside owned mapping. Default loopback `127.0.0.1:${ROUTER_PORT:-8080}:80`; container-Nginx overlay через Compose `!reset` ports и explicitly external ingress (document compatible Compose version). Backend/landing только services net; proxy env opt-in без loading локального `.env` в backend env_file. Synthetic smoke domain/ports independent of user's server.
- [ ] Linux reusable Docker job read-only: config/build, `docker compose -f compose.yaml -f deploy/compose.smoke.yaml up -d --wait`, Node HTTP smoke, `down --volumes` в finally/always только для собственного uniquely named CI project. Locally те же commands; failures logs bounded и без user env. Expected: config/build/all HTTP assertions PASS; run negative unknown-host/API tests, не довольствоваться status homepage.
- [ ] Commit: `feat: route production services behind HTTP Caddy`.

### Task 4: Operator documentation и external acceptance

**Files:** Create `deploy/README.md`; Modify root README, ARCHITECTURE, ROADMAP, AGENTS factual status и общий evidence.

**Interfaces:** Consumes — tested compose/images/HTTP routes. Produces — две инструкции host-Nginx/container-Nginx, env/DNS/TLS/private integration/restart/update/health checks и blockers. Никаких изменений существующего Nginx автоматически.

- [ ] Добавить docs-policy `deployment_docs_distinguish_internal_http_and_external_tls`: assertions required variable names, loopback ingress и `proxy_set_header Host $host;` example, отсутствие инструкций ACME/host443 для compose; выполнить и подтвердить FAIL до docs.
  ```js
  assert.ok(readme.includes('proxy_set_header Host $host;'));
  assert.ok(readme.includes('127.0.0.1') && readme.includes('COMMON_DOMAIN'));
  assert.ok(readme.includes('HTTPS') && readme.includes('INGRESS_NETWORK'));
  ```
- [ ] Документировать copy `.env.example` и DNS site/app labels; root Nginx server blocks с существующим TLS setup и `proxy_pass http://127.0.0.1:<ROUTER_PORT>`, original Host/forwarded headers. Container alternative без host publication, named ingress только router. Backend access через private integration/VPN/SSH; публичная экспозиция — отдельная security задача. Внешний HTTPS обязателен browser SW/WebCrypto/OIDC, внутренний HTTP его не заменяет. Команды rebuild/restart/health/logs не удаляют чужие volumes.
- [ ] С владельцем external HTTPS/Host/Nginx smoke и web OIDC callback на app-subdomain; server changes/deploy только по отдельному разрешению. Если Docker/server недоступны — evidence blocker, compose roadmap не checked. Полный workspace + native + Docker CI должен быть зелёным перед PR.
- [ ] Commit: `docs: document private production deployment`; общий branch review — финальный gate индекса.
