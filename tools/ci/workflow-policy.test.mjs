import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { parse } from 'yaml';

const workspaceRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../..',
);

const workflowsDir = path.join(workspaceRoot, '.github', 'workflows');

const REQUIRED_NODE_VERSION = '24.11.0';
const REQUIRED_NPM_VERSION = '11.6.1';
const FULL_GATE_COMMAND = 'npx nx run-many -t typecheck,lint,test,build';

// Actions may only come from the official `actions` org, pinned to a commit
// SHA and documented with the release tag.
const ALLOWED_ACTIONS = new Set([
  'actions/checkout',
  'actions/setup-node',
  'actions/cache',
  'actions/upload-artifact',
]);

// Upload allowlist: web build, landing output and test reports only. Never the
// whole workspace, native/target directories or release outputs.
const ALLOWED_ARTIFACT_PATHS = [
  'apps/web/dist',
  'apps/landing/.next',
  'apps/*/test-output',
  'libs/*/test-output',
];

// Cache allowlist: npm download cache and the local Nx cache for the unsigned
// JavaScript checks only.
const ALLOWED_CACHE_PATHS = ['~/.npm/_cacache', '.nx/cache'];

function readWorkflow(name) {
  const file = path.join(workflowsDir, name);
  const raw = fs.readFileSync(file, 'utf8');

  return { name, file, raw, workflow: parse(raw) };
}

function workflowJobs(workflow) {
  return Object.entries(workflow.jobs ?? {});
}

function workflowSteps(workflow) {
  return workflowJobs(workflow).flatMap(([, job]) => job.steps ?? []);
}

function stepPaths(step) {
  const value = step.with?.path;

  if (value === undefined) {
    return [];
  }

  const lines = Array.isArray(value) ? value : String(value).split('\n');

  return lines.map((line) => line.trim()).filter(Boolean);
}

function actionSteps(workflow) {
  return workflowSteps(workflow).filter(
    (step) => typeof step.uses === 'string' && !step.uses.startsWith('./'),
  );
}

function isAllowedArtifactPath(candidate) {
  const normalized = candidate.replace(/^!/, '');

  return ALLOWED_ARTIFACT_PATHS.some(
    (allowed) =>
      normalized === allowed || normalized.startsWith(`${allowed}/`),
  );
}

