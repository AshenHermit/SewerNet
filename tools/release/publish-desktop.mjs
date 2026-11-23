import { lstat, readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateStableTag, validateUpdaterManifest } from './desktop-release.mjs';

const REQUIRED_ASSETS = ['latest.json'];
const INSTALLER_PATTERN = /^SewerNet_[0-9]+\.[0-9]+\.[0-9]+_x64-setup\.exe$/;
const API_ROOT = 'https://api.github.com';
const EXPECTED_REPOSITORY = 'AshenHermit/SewerNet';
const RELEASE_MARKER = '<!-- sewernet-desktop-release -->';

function verifyRelease(release, { id, tag, repository, draft, prerelease } = {}) {
  if (!release || typeof release !== 'object') throw new Error('GitHub release response is missing');
  if (id !== undefined && release.id !== id) throw new Error('GitHub release response ID mismatch');
  if ((release.tag_name ?? release.tag) !== tag) throw new Error('GitHub release tag identity mismatch');
  const actualRepository = typeof release.repository === 'string'
    ? release.repository
    : release.repository?.full_name ?? release.repository_full_name ?? release.target_repository;
  if (actualRepository !== repository) throw new Error('GitHub release repository identity mismatch');
  let releaseUrl;
  try { releaseUrl = new URL(release.html_url); } catch { throw new Error('GitHub release URL identity is missing'); }
  if (releaseUrl.origin !== 'https://github.com' || releaseUrl.pathname !== `/${repository}/releases/tag/${tag}` || releaseUrl.search || releaseUrl.hash) throw new Error('GitHub release URL repository/tag identity mismatch');
  if (release.draft !== draft) throw new Error(`GitHub release draft state mismatch: expected ${draft}`);
  if (prerelease !== undefined && release.prerelease !== prerelease) throw new Error(`GitHub release prerelease state mismatch: expected ${prerelease}`);
  if (typeof release.body !== 'string' || !release.body.includes(RELEASE_MARKER)) throw new Error('GitHub release immutable workflow marker is missing');
  return release;
}

function ensureClient(client) {
  for (const method of ['getReleaseByTag', 'createDraftRelease', 'listReleaseAssets', 'uploadReleaseAsset', 'readReleaseAsset', 'publishRelease']) {
    if (typeof client?.[method] !== 'function') throw new TypeError(`githubClient.${method} must be a function`);
  }
}

function getReleaseUrl(release) {
  const url = release?.html_url ?? release?.url;
  if (typeof url !== 'string' || !url) throw new Error('GitHub release URL is missing');
  return url;
}

