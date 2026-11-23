# Windows Desktop Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Установимый Windows SewerNet с OS credentials, cold/warm OIDC, authenticated/encrypted media, tray и consent-based updater.

**Architecture:** Tauri 2 упаковывает shared Vite UI. Rust owns credential record transactions и pending callback claim; TypeScript adapter реализует shared-platform contracts. Remote pages никогда не становятся privileged WebView.

**Tech Stack:** Tauri 2 Bundler/Updater/deep-link/single-instance plugins, Windows keyring backend, Rust MSVC, Vitest, Cargo, WebView2.

**Spec:** `docs/superpowers/specs/2026-11-18-mvp-polish-design.md`, sections 4–8, 11; dependency — shared-platform plan.

## Global Constraints

- Только Windows 10/11 x64 `x86_64-pc-windows-msvc`, current-user NSIS `.exe`; `sewernet://oidc/callback`; общий web UI.
- Rust минимум 1.90, исходный toolchain pin `1.90.0`; выбрать поддерживаемые совместимые crates и commit Cargo.lock. Если MSRV требует более нового stable, обновить pin явно вместе с CI, не использовать floating toolchain.
- Windows-native credential store, local-machine/current-user persistence; namespace `org.sewernet.desktop:v1`. Chunks ≤2048 bytes, record ≤256 KiB, descriptor last, corruption — error, не empty session.
- Pending один, TTL 15 минут, SDK `mx_oidc_` serialized state в credential blobs до system browser. Native OIDC без loopback fallback; `unredacted.org` warm/cold acceptance обязательна.
- Close → hide/sync, tray Open/Check updates/Exit; Exit не logout. Startup check неблокирующий; install по согласию, credential flush до exit.
- Updater prod HTTPS/signature; никакого fake signing key, broad FS/HTTP/shell scope или отключения CSP. UI EN/RU proxy components.

## Review Focus

1. Windows case-insensitive target names/long JWT — Task 2 hash ids и chunk tests.
2. Crash до root/index commit или после callback claim — Tasks 2–3 fail closed, no code replay.
3. Callback duplicates/denial от чужого state — Task 3 не обменивает code и не стирает valid flow.
4. Legacy desktop localStorage + отказ keyring — Task 4 auth блокируется, plaintext не удалён до commit.
5. Exit/update во время save/download или main external navigation — Tasks 1, 6 flush/guard и local-only capabilities.

---

### Task 1: Tauri workspace, separate frontend output и native CI gate

**Files:** Create `apps/desktop/package.json`, `README.md`, `src-tauri/{Cargo.toml,Cargo.lock,build.rs,tauri.conf.json}`, `src-tauri/src/{main.rs,lib.rs}`, `src-tauri/capabilities/main.json`, `src-tauri/icons/*`, `rust-toolchain.toml`, `tools/ci/desktop-policy.test.mjs`; Modify root `package.json`/lock, `.gitignore`, `apps/web/vite.config.mts`, `.github/workflows/checks.yml`.

**Interfaces:** `desktop:build` — только shared frontend Vite mode `desktop` → `apps/desktop/dist`; `desktop:dev` — Tauri dev, web dev server `localhost:4200`; `desktop:bundle` — uncached `tauri build --bundles nsis` с cwd `apps/desktop`, forwarded CLI args (release overlay через Nx `--args="--config <path>"`), `frontendDist: '../dist'`; `desktop:native-test` — Windows Cargo gate; `desktop:test` — Node config policy. Web/adapter TS typecheck/lint остаются `web` targets: desktop не генерирует второй JS app и не имитирует их noop targets. Product identifier `org.sewernet.desktop`, initial version `0.1.0` совпадает npm/Cargo/Tauri.

- [ ] Написать `desktop_frontend_is_shared_and_separate`, `native_targets_are_not_in_linux_run_many`, `capabilities_are_local_main_only`, `csp_and_links_do_not_grant_remote_ipc`, `ci_package_has_no_prod_updater_or_signing_key`. Assert build paths, Windows native job, private scope/main window, no remote URLs/csp null/wildcard asset scopes. Новый workspace scaffolding при исполнении — сначала `nx-generate`, затем допустимый custom Tauri workspace без React generator.
  ```js
  assert.equal(config.build.frontendDist, '../dist');
  assert.equal(config.identifier, 'org.sewernet.desktop');
  assert.deepEqual(capability.windows, ['main']);
  assert.ok(!capability.remote && config.app.security.csp);
  ```
