import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const workspaceRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../..',
);

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(path.join(workspaceRoot, filePath), 'utf8'));
}

test('landing_build_outputs_real_export', () => {
  const exportDir = path.join(workspaceRoot, 'apps', 'landing', 'out');
  const indexPath = path.join(exportDir, 'index.html');
  const devLogPath = path.join(exportDir, 'dev-log', 'index.html');

  assert.ok(fs.statSync(indexPath).isFile(), 'landing export must include out/index.html');
  assert.ok(fs.statSync(devLogPath).isFile(), 'export must include out/dev-log/index.html');
  assert.match(fs.readFileSync(indexPath, 'utf8'), /<html/);
  assert.match(fs.readFileSync(devLogPath, 'utf8'), /<html/);
});

test('landing_cache_tracks_out', () => {
  const landing = readJson('apps/landing/package.json');
  const build = landing.nx.targets.build;

  assert.ok(build, 'landing build target must be explicit');
  assert.ok(
    build.outputs?.some((output) => output.includes('apps/landing/out')),
    'landing build cache outputs must include apps/landing/out',
  );
});

test('backend_generated_manifest_contains_runtime_only', () => {
  const distDir = path.join(workspaceRoot, 'apps', 'backend', 'dist');
  const manifestPath = path.join(distDir, 'package.json');
  const lockPath = path.join(distDir, 'package-lock.json');

  assert.ok(fs.statSync(path.join(distDir, 'main.js')).isFile(), 'backend build must include main.js');
  assert.ok(fs.statSync(manifestPath).isFile(), 'backend prune must generate package.json');
  assert.ok(fs.statSync(lockPath).isFile(), 'backend prune must generate package-lock.json');

  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  const lock = JSON.parse(fs.readFileSync(lockPath, 'utf8'));
  const runtimeDependencies = [
    '@nestjs/common',
    '@nestjs/core',
    '@nestjs/platform-express',
    '@sewer-net/types',
    'reflect-metadata',
    'rxjs',
    'tslib',
    'undici',
  ];

  assert.deepEqual(Object.keys(manifest.dependencies ?? {}).sort(), runtimeDependencies.sort());
  assert.deepEqual(manifest.devDependencies ?? {}, {}, 'runtime manifest must not include dev dependencies');
  assert.deepEqual(lock.packages?.['']?.devDependencies ?? {}, {}, 'runtime lock must not include dev dependencies');
  assert.equal(manifest.dependencies.nx, undefined);
  assert.equal(manifest.dependencies.typescript, undefined);
  assert.equal(manifest.devDependencies?.['@nestjs/testing'], undefined);
  assert.equal(lock.packages?.['node_modules/@nestjs/testing'], undefined);
});
