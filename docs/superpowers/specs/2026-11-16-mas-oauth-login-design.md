# Design: MAS OAuth login (как в WizardChat) — SewerNet

Дата: 2026-11-16. Статус: на утверждение.

## Зачем
Вход через OAuth 2.0 Matrix Authentication Service (MSC2964/2965/2966) по образцу
app.wizardchat.org/welcome: экран «Продолжить с Matrix» → редирект на issuer
(для matrix.org — account.matrix.org) → логин/consent → возврат в клиент с
access+refresh токенами. Это официальный путь авторизации Element X / новых
homeserver'ов; парольный вход остаётся запасным (вариант A).

## Цели
- OAuth authorization code + PKCE S256 против любого MAS.
- Автоопределение MAS у homeserver'а; fallback на парольную форму.
- Обмен кода на токены через наш backend (stateless), access token сразу
  работает в существующем `/api/matrix/*` proxy.
- Refresh token grant (MSC2964 обязывает MAS выдавать refresh).

## Не-цели (позже)
- E2E-шифрование, device keys, crypto identity scope.
- Tauri-редиректы (desktop loopback), SSO-redirect для мобильных.
- Статическая регистрация клиента на MAS админом.

## Подходы
- A (выбран): OAuth-кнопка когда homeserver анонсирует MAS, парольная форма как запасной вариант.
- B (отклонён): OAuth-only — на homeserver'ах без MAS вход станет невозможен.

## Решения (как строим)
1. **Discovery** (frontend при сабмите homeserver):
   `GET {hs}/_matrix/client/v1/auth_metadata` → fallback `.well-known/matrix/client`
   поле `authentication` (type oauth/delegated, issuer) → нет ни того ни другого:
   только парольная форма. Метадата OIDC тянется c issuer'а backend'ом.
2. **PKCE/state на фронте**: `crypto.subtle` (S256), хранение в
   `sessionStorage` (`sewernet:oauth`): {homeserverUrl, issuer, clientId,
   redirectUri, state, codeVerifier}. `response_mode`: `query` для
   `http://localhost`, `fragment` для https redirect_uri (по MSC2964);
   callback читает и то и другое.
3. **Backend (stateless, новый модуль `oauth`)**:
   - `POST /api/matrix/oauth/register` — body: {issuer, redirectUri}.
     Backend строит метаданные клиента из Origin запроса (client_name
     SewerNet, client_uri = origin, redirect_uris=[redirectUri],
     token_endpoint_auth_method: none, grant_types: authorization_code +
     refresh_token, application_type: web), POST на registration_endpoint →
     возвращает client_id. Без кэша: регистрация заново на каждый флоу
     (рекомендация MSC2966; MAS дедуплицирует по хэшу метаданных).
   - `POST /api/matrix/oauth/token` — body: {issuer, clientId, redirectUri,
     code, codeVerifier, grantType?}. grantType `authorization_code` или
     `refresh_token` (+ refreshToken). x-www-form-urlencoded POST на
     token_endpoint → {access_token, refresh_token, expires_in}.
   - Ошибки MAS проксируются как есть (status + errcode/error).
4. **Scope**: `openid urn:matrix:client:api:* urn:matrix:org.matrix.msc2967.client:device:*`.
5. **Сессия**: расширяется AuthSession (+ refreshToken, expiresAt, issuer);
   после обмена backend'ом → frontend вызывает `whoami` (уже есть) для userId.
   401 при запросах → попытка refresh через backend → иначе logout.
6. **UI login screen**: поле homeserver → авто-discovery; если MAS — большая
   кнопка «Continue with Matrix» (redirect через `location.href` на
   authorization_endpoint) + ссылка «Create account» (prompt=create) +
   сворачиваемая парольная форма. Если MAS нет — сразу парольная форма.
7. **Callback**: маршрут `/callback` в web SPA; обмен через backend →
   сессия → редирект на `/`. Ошибки — экран ошибки с повтором.

## Осталось билдеру
- Тексты ошибок и их локализация (en/ru).
- Точная стилистика welcome-экрана (в рамках текущей темы --sn-*).

## Верификация
- `nx run-many -t typecheck,lint,test,build` зелёный.
- Backend-тесты: discovery fallback, регистрация (payload), обмен кода (payload, form-encoded).
- Ручной прогон: web + backend против matrix.org — редирект на
  account.matrix.org, consent, возврат, whoami, комнаты. Полный consent-клик
  делает пользователь со своим аккаунтом.
