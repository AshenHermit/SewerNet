import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { publishDraftRelease } from './publish-desktop.mjs';

const tag = 'v0.1.0';
const version = '0.1.0';
const installerName = `SewerNet_${version}_x64-setup.exe`;
const signature = 'synthetic updater signature';
const installerUrl = `https://github.com/AshenHermit/SewerNet/releases/latest/download/${installerName}`;
const repository = 'AshenHermit/SewerNet';

async function fixture(t, { includeSignature = true, ownAssets = [] } = {}) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'sewer-release-test-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const artifactsDir = path.join(root, 'artifacts');
  await fs.mkdir(artifactsDir);
  await fs.writeFile(path.join(artifactsDir, installerName), 'synthetic installer');
  if (includeSignature) {
    await fs.writeFile(path.join(artifactsDir, `${installerName}.sig`), signature);
  }
  await fs.writeFile(
    path.join(artifactsDir, 'latest.json'),
    JSON.stringify({
      version,
      notes: 'Synthetic release notes',
      pub_date: '2026-11-20T00:00:00.000Z',
      platforms: {
        'windows-x86_64': { url: installerUrl, signature },
      },
    }),
  );
  const notesFile = path.join(root, 'notes.md');
  await fs.writeFile(notesFile, 'Synthetic release notes');

  const release = { id: 17, tag, repository, draft: true, prerelease: false, body: '<!-- sewernet-desktop-release -->', html_url: `https://github.com/AshenHermit/SewerNet/releases/tag/${tag}` };
  const assets = [...ownAssets];
  let releaseLookups = 0;
  const client = {
    publishCalls: [],
    deletedForeignAssets: [],
    async getReleaseByTag(requestedTag, requestedRepository) {
      if (requestedTag !== undefined) assert.equal(requestedTag, tag);
      if (requestedRepository !== undefined) assert.equal(requestedRepository, repository);
      releaseLookups += 1;
      return releaseLookups === 1 ? null : release;
    },
    async createDraftRelease(input) {
      assert.equal(input.tag, tag);
      assert.equal(input.version, version);
      assert.equal(input.repository, repository);
      return release;
    },
    async listReleaseAssets() { return assets.map(({ name, content }) => ({ name, content })); },
    async uploadReleaseAsset(_release, asset) {
      if (client.failUploadName === asset.name) throw new Error(`synthetic upload failure: ${asset.name}`);
      if (assets.some((existing) => existing.name === asset.name)) {
        throw new Error(`duplicate asset: ${asset.name}`);
      }
      assets.push({ name: asset.name, content: await fs.readFile(asset.path, 'utf8') });
    },
    async readReleaseAsset(_release, name) {
      const asset = assets.find((candidate) => candidate.name === name);
      if (!asset) throw new Error(`missing release asset: ${name}`);
      return asset.content;
    },
    async publishRelease(id) {
      client.publishCalls.push(id);
      release.draft = false;
      return release;
    },
    async deleteReleaseAsset(asset) {
      if (asset.foreign) client.deletedForeignAssets.push(asset.name);
      const index = assets.indexOf(asset);
      if (index >= 0) assets.splice(index, 1);
    },
    assets,
    release,
  };

  return { artifactsDir, notesFile, client, assets };
}

test('unsigned_or_incomplete_assets_never_publish', async (t) => {
  const { artifactsDir, notesFile, client } = await fixture(t, { includeSignature: false });
  await assert.rejects(
    publishDraftRelease({ tag, version, artifactsDir, notesFile }, client),
    /signature/i,
  );
  assert.equal(client.publishCalls.length, 0);
});

test('manifest_references_existing_exact_sig_content', async (t) => {
  const { artifactsDir, notesFile, client } = await fixture(t);
  const result = await publishDraftRelease({ tag, version, artifactsDir, notesFile }, client);
  assert.equal(result.releaseUrl, client.release.html_url);
  assert.ok(client.publishCalls.includes(client.release.id));
  assert.equal(await client.readReleaseAsset(client.release, 'latest.json').then(JSON.parse).then((manifest) => manifest.platforms['windows-x86_64'].signature), signature);
});

test('partial_upload_retry_repairs_only_own_draft', async (t) => {
  const { artifactsDir, notesFile, client, assets } = await fixture(t);
  client.failUploadName = 'latest.json';
  await assert.rejects(publishDraftRelease({ tag, version, artifactsDir, notesFile }, client), /synthetic upload failure/);
  assert.equal(client.publishCalls.length, 0);
  assert.ok(assets.some((asset) => asset.name === installerName));

  client.failUploadName = undefined;
  let draftLookups = 0;
  client.getReleaseByTag = async () => {
    draftLookups += 1;
    return client.release;
  };
  const result = await publishDraftRelease({ tag, version, artifactsDir, notesFile }, client);
  assert.equal(result.releaseUrl, client.release.html_url);
  assert.equal(draftLookups, 2);
  assert.equal(assets.filter((asset) => asset.name === installerName).length, 1);
});

test('duplicate_asset_names_are_rejected_without_deletion', async (t) => {
  const dup = { name: installerName, content: 'foreign asset', foreign: true };
  const { artifactsDir, notesFile, client } = await fixture(t, { ownAssets: [dup, { ...dup }] });
  await assert.rejects(publishDraftRelease({ tag, version, artifactsDir, notesFile }, client), /duplicate/i);
  assert.deepEqual(client.deletedForeignAssets, []);
  assert.equal(client.publishCalls.length, 0);
});