test('ci_policy_is_read_only', () => {
  const ci = readWorkflow('ci.yml');
  const checks = readWorkflow('checks.yml');

  assert.ok(!('pull_request_target' in ci.workflow.on));
  assert.ok(!('pull_request_target' in checks.workflow.on));
  assert.ok('pull_request' in ci.workflow.on);
  assert.ok('workflow_dispatch' in ci.workflow.on);
  assert.deepEqual(ci.workflow.on.push?.branches, ['master']);
  assert.ok(
    !('tags' in (ci.workflow.on.push ?? {})),
    'PR workflow must not trigger on release tags',
  );
  assert.ok(
    'workflow_call' in checks.workflow.on,
    'checks.yml must be reusable through workflow_call',
  );
  assert.deepEqual(Object.keys(checks.workflow.on), ['workflow_call']);

  assert.equal(ci.workflow.permissions.contents, 'read');
  assert.equal(checks.workflow.permissions.contents, 'read');

  for (const { name, workflow } of [ci, checks]) {
    for (const [scope, access] of Object.entries(workflow.permissions)) {
      assert.equal(access, 'read', `${name} must keep ${scope} read-only`);
    }
  }

  const group = String(ci.workflow.concurrency?.group ?? '');
  assert.match(group, /github\.workflow/);
  assert.match(group, /github\.ref/);
  assert.match(
    String(ci.workflow.concurrency?.['cancel-in-progress'] ?? ''),
    /pull_request/,
    'superseded pull request runs must be cancelled',
  );

  for (const { name, raw } of [ci, checks]) {
    assert.ok(
      !/\$\{\{\s*secrets\./.test(raw),
      `${name} must not reference repository secrets`,
    );
  }
});

test('checks_run_full_workspace_nonwatch', () => {
  const { workflow: checks } = readWorkflow('checks.yml');
  const { workflow: ci } = readWorkflow('ci.yml');
  const job = checks.jobs.javascript;

  assert.equal(
    ci.jobs.javascript.uses,
    './.github/workflows/checks.yml',
    'ci.yml must call the reusable checks workflow',
  );
  assert.ok(job, 'checks.yml must expose a javascript job');
  assert.equal(job.env.CI, 'true');
  assert.equal(job['timeout-minutes'], 30);

  const runs = job.steps
    .filter((step) => typeof step.run === 'string')
    .map((step) => step.run);

  assert.ok(runs.includes(FULL_GATE_COMMAND));
  assert.ok(runs.includes('npm ci'));
  assert.ok(
    runs.some(
      (run) =>
        run.includes('node --test') && run.includes('tools/ci/*.test.mjs'),
    ),
    'policy tests must run before the Nx gate',
  );
  assert.ok(
    runs.some((run) => run.includes(`npm@${REQUIRED_NPM_VERSION}`)),
    `npm ${REQUIRED_NPM_VERSION} must be pinned in the runner`,
  );
  assert.ok(
    runs.every((run) => !/--watch|\bwatch\b/.test(run)),
    'CI checks must not run in watch mode',
  );

  const policyStepIndex = job.steps.findIndex(
    (step) => typeof step.run === 'string' && step.run.includes('node --test'),
  );
  const gateStepIndex = job.steps.findIndex(
    (step) => step.run === FULL_GATE_COMMAND,
  );
  assert.ok(policyStepIndex >= 0 && policyStepIndex < gateStepIndex);

  const checkout = actionSteps(checks).find((step) =>
    step.uses.startsWith('actions/checkout@'),
  );
  assert.ok(checkout, 'checks.yml must check out the repository');
  assert.equal(checkout.with['fetch-depth'], 0);
  assert.equal(checkout.with['persist-credentials'], false);

  const setupNode = actionSteps(checks).find((step) =>
    step.uses.startsWith('actions/setup-node@'),
  );
  assert.ok(setupNode, 'checks.yml must set up Node.js');
  assert.equal(setupNode.with['node-version'], REQUIRED_NODE_VERSION);
});

test('artifacts_are_allowlisted', () => {
  for (const name of ['ci.yml', 'checks.yml']) {
    const { workflow } = readWorkflow(name);
    const steps = workflowSteps(workflow);
    const gateIndex = steps.findIndex((step) => step.run === FULL_GATE_COMMAND);

    for (const [index, step] of steps.entries()) {
      const isUpload =
        typeof step.uses === 'string' &&
        step.uses.startsWith('actions/upload-artifact@');

      if (!isUpload) {
        continue;
      }

      const paths = stepPaths(step);
      assert.ok(
        paths.length > 0,
        `${name}: artifact upload needs explicit paths`,
      );

      for (const candidate of paths) {
        assert.ok(
          isAllowedArtifactPath(candidate),
          `${name}: ${candidate} is outside the artifact allowlist`,
        );
        assert.ok(
          !candidate.includes('${{') &&
            !candidate.includes('github.workspace') &&
            candidate !== '.' &&
            candidate !== '**',
          `${name}: upload must not cover the whole workspace`,
        );
      }

      const isTestReport = paths.some((candidate) =>
        candidate.includes('test-output'),
      );
      if (isTestReport) {
        assert.equal(
          step.if,
          'failure()',
          `${name}: test reports upload on failure only`,
        );
      } else {
        assert.ok(
          !step.if || step.if === 'success()',
          `${name}: build artifacts upload only after a green gate`,
        );
      }

      if (gateIndex >= 0) {
        assert.ok(
          index > gateIndex,
          `${name}: artifacts upload only after the gate ran`,
        );
      }
    }
  }

  const { workflow: checks } = readWorkflow('checks.yml');
  const uploads = workflowSteps(checks).filter(
    (step) =>
      typeof step.uses === 'string' &&
      step.uses.startsWith('actions/upload-artifact@'),
  );

  const landingUpload = uploads.find((step) =>
    stepPaths(step).some((candidate) =>
      candidate.startsWith('apps/landing/.next'),
    ),
  );

  assert.ok(landingUpload, 'landing output must be uploaded explicitly');
  assert.equal(landingUpload.with['include-hidden-files'], true);
  assert.ok(
    stepPaths(landingUpload).includes('!apps/landing/.next/cache'),
    'Next.js internal cache must not be uploaded',
  );

  const webUpload = uploads.find((step) =>
    stepPaths(step).some((candidate) => candidate.startsWith('apps/web/dist')),
  );
  assert.ok(webUpload, 'web build must be uploaded explicitly');
});

test('cache_excludes_native_and_secrets', () => {
  const { workflow: checks } = readWorkflow('checks.yml');
  const cacheSteps = actionSteps(checks).filter((step) =>
    step.uses.startsWith('actions/cache@'),
  );

  assert.equal(cacheSteps.length, 2, 'only npm and Nx caches are configured');

  const cachedPaths = cacheSteps.flatMap(stepPaths).sort();
  assert.deepEqual(cachedPaths, [...ALLOWED_CACHE_PATHS].sort());

  for (const candidate of cachedPaths) {
    assert.ok(
      !/(src-tauri|\btarget\b|release|\.next|node_modules|test-output|dist)/.test(
        candidate.replace(/^!/, ''),
      ),
      `${candidate} must never be cached`,
    );
  }

  for (const step of cacheSteps) {
    const key = String(step.with?.key ?? '');
    assert.match(key, /runner\.os/, 'cache key must include the runner OS');
    assert.ok(
      key.includes(REQUIRED_NODE_VERSION),
      'cache key must include Node version',
    );
    assert.ok(
      key.includes(REQUIRED_NPM_VERSION),
      'cache key must include npm version',
    );
    assert.match(
      key,
      /hashFiles\([^)]*package-lock\.json/,
      'cache key must include the lockfile hash',
    );
    assert.ok(!/secrets/.test(key));
  }

  const nxCacheKey = String(
    cacheSteps.find((step) => stepPaths(step).includes('.nx/cache')).with.key,
  );
  assert.match(nxCacheKey, /hashFiles\([^)]*nx\.json/);
  assert.match(nxCacheKey, /hashFiles\([^)]*tsconfig\.base\.json/);

  // Caches must be restored before the steps that consume them.
  const steps = checks.jobs.javascript.steps;
  const npmCacheIndex = steps.findIndex((step) =>
    stepPaths(step).includes('~/.npm/_cacache'),
  );
  const nxCacheIndex = steps.findIndex((step) =>
    stepPaths(step).includes('.nx/cache'),
  );
  const installIndex = steps.findIndex((step) => step.run === 'npm ci');
  const gateIndex = steps.findIndex((step) => step.run === FULL_GATE_COMMAND);

  assert.ok(npmCacheIndex >= 0 && npmCacheIndex < installIndex);
  assert.ok(nxCacheIndex >= 0 && nxCacheIndex < gateIndex);

  for (const name of ['ci.yml', 'checks.yml']) {
    const { raw } = readWorkflow(name);
    assert.ok(!/src-tauri/.test(raw), `${name} must not touch native artifacts`);
    assert.ok(!/\$\{\{\s*secrets\./.test(raw), `${name} must stay secret-free`);
  }
});

test('actions_are_pinned_to_official_shas', () => {
  for (const name of ['ci.yml', 'checks.yml']) {
    const { raw, workflow } = readWorkflow(name);

    for (const step of actionSteps(workflow)) {
      const [ownerRepo, ref] = step.uses.split('@');
      assert.ok(
        ALLOWED_ACTIONS.has(ownerRepo),
        `${name}: ${ownerRepo} is not an approved official action`,
      );
      assert.match(ref ?? '', /^[0-9a-f]{40}$/, `${name}: ${step.uses} must be a SHA`);
    }

    const usesLines = raw
      .split(/\r?\n/)
      .filter((line) => /^\s*(-\s*)?uses:\s*\S+/.test(line))
      .filter((line) => !/uses:\s*\.\//.test(line));
    assert.equal(usesLines.length, actionSteps(workflow).length);

    for (const line of usesLines) {
      assert.match(
        line,
        /uses:\s*\S+@[0-9a-f]{40}\s+#\s+v\d+\.\d+\.\d+\s*$/,
        `${name}: "${line.trim()}" needs a SHA pin and a version comment`,
      );
    }
  }
});
