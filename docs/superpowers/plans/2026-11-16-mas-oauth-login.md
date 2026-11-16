# MAS OAuth Login Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Вход через Matrix Authentication Service (OAuth 2.0 authorization code + PKCE) по образцу WizardChat, с парольным fallback.

**Architecture:** Frontend генерирует PKCE/state и ведёт браузер на authorization_endpoint; stateless NestJS проксирует динамическую регистрацию клиента и обмен/refresh токенов на token_endpoint; access token MAS используется в существующем `/api/matrix/*` proxy как обычный Bearer.

**Tech Stack:** существующий стек (React 19 + zustand + lingui, NestJS 11, global fetch, WebCrypto). Новых npm-зависимостей нет.

**Spec:** `docs/superpowers/specs/2026-11-16-mas-oauth-login-design.md`

## Global Constraints

- Backend stateless: никаких сессий/cookies; каждый запрос самодостаточен.
- Новых зависимостей не добавлять: только `global.fetch` и WebCrypto (`crypto.subtle`).
- Все строки UI — через `@lingui/react/macro` (`<Trans>` / `t``); после правок выполнять `npx nx run web:extract-i18n` и заполнять `apps/web/src/locales/ru.po`.
- issuer нормализуется с трейлинг-слэшем; OIDC-эндпоинты всегда берутся из `{issuer}/.well-known/openid-configuration` (не хардкодить пути).
- PKCE S256 только (MAS поддерживает); state — 32 случайных символа base64url.
- Verification gate каждого таска: `npx nx run-many -t typecheck,lint,test,build` (или по проектам) — зелёный.
- Conventional Commits; финальный `git status` чистый.

## Review Focus

1. Homeserver без схемы («matrix.org») → должен резолвиться через `.well-known` в `https://matrix-client.matrix.org`, discovery не падает. — Test: Task 3 (`resolveHomeserver`).
2. Homeserver без MAS → `discoverMasAuth` возвращает `null`, экран показывает парольную форму, OAuth-кнопки нет. — Test: Task 5.
3. Callback с `error` (отказ пользователя) или несовпадением `state` → экран ошибки, без краша и без петли. — Test: Task 4.
4. 401 в сессии с refresh token → один прозрачный refresh + один retry; неудача refresh → logout, без бесконечного цикла. — Test: Task 3.
5. Callback во fragment-режиме (https, `#code=...`) парсится так же, как query. — Test: Task 4 (`parseCallbackParams`).

---

### Task 1: Backend — OAuth модуль (discover/register/token)

**Files:**
- Modify: `libs/types/src/lib/matrix.ts`, `libs/types/src/index.ts`
- Create: `apps/backend/src/app/oauth/oauth.service.ts`, `oauth.controller.ts`, `oauth.module.ts`
- Modify: `apps/backend/src/app/app.module.ts` (import OauthModule)
- Test: `apps/backend/src/app/oauth/oauth.service.spec.ts`

**Interfaces:**
- Produces (libs/types): `MasOidcMetadata {issuer; authorizationEndpoint; tokenEndpoint; registrationEndpoint; responseModesSupported: string[]; promptValuesSupported?: string[]}`, `OauthDiscoverRequest {issuer}`, `OauthRegisterRequest {issuer; redirectUri}`, `OauthRegisterResponse {clientId}`, `OauthTokenRequest {issuer; clientId; redirectUri?; code?; codeVerifier?; grantType: 'authorization_code' | 'refresh_token'; refreshToken?}`, `OauthTokenResponse {accessToken; refreshToken?; expiresIn?; scope?}`
- Produces (HTTP): `POST /api/matrix/oauth/discover|register|token` — тела = Request DTO, ответы = Response DTO.
- Consumes: паттерн `MatrixService` (fetch + `HttpException(payload, status)`).

- [ ] **Step 1: failing spec** `oauth.service.spec.ts` (паттерн `matrix.service.spec.ts` — мок `global.fetch`):
  - `discover('https://account.matrix.org/')` → GET `{issuer}/.well-known/openid-configuration` → маппинг в camelCase `MasOidcMetadata`;
  - `register` POST на registrationEndpoint с телом: `client_name: 'SewerNet'`, `client_uri` = origin redirectUri, `redirect_uris: [redirectUri]`, `response_types: ['code']`, `grant_types: ['authorization_code','refresh_token']`, `token_endpoint_auth_method: 'none'`, `application_type: 'web'` → возвращает `{clientId}` из ответа;
  - `token` authorization_code: form-encoded (`application/x-www-form-urlencoded`) c `grant_type`, `code`, `redirect_uri`, `client_id`, `code_verifier`;
  - `token` refresh_token: только `grant_type`, `refresh_token`, `client_id` (redirect_uri и code отсутствуют);
  - ответ MAS !ok → `HttpException` c upstream статусом.
- [ ] **Step 2:** `npx nx run backend:test` → FAIL (модуль не существует).
- [ ] **Step 3:** реализовать `OauthService` (`discoverOidc(issuer)`, `register(...)`, `token(...)` — приватный `oidcMetadata(issuer)` c кэшем на время вызова не нужен), `OauthController` (`@Controller('matrix/oauth')`, три POST-роута), `OauthModule`, импорт в `app.module.ts`. Клиентские метаданные строятся из `redirectUri` (`new URL(redirectUri).origin`), Origin-заголовок не используется.
- [ ] **Step 4:** `npx nx run-many -t test,typecheck,lint --projects=backend,types` → PASS.
- [ ] **Step 5:** `git add ...; git commit -m "feat(backend): MAS OAuth discover/register/token endpoints"`

### Task 2: Web — PKCE/authorization-url утилита

**Files:**
- Create: `apps/web/src/lib/oauth-pkce.ts`
- Test: `apps/web/src/lib/oauth-pkce.spec.ts`

**Interfaces:**
- Produces:
  - `generateState(): string`, `generateCodeVerifier(): string` (32 байта → base64url, длина ≥ 43),
  - `codeChallengeS256(verifier: string): Promise<string>` (base64url(sha256(verifier)) без паддинга),
  - `buildAuthorizationUrl(metadata: {authorization_endpoint: string}, opts: {clientId; redirectUri; state; codeChallenge; prompt?: 'create'}): string` — параметры: `response_type=code`, `client_id`, `redirect_uri`, `scope='openid urn:matrix:client:api:* urn:matrix:org.matrix.msc2967.client:device:*'`, `state`, `code_challenge`, `code_challenge_method=S256`, `response_mode` = `query` если redirectUri — `http://localhost*`/`http://127.0.0.1*`, иначе `fragment`; `prompt` добавляется только если задан;
  - `parseCallbackParams(search: string, hash: string): {code?; state?; error?; errorDescription?}` — hash приоритетнее search;
  - pending-state хранилище: `savePendingOAuth(s: OAuthSessionState)`, `getPendingOAuth(): OAuthSessionState | null`, `clearPendingOAuth()` — sessionStorage ключ `'sewernet:oauth'`; `OAuthSessionState {homeserverUrl; issuer; clientId; redirectUri; state; codeVerifier; prompt?}`.

- [ ] **Step 1:** failing spec:
  - challenge совпадает с независимо посчитанным base64url(sha256) через `node:crypto`;
  - verifier длина ≥ 43, уникален между вызовами; state длина ≥ 16;
  - `buildAuthorizationUrl` содержит все параметры; для `http://localhost:4200/callback` → `response_mode=query`, для `https://app.example/callback` → `fragment`; `prompt=create` попадает в URL только при передаче;
  - `parseCallbackParams('?code=a&state=s', '#code=b&state=t')` → b/t (hash выигрывает); `?error=access_denied` → error заполнен.
- [ ] **Step 2:** `npx nx run web:test` → FAIL.
- [ ] **Step 3:** реализовать (base64url через `btoa`/манипуляцию байтами; `crypto.getRandomValues`).
- [ ] **Step 4:** `npx nx run web:test` → PASS; commit `feat(web): PKCE helpers for MAS OAuth`.

### Task 3: Web — matrix-client: discovery, register/exchange/refresh, авто-refresh на 401

**Files:**
- Modify: `apps/web/src/lib/matrix-client.ts`
- Test: `apps/web/src/lib/matrix-client.spec.ts` (новый)

**Interfaces:**
- Consumes: Task 1 HTTP-роуты, `MasOidcMetadata`/`OauthTokenResponse` из libs/types, существующий `request()`/`MatrixApiError`.
- Produces:
  - `AuthSession` + поля `issuer?: string; clientId?: string; refreshToken?: string; expiresAt?: number`;
  - `normalizeHomeserver(input: string): Promise<string>` (добавить схему → `.well-known/matrix/client` → `m.homeserver.base_url` при наличии);
  - `discoverMasAuth(homeserverUrl: string): Promise<MasAuthMetadata | null>` — `GET {hs}/_matrix/client/v1/auth_metadata` (прямая запись homeserver, CORS открыт у Matrix) → при неудаче `.well-known` → `authentication.issuer` (type oauth/delegated) → OIDC discovery через `matrixClient.discoverOauth(issuer)` → иначе `null`;
  - `matrixClient.registerOauthClient(issuer: string, redirectUri: string): Promise<string>`;
  - `matrixClient.exchangeOauthCode(req): Promise<OauthTokenResponse>`;
  - `matrixClient.refreshOauthToken(session: AuthSession): Promise<AuthSession>` (обновляет accessToken/refreshToken/expiresAt, persist через `useAuthStore.getState().setSession`);
  - `request(...)`: при 401, если у session есть `refreshToken` и это ещё не retry → refresh один раз → повтор запроса; неудача refresh → throw исходной ошибки.

- [ ] **Step 1:** failing spec (мок `global.fetch`):
  - `normalizeHomeserver('matrix.org')` → `https://matrix-client.matrix.org` (well-known замокан);
  - `discoverMasAuth` на 404 auth_metadata + well-known с issuer → метадата через backend discover; на 404 и без issuer → `null`;
  - авто-refresh: первый fetch 401 → вызван `POST /api/matrix/oauth/token` (grant refresh_token, только issuer/clientId/refreshToken в теле) → retry исходного запроса с новым токеном → результат; второй последовательный 401-после-refresh → без второй попытки refresh (retry-флаг).
- [ ] **Step 2:** `npx nx run web:test` → FAIL.
- [ ] **Step 3:** реализовать; `expiresAt = Date.now() + expires_in*1000`; whoami после обмена остаётся в Task 4.
- [ ] **Step 4:** `npx nx run web:test` → PASS; commit `feat(web): MAS discovery, client registration and token refresh in matrix-client`.

### Task 4: Web — /callback экран и маршрут

**Files:**
- Create: `apps/web/src/app/screens/callback-screen.tsx`
- Modify: `apps/web/src/app/app.tsx` (Route `/callback`)
- Test: `apps/web/src/app/screens/callback-screen.spec.tsx`

**Interfaces:**
- Consumes: `parseCallbackParams`, `getPendingOAuth`/`clearPendingOAuth`, `exchangeOauthCode`, `refreshOauthToken`-free flow, `whoami`, `useAuthStore.setSession`, `MasAuthMetadata` в pending-хранилище? — нет: в pending только `OAuthSessionState`; homeserverUrl уже резолвнутый.
- Produces: экран, который при успехе делает `setSession({homeserverUrl, accessToken, userId (из whoami), issuer, clientId, refreshToken, expiresAt})` и `<Navigate to="/" replace/>`; при ошибке — сообщение + ссылка на `/`.

- [ ] **Step 1:** failing spec:
  - `state` из URL ≠ `pending.state` → рендер ошибки, сетевой вызов token НЕ делался;
  - `error=access_denied` → текст ошибки, без вызовов;
  - успех (замоканы fetch: token → whoami) → `setSession` вызван с userId из whoami, redirect на `/`.
- [ ] **Step 2:** `npx nx run web:test` → FAIL.
- [ ] **Step 3:** реализовать `CallbackScreen` (использовать `useNavigate`; router уже BrowserRouter в `main.tsx`); Route в `app.tsx`.
- [ ] **Step 4:** `npx nx run web:test` → PASS; commit `feat(web): OAuth callback screen`.

### Task 5: Web — welcome-логин: discovery, кнопки OAuth, парольный fallback; локали

**Files:**
- Modify: `apps/web/src/app/screens/login-screen.tsx`
- Modify: `apps/web/src/locales/en.po`, `apps/web/src/locales/ru.po`
- Test: `apps/web/src/app/screens/login-screen.spec.tsx` (новый)

**Interfaces:**
- Consumes: `normalizeHomeserver`, `discoverMasAuth`, `generateState`/`generateCodeVerifier`/`codeChallengeS256`/`buildAuthorizationUrl`, `savePendingOAuth`, `registerOauthClient`, `matrixClient.login` (существующая парольная форма — сохранить как есть).
- Produces: submit OAuth: `redirectUri = window.location.origin + '/callback'` → PKCE → `registerOauthClient` → `savePendingOAuth({homeserverUrl (резолвнутый), issuer, clientId, redirectUri, state, codeVerifier, prompt?})` → `window.location.href = buildAuthorizationUrl(...)`.

- [ ] **Step 1:** failing spec (мок `matrixClient`/`oauth-pkce` через `vi.mock`):
  - MAS определён → видны «Continue with Matrix» и «Create account», парольная форма скрыта за переключателем;
  - `discoverMasAuth → null` → OAuth-кнопок нет, парольная форма видна (Review Focus #2);
  - клик OAuth → редирект (`location.href` замокан) на URL, начинающийся с `authorization_endpoint`, pending сохранён.
- [ ] **Step 2:** `npx nx run web:test` → FAIL.
- [ ] **Step 3:** реализовать: поле homeserver (значение по умолчанию `https://matrix.org`), discovery on blur/on mount; кнопки; парольная форма в `<details>`; ошибки отображаются.
- [ ] **Step 4:** `npx nx run web:extract-i18n`; перевести новые ключи в `ru.po`; `npx nx run web:test` → PASS; commit `feat(web): MAS OAuth login screen with password fallback (EN/RU)`.

### Task 6: Документация и финальная верификация

**Files:**
- Modify: `README.md`, `ARCHITECTURE.md`, `ROADMAP.md` (короткие правки: раздел Авторизация, поток OAuth, MVP-чеклист)

- [ ] **Step 1:** правки доков по факту реализации.
- [ ] **Step 2:** `npx nx run-many -t typecheck,lint,test,build` → 8/8 зелёные; `npx nx run ui:build-storybook` не требуется (UI libs не менялись).
- [ ] **Step 3:** `git add -A; git commit -m "docs: MAS OAuth login in architecture/roadmap/readme"`.
- [ ] **Step 4 (ручной прогон с пользователем):** `npx nx serve backend` + `npx nx serve web` → login на `http://localhost:4200`, homeserver matrix.org → «Continue with Matrix» → account.matrix.org login/consent → возврат на `/callback` → список комнат. Пользователь вводит свои креды на странице MAS.

## Self-Review

- Spec coverage: discovery+fallback (T1/T3), регистрация из redirectUri (T1), PKCE/state/response_mode (T2), обмен+refresh+сессия (T3), callback dual-mode+ошибки (T4), welcome-UI+пароль-fallback+локали (T5), доки+ручная верификация (T6) — покрыто.
- Type consistency: `OAuthSessionState`/`AuthSession`/`MasOidcMetadata`/`OauthTokenRequest` поля совпадают между тасками (`grantType` литералы, `redirectUri` camelCase).
- Review Focus: все 5 строк имеют тесты в своих тасках (T3, T5, T4, T3, T4).
- Пропорция: план ~ halves spec по объёму; тела только для нетривиальных алгоритмов (base64url, retry-once).
