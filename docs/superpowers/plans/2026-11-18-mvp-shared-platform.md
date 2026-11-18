# Shared Platform and Encrypted Attachments Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Сохранить browser-клиент при переходе на durable async persistence и добавить стандартные encrypted attachments/send/receive, пригодные для Tauri.

**Architecture:** Memory account repository — единственный источник синхронных чтений; platform persistence выполняет awaited writes. Matrix/session orchestration не принадлежит zustand persist. Attachment crypto, validated media transport и визуальный renderer разделены; SDK/секреты не переходят в `libs/ui`.

**Tech Stack:** TypeScript, React 19, zustand, Matrix SDK 41.9, WebCrypto AES-CTR/SHA-256, Vitest/jsdom, Lingui, proxy UI.

**Spec:** `docs/superpowers/specs/2026-11-18-mvp-polish-design.md`, sections 4–7, 11; dependency — CI plan.

## Global Constraints

- Browser keys сохраняются: `sewernet_accounts`, `sewernet_active_account`; legacy `sewernet:auth` очищается после выбора платформы. Desktop storage failure никогда не вызывает browser fallback.
- Snapshot/UI меняется после durable commit; async initialize/upsert/remove/setActive/clear, writes сериализованы и awaited, никаких fire-and-forget credentials.
- AES-256-CTR encrypted attachments v2; fresh key/IV, SHA-256 ciphertext до decrypt, ключ/filename/MIME только внутри Megolm event. Plaintext fallback в encrypted room запрещён.
- `apps/web` только логика/данные; markup/styles в `libs/ui`, EN/RU Lingui; Matrix напрямую к homeserver. SW только browser.
- Branch/test/review/evidence правила — общий индекс. Не модернизировать весь UI/Markdown заодно.

## Review Focus

1. Поздний refresh после logout/смены устройства — Task 2 запрещает resurrection.
2. Keyring write/read fail и повтор bootstrap — Tasks 1–2 сохраняют error, не пустой аккаунт/fallback.
3. Crypto отключён, но room state зашифрован — Task 3 отказывает, не отправляет plaintext.
4. Descriptor/HTML MIME из недоверенного event — Tasks 3, 5 отказывают decrypt/active preview.
5. Account switch во время media fetch — Task 4 отменяет запрос и не публикует blob старого аккаунта.

---

### Task 1: Platform contract и async account repository

**Files:** Modify root `package-lock.json` и web `package.json` для official Tauri API dependency; Create `apps/web/src/client/account-types.ts`, `apps/web/src/platform/contracts.ts`, `apps/web/src/platform/browser.ts`, `apps/web/src/platform/runtime.ts`, `apps/web/src/platform/runtime.spec.ts`; Modify `apps/web/src/client/accounts.ts`, `accounts.spec.ts`.

**Interfaces:**
- `account-types.ts`: перенести существующие `MatrixCredentials`, `OidcSession`; `accounts.ts` re-export для совместимости. `AccountSnapshot = { accounts: Record<string, MatrixCredentials>; activeUserId: string | null; blockedAccounts: Record<string, { deviceId: string; reason: 'refresh' | 'delete' }> }` (legacy load defaults blockedAccounts to `{}`).
- `AccountPersistence`: `load(): Promise<AccountSnapshot>`, `upsertAccount(c: MatrixCredentials): Promise<void>`, `beginOperation(userId: string, deviceId: string, reason: 'refresh' | 'delete'): Promise<void>`, `removeAccount(userId: string): Promise<void>`, `setActiveAccount(userId: string | null): Promise<void>`, `clear(): Promise<void>`, `flush(): Promise<void>`. Upsert нового аккаунта/токенов очищает его barrier только после credential commit.
- `accounts.ts`: `initializeAccounts(storage: AccountPersistence): Promise<void>`; прежние getters sync только из initialized memory (blocked active не autoresume); прежние mutations теперь `Promise<void>`; `subscribeAccounts(listener: () => void): () => void`, `flushAccounts(): Promise<void>`, `saveAndActivateAccount(c: MatrixCredentials): Promise<void>`, `beginAccountOperation(userId: string, deviceId: string, reason: 'refresh' | 'delete'): Promise<void>`. Последняя пишет durable barrier, но не прерывает текущий UI успешной ротации.
- `runtime.ts`: `initializePlatform(): Promise<void>`, `getPlatformKind(): 'browser' | 'desktop'`; использовать официальную `isTauri()` и lazy import native modules. Adapter install API `setAccountPersistence(storage: AccountPersistence): void` доступен bootstrap, не localStorage flags.

