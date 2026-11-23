import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const read = (path) => readFile(new URL(`../../${path}`, import.meta.url), 'utf8');

const readJson = async (path) => JSON.parse(await read(path));

test('task3_oidc_callback_and_deep_link_policy', async () => {
  const [lib, cargo, config, capability, oidcMod, oidcPending, oidcCallback, deepLinks] = await Promise.all([
    read('apps/desktop/src-tauri/src/lib.rs'),
    read('apps/desktop/src-tauri/Cargo.toml'),
    readJson('apps/desktop/src-tauri/tauri.conf.json'),
    readJson('apps/desktop/src-tauri/capabilities/main.json'),
    read('apps/desktop/src-tauri/src/oidc/mod.rs'),
    read('apps/desktop/src-tauri/src/oidc/pending.rs'),
    read('apps/desktop/src-tauri/src/oidc/callback.rs'),
    read('apps/desktop/src-tauri/src/deep_links.rs'),
  ]);
  const serialized = JSON.stringify({ lib, cargo, config, capability, oidcMod, oidcPending, oidcCallback, deepLinks });
  assert.match(serialized, /oidc_pending_save/);
  assert.match(serialized, /oidc_pending_clear/);
  assert.match(serialized, /oidc_callback_claim/);
  assert.match(serialized, /tauri-plugin-deep-link/);
  assert.match(serialized, /tauri-plugin-single-instance/);
  assert.match(serialized, /SEWERNET_OIDC_DEV_REGISTER/);
  assert.match(serialized, /sewernet:\/\/oidc\/callback/);
  assert.doesNotMatch(serialized, /callback_url|raw_url|raw_callback|TAURI_SIGNING_PRIVATE_KEY/);
  assert.deepEqual(config.plugins?.['deep-link']?.desktop?.schemes, ['sewernet']);
  assert.ok(capability.permissions.includes('deep-link:default'));
  assert.doesNotMatch(capability.permissions.join(','), /shell|http/);
});

test('task2_desktop_account_storage_ipc_is_explicit', async () => {
  const [lib, mod, records, desktop] = await Promise.all([
    read('apps/desktop/src-tauri/src/lib.rs'),
    read('apps/desktop/src-tauri/src/storage/mod.rs'),
    read('apps/desktop/src-tauri/src/storage/records.rs'),
    read('apps/web/src/platform/desktop.ts'),
  ]);
  assert.match(mod, /accounts_load/);
  assert.match(mod, /account_upsert/);
  assert.match(mod, /account_begin_operation/);
  assert.match(mod, /account_remove/);
  assert.match(mod, /account_set_active/);
  assert.match(mod, /accounts_clear/);
  assert.match(mod, /storage_flush/);
  assert.match(mod, /spawn_blocking/);
  assert.doesNotMatch(mod, /localStorage|readTextFile|writeTextFile/);
  assert.match(records, /2048/);
  assert.match(records, /256 \* 1024|MAX_RECORD/);
  assert.match(records, /root_target/);
  assert.match(desktop, /@tauri-apps\/api\/core/);
  assert.match(lib, /invoke_handler/);
});

