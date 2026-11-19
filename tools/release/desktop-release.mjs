import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const STABLE_TAG = /^v(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;
const STABLE_VERSION = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;
const OWN_RELEASE_PREFIX = 'https://github.com/AshenHermit/SewerNet/releases/latest/download/';

export function validateStableTag(tag, version) {
  if (typeof tag !== 'string' || !STABLE_TAG.test(tag)) {
    throw new Error(`Invalid stable semver tag: ${String(tag)}`);
  }
  if (typeof version !== 'string' || !STABLE_VERSION.test(version)) {
    throw new Error(`Invalid stable semver version: ${String(version)}`);
  }
  if (tag.slice(1) !== version) {
    throw new Error(`Tag ${tag} does not match desktop version ${version}`);
  }
}

export async function readDesktopVersion(root = process.cwd()) {
  try {
    const [packageText, cargoText, tauriText] = await Promise.all([
      readFile(path.join(root, 'package.json'), 'utf8'),
      readFile(path.join(root, 'apps/desktop/src-tauri/Cargo.toml'), 'utf8'),
      readFile(path.join(root, 'apps/desktop/src-tauri/tauri.conf.json'), 'utf8'),
    ]);
    const npmVersion = JSON.parse(packageText).version;
    const cargoMatch = cargoText.match(/\[package\][\s\S]*?^version\s*=\s*"([^"]+)"/m);
    const tauriVersion = JSON.parse(tauriText).version;
    const cargoVersion = cargoMatch?.[1];

    if (!npmVersion || npmVersion === '0.0.0' || !cargoVersion || !tauriVersion) {
      throw new Error('missing');
    }
    if (npmVersion !== cargoVersion || npmVersion !== tauriVersion) {
      throw new Error(`Desktop version sources differ: npm=${npmVersion}, Cargo=${cargoVersion}, Tauri=${tauriVersion}`);
    }
    if (!STABLE_VERSION.test(npmVersion)) {
      throw new Error(`Desktop version is not stable semver: ${npmVersion}`);
    }
    return npmVersion;
  } catch (error) {
    if (/differ|not stable semver/.test(error.message)) throw error;
    throw new Error(`Desktop version sources could not be read: ${error.message}`);
  }
}

export function buildUpdaterManifest({ version, notes, pubDate, installerUrl, signature }) {
  if (!STABLE_VERSION.test(version)) throw new Error(`Invalid stable semver version: ${String(version)}`);
  if (typeof notes !== 'string') throw new Error('Release notes must be a string');
  if (typeof pubDate !== 'string' || Number.isNaN(Date.parse(pubDate))) throw new Error('Invalid pub_date');
  if (typeof installerUrl !== 'string' || !installerUrl) throw new Error('Missing installer URL');
  if (typeof signature !== 'string' || !signature.trim()) throw new Error('Missing updater signature');

  return {
    version,
    notes,
    pub_date: pubDate,
    platforms: {
      'windows-x86_64': { url: installerUrl, signature },
    },
  };
}

export function validateUpdaterManifest(manifest, expectedVersion, assetNames) {
  if (!manifest || typeof manifest !== 'object') throw new Error('Manifest must be an object');
  if (manifest.version !== expectedVersion) throw new Error('Manifest version does not match expected version');
  if (!STABLE_VERSION.test(manifest.version)) throw new Error('Manifest version must be stable semver');
  if (!manifest.notes || typeof manifest.notes !== 'string') throw new Error('Manifest release notes are missing');
  if (typeof manifest.pub_date !== 'string' || Number.isNaN(Date.parse(manifest.pub_date))) throw new Error('Manifest pub_date is invalid');

  const platforms = manifest.platforms;
  if (!platforms || typeof platforms !== 'object' || Array.isArray(platforms)) throw new Error('Manifest platforms are missing');
  const keys = Object.keys(platforms);
  if (keys.length !== 1 || keys[0] !== 'windows-x86_64') {
    throw new Error('Manifest must contain only windows-x86_64 platform');
  }

  const platform = platforms['windows-x86_64'];
  if (!platform || typeof platform !== 'object') throw new Error('windows-x86_64 asset is missing');
  if (typeof platform.signature !== 'string' || !platform.signature.trim()) throw new Error('Missing updater signature asset or signature content');
  let url;
  try { url = new URL(platform.url); } catch { throw new Error('Installer asset URL is invalid'); }
  if (url.protocol !== 'https:') throw new Error('Installer asset URL must use HTTPS');
  if (!platform.url.startsWith(OWN_RELEASE_PREFIX)) throw new Error('Installer URL must reference an AshenHermit SewerNet release asset');

  const assetName = decodeURIComponent(url.pathname.slice(url.pathname.lastIndexOf('/') + 1));
  if (!Array.isArray(assetNames) || !assetNames.includes(assetName)) throw new Error(`Installer asset ${assetName} is missing from release assets`);
  const sigName = `${assetName}.sig`;
  if (!assetNames.includes(sigName)) throw new Error(`Signature asset ${sigName} is missing`);
}

async function main(argv) {
  const [command, ...args] = argv;
  if (command !== 'validate-version') throw new Error('Usage: validate-version --tag vX.Y.Z');
  const tagIndex = args.indexOf('--tag');
  const tag = tagIndex >= 0 ? args[tagIndex + 1] : undefined;
  if (!tag) throw new Error('Usage: validate-version --tag vX.Y.Z');
  const version = await readDesktopVersion(process.cwd());
  validateStableTag(tag, version);
  process.stdout.write(`desktop version ${version} matches stable tag ${tag}\n`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main(process.argv.slice(2)).catch((error) => {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  });
}