export async function publishDraftRelease({ tag, version, repository = EXPECTED_REPOSITORY, artifactsDir, notesFile, expectedInstallerSha256, expectedInstallerName }, githubClient) {
  ensureClient(githubClient);
  validateStableTag(tag, version);
  if (typeof artifactsDir !== 'string' || !artifactsDir) throw new Error('artifactsDir is required');
  if (typeof notesFile !== 'string' || !notesFile) throw new Error('notesFile is required');
  if (repository !== EXPECTED_REPOSITORY) throw new Error(`Unexpected release repository: ${repository}`);

  const fileNames = await readdir(artifactsDir);
  const installers = fileNames.filter((name) => INSTALLER_PATTERN.test(name));
  if (installers.length !== 1) throw new Error('Expected exactly one signed Windows NSIS installer');
  const installerName = installers[0];
  if (expectedInstallerName && installerName !== expectedInstallerName) throw new Error('Signed artifact digest names a different installer');
  const signatureName = `${installerName}.sig`;
  const requiredNames = [installerName, signatureName, ...REQUIRED_ASSETS];
  const localNames = [...requiredNames, ...(process.env.RELEASE_DIGEST_FILE ? ['release-notes.md', 'installer.sha256'] : [])];
  if (process.env.RELEASE_DIGEST_FILE && path.basename(process.env.RELEASE_DIGEST_FILE) !== 'installer.sha256') throw new Error('Digest metadata file must be installer.sha256');
  if (expectedInstallerSha256 && !/^[a-f0-9]{64}$/.test(expectedInstallerSha256)) throw new Error('Invalid expected installer SHA-256 digest');
  for (const name of requiredNames) {
    if (!fileNames.includes(name)) throw new Error(`Required release signature/asset is missing: ${name}`);
  }
  if (fileNames.some((name) => !localNames.includes(name))) throw new Error('Unexpected artifact in release directory');
  if (process.env.RELEASE_DIGEST_FILE && !fileNames.includes('release-notes.md')) throw new Error('Transferred release notes file is missing');

  for (const name of localNames) {
    const info = await lstat(path.join(artifactsDir, name));
    if (!info.isFile() || info.isSymbolicLink()) throw new Error(`Release asset must be a regular non-symlink file: ${name}`);
  }
  const installerContents = await readFile(path.join(artifactsDir, installerName));
  if (expectedInstallerSha256) {
    const { createHash } = await import('node:crypto');
    const actualDigest = createHash('sha256').update(installerContents).digest('hex');
    if (actualDigest !== expectedInstallerSha256) throw new Error('Installer SHA-256 digest does not match signed-job digest');
  }
  const signatureContents = (await readFile(path.join(artifactsDir, signatureName), 'utf8')).trim();
  const manifestContents = await readFile(path.join(artifactsDir, 'latest.json'), 'utf8');
  const manifest = JSON.parse(manifestContents);
  const notes = await readFile(notesFile, 'utf8');
  if (process.env.RELEASE_DIGEST_FILE && await readFile(path.join(artifactsDir, 'release-notes.md'), 'utf8') !== notes) throw new Error('Transferred release notes differ from publish notes');
  if (typeof notes !== 'string' || !notes.trim()) throw new Error('Release notes are empty');
  if (!installerContents.length) throw new Error('Installer asset is empty');
  if (!signatureContents) throw new Error('Updater signature asset is empty');
  const installerUrl = manifest?.platforms?.['windows-x86_64']?.url;
  let parsedInstallerUrl;
  try { parsedInstallerUrl = new URL(installerUrl); } catch { throw new Error('Manifest installer URL is invalid'); }
  const canonicalInstallerUrl = `https://github.com/${repository}/releases/latest/download/${installerName}`;
  if (installerUrl !== canonicalInstallerUrl || parsedInstallerUrl.origin !== 'https://github.com' || parsedInstallerUrl.pathname !== `/${repository}/releases/latest/download/${installerName}` || parsedInstallerUrl.search || parsedInstallerUrl.hash || parsedInstallerUrl.username || parsedInstallerUrl.password) {
    throw new Error('Manifest installer URL must be the exact canonical release asset URL');
  }
  if (manifest.platforms['windows-x86_64'].signature !== signatureContents) {
    throw new Error('Manifest signature does not equal signature asset contents');
  }
  if (manifest.notes !== notes) throw new Error('Manifest notes do not match release notes asset');
  validateUpdaterManifest(manifest, version, requiredNames);

  const releaseIdentity = { tag, repository, draft: true, prerelease: false };
  let release = await githubClient.getReleaseByTag(tag, repository);
  if (release) {
    if (!release.draft) throw new Error(`Release ${tag} is already published; refusing overwrite`);
    if (release.tag !== tag || release.repository !== repository || release.prerelease !== false || !String(release.body ?? '').includes(RELEASE_MARKER)) {
      throw new Error('Existing draft identity is not owned by this workflow/repository/tag');
    }
    verifyRelease(release, releaseIdentity);
  }
  if (!release) {
    release = await githubClient.createDraftRelease({ tag, version, repository, notes: `${notes}\n\n${RELEASE_MARKER}`, draft: true, prerelease: false });
    verifyRelease(release, releaseIdentity);
  }

  const existingAssets = await githubClient.listReleaseAssets(release);
  if (!Array.isArray(existingAssets)) throw new Error('GitHub release assets response must be an array');
  const allowedNames = new Set(requiredNames);
  for (const asset of existingAssets) if (!allowedNames.has(asset.name)) throw new Error(`Unexpected asset in draft release: ${asset.name}`);
  const counts = new Map();
  for (const asset of existingAssets) counts.set(asset.name, (counts.get(asset.name) ?? 0) + 1);
  for (const [name, count] of counts) if (count > 1) throw new Error(`Duplicate asset name in draft release: ${name}`);

  // Existing named assets are immutable here: never replace/delete them.
  for (const name of requiredNames) {
    if (!counts.has(name)) await githubClient.uploadReleaseAsset(release, { name, path: path.join(artifactsDir, name) });
  }

  const finalAssets = await githubClient.listReleaseAssets(release);
  if (!Array.isArray(finalAssets)) throw new Error('GitHub release assets response must be an array');
  const finalCounts = new Map();
  for (const asset of finalAssets) finalCounts.set(asset.name, (finalCounts.get(asset.name) ?? 0) + 1);
  for (const [name, count] of finalCounts) if (count > 1) throw new Error(`Duplicate asset name in draft release: ${name}`);
  const finalNames = finalAssets.map((asset) => asset.name);
  for (const name of requiredNames) {
    if (finalNames.filter((candidate) => candidate === name).length !== 1) {
      throw new Error(`Draft release must contain exactly one ${name}`);
    }
  }
  const verifiedAssets = await githubClient.listReleaseAssets(release);
  if (!Array.isArray(verifiedAssets)) throw new Error('GitHub release assets response must be an array');
  const verifiedCounts = new Map();
  for (const asset of verifiedAssets) {
    if (!allowedNames.has(asset.name)) throw new Error(`Unexpected asset in draft release: ${asset.name}`);
    verifiedCounts.set(asset.name, (verifiedCounts.get(asset.name) ?? 0) + 1);
  }
  for (const name of requiredNames) if (verifiedCounts.get(name) !== 1) throw new Error(`Draft release must contain exactly one ${name}`);
  const uploadedManifestText = await githubClient.readReleaseAsset(release, 'latest.json');
  const uploadedManifest = typeof uploadedManifestText === 'string'
    ? JSON.parse(uploadedManifestText)
    : JSON.parse(Buffer.from(uploadedManifestText).toString('utf8'));
  validateUpdaterManifest(uploadedManifest, version, finalNames);
  if (uploadedManifest.platforms['windows-x86_64'].signature !== signatureContents) {
    throw new Error('Draft manifest signature does not equal uploaded signature asset contents');
  }
  if (uploadedManifest.notes !== notes) throw new Error('Draft manifest notes differ from release notes');
  if (uploadedManifest.platforms['windows-x86_64'].url !== installerUrl) throw new Error('Draft manifest installer URL changed');
  const uploadedSignature = await githubClient.readReleaseAsset(release, signatureName);
  const signatureText = typeof uploadedSignature === 'string' ? uploadedSignature : Buffer.from(uploadedSignature).toString('utf8');
  if (signatureText.trim() !== signatureContents) throw new Error('Uploaded signature asset contents differ');
  const uploadedInstaller = await githubClient.readReleaseAsset(release, installerName);
  const installerBytes = Buffer.isBuffer(uploadedInstaller) ? uploadedInstaller : Buffer.from(uploadedInstaller);
  if (!installerBytes.equals(installerContents)) throw new Error('Uploaded installer differs from signed artifact');

  const immediatelyBeforePublish = await githubClient.getReleaseByTag(tag, repository);
  verifyRelease(immediatelyBeforePublish, { ...releaseIdentity, id: release.id });
  const published = await githubClient.publishRelease(release.id);
  verifyRelease(published, { tag, repository, id: release.id, draft: false, prerelease: false });
  return { releaseUrl: getReleaseUrl(published), releaseId: published.id };
}