- [ ] Написать `uninitialized_reads_are_rejected`, `write_commits_before_snapshot_notification`, `failed_write_keeps_previous_snapshot`, `ordered_writes_and_flush`, `browser_retains_existing_keys`, `native_detection_never_loads_browser_credentials`. Deferred fake persistence явно записывает calls и позволяет resolve/reject каждой операции; assert до resolve getter старый, после — новый; fake native runtime read failure остаётся error.
  ```ts
  const saving = upsertAccount(nextCredentials); // deferred persistence fixture
  expect(getAccount(nextCredentials.userId)).toEqual(previousCredentials);
  deferredWrite.resolve();
  await saving;
  expect(getAccount(nextCredentials.userId)).toEqual(nextCredentials);
  ```
- [ ] Выполнить `npx vitest run src/client/accounts.spec.ts src/platform/runtime.spec.ts` с cwd `apps/web`. Expected: FAIL на новых async/initialize semantics.
- [ ] npm workspace-командой добавить совместимый `@tauri-apps/api` для official `isTauri()` detection (без native imports в browser runtime). Реализовать контракт, guarded memory snapshot и сериализованный mutation queue. Browser load валидирует JSON, не сбрасывает malformed credentials незаметно. Active id может ссылаться только на committed account. Browser writes обрабатывают quota/security errors. На данном этапе обнаруженный native runtime без adapter сообщает «desktop adapter unavailable», не fallback; desktop Task 4 подключает реализацию.
- [ ] Выполнить focused specs и `npx nx run-many -p web -t typecheck,lint,test,build`. Expected: PASS после адаптации существующих accounts fixtures к async initialization.
- [ ] Commit: `refactor: add async account persistence`.

### Task 2: Bootstrap, login, refresh и logout через один durable путь

**Files:** Create `apps/web/src/client/session.ts`, `apps/web/src/client/session.spec.ts`, `apps/web/src/platform/bootstrap.ts`, `bootstrap.spec.ts`, `apps/web/src/app/components/bootstrap-status.tsx`; Modify `main.tsx`, `app/app.tsx`, `app/stores/auth-store.ts`, `auth-store.spec.ts`, `client/init-matrix.ts`, `init-matrix.spec.ts`, `app/features/auth/oidc.ts`, `oidc.spec.ts`, `app/features/auth/require-auth.tsx`, `app/screens/{chat-screen,oidc-callback-screen}.tsx` и их specs; locales `.po`.

**Interfaces:**
- `bootstrapSession(): Promise<void>` выбирает platform, устанавливает desktop callback queue/listener (desktop Task 4), loads accounts, затем hydrates auth. Ошибка допускает явный retry, но не resume.
- Auth store memory-only: `credentials`, `status: 'loading' | 'ready' | 'storage-error'`, `error: string | null`; `hydrateAuthStore(): void` читает initialized snapshot и подписывается. Удалить credential persist и публичный `setCredentials`-write путь.
- `session.ts`: `getSessionEpoch(userId: string): number` для guarded writes/media; `commitLogin(c: MatrixCredentials): Promise<void>` через `saveAndActivateAccount`; `stopAccountSession(userId: string): void` в init-matrix останавливает и исключает клиент без удаления; `quarantineAccount(userId: string, reason: 'refresh-save' | 'delete-failed'): void` немедленно блокирует живую сессию/показывает безопасную ошибку; `logoutAccount(userId: string): Promise<void>` ожидает remove/pending cleanup. `logoutCurrent(): Promise<void>` сохраняется как session facade.
- До network refresh ожидается `beginAccountOperation(..., 'refresh')`; если barrier не записан, token endpoint не вызывается. Crash или failed rotated-token commit оставляет blocked record для предупреждения/new login на restart. Browser barrier key `sewernet_blocked_accounts_v1` содержит только userId/deviceId/reason (несекретные metadata); desktop — часть credential record, не JS localStorage. Successful fresh login/upsert/remove очищает barrier после commit; stale epoch не может его снять.

