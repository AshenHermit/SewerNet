import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

import {
  buildUpdaterManifest,
  readDesktopVersion,
  validateStableTag,
  validateUpdaterManifest,
} from './desktop-release.mjs';

const OWN_RELEASE = 'https://github.com/AshenHermit/SewerNet/releases/latest/download/';

function validManifest() {
  return buildUpdaterManifest({
    version: '0.2.0',
    notes: 'Release notes',
    pubDate: '2026-11-18T12:00:00Z',
    installerUrl: `${OWN_RELEASE}sewernet_0.2.0_x64-setup.exe`,
    signature: 'CONTENT',
  });
}

test('reject_mismatched_versions_prerelease_and_invalid_tag', async () => {
  await assert.rejects(() => readDesktopVersion('/definitely/missing'), /Desktop version sources/);
  assert.throws(() => validateStableTag('v0.2.0', '0.1.0'), /does not match/);
  assert.throws(() => validateStableTag('v0.1.0-beta.1', '0.1.0-beta.1'), /stable semver/);
  assert.throws(() => validateStableTag('0.1.0', '0.1.0'), /stable semver/);
});

test('validate_version_cli_runs_when_invoked_directly', () => {
  const scriptPath = fileURLToPath(new URL('./desktop-release.mjs', import.meta.url));

  assert.throws(() => execFileSync(process.execPath, [scriptPath, 'validate-version', '--tag', 'v99.99.99'], {
    cwd: process.cwd(),
    encoding: 'utf8',
  }), /does not match/i);
});

test('manifest_has_only_windows_x86_64_and_exact_version', () => {
  const manifest = validManifest();
  assert.deepEqual(Object.keys(manifest.platforms), ['windows-x86_64']);
  assert.equal(manifest.version, '0.2.0');
  validateUpdaterManifest(manifest, '0.2.0', ['sewernet_0.2.0_x64-setup.exe', 'sewernet_0.2.0_x64-setup.exe.sig']);
});

test('manifest_url_is_https_own_release_asset', () => {
  const manifest = validManifest();
  assert.throws(() => validateUpdaterManifest({
    ...manifest,
    platforms: {
      'windows-x86_64': { url: 'http://example.com/sewernet.exe', signature: 'CONTENT' },
    },
  }, '0.2.0', ['sewernet_0.2.0_x64-setup.exe']), /HTTPS/);
  assert.throws(() => validateUpdaterManifest({
    ...manifest,
    platforms: {
      'windows-x86_64': { url: 'https://evil.example/sewernet.exe', signature: 'CONTENT' },
    },
  }, '0.2.0', ['sewernet_0.2.0_x64-setup.exe']), /SewerNet release asset/);
});

test('missing_signature_asset_or_pubkey_is_failure', () => {
  assert.throws(() => validateUpdaterManifest({
    ...validManifest(),
    platforms: { 'windows-x86_64': { url: `${OWN_RELEASE}missing.exe`, signature: '' } },
  }, '0.2.0', ['missing.exe.sig']), /signature/);

  assert.throws(() => validateUpdaterManifest(validManifest(), '0.2.0', ['other.exe']), /missing from release assets/);
});

test('example_overlay_contains_no_key', async () => {
  const overlayUrl = new URL('../../apps/desktop/src-tauri/tauri.release.conf.example.json', import.meta.url);
  const overlayText = await readFile(overlayUrl, 'utf8');
  const overlay = JSON.parse(overlayText);
  assert.equal(overlay.plugins.updater.pubkey, '');
  assert.doesNotMatch(overlayText, /dW50cnVzdGVk|BEGIN PUBLIC KEY|PRIVATE KEY|TAURI_SIGNING_PRIVATE_KEY/);
});
