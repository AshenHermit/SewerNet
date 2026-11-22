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
  'actions/download-artifact',
]);

// Upload allowlist: web build, landing output and test reports only. Never the
// whole workspace, native/target directories or release outputs.
const ALLOWED_ARTIFACT_PATHS = [
  'apps/web/dist',
  'apps/landing/out',
  'apps/*/test-output',
  'libs/*/test-output',
];

// Cache allowlist for the `javascript` job: npm download cache and the local
// Nx cache for the unsigned JavaScript checks only.
const ALLOWED_CACHE_PATHS = ['~/.npm/_cacache', '.nx/cache'];

// Packaging/signing outputs must never be cached or uploaded by any job. Later
// plans may add native (cargo) and Docker jobs, but those stay build-only:
// `src-tauri/target`, release bundles and their installers/signatures are not
// cache or artifact material for CI checks.
const PACKAGING_OUTPUT_PATTERN =
  /(src-tauri[\\/]target|(^|[\\/])(bundle|release|signing)([\\/]|$)|\.(exe|msi|msix|dmg|deb|rpm|appx|pkg|sig)$)/i;

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

function jobSteps(job) {
  return job?.steps ?? [];
}

function readJob(workflowName, jobName) {
  const { workflow } = readWorkflow(workflowName);
  const job = workflow.jobs?.[jobName];

  assert.ok(job, `${workflowName} must expose a "${jobName}" job`);

  return { job, workflow };
}

function stepPaths(step) {
  const value = step.with?.path;

  if (value === undefined) {
    return [];
  }

  const lines = Array.isArray(value) ? value : String(value).split('\n');

  return lines.map((line) => line.trim()).filter(Boolean);
}

function actionStepsIn(steps) {
  return steps.filter(
    (step) => typeof step.uses === 'string' && !step.uses.startsWith('./'),
  );
}

function actionSteps(workflow) {
  return actionStepsIn(workflowSteps(workflow));
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

    for (const [jobName, job] of workflowJobs(workflow)) {
      for (const [scope, access] of Object.entries(job.permissions ?? {})) {
        assert.equal(
          access,
          'read',
          `${name}:${jobName} must keep ${scope} read-only`,
        );
      }
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
  const { workflow: ci } = readWorkflow('ci.yml');
  const { job } = readJob('checks.yml', 'javascript');

  assert.equal(
    ci.jobs.javascript.uses,
    './.github/workflows/checks.yml',
    'ci.yml must call the reusable checks workflow',
  );
  assert.equal(job['runs-on'], 'ubuntu-latest');
  assert.equal(job.env.CI, 'true');
  assert.equal(job['timeout-minutes'], 30);

  const runs = jobSteps(job)
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

  const jobActionSteps = actionStepsIn(jobSteps(job));

  const checkout = jobActionSteps.find((step) =>
    step.uses.startsWith('actions/checkout@'),
  );
  assert.ok(checkout, 'checks.yml must check out the repository');
  assert.equal(checkout.with['fetch-depth'], 0);
  assert.equal(checkout.with['persist-credentials'], false);

  const setupNode = jobActionSteps.find((step) =>
    step.uses.startsWith('actions/setup-node@'),
  );
  assert.ok(setupNode, 'checks.yml must set up Node.js');
  assert.equal(setupNode.with['node-version'], REQUIRED_NODE_VERSION);
});

test('artifacts_are_allowlisted', () => {
  // The allowlist describes what the JavaScript gate may publish; other jobs
  // added later (native, Docker) own their artifacts in their own plans.
  const { job } = readJob('checks.yml', 'javascript');
  const steps = jobSteps(job);
  const gateIndex = steps.findIndex((step) => step.run === FULL_GATE_COMMAND);

  assert.ok(gateIndex >= 0, 'checks.yml: javascript job must run the full gate');

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
      'checks.yml: artifact upload needs explicit paths',
    );

    for (const candidate of paths) {
      assert.ok(
        isAllowedArtifactPath(candidate),
        `checks.yml: ${candidate} is outside the artifact allowlist`,
      );
      assert.ok(
        !candidate.includes('${{') &&
          !candidate.includes('github.workspace') &&
          candidate !== '.' &&
          candidate !== '**',
        'checks.yml: upload must not cover the whole workspace',
      );
    }

    const isTestReport = paths.some((candidate) =>
      candidate.includes('test-output'),
    );
    if (isTestReport) {
      assert.equal(
        step.if,
        'failure()',
        'checks.yml: test reports upload on failure only',
      );
    } else {
      assert.ok(
        !step.if || step.if === 'success()',
        'checks.yml: build artifacts upload only after a green gate',
      );
    }

    assert.ok(
      index > gateIndex,
      'checks.yml: artifacts upload only after the gate ran',
    );
  }

  const uploads = jobSteps(job).filter(
    (step) =>
      typeof step.uses === 'string' &&
      step.uses.startsWith('actions/upload-artifact@'),
  );

  const landingUpload = uploads.find((step) =>
    stepPaths(step).includes('apps/landing/out'),
  );

  assert.ok(landingUpload, 'landing export must be uploaded explicitly');

  const webUpload = uploads.find((step) =>
    stepPaths(step).some((candidate) => candidate.startsWith('apps/web/dist')),
  );
  assert.ok(webUpload, 'web build must be uploaded explicitly');
});