test('existing_public_release_is_not_overwritten', async (t) => {
  const { artifactsDir, notesFile, client } = await fixture(t);
  client.getReleaseByTag = async () => ({ id: 12, tag, draft: false, html_url: 'https://example.invalid/release' });
  await assert.rejects(publishDraftRelease({ tag, version, artifactsDir, notesFile }, client), /published|public/i);
  assert.equal(client.publishCalls.length, 0);
});

test('foreign_assets_fail_closed_without_publish', async (t) => {
  const foreign = { name: 'foreign.txt', content: 'untouched', foreign: true };
  const { artifactsDir, notesFile, client } = await fixture(t, { ownAssets: [foreign] });
  await assert.rejects(publishDraftRelease({ tag, version, artifactsDir, notesFile }, client), /unexpected.*asset/i);
  assert.deepEqual(client.deletedForeignAssets, []);
  assert.equal(client.publishCalls.length, 0);
});

test('late foreign asset fails closed after upload verification', async (t) => {
  const { artifactsDir, notesFile, client } = await fixture(t);
  const listAssets = client.listReleaseAssets;
  let calls = 0;
  client.listReleaseAssets = async (...args) => {
    calls += 1;
    const listed = await listAssets(...args);
    if (calls === 3) listed.push({ name: 'injected.txt' });
    return listed;
  };
  await assert.rejects(publishDraftRelease({ tag, version, artifactsDir, notesFile }, client), /unexpected.*asset/i);
  assert.equal(client.publishCalls.length, 0);
});

test('artifact symlinks are rejected', async (t) => {
  const { artifactsDir, notesFile, client } = await fixture(t);
  const file = path.join(artifactsDir, installerName);
  await fs.unlink(file);
  try {
    await fs.symlink(path.join(artifactsDir, `${installerName}.sig`), file);
  } catch (error) {
    if (error.code === 'EPERM' || error.code === 'EACCES') return t.skip('symlink creation unavailable on this Windows runner');
    throw error;
  }
  await assert.rejects(publishDraftRelease({ tag, version, artifactsDir, notesFile }, client), /symlink|regular file/i);
  assert.equal(client.publishCalls.length, 0);
});

test('installer URL must use exact canonical GitHub release URL', async (t) => {
  const { artifactsDir, notesFile, client } = await fixture(t);
  const manifestPath = path.join(artifactsDir, 'latest.json');
  const manifest = JSON.parse(await fs.readFile(manifestPath, 'utf8'));
  manifest.platforms['windows-x86_64'].url = `https://github.com.evil/AshenHermit/SewerNet/releases/latest/download/${installerName}`;
  await fs.writeFile(manifestPath, JSON.stringify(manifest));
  await assert.rejects(publishDraftRelease({ tag, version, artifactsDir, notesFile }, client), /installer.*url|release asset/i);
  assert.equal(client.publishCalls.length, 0);
});

test('existing draft release identity must match requested repository and tag', async (t) => {
  const { artifactsDir, notesFile, client } = await fixture(t);
  client.getReleaseByTag = async () => ({ ...client.release, tag: 'v0.2.0', repository: 'attacker/fork' });
  await assert.rejects(publishDraftRelease({ tag, version, repository, artifactsDir, notesFile }, client), /identity|tag|repository/i);
  assert.equal(client.publishCalls.length, 0);
});

test('publish response identity and stable flags are verified', async (t) => {
  const { artifactsDir, notesFile, client } = await fixture(t);
  client.publishRelease = async (id) => {
    client.publishCalls.push(id);
    return { ...client.release, draft: false, prerelease: true, repository: 'attacker/fork' };
  };
  await assert.rejects(publishDraftRelease({ tag, version, repository, artifactsDir, notesFile }, client), /publish response|prerelease|identity/i);
});

test('foreign repository is rejected before API mutation', async (t) => {
  const { artifactsDir, notesFile, client } = await fixture(t);
  await assert.rejects(publishDraftRelease({ tag, version, repository: 'attacker/SewerNet', artifactsDir, notesFile }, client), /repository/i);
  assert.equal(client.publishCalls.length, 0);
});

test('installer digest mismatch prevents upload and publish', async (t) => {
  const { artifactsDir, notesFile, client } = await fixture(t);
  await assert.rejects(publishDraftRelease({ tag, version, artifactsDir, notesFile, expectedInstallerSha256: '0'.repeat(64) }, client), /sha-256/i);
  assert.equal(client.publishCalls.length, 0);
  assert.equal(client.assets.length, 0);
});

test('published response with wrong release ID is rejected', async (t) => {
  const { artifactsDir, notesFile, client } = await fixture(t);
  client.publishRelease = async () => ({ ...client.release, id: 99, draft: false });
  await assert.rejects(publishDraftRelease({ tag, version, artifactsDir, notesFile }, client), /ID mismatch/i);
});

test('published response with wrong release tag is rejected', async (t) => {
  const { artifactsDir, notesFile, client } = await fixture(t);
  client.publishRelease = async () => ({ ...client.release, tag: 'v0.2.0', draft: false });
  await assert.rejects(publishDraftRelease({ tag, version, artifactsDir, notesFile }, client), /tag identity/i);
});

test('manifest signature must equal uploaded signature asset contents', async (t) => {
  const { artifactsDir, notesFile, client } = await fixture(t);
  const manifestPath = path.join(artifactsDir, 'latest.json');
  const manifest = JSON.parse(await fs.readFile(manifestPath, 'utf8'));
  manifest.platforms['windows-x86_64'].signature = 'different synthetic signature';
  await fs.writeFile(manifestPath, JSON.stringify(manifest));
  await assert.rejects(publishDraftRelease({ tag, version, artifactsDir, notesFile }, client), /signature/i);
  assert.equal(client.publishCalls.length, 0);
});