export function createGitHubClient({ token, repository, tempDir = process.env.RUNNER_TEMP ?? process.cwd() }) {
  if (!token || !repository || !/^[^/]+\/[^/]+$/.test(repository)) throw new Error('GitHub token and owner/repository are required');
  const headers = { authorization: `Bearer ${token}`, accept: 'application/vnd.github+json', 'x-github-api-version': '2022-11-28' };
  async function request(url, options = {}) {
    const response = await fetch(url, { ...options, headers: { ...headers, ...options.headers } });
    if (!response.ok) {
      const message = await response.text();
      const error = new Error(`GitHub API ${response.status}: ${message.slice(0, 500)}`);
      error.status = response.status;
      throw error;
    }
    return response;
  }
  const endpoint = `${API_ROOT}/repos/${repository}`;
  return {
    async getReleaseByTag(tag, requestedRepository = repository) {
      if (requestedRepository !== repository) throw new Error('Requested release repository differs from configured repository');
      try {
        const release = await (await request(`${endpoint}/releases/tags/${encodeURIComponent(tag)}`)).json();
        return { ...release, tag: release.tag_name, repository: release.repository?.full_name ?? repository, html_url: release.html_url };
      } catch (error) { if (error.status === 404) return null; throw error; }
    },
    async createDraftRelease({ tag, version, notes, repository: requestedRepository = repository }) {
      if (requestedRepository !== repository) throw new Error('Requested release repository differs from configured repository');
      const response = await request(`${endpoint}/releases`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ tag_name: tag, name: `SewerNet ${version}`, body: notes, draft: true, prerelease: false }),
      });
      const created = await response.json();
      return { ...created, tag: created.tag_name, repository: created.repository?.full_name ?? repository, html_url: created.html_url };
    },
    async listReleaseAssets(release) {
      const results = [];
      let page = 1;
      while (true) {
        const response = await request(`${endpoint}/releases/${release.id}/assets?per_page=100&page=${page}`);
        const assets = await response.json();
        if (!Array.isArray(assets)) throw new Error('GitHub release assets response must be an array');
        results.push(...assets);
        if (assets.length < 100) return results;
        page += 1;
      }
    },
    async uploadReleaseAsset(release, { name, path: assetPath }) {
      const content = await readFile(assetPath);
      const uploadUrl = release.upload_url.replace(/\{.*$/, '');
      await request(`${uploadUrl}?name=${encodeURIComponent(name)}`, {
        method: 'POST',
        headers: { 'content-type': 'application/octet-stream' },
        body: content,
      });
    },
    async readReleaseAsset(release, name) {
      const assets = await this.listReleaseAssets(release);
      const matching = assets.filter((asset) => asset.name === name);
      if (matching.length !== 1) throw new Error(`Expected exactly one GitHub asset named ${name}`);
      const assetUrl = new URL(matching[0].url);
      if (assetUrl.origin !== 'https://api.github.com' || !assetUrl.pathname.startsWith(`${new URL(endpoint).pathname}/releases/assets/`)) throw new Error('GitHub asset download URL is outside configured repository API');
      const response = await request(assetUrl, { headers: { accept: 'application/octet-stream' } });
      return Buffer.from(await response.arrayBuffer());
    },
    async publishRelease(id) {
      const response = await request(`${endpoint}/releases/${id}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ draft: false }),
      });
      const published = await response.json();
      return { ...published, draft: published.draft, tag: published.tag_name, repository: published.repository?.full_name ?? repository, html_url: published.html_url };
    },
  };
}

async function main(argv) {
  if (argv[0] !== 'publish') throw new Error('Usage: node tools/release/publish-desktop.mjs publish');
  const tag = process.env.RELEASE_TAG;
  const version = process.env.RELEASE_VERSION?.replace(/^v/, '');
  const repository = process.env.GITHUB_REPOSITORY;
  const client = createGitHubClient({ token: process.env.GITHUB_TOKEN, repository });
  let expectedInstallerSha256;
  if (process.env.RELEASE_DIGEST_FILE) {
    const digestLine = (await readFile(process.env.RELEASE_DIGEST_FILE, 'utf8')).trim();
    const match = digestLine.match(/^([a-f0-9]{64})\s+\*?([^\s]+)$/);
    if (!match || match[2] !== path.basename(match[2]) || !INSTALLER_PATTERN.test(match[2])) throw new Error('Invalid signed artifact SHA-256 metadata');
    expectedInstallerSha256 = match[1];
    process.env.RELEASE_EXPECTED_INSTALLER_NAME = match[2];
  }
  const { releaseUrl } = await publishDraftRelease({
    tag,
    version,
    repository,
    artifactsDir: process.env.RELEASE_ARTIFACTS_DIR,
    notesFile: process.env.RELEASE_NOTES_FILE,
    expectedInstallerSha256,
    expectedInstallerName: process.env.RELEASE_EXPECTED_INSTALLER_NAME,
  }, client);
  process.stdout.write(`Published desktop release: ${releaseUrl}\n`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main(process.argv.slice(2)).catch((error) => {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  });
}