- [ ] Выполнить `node --test tools/ci/desktop-policy.test.mjs`. Expected: FAIL — app/config absent.
- [ ] npm workspace-командами установить совместимые pinned Tauri CLI (desktop), API/plugins (web adapter); не вручную править linkage. Создать Tauri workspace с lockfile, отдельным output/base mode (desktop relative assets; browser `/`), `beforeBuildCommand` без recursive Nx/Tauri calls. CSP local assets + `wasm-unsafe-eval`, blob images/media, HTTPS homeserver/MAS; dev localhost/HMR отдельно. Block remote navigation/popups; external http(s) links через узкий Rust `open_external_url`, не shell scope. SVG/HTML blob не navigate privileged window. Reuse существующей/нейтральной технической icon, не новый бренд.
- [ ] Добавить reusable `windows` job с toolchain/MSVC/WebView2: `cargo fmt --manifest-path apps/desktop/src-tauri/Cargo.toml -- --check`, `cargo clippy --manifest-path apps/desktop/src-tauri/Cargo.toml --all-targets -- -D warnings`, `cargo test --manifest-path apps/desktop/src-tauri/Cargo.toml`, `npx nx run desktop:bundle --skip-nx-cache`. Проверить JS full gate Linux/Windows и NSIS output. PR packaging без release overlay/production secrets; cargo build cache не заменяет package/sign step.
- [ ] Commit: `feat: package shared UI for Windows`.

### Task 2: Windows credential record engine и account transactions

**Files:** Create `apps/desktop/src-tauri/src/storage/{mod.rs,credential_backend.rs,records.rs,accounts.rs,error.rs}`, `src-tauri/tests/storage_native.rs`; Modify Cargo manifest/lock, lib.rs/capabilities; tests inline Rust modules.

**Interfaces:** Internal `CredentialBackend` byte API: `read(target: &str) -> Result<Option<Vec<u8>>, StorageError>`, `write(target: &str, bytes: &[u8]) -> Result<(), StorageError>`, `delete(target: &str) -> Result<(), StorageError>`, `list_owned(prefix: &str) -> Result<Vec<String>, StorageError>` (fixed own namespace; never IPC). `RecordStore::{read,write,delete}` bounded logical records. IPC exactly `accounts_load() -> AccountSnapshot`, `account_upsert(credentials) -> ()`, `account_begin_operation(user_id, device_id, reason: 'refresh' | 'delete') -> ()`, `account_remove(user_id) -> ()`, `account_set_active(user_id: Option<String>) -> ()`, `accounts_clear() -> ()`, `storage_flush() -> ()`, all `Result<_, SafeIpcError>` and async wrappers for blocking keyring. Snapshot wire fields camelCase match shared contract.

- [ ] Написать `roundtrip_boundaries_2048_2560_and_256k`, `case_distinct_ids_do_not_collide`, `reject_corrupt_hash_schema_missing_chunk`, `old_generation_visible_until_root_commit`, `index_never_points_to_partial_account`, `concurrent_write_delete_is_serial`, `failed_gc_does_not_undo_commit`, `rotation_barrier_survives_restart_until_credential_commit`, `tombstone_prevents_account_resurrection`, `native_roundtrip_is_scoped_and_cleaned`. Failure-injectable memory backend records every byte write; synthetic JWT/state >2560 bytes. Native integration marked ignored unless explicit own test namespace; cleanup даже на assertion failure.
  ```rust
  let payload = vec![7_u8; 3_000];
  store.write("account:synthetic", &payload).unwrap();
  assert_eq!(store.read("account:synthetic").unwrap(), Some(payload));
  assert!(backend.writes().iter().all(|(_, bytes)| bytes.len() <= 2_048));
  ```
  Store fixture uses memory byte backend; root descriptor тоже bounded. `RecordStore.read(id: &str) -> Result<Option<Vec<u8>>, StorageError>`, `write(id: &str, bytes: &[u8]) -> Result<(), StorageError>`, `delete(id: &str) -> Result<(), StorageError>`.