test('javascript_cache_roots_are_npm_and_nx_only', () => {
  const { job } = readJob('checks.yml', 'javascript');
  const steps = jobSteps(job);
  const cacheSteps = actionStepsIn(steps).filter((step) =>
    step.uses.startsWith('actions/cache@'),
  );

  assert.equal(
    cacheSteps.length,
    2,
    'the javascript job configures only the npm and Nx caches',
  );

  const cachedPaths = cacheSteps.flatMap(stepPaths).sort();
  assert.deepEqual(
    cachedPaths,
    [...ALLOWED_CACHE_PATHS].sort(),
    'cache roots stay limited to the npm download cache and .nx/cache',
  );

  for (const candidate of cachedPaths) {
    assert.ok(
      !/\.next|node_modules|test-output|dist/.test(candidate.replace(/^!/, '')),
      `${candidate} must never be a cache root`,
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
    assert.ok(!/\$\{\{\s*secrets\./.test(raw), `${name} must stay secret-free`);
  }
});

// File-global invariant: later plans may add native (cargo) and Docker jobs,
// but no job may cache or publish packaging/signing outputs.
test('no_job_caches_or_uploads_packaging_outputs', () => {
  for (const name of ['ci.yml', 'checks.yml']) {
    const { workflow } = readWorkflow(name);

    for (const [jobName, job] of workflowJobs(workflow)) {
      for (const step of jobSteps(job)) {
        const paths = stepPaths(step);
        const isCache =
          typeof step.uses === 'string' &&
          step.uses.startsWith('actions/cache@');
        const isUpload =
          typeof step.uses === 'string' &&
          step.uses.startsWith('actions/upload-artifact@');

        if (!isCache && !isUpload) {
          continue;
        }

        for (const candidate of paths) {
          assert.ok(
            !PACKAGING_OUTPUT_PATTERN.test(candidate.replace(/^!/, '')),
            `${name}:${jobName}: ${candidate} is a packaging/signing output`,
          );
        }
      }
    }
  }
});

test('release_requires_green_checks_and_master_ancestor', () => {
  const { workflow, raw } = readWorkflow('release-desktop.yml');
  assert.deepEqual(workflow.on.push?.tags, ['v*']);
  assert.ok('workflow_dispatch' in workflow.on);
  assert.equal(workflow.permissions.contents, 'read');
  assert.equal(workflow.jobs.checks.uses, './.github/workflows/checks.yml');
  assert.deepEqual(workflow.jobs.publish.needs, ['checks', 'preflight', 'signed_windows']);
  assert.match(raw, /git merge-base --is-ancestor/);
  assert.match(raw, /origin\/master/);
  assert.match(raw, /validate-version --tag/);
  assert.match(raw, /if:\s*startsWith\(github\.ref, 'refs\/tags\/v'\)/);
});

test('publish_job_revalidates_trusted_release_context_and_uses_signed_artifact_metadata', () => {
  const { workflow, raw } = readWorkflow('release-desktop.yml');
  const publish = workflow.jobs.publish;
  assert.equal(publish.environment, 'desktop-release');
  assert.match(JSON.stringify(publish), /git merge-base --is-ancestor/);
  assert.match(JSON.stringify(publish), /AshenHermit\/SewerNet/);
  assert.match(JSON.stringify(publish), /GITHUB_REPOSITORY/);
  const signedJob = workflow.jobs.signed_windows;
  assert.ok(jobSteps(signedJob).some((step) => /conventional-changelog-cli/.test(step.run ?? '')));
  assert.ok(jobSteps(signedJob).some((step) => /installer\.sha256/.test(step.run ?? '')));
  assert.ok(jobSteps(publish).some((step) => /release-notes\.md/.test(step.run ?? '')));
  assert.match(raw, /TAURI_UPDATER_PUBLIC_KEY is required/);
  assert.match(raw, /download-artifact/);
});

test('signing_secrets_only_in_protected_job', () => {
  const { workflow, raw } = readWorkflow('release-desktop.yml');
  const publish = workflow.jobs.publish;
  const signed = workflow.jobs.signed_windows;
  assert.equal(publish.environment, 'desktop-release');
  assert.equal(publish.permissions.contents, 'write');
  assert.equal(signed.environment, 'desktop-release');
  assert.equal(signed['runs-on'], 'windows-latest');
  assert.match(raw, /TAURI_SIGNING_PRIVATE_KEY/);
  assert.match(raw, /TAURI_SIGNING_PRIVATE_KEY_PASSWORD/);
  assert.match(raw, /TAURI_UPDATER_PUBLIC_KEY/);
  assert.match(raw, /npx nx run desktop:bundle --skip-nx-cache/);
  assert.ok(!/printenv|env\s*\|\s*sort|Write-Output\s+\$env:TAURI/.test(raw));
  for (const [jobName, job] of workflowJobs(workflow)) {
    if (jobName !== 'signed_windows') {
      assert.ok(!JSON.stringify(job).includes('TAURI_SIGNING_PRIVATE_KEY'));
    }
  }
  assert.ok(!raw.includes('pull_request_target'));
});

test('release_actions_are_pinned_to_official_shas', () => {
  const { raw, workflow } = readWorkflow('release-desktop.yml');
  for (const step of actionSteps(workflow)) {
    const [ownerRepo, ref] = step.uses.split('@');
    assert.ok(ALLOWED_ACTIONS.has(ownerRepo), `release-desktop.yml: ${ownerRepo} is not approved`);
    assert.match(ref ?? '', /^[0-9a-f]{40}$/);
  }
  const usesLines = raw.split(/\r?\n/).filter((line) => /^\s*(-\s*)?uses:\s*\S+/.test(line)).filter((line) => !/uses:\s*\.\//.test(line));
  assert.equal(usesLines.length, actionSteps(workflow).length);
  for (const line of usesLines) assert.match(line, /uses:\s*\S+@[0-9a-f]{40}\s+#\s+v\d+\.\d+\.\d+\s*$/);
});

test('actions_are_pinned_to_official_shas', () => {
  for (const name of ['ci.yml', 'checks.yml', 'release-desktop.yml']) {
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
