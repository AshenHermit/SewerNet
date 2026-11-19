import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const read = (path) => readFile(new URL(`../../${path}`, import.meta.url), 'utf8');

const readJson = async (path) => JSON.parse(await read(path));

test('desktop_frontend_is_shared_and_separate', async () => {
  const [project, packageJson, cargo, rustToolchain, config, vite] = await Promise.all([
    readJson('apps/desktop/project.json'),
    readJson('apps/desktop/package.json'),
    read('apps/desktop/src-tauri/Cargo.toml'),
    read('apps/desktop/src-tauri/rust-toolchain.toml'),
    readJson('apps/desktop/src-tauri/tauri.conf.json'),
    read('apps/web/vite.config.mts'),
  ]);

  assert.equal(packageJson.name, '@sewer-net/desktop');
  assert.equal(packageJson.version, '0.1.0');
  assert.equal(config.version, '0.1.0');
  assert.equal(config.identifier, 'org.sewernet.desktop');
  assert.match(rustToolchain, /channel\s*=\s*"stable"/);
  assert.match(rustToolchain, /targets\s*=\s*\["x86_64-pc-windows-msvc"\]/);
  assert.doesNotMatch(rustToolchain, /1\.90\.0/);
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
  assert.deepEqual(capability.permissions, ['core:default']);
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

test('ci_package_has_no_prod_updater_or_signing_key', async () => {
  const [config, packageJson, cargo, workflow, project] = await Promise.all([
    readJson('apps/desktop/src-tauri/tauri.conf.json'),
    readJson('apps/desktop/package.json'),
    read('apps/desktop/src-tauri/Cargo.toml'),
    read('.github/workflows/checks.yml'),
    readJson('apps/desktop/project.json'),
  ]);
  const serialized = JSON.stringify({ config, packageJson, cargo, workflow, project });
  assert.doesNotMatch(serialized, /TAURI_SIGNING_PRIVATE_KEY|TAURI_SIGNING_PRIVATE_KEY_PASSWORD/);
  assert.doesNotMatch(serialized, /plugins\.updater|tauri-plugin-updater|production.*updat/i);
  assert.deepEqual(config.bundle.targets, ['nsis']);
  assert.doesNotMatch(JSON.stringify(project), /run-many[^\n]*desktop:(?:native-test|bundle)/);
});
