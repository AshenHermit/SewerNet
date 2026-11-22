import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const workspaceRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../..',
);

const require = createRequire(import.meta.url);
const nxPackageJsonPath = require.resolve('nx/package.json');
const nxPackageJson = JSON.parse(fs.readFileSync(nxPackageJsonPath, 'utf8'));
const nxBin = path.join(path.dirname(nxPackageJsonPath), nxPackageJson.bin.nx);

const execOptions = {
  cwd: workspaceRoot,
  encoding: 'utf8',
  maxBuffer: 64 * 1024 * 1024,
};

function nx(args) {
  return execFileSync(process.execPath, [nxBin, ...args], execOptions);
}

function showLandingProject() {
  return JSON.parse(nx(['show', 'project', 'landing', '--json']));
}

test('landing_has_explicit_typecheck', () => {
  const landing = showLandingProject();

  assert.ok(landing.targets.typecheck);
  assert.equal(landing.targets.typecheck.options.cwd, 'apps/landing');
  assert.match(
    landing.targets.typecheck.command ??
      landing.targets.typecheck.options.command,
    /tsc.*--noEmit/,
  );
});

test('typecheck_works_without_next_output', () => {
  const landing = showLandingProject();
  const dependsOn = landing.targets.typecheck?.dependsOn ?? [];
  assert.ok(
    !dependsOn.includes('build'),
    'landing:typecheck must not depend on the Next production build',
  );

  const landingRoot = path.join(workspaceRoot, 'apps', 'landing');
  const nextDir = path.join(landingRoot, '.next');
  const buildInfoPath = path.join(
    landingRoot,
    'dist',
    'tsconfig.tsbuildinfo',
  );

  // Rename can fail on Windows while Next holds cache handles; a recursive copy
  // gives the policy test same empty-.next check without mutating build output.
  const hasNextOutput = fs.existsSync(nextDir);
  const backupParent = hasNextOutput
    ? fs.mkdtempSync(path.join(os.tmpdir(), 'landing-next-policy-'))
    : null;
  const backupDir = backupParent
    ? path.join(backupParent, '.next')
    : null;
  if (hasNextOutput) {
    fs.cpSync(nextDir, backupDir, { recursive: true });
    fs.rmSync(nextDir, { recursive: true, force: true });
  }
  // Force a full tsc run instead of reusing incremental state.
  fs.rmSync(buildInfoPath, { force: true });

  try {
    nx(['run', 'landing:typecheck', '--skip-nx-cache']);
  } finally {
    if (hasNextOutput) {
      fs.rmSync(nextDir, { recursive: true, force: true });
      fs.cpSync(backupDir, nextDir, { recursive: true });
      fs.rmSync(backupParent, { recursive: true, force: true });
    }
  }
});
