# Signed Desktop Releases Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stable tag выпускает только проверенный signed Windows NSIS update с валидным manifest и воспроизводимыми version/release notes.

**Architecture:** Release переиспользует полный `checks.yml`, проверяет tag/version/default-branch ancestry и builds signed NSIS в protected Windows job. Assets сначала в draft; публикация только после проверки всех ссылок/подписей. Signed build всегда заново, не Nx cache hit.

**Tech Stack:** GitHub Actions/Releases, Tauri Bundler/Updater, Node test runner, Conventional Changelog CLI, SemVer.

**Spec:** `docs/superpowers/specs/2026-11-18-mvp-polish-design.md`, sections 8–9, 11; dependencies — CI + desktop plans.

## Global Constraints

- Только stable `vX.Y.Z`, точная равная версия npm/Cargo/Tauri, tag reachable from `master`; единственная manifest platform `windows-x86_64`.
- Updater endpoint `https://github.com/AshenHermit/SewerNet/releases/latest/download/latest.json`; production signature обязательна.
- Public key repo variable `TAURI_UPDATER_PUBLIC_KEY`; secrets `TAURI_SIGNING_PRIVATE_KEY`, `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`. Отсутствующий private/public key — release FAIL; пустой password допустим только для реально unencrypted private key и не логируется.
- Нет real/fake key/config в Git. CI PR artifacts unsigned и не auto-updatable. Authenticode не входит в scope.
- Protected release environment `desktop-release`; `contents: write` только publish job, PR/fork code не получает secrets. Actions/tool versions pinned, artifact allowlist.

## Review Focus

1. Неверный stable tag/version/ancestry — Task 1 fails до secrets/build.
2. Installer есть, `.sig`/manifest нет или ссылка чужая — Task 2 draft остаётся unpublished.
3. GitHub API partial upload/retry — Task 2 idempotent own draft, без удаления чужого release.
4. Повреждённый signed artifact или другая public key — Task 3 rejects install.
5. Аккаунт с rotated refresh/draft перед обновлением — desktop Task 6 + Task 3 реальный A → B smoke.

---

### Task 1: Version, release overlay и testable manifest contracts

**Files:** Create `tools/release/{desktop-release.mjs,desktop-release.test.mjs}`, `apps/desktop/src-tauri/tauri.release.conf.example.json`; Modify npm root manifest/lock, desktop README, CI policy test invocation.

**Interfaces:** `readDesktopVersion(root: string): string` проверяет npm/Cargo/Tauri equality; `validateStableTag(tag: string, version: string): void`; `buildUpdaterManifest(input: { version: string; notes: string; pubDate: string; installerUrl: string; signature: string }): UpdaterManifest`; `validateUpdaterManifest(manifest: unknown, expectedVersion: string, assetNames: string[]): void`. `UpdaterManifest = { version: string; notes: string; pub_date: string; platforms: { 'windows-x86_64': { url: string; signature: string } } }`. CLI `node tools/release/desktop-release.mjs validate-version --tag vX.Y.Z`.

- [ ] npm dev commands добавить `smol-toml` и `conventional-changelog-cli`; написать `reject_mismatched_versions_prerelease_and_invalid_tag`, `manifest_has_only_windows_x86_64_and_exact_version`, `manifest_url_is_https_own_release_asset`, `missing_signature_asset_or_pubkey_is_failure`, `example_overlay_contains_no_key`. Fixtures synthetic, `.sig` строка читается как CONTENT, не путь к файлу.
  ```js
  assert.throws(() => validateStableTag('v0.2.0', '0.1.0'));
  assert.throws(() => validateStableTag('v0.1.0-beta.1', '0.1.0-beta.1'));
  assert.deepEqual(Object.keys(manifest.platforms), ['windows-x86_64']);
  assert.equal(manifest.platforms['windows-x86_64'].signature, signatureFileContents);
  ```
- [ ] Выполнить `node --test tools/release/desktop-release.test.mjs`. Expected: FAIL — helpers/config отсутствуют.
- [ ] Реализовать pure helpers и version CLI с validated JSON/TOML. Release overlay генерируется во временном workspace из public variable: `bundle.createUpdaterArtifacts: true`, endpoint exact, plugin public key. Example содержит placeholder instructions, не fake key. Temp overlay/artifacts ignored и не upload целого target tree. CI unsigned bundle остаётся без этого overlay. Root CI выполняет `node --test tools/ci/*.test.mjs tools/release/*.test.mjs`.
- [ ] Выполнить helper/config tests и unsigned Windows NSIS smoke, подтвердить production-key absence не ломает PR build, но release preflight её отклоняет.
- [ ] Commit: `ci: validate desktop release metadata`.