- [ ] Выполнить Cargo tests. Expected: FAIL — storage engine absent.
- [ ] Реализовать verified Windows-native keyring byte store (keyring-core/windows-native-keyring-store совместимые versions; Local не Enterprise). Target — фиксированный namespace + SHA-256 точного record id, не lowercase userId. Fresh generation chunks≤2048; root schema/version/generation/count/length/SHA-256 заменяется последней. Validate maximum128 chunks/256 KiB до allocation/deserialization. Mutex сериализует read/write/delete; `spawn_blocking`, secrets без открытого Debug/ошибочных payload dumps. Own-namespace enumeration/GC охватывает orphan generations, bounded cleanup; успешный postcommit GC failure — безопасный warning без секретов. Account commit до index/active; `account_begin_operation` записывает blocked flag в account record до refresh network, а upsert новых credentials снимает его в том же root commit; `accounts_load` возвращает blockedAccounts для предупреждения, не autoresume. Delete tombstone + index deactivate до purge, повтор idempotent, failures возвращаются. Account remove также чистит matching pending flow.
- [ ] Выполнить fmt/clippy/Cargo unit + explicit native integration `cargo test --manifest-path apps/desktop/src-tauri/Cargo.toml --test storage_native -- --ignored`; проверить только собственные test credentials удалены. IPC fixture serialization соответствует AccountSnapshot; no file fallback.
- [ ] Commit: `feat: store desktop credentials in Windows keyring`.

### Task 3: Durable pending OIDC и strict callback claim

**Files:** Create `apps/desktop/src-tauri/src/oidc/{mod.rs,pending.rs,callback.rs}`, `src-tauri/src/deep_links.rs`; Modify lib.rs/Cargo/config/capabilities; Rust tests inline.

**Interfaces:** Shared pending payload `StoredOidcFlow = { schema: 1; state: string; issuer: string; redirectUri: string; sdkStateKey: string; sdkState: string; createdAt: number; context: PendingOidcFlow; status: 'pending' | 'processing' }` (milliseconds). `PendingOidcFlow` включает существующие homeserverUrl/nonce/responseMode/action/revocationEndpoint и effective `redirectUri`.
- IPC `oidc_pending_save(flow) -> ()`, `oidc_pending_clear(state: Option<String>) -> ()` (expected-state guard), `oidc_callback_claim(url: String) -> ClaimedOidcCallback` where `{ flow: StoredOidcFlow; callback: { state: string; code?: string; error?: string } }`; safe typed errors `invalid_callback|no_pending|expired|already_processing|state_mismatch|storage_error`.
- Single-instance/deep-link delivery в trusted main только; frontend слушает official plugin events и initial URLs, Rust claim — авторитетный persisted guard.

- [ ] Написать `exact_scheme_host_path_only`, `reject_userinfo_port_fragment_duplicate_params_and_oversize`, `require_single_state_and_code_xor_error`, `ttl_15_minutes_including_clock_rollback`, `wrong_state_does_not_delete_good_flow`, `one_claim_for_concurrent_duplicates`, `claim_commit_failure_never_returns_code`, `restart_after_processing_requires_new_login`. Limits: URI≤8192 bytes, state≤512, code≤4096; future createdAt>now+60s reject. TTL≥15 minutes expired, not silently extended.
  ```rust
  assert!(claim("sewernet://evil/callback?state=synthetic&code=x").is_err());
  assert!(claim("sewernet://oidc/callback?state=synthetic&state=other&code=x").is_err());
  assert!(claim(valid_callback).is_ok());
  assert!(matches!(claim(valid_callback), Err(AlreadyProcessing)));
  ```
  `claim` — fixture вызывает реальный pending store claim при seeded synthetic flow/fixed clock; AlreadyProcessing — внутренний variant mapped в safe IPC code.
- [ ] Выполнить Cargo callback/pending tests. Expected: FAIL — engine absent.
- [ ] Реализовать exact URI validator, persisted status transition under storage lock, one flow replacement. Save checks exact redirect/issuer/sdk key `mx_oidc_${state}`, never accepts callback URL as token endpoint/navigation. OAuth denial requires matching state then claim/cleanup; malformed/wrong-state callbacks не отменяют valid login. Single-instance plugin первым с deep-link feature, config static scheme; dev register only explicit environment flag. Errors/logs без raw URL/code/sdkState.
- [ ] Выполнить fmt/clippy/tests + `desktop:test`; mocked initial event + concurrent warm event вызывают один claim. Cold native launch script использует synthetic callback, не выводит URL/token в журнал.
- [ ] Commit: `feat: validate and claim desktop OIDC callbacks`.

### Task 4: Desktop adapter, migration и SDK OIDC orchestration

**Files:** Create `apps/web/src/platform/desktop.ts`, `desktop.spec.ts`, `apps/web/src/platform/oidc-contract.ts`, `apps/web/src/app/features/auth/desktop-oidc.ts`, `.spec.ts`; Modify runtime/contracts/bootstrap/browser, auth/oidc.ts/specs, welcome/callback screens, app.tsx, locales; Rust external opener/lifecycle commands.

