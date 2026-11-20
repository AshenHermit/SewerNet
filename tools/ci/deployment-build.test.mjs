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

test('deployment_docs_distinguish_internal_http_and_external_tls', () => {
  const readmePath = path.join(workspaceRoot, 'deploy', 'README.md');
  const readme = fs.existsSync(readmePath) ? fs.readFileSync(readmePath, 'utf8') : '';
  const envExample = fs.readFileSync(path.join(workspaceRoot, '.env.example'), 'utf8');

  // Brief's exact assertions.
  assert.ok(readme.includes('proxy_set_header Host $host;'));
  assert.ok(readme.includes('127.0.0.1') && readme.includes('COMMON_DOMAIN'));
  assert.ok(readme.includes('HTTPS') && readme.includes('INGRESS_NETWORK'));

  // Required public env var names must appear in both the template and the guide.
  for (const key of [
    'COMMON_DOMAIN',
    'SITE_SUBDOMAIN',
    'APP_SUBDOMAIN',
    'ROUTER_PORT',
    'INGRESS_NETWORK',
  ]) {
    assert.match(envExample, new RegExp(`^${key}=`, 'm'), `${key} must be in .env.example`);
    assert.ok(readme.includes(key), `${key} must be documented in deploy/README.md`);
  }

  // The external Nginx example must preserve the original Host header.
  assert.match(readme, /proxy_set_header\s+Host\s+\$host;/);

  // No ACME / 443 / TLS volumes may be instructed for the compose stack.
  const deployDocs = readme;
  assert.doesNotMatch(
    deployDocs,
    /acme|letsencrypt|certbot/i,
    'deployment docs must not instruct ACME inside compose',
  );
  assert.doesNotMatch(deployDocs, /:\s*443\b|listen\s+443/i, 'no host 443 in the compose stack');
  assert.doesNotMatch(
    deployDocs,
    /tls[_-]?(vol|cert|key)|mount[^\n]*\.(pem|key)/i,
    'no TLS volumes for compose',
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