### Task 2: Protected signed tag workflow и draft publication

**Files:** Create `.github/workflows/release-desktop.yml`, `tools/release/publish-desktop.mjs`, `tools/release/publish-desktop.test.mjs`; Modify workflow-policy tests, desktop README.

**Interfaces:** Workflow trigger push tags `v*` (script accepts only stable), optional manual rerun existing tag; `checks` job calls reusable workflow. `publishDraftRelease({ tag, version, artifactsDir, notesFile }, githubClient): Promise<{ releaseUrl: string }>`; injectable client methods get/create own draft, list/upload assets, download/read manifest, publish draft. Signed Windows job uses `npx nx run desktop:bundle --skip-nx-cache` with generated release overlay, private key environment; no node/npm command prints environment.

- [ ] Написать `release_requires_green_checks_and_master_ancestor`, `signing_secrets_only_in_protected_job`, `unsigned_or_incomplete_assets_never_publish`, `manifest_references_existing_exact_sig_content`, `partial_upload_retry_repairs_only_own_draft`, `existing_public_release_is_not_overwritten`, `foreign_assets_are_not_deleted`. Fake GitHub client exercises failed second upload, retry, duplicate asset names и no public transition.
  ```js
  await assert.rejects(publishDraftRelease(incompleteArtifactsFixture, fakeGithub));
  assert.equal(fakeGithub.publishCalls.length, 0);
  assert.equal(fakeGithub.deletedForeignAssets.length, 0);
  ```
- [ ] Выполнить Node release/policy tests и actionlint. Expected: FAIL — workflow/publication absent.
- [ ] Реализовать tag validation до privileged job: fetch master/full history, `git merge-base --is-ancestor <tag commit> origin/master`, read exact versions. Reuse JS/Windows/Docker checks; stable signed Windows build в `desktop-release`, cache не заменяет signing; private key/public key проверить без вывода. Generate notes command `npx conventional-changelog -p angular -r 1 -o <temp notes file>` с tag context. Upload только NSIS `.exe`, matching `.exe.sig`, `latest.json` и отдельные allowlisted web/landing archives. Immutable artifact names/version URLs внутри собственного release; no latest.json до всех assets. Проверить downloaded draft manifest/version/platform/url/signature content и обязательные asset names, затем publish. Повтор public release отказывает, повреждённый own draft можно безопасно дополнить; не force-delete существующие releases/tags.
- [ ] Выполнить tests/actionlint/full reusable gates. Локально fake GitHub/client simulation; реальная protected environment, ключи, branch/tag policies и первый publish — owner participation, не claim после YAML. README даёт процедуру key generation/backup вне Git и repository settings, не генерирует ключи автоматически.
- [ ] Commit: `ci: publish signed Windows desktop releases`.

### Task 3: Signed updater acceptance и release operator checklist

Публикацию/реальный A → B smoke выполнять после deployment gate и финальных проверок всех планов; не выпускать stable midway implementation.

**Files:** Create `deploy/desktop-release-checklist.md`; Modify desktop README и общий evidence, при необходимости lifecycle/update tests.

**Interfaces:** Consumes — опубликованные версии A/B с одинаковым реальным public key и Tauri updater lifecycle; Produces — operator evidence version/hash/signature result и explicit release prerequisites. Секретный key/password не записывается.

- [ ] Добавить regression `bad_signature_preserves_running_session` в updater test: fake installer refuses, процесс не exited, credentials не erased, error видим. Выполнить focused test и подтвердить FAIL до missing behavior (если уже покрыто desktop Task 6, не дублировать test; сослаться на существующий green test).
  ```ts
  await expect(installAvailableUpdate()).rejects.toThrow(); // fixture: bad signature
  expect(processExit).not.toHaveBeenCalled();
  expect(getActiveAccount()).toEqual(savedAccount);
  ```
- [ ] Записать операторский checklist: owner генерирует/резервирует private key, public key variable, protected environment/tags; собрать A, затем B с bumped равными semver; publication только после gate и approval. Отдельно предупредить SmartScreen/Authenticode distinction.
- [ ] С владельцем установить A и проверить actual endpoint/check/download/consent/flush/NSIS B/restart аккаунта. В безопасном тестовом release overlay с тем же public key проверить испорченный artifact и wrong signature: установка отклонена, account сохранён. Не менять stable public manifest ради negative test.
- [ ] Записать результаты version/commit/OS, no secrets; при невозможности публикации/ключей оставить blocker и desktop/CI roadmap boxes незавершёнными. Commit: `docs: document signed desktop release acceptance`.