- [ ] Написать `bootstrap_never_resumes_before_load`, `bootstrap_failure_has_retry_no_fallback`, `login_writes_once_before_auth_publish`, `rotation_barrier_precedes_network_and_blocks_crash_resume`, `barrier_failure_never_calls_token_endpoint`, `rotated_refresh_waits_for_commit`, `failed_rotation_stops_and_blocks_restart`, `late_refresh_after_logout_or_new_device_cannot_resurrect`, `logout_without_client_still_removes_credentials`, `delete_failure_is_visible`, `token_update_does_not_restart_crypto_sync`. Fake client + deferred persistence, assert no UI/return tokens до commit, stopped client/no subsequent upsert при obsolete session epoch.
  ```ts
  await expect(refreshWithFailingBarrier()).rejects.toThrow();
  expect(tokenEndpoint).not.toHaveBeenCalled();
  expect(snapshotAfterSimulatedRotationCrash.blockedAccounts[userId].reason).toBe('refresh');
  expect(resumeAfterRestart).not.toHaveBeenCalled();
  ```
  `refreshWithFailingBarrier` — fixture вызывающая реальный SDK tokenRefreshFunction с rejecting beginOperation; restart fixture loads persisted snapshot, не reuse memory.
- [ ] Выполнить `npx vitest run src/client/session.spec.ts src/platform/bootstrap.spec.ts src/client/init-matrix.spec.ts src/app/stores/auth-store.spec.ts` (cwd `apps/web`). Expected: FAIL на старом persist/неожидаемом refresh.
- [ ] Реализовать bootstrap status через existing `ProxyStatusPanel` и retry, без import-time storage reads. Password/OIDC вызывают `commitLogin` ровно один раз. Token refresh захватывает session epoch/userId/deviceId, ожидает durable operation barrier до network request, проверяет epoch перед commit и возвращает tokens только после сохранения; queue invalidation не позволяет late write после tombstone. Если refresh network result неопределён, barrier сохраняется и требуется новый login, не replay старого rotating token. Quarantine останавливает affected SDK, media cleanup, оставляет warning на restart. Logout сначала убирает живой UI/client из доступа, затем awaited local deletion и network revocation/logout best-effort; clear failure не называется успехом. SW posting routed только browser, не ждёт неподдерживаемый desktop SW.
- [ ] Выполнить полный web gate и extraction `npx nx run web:extract-i18n`; заполнить новые RU/EN strings и повторить тесты. Remove старые auth duplicate writes во всех найденных callers; existing responsive/architecture tests остаются зелёными, touched RequireAuth не добавляет styling attrs.
- [ ] Commit: `refactor: await durable session changes`.

### Task 3: Matrix v2 crypto и encrypted upload

**Files:** Create `apps/web/src/lib/attachment-crypto.ts`, `attachment-crypto.spec.ts`, `apps/web/tests/fixtures/encrypted-attachment-v2.json`; Modify `app/hooks/use-timeline.ts`, `use-timeline.spec.ts`.

**Interfaces:** `MatrixEncryptedFile = { v: 'v2'; url: string; key: JsonWebKey; iv: string; hashes: { sha256: string } }`; `encryptAttachment(bytes: ArrayBuffer): Promise<{ ciphertext: ArrayBuffer; descriptor: Omit<MatrixEncryptedFile, 'url'> }>`; `decryptAttachment(ciphertext: ArrayBuffer, descriptor: MatrixEncryptedFile): Promise<ArrayBuffer>`. Existing `sendMessageFile(roomId, file, onProgress?): Promise<void>` signature unchanged.

- [ ] Написать `v2_known_vector_roundtrip` против независимо полученного Matrix-compatible fixture; `fresh_key_and_iv_per_file`; `tampered_ciphertext_rejected_before_decrypt`; `invalid_v_key_iv_hash_rejected`; `encrypted_room_uploads_ciphertext_without_original_metadata`; `crypto_failure_never_uploads_plaintext`; `encrypted_room_without_crypto_fails`; `unencrypted_file_is_unchanged`. Assertions: `v==='v2'`, JWK `kty:'oct', alg:'A256CTR', ext:true, key_ops:['encrypt','decrypt']`, 32-byte key; 16-byte IV с zero low 64 bits; ciphertext не равен исходнику; uploaded `type==='application/octet-stream'`, filename omitted; encrypted content имеет `file`, не `url`, и filename/MIME только в content. SDK `sendMessage` stub проверяет descriptor, не подменяет настоящий Megolm smoke.
  ```ts
  const encrypted = await encryptAttachment(plaintext);
  expect(encrypted.ciphertext).not.toEqual(plaintext);
  expect(await decryptAttachment(encrypted.ciphertext, { ...encrypted.descriptor, url: 'mxc://example.test/file' })).toEqual(plaintext);
  await expect(decryptAttachment(tamper(encrypted.ciphertext), { ...encrypted.descriptor, url: 'mxc://example.test/file' })).rejects.toThrow();
  ```
  Fixture `tamper` меняет один ciphertext byte; plaintext — synthetic nonempty ArrayBuffer.