**Interfaces:** Desktop adapter implements `AccountPersistence` via Task 2 IPC. `OidcPlatform = { redirectUri(): string; applicationType(): 'web' | 'native'; clientUri(): string; savePending(flow: StoredOidcFlow): Promise<void>; claimCallback(url: string): Promise<ClaimedOidcCallback>; clearPending(state?: string): Promise<void>; openAuthorization(url: string): Promise<void>; listenCallbacks(handler: (url: string) => void): Promise<() => void> }`. Browser implementation сохраняет sessionStorage/redirect behavior; native clientUri `https://github.com/AshenHermit/SewerNet`, redirect exact custom URI, applicationType native. `handleDesktopOidcCallback(url: string): Promise<void>` — claim/SDK restore/grant/commit/cleanup; route UI `/oidc/callback` без query секретов, callback result только memory.

- [ ] Написать `native_registration_exact_uri_no_loopback_retry`, `sdk_state_is_saved_before_browser_open`, `only_related_sdk_state_is_persisted`, `cold_callback_restores_pkce_then_grants_once`, `warm_duplicate_grants_once`, `commit_precedes_flow_cleanup_and_auth_success`, `migration_clears_plaintext_only_after_commit`, `failed_migration_blocks_auth_and_preserves_source`, `listener_installed_before_initial_urls`, `oauth_error_does_not_display_raw_description`. Fake official plugins+IPC and SDK methods; assert original nonce/SDK serialized state survives and no URL stored in history/localStorage.
  ```ts
  await startOidcLogin(metadata, clientId, 'sewernet://oidc/callback', 'https://home.test');
  expect(calls.indexOf('oidc_pending_save')).toBeLessThan(calls.indexOf('open_external_url'));
  await handleDesktopOidcCallback(callback);
  await handleDesktopOidcCallback(callback);
  expect(completeAuthorizationCodeGrant).toHaveBeenCalledTimes(1);
  ```
  `calls` принадлежит fake IPC fixture, callback содержит сохранённый synthetic state; второй callback safely ignored как already-processing/no-pending, не rejected unhandled.
- [ ] Выполнить focused desktop/oidc/bootstrap tests (cwd `apps/web`). Expected: FAIL — native behavior absent.
- [ ] Реализовать lazy official runtime adapter; install callback listener перед initial `getCurrent`, queue until accounts bootstrap ready. Desktop legacy same-WebView accounts import через awaited keyring writes; удалить plaintext keys (`sewernet_accounts`, active, legacy auth/persist и связанные OIDC PKCE/pending) только после complete migration; failure retry/error без browser fallback. Не импортировать внешний browser profile. OIDC SDK генерирует URL; извлечь state и единственный `mx_oidc_` record, сохранить credentials-context до системного browser open. Open failure clears own pending/state. Exact effective redirect записать в OidcSession, не пересчитать из WebView origin. После claim восстановить SDK state и собственный pending context в ephemeral sessionStorage, чтобы общий completeOidcLogin получил original effective redirect/context; после grant/failure очистить оба. Grant SDK сохраняет PKCE/nonce validation; processing crash требует нового login. SDK response/whoami errors переводить в безопасные EN/RU сообщения, не raw JSON.
- [ ] Выполнить full web gate + Windows bundle. Обязательный manual installed NSIS OIDC `unredacted.org`: warm/cold/system browser/first sync. Если MAS/custom-scheme/CORS не совместимы — записать blocker, не заменять приёмку password fallback; native non-media proxy требует нового согласования.
- [ ] Commit: `feat: complete desktop OIDC through system browser`.

### Task 5: Packaged WebView media/WASM и navigation safety

**Files:** Modify `platform/desktop.ts`/specs, media resolver specs, Tauri CSP/navigation/capabilities; Create при необходимости узкий `apps/desktop/src-tauri/src/media.rs` + Rust tests; Modify desktop README.

**Interfaces:** Implements shared `MediaTransport.fetchBlob`. Primary — WebView scoped authenticated fetch; если media CORS блокирует packaged app, IPC `media_download(mxc: String, kind: 'download' | 'thumbnail', size?: u32, user_id: String) -> Vec<u8>` получает baseUrl/token из account storage, не caller-supplied bearer/URL. Только этот optional transport; никаких Matrix/OAuth general requests.