test('task5_native_media_navigation_and_csp_policy', async () => {
  const [desktop, mediaSpec, sw, config, capability, readme, lib] = await Promise.all([
    read('apps/web/src/platform/desktop.ts'),
    read('apps/web/src/platform/desktop.spec.ts'),
    read('apps/web/src/lib/sw-session.ts'),
    readJson('apps/desktop/src-tauri/tauri.conf.json'),
    readJson('apps/desktop/src-tauri/capabilities/main.json'),
    read('apps/desktop/README.md'),
    read('apps/desktop/src-tauri/src/lib.rs'),
  ]);
  const serialized = JSON.stringify({ desktop, mediaSpec, sw, config, capability, lib });
  assert.match(serialized, /DesktopMediaTransport/);
  assert.match(serialized, /redirect:\s*['"]error['"]/);
  assert.match(serialized, /cache:\s*['"]no-store['"]/);
  assert.match(sw, /getPlatformKind\(\) !== 'browser'/);
  assert.doesNotMatch(desktop, /register\(['"]\/sw\.js['"]/);
  assert.doesNotMatch(JSON.stringify({ config, capability, lib }), /dangerousRemoteDomainIpcAccess/);
  // opener:default is required for tauri-plugin-opener (OIDC browser launch)
  assert.doesNotMatch(capability.permissions.join(','), /shell|http/);
  assert.match(config.app.security.csp, /wasm-unsafe-eval/);
  assert.match(config.app.security.csp, /blob:/);
  assert.equal(config.app.security.assetProtocol.enable, false);
  assert.doesNotMatch(readme, /manual smoke passed|encrypted.*passed|SewerNet.*Element.*passed/i);
});

test('matrix_widget_api_freeze_compat_patch_is_applied_on_install', async () => {
  const [rootPackage, patch] = await Promise.all([
    readJson('package.json'),
    read('patches/matrix-widget-api+1.20.0.patch'),
  ]);
  assert.equal(rootPackage.scripts.postinstall, 'patch-package');
  assert.equal(rootPackage.devDependencies['patch-package'], '8.0.1');
  assert.match(patch, /exports\.toString = toString;/);
  assert.match(patch, /Object\.defineProperty\(exports, 'toString'/);
});

test('tray_exit_flushes_credentials_before_native_exit', async () => {
  const [lifecycle, controller, updates] = await Promise.all([
    read('apps/desktop/src-tauri/src/lifecycle.rs'),
    read('apps/web/src/app/components/update-controller.tsx'),
    read('apps/web/src/platform/updates.ts'),
  ]);
  assert.match(lifecycle, /"exit"\s*=>\s*\{[\s\S]*?show_main_window_handle\([\s\S]*?window\.emit\("app-exit-requested", true\)/);
  assert.match(controller, /listen\('app-exit-requested',[^\n]*controller\.exitDesktop\(\)/);
  assert.match(updates, /async function exitDesktop\(\): Promise<void>\s*\{[\s\S]*?await options\.flush\(\)[\s\S]*?await options\.requestExit\(\)/);
  assert.match(lifecycle, /spawn_blocking\(move \|\| store\.flush\(\)\)[\s\S]*?app\.exit\(0\)/);
});

test('tray_left_click_opens_window_and_right_click_shows_menu', async () => {
  const lifecycle = await read('apps/desktop/src-tauri/src/lifecycle.rs');
  assert.match(lifecycle, /\.menu\(&menu\)/);
  assert.match(lifecycle, /\.show_menu_on_left_click\(false\)/);
  const clickHandler = lifecycle.split('.on_tray_icon_event')[1]?.split('.on_menu_event')[0] ?? '';
  const menuHandler = lifecycle.split('.on_menu_event')[1]?.split('.build(&app_handle)')[0] ?? '';
  assert.match(clickHandler, /if let TrayIconEvent::Click\s*\{/);
  assert.match(clickHandler, /button:\s*MouseButton::Left/);
  assert.match(clickHandler, /button_state:\s*MouseButtonState::Up/);
  assert.match(clickHandler, /show_main_window_handle/);
  assert.match(lifecycle, /let click_handle\s*=\s*app_handle\.clone\(\)/);
  assert.match(lifecycle, /let menu_handle\s*=\s*app_handle\.clone\(\)/);
  assert.match(menuHandler, /menu_handle\.get_webview_window\("main"\)/);
});

test('desktop_frontend_is_shared_and_separate', async () => {
  const [project, packageJson, cargo, rustToolchain, config, vite, lifecycle] = await Promise.all([
    readJson('apps/desktop/project.json'),
    readJson('apps/desktop/package.json'),
    read('apps/desktop/src-tauri/Cargo.toml'),
    read('apps/desktop/src-tauri/rust-toolchain.toml'),
    readJson('apps/desktop/src-tauri/tauri.conf.json'),
    read('apps/web/vite.config.mts'),
    read('apps/desktop/src-tauri/src/lifecycle.rs'),
  ]);

  assert.equal(packageJson.name, '@sewer-net/desktop');
  assert.equal(packageJson.version, '0.1.0');
  assert.equal(config.version, '0.1.0');
  assert.equal(config.identifier, 'org.sewernet.desktop');
  assert.match(rustToolchain, /channel\s*=\s*"stable"/);
  assert.match(rustToolchain, /targets\s*=\s*\["x86_64-pc-windows-msvc"\]/);
  assert.doesNotMatch(rustToolchain, /1\.90\.0/);
  assert.match(cargo, /tauri-plugin-deep-link\s*=\s*"2\.6\.3"/);
  assert.match(cargo, /custom-protocol\s*=\s*\[\s*"tauri\/custom-protocol"\s*\]/);
  assert.equal(packageJson.dependencies['@tauri-apps/plugin-deep-link'], '2.6.3');
  assert.match(lifecycle, /WindowEvent::CloseRequested\s*\{\s*api,\s*\.\.\s*\}/);
  assert.match(lifecycle, /&tauri::Window<R>/);
  assert.equal(config.build.frontendDist, '../dist');
  assert.match(config.build.beforeBuildCommand, /desktop:build/);
  assert.match(vite, /mode === 'desktop'/);
  assert.match(vite, /\.\.\/desktop\/dist/);
  assert.doesNotMatch(vite, /apps\/desktop\/src/);
  assert.match(cargo, /version\s*=\s*"0\.1\.0"/);

  for (const target of ['build', 'dev', 'bundle', 'native-test', 'test']) {
    assert.ok(packageJson.scripts[`desktop:${target}`], `missing desktop:${target} script`);
  }
  assert.equal(project.targets.build.executor, 'nx:run-commands');
  assert.equal(project.targets.build.options.command, 'npm run desktop:build');
  assert.equal(project.targets['native-test'].options.command, 'npm run desktop:native-test');
  assert.equal(project.targets.test.options.command, 'npm run desktop:test');
  assert.equal(project.targets['native-test'].cache, false);
});

test('native_targets_are_not_in_linux_run_many', async () => {
  const [workflow, project] = await Promise.all([
    read('.github/workflows/checks.yml'),
    readJson('apps/desktop/project.json'),
  ]);

  assert.match(workflow, /desktop-native:/);
  assert.match(workflow, /runs-on:\s*windows-latest/);
  assert.match(workflow, /rustup toolchain install stable/);
  assert.match(workflow, /rustup default stable-x86_64-pc-windows-msvc/);
  assert.match(workflow, /cargo fmt --manifest-path apps\/desktop\/src-tauri\/Cargo\.toml -- --check/);
  assert.match(workflow, /cargo clippy --manifest-path apps\/desktop\/src-tauri\/Cargo\.toml --all-targets -- -D warnings/);
  assert.doesNotMatch(workflow, /1\.90\.0/);
  assert.match(workflow, /cargo test --manifest-path apps\/desktop\/src-tauri\/Cargo\.toml/);
  assert.match(workflow, /npx nx run desktop:bundle --skip-nx-cache/);
  assert.doesNotMatch(workflow, /run-many[^\n]*desktop:(?:native-test|bundle)/);
  assert.equal(project.targets['native-test'].executor, 'nx:run-commands');
  assert.equal(project.targets['native-test'].options.cwd, 'apps/desktop');
  assert.equal(project.targets['native-test'].options.command, 'npm run desktop:native-test');
});

test('capabilities_are_local_main_only', async () => {
  const capability = await readJson('apps/desktop/src-tauri/capabilities/main.json');
  assert.equal(capability.identifier, 'main-capability');
  assert.deepEqual(capability.windows, ['main']);
  // opener:default required for tauri-plugin-opener (OIDC browser launch)
  assert.deepEqual(capability.permissions, ['core:default', 'deep-link:default', 'opener:default']);
  assert.equal('remote' in capability, false);
  assert.equal('scope' in capability, false);
});

test('csp_and_links_do_not_grant_remote_ipc', async () => {
  const config = await readJson('apps/desktop/src-tauri/tauri.conf.json');
  const csp = config.app.security.csp;
  assert.ok(csp);
  assert.doesNotMatch(csp, /\*|https?:\/\/\*/);
  assert.match(csp, /wasm-unsafe-eval/);
  assert.match(csp, /blob:/);
  assert.equal(config.app.security.assetProtocol.enable, false);
  assert.deepEqual(config.app.security.assetProtocol.scope, []);
  assert.equal(config.app.security.dangerousRemoteDomainIpcAccess, undefined);
  assert.deepEqual(config.app.security.capabilities, ['main-capability']);
  assert.equal(config.app.security.freezePrototype, true);
  assert.equal(config.app.windows[0].label, 'main');
  assert.equal(config.app.windows[0].url, 'index.html');
  assert.equal(config.app.windows[0].url.startsWith('http'), false);
});

test('ci_package_has_no_prod_signing_key_and_allows_empty_updater_config', async () => {
  const [config, packageJson, cargo, workflow, project] = await Promise.all([
    readJson('apps/desktop/src-tauri/tauri.conf.json'),
    readJson('apps/desktop/package.json'),
    read('apps/desktop/src-tauri/Cargo.toml'),
    read('.github/workflows/checks.yml'),
    readJson('apps/desktop/project.json'),
  ]);
  const serialized = JSON.stringify({ config, packageJson, cargo, workflow, project });
  assert.doesNotMatch(serialized, /TAURI_[A-Z0]*SIGNING[A-Z0_]*/);
  assert.doesNotMatch(serialized, /TAURI_SIGNING_PRIVATE_KEY|TAURI_SIGNING_PRIVATE_KEY_PASSWORD/);
  assert.doesNotMatch(serialized, /BEGIN (RSA |EC |)PRIVATE KEY|dW50cnVzdGVk/);
  assert.equal(config.plugins.updater.pubkey, '');
  assert.match(cargo, /tauri-plugin-updater/);
  assert.doesNotMatch(workflow, /TAURI_[A-Z0]*SIGNING[A-Z0_]*/);
  assert.doesNotMatch(JSON.stringify(project), /TAURI_[A-Z0]*SIGNING[A-Z0_]*/);
  assert.deepEqual(config.bundle.targets, ['nsis']);
  assert.doesNotMatch(JSON.stringify(project), /run-many[^\n]*desktop:(?:native-test|bundle)/);
});