- [ ] Выполнить `npx vitest run src/lib/attachment-crypto.spec.ts src/app/hooks/use-timeline.spec.ts` (cwd `apps/web`). Expected: FAIL — текущая загрузка plaintext и crypto module отсутствует.
- [ ] Реализовать WebCrypto AES-CTR с `length:64`, fresh 256-bit key и случайными high64 IV; Matrix base64url для key, unpadded base64 для iv/hash. Validate bounded descriptor и hash до AES decrypt. Room `m.room.encryption`/SDK encryption state проверять fail-closed перед upload, включая missing crypto/unknown room; проверить состояние ещё перед send, если room включила encryption во время unencrypted upload — не отправлять plaintext reference, повтор требует encrypted upload. Не генерировать thumbnails в MVP. Upload ciphertext как Blob без исходного имени, затем обычный SDK sendMessage encrypted room.
- [ ] Выполнить focused crypto/send tests и web gate. Empty/binary files тоже roundtrip; progress upload сохраняет 0..1. Fixture содержит только synthetic bytes/key, не реальные user data.
- [ ] Commit: `fix: encrypt Matrix attachment contents`.

### Task 4: Scoped media resolver и blob lifecycle

**Files:** Create `apps/web/src/lib/media-resolver.ts`, `media-resolver.spec.ts`, `apps/web/src/app/hooks/use-media.ts`, `use-media.spec.tsx`; Modify `platform/contracts.ts`, `platform/browser.ts`, `lib/media-url.ts`, `lib/sw-session.ts`, `lib/sw-session.spec.ts`, `app/components/{room-list,chat-view}.tsx` и specs.

**Interfaces:** `MediaSession = { userId: string; deviceId: string; baseUrl: string; accessToken: string; epoch: number }`; `MediaSource = { mxc: string; size?: number; encryptedFile?: MatrixEncryptedFile }`; `MediaTransport.fetchBlob(url: string, session: MediaSession, signal: AbortSignal): Promise<Blob>`. Runtime owns `setMediaTransport(transport: MediaTransport): void`; `getMediaSession(): MediaSession | null` из committed active account + Task 2 epoch. `validateMatrixMediaUrl(url: string, baseUrl: string): URL` разрешает только активный HTTPS origin/base path и Matrix authenticated download/thumbnail paths, запрещает userinfo/fragment/traversal. `acquireMedia(source: MediaSource, signal?: AbortSignal): Promise<{ url: string; release(): void }>`; `clearMediaCache(): void`; `useMedia(source: MediaSource | null): { url?: string; loading: boolean; error?: string }`.

- [ ] Написать `bearer_never_crosses_origin_path_or_redirect`, `refreshed_token_used_for_new_request`, `account_switch_during_fetch_discards_blob`, `last_release_and_logout_revoke_urls`, `encrypted_source_uses_download_not_thumbnail`, `unsupported_sw_does_not_hang`. Cache tests use fake URLs/fetch; request identity includes user/device/epoch+descriptor, no secrets in cache key/logs; deferred account-A response after account-B switch never reaches hook state.
  ```ts
  expect(() => validateMatrixMediaUrl('https://evil.test/_matrix/client/v1/media/download/a/b', 'https://home.test')).toThrow();
  const lease = await acquireMedia({ mxc: 'mxc://home.test/synthetic' });
  lease.release();
  expect(URL.revokeObjectURL).toHaveBeenCalledWith(lease.url);
  ```