- [ ] Написать `native_media_same_origin_path_only_no_redirect`, `no_token_for_cross_origin_or_stale_account`, `native_media_never_registers_sw`, `external_navigation_cannot_invoke_ipc`. Optional Rust transport tests reject redirects, traversal/malformed MXC, excessive dimensions, inactive/deleted account; derive allowed SDK-style URL, не произвольный proxy.
- [ ] Выполнить focused web tests, optional Cargo tests. Expected: FAIL до transport/guards.
- [ ] Реализовать WebView adapter с shared validator/epoch и current token. Validate WASM CSP/IndexedDB на packaged build; менять CSP только на доказанное минимально нужное разрешение. При доказанном media CORS добавить Rust scoped fetch с no redirects/timeouts и только active account; обработать reauth/refresh без старого bearer. Remote popup/navigation → system browser, локальные blob downloads не становятся executable privileged content.
- [ ] Выполнить Windows bundle и manual E2EE/WASM/avatars/file/image, encrypted SewerNet ↔ Element, tampered file rejection, restart IndexedDB; media account-switch/logout blob cleanup. Evidence отделяет packaged smoke от Vite/mock результатов.
- [ ] Commit: `feat: support scoped media in desktop WebView`.

### Task 6: Tray, updater UI и controlled shutdown

**Files:** Create `apps/desktop/src-tauri/src/lifecycle.rs`, `apps/web/src/platform/{updates,draft-registry}.ts` и `.spec.ts`, `apps/web/src/app/components/update-controller.tsx`, `libs/ui/src/lib/proxy/proxy-update-panel.tsx`, `libs/ui/src/lib/kits/shadcn/update-panel.tsx`, `.spec.tsx`, `.stories.tsx`; Modify desktop lib/config/capabilities, platform bootstrap, web settings-panel.tsx/chat-view.tsx, `libs/ui/src/lib/ui-kit.ts`, proxy/index.ts, kits/shadcn/index.ts, ui/src/index.ts, kits/shadcn/settings-{form,screen,dialog}.tsx и locale catalogs.

**Interfaces:** Rust `show_main_window()`, `request_app_exit()` and `update-check-requested`/`app-exit-requested` events; tray Exit requests JS coordinator, primitive Rust exit called только после consent/flush. `UpdateState = { phase: 'idle' | 'unavailable' | 'checking' | 'up-to-date' | 'available' | 'downloading' | 'installing' | 'error'; version?: string; progress?: number; error?: string }`; `checkForUpdates(manual: boolean): Promise<void>`, `installAvailableUpdate(): Promise<void>`, `dismissUpdate(): void`, `exitDesktop(): Promise<void>`.
- `UpdatePanelProps`: state fields phase/version/progress/error, `title`, `statusLabel`, `installLabel`, `dismissLabel`, `draftWarningLabel` — strings; `draftWarning: boolean`; `onInstall`, `onDismiss` — `() => void`. UI phase type дублирует только plain string union, не импортирует web module. `UiKit.UpdatePanel`/`ProxyUpdatePanel`; settings `updates?: ReactNode` slot передаётся общей форме compact/wide.
- `draft-registry.ts`: `registerDraft(id: string, hasDraft: () => boolean): () => void`, `hasUnsavedDraft(): boolean`; chat-view registers memory getter, unregisters on unmount. Updater/Exit explicitly warn о потере draft (не сохранять potentially secret message draft в plaintext).

- [ ] Написать `close_hides_exit_keeps_account`, `startup_network_failure_does_not_block_chat`, `manual_check_shows_no_update`, `install_requires_confirmation_and_warns_draft`, `pending_saves_flush_before_windows_autoexit`, `flush_failure_cancels_install`, `dismiss_before_install_keeps_process`, `invalid_signature_install_fails`, `update_shutdown_bypasses_close_hide`. Native update objects mocked only for UI, real invalid-signature check — release Task 3.
- [ ] Выполнить focused updater/UI tests и Rust lifecycle tests. Expected: FAIL — native lifecycle/updater missing.
- [ ] Реализовать native tray Open/Check updates/Exit и task-safe exit; Exit не logout/erase. `request_app_exit`/update path ожидает credential queue flush и подтверждение draft loss; storage error держит процесс открытым. Updater official plugin lazy loaded/production overlay enabled; initial check only after bootstrap, network failure не auth error. Download/progress/error через proxy UI, install только после explicit confirm; перед plugin Windows autoexit awaited JS/Rust flush, terminating guard release. Settings update entry только desktop. CI unsigned config показывает updates unavailable без fake key.
- [ ] Выполнить web/ui full gates, extraction/EN-RU, fmt/clippy/Cargo и NSIS build; manual tray/exit/restart/draft consent. Append signed A → B acceptance requirement в desktop README и общий evidence.
- [ ] Commit: `feat: add desktop tray and update lifecycle`.

## Выходной gate

- [ ] Все native команды Windows, полный JS gate и installed smoke из spec; не отмечать desktop roadmap completed при непроверенном OIDC/keyring/update. Не обещать Authenticode/отсутствие SmartScreen warning.