- [ ] Выполнить `npx vitest run src/lib/media-resolver.spec.ts src/app/hooks/use-media.spec.tsx src/lib/sw-session.spec.ts` (cwd `apps/web`). Expected: FAIL — async resolver/cleanup отсутствуют.
- [ ] Реализовать scoped transport: browser SW avatars сохраняются, attachments download/decrypt проходят общий resolver. `redirect:'error'`, url/base path validation до bearer; browser SW регистрируется только browser и ready не ждёт бесконечно отсутствующую registration. Bounded cache: максимум 32 entries/64 MiB retained blobs, LRU только unreferenced; last release удаляет blob, active requests aborted на account switch/logout. Большой файл может обрабатываться вне retained cache, но лимиты/ошибка памяти явные. Раздельный RoomList entry controller владеет avatar hook; hooks не вызывать в map условно. Native transport поставляет desktop Task 5.
- [ ] Выполнить media + SW regression + web gate. Object URLs revoked на unmount, account change и logout, encrypted hash fail не создаёт plaintext URL.
- [ ] Commit: `feat: resolve scoped authenticated media`.

### Task 5: Полученные attachments через proxy UI

**Files:** Create `apps/web/src/app/components/message-attachment.tsx`, `message-attachment.spec.tsx`, `libs/ui/src/lib/proxy/proxy-message-attachment.tsx`, `libs/ui/src/lib/kits/shadcn/message-attachment.tsx`, `.spec.tsx`, `.stories.tsx`; Modify `app/hooks/use-timeline.ts`, `app/components/chat-view.tsx`/specs, `libs/ui/src/lib/ui-kit.ts`, `lib/proxy/index.ts`, `lib/kits/shadcn/index.ts`, `lib/kits/shadcn/chat-view-{message,message-list}.tsx`, `libs/ui/src/index.ts` и locale catalogs.

**Interfaces:** `TimelineItem.content` retains validated attachment fields from SDK decrypted event; projection renders encrypted events как `m.room.message` только после успешного SDK decrypt, а не raw `m.room.encrypted`. `ChatViewMessageListProps.renderAttachment?: (event: MatrixRoomEvent) => ReactNode`; `ChatViewMessageProps.attachment?: ReactNode`. `MessageAttachmentProps = { name: string; url?: string; previewUrl?: string; loading: boolean; error?: string; downloadLabel: string; loadingLabel: string; retryLabel: string; onRetry: () => void }`; proxy/kit export `ProxyMessageAttachment`/`UiKit.MessageAttachment`.

- [ ] Написать `decrypted_attachment_descriptor_survives_projection`, `descriptor_change_invalidates_item_identity`, `valid_image_and_file_download`, `hash_failure_has_retry_no_download`, `html_svg_do_not_render_active_preview`, `redacted_event_does_not_download`, `existing_text_and_scroll_behavior_unchanged`. Kit tests assert accessible download name/loading/error, app test passes only validated resolver blob; no arbitrary content URL/href from server. Safe inline preview только JPEG/PNG/GIF/WebP, не SVG/HTML и не raw decrypted HTML.
  ```tsx
  render(<MessageAttachment event={tamperedEncryptedImageEvent} />);
  expect(await screen.findByRole('button', { name: /retry/i })).toBeVisible();
  expect(screen.queryByRole('link', { name: /download/i })).toBeNull();
  expect(screen.queryByRole('img')).toBeNull();
  ```
  Controller `MessageAttachment({ event }: { event: MatrixRoomEvent }): ReactNode` использует synthetic descriptor/failing hash fixture.
- [ ] Выполнить new focused app/kit tests. Expected: FAIL — projection сейчас удаляет media fields, kit печатает только body.
- [ ] Реализовать message attachment controller с `useMedia`, передать ReactNode через render slot; SDK/type/decryption logic остаётся в web. Download — sanitized filename и blob URL, `download` link в kit без native external navigation; encrypted thumbnail только собственный descriptor либо локальный preview decrypted full file. Preserve текст и существующий scroll; no plaintext media fallback при file descriptor присутствии/ошибке.
- [ ] Выполнить `npx nx run-many -p web,ui -t typecheck,lint,test,build`, Lingui extraction/translations. Добавить Storybook image/file/loading/hash failure. Зафиксировать Element interoperability как обязательный реальный smoke в evidence, не доказанный unit roundtrip.
- [ ] Commit: `feat: display encrypted Matrix attachments`.
