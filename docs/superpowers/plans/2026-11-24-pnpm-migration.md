# pnpm Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace npm with pnpm 10.34.9 everywhere so lockfile drift can no longer break `npm ci` in CI or Docker.

**Architecture:** pnpm activated via corepack (no external action allowed by policy). Single `pnpm-lock.yaml` plus `pnpm-workspace.yaml` and `.npmrc` (`node-linker=hoisted` for `patch-package`). CI, Docker and desktop invoke `pnpm`; Nx 24 generates the pruned pnpm runtime output.

**Tech Stack:** Node 24.11.0, corepack 0.34.0, pnpm 10.34.9, Nx 24.0.6, Docker Compose, Node test runner.

**Spec:** `docs/superpowers/specs/2026-11-24-pnpm-migration-design.md`

## Global Constraints

- pnpm **10.34.9**, activated with `corepack enable && corepack prepare pnpm@10.34.9 --activate`.
- No new GitHub Actions; only official `actions/*` pinned by SHA (workflow policy).
- `packageManager: "pnpm@10.34.9"`; remove `workspaces` from root `package.json`.
- `.npmrc` must contain `node-linker=hoisted` so root `postinstall: patch-package` can patch `node_modules/matrix-widget-api`.
- `package-lock.json` must not exist anywhere in the repository; do not change dependency version ranges.
- Do NOT change deploy topology (compose, `sewernet`/`shared-net`, ports, `master` trigger) or the `desktop-native` `if:` condition.
- `npx --yes conventional-changelog-cli@5.0.0` stays unchanged.
- Historical `docs/superpowers/{plans,specs}/*` are records — do not rewrite them. Only live docs (`README.md`, `AGENTS.md`, `ARCHITECTURE.md`, `apps/desktop/README.md`, `docs/superpowers/architecture/ARHITECTURE.md`) get pnpm commands.

## Review Focus

- **Partial workspace in Docker builder:** pnpm `--frozen-lockfile` may reject a workspace that omits some importers; verify with real install before finalizing Dockerfiles.
- **Pruned pnpm output:** Nx emits `pnpm-lock.yaml` + settings-only `pnpm-workspace.yaml` (+ patch/local-path artifacts), not `package-lock.json`; verify `apps/backend/dist` contents and that runtime `pnpm install --frozen-lockfile --prod` succeeds.
- **patch-package under pnpm:** verify `matrix-widget-api+1.20.0.patch` still applies at clean install.
- **Cache keys:** must hash `pnpm-lock.yaml`, not `package-lock.json`, and include pnpm version.
- **`nx sync`:** must not mutate manifests so much that `--frozen-lockfile` breaks after it; verify build stage ordering.

---

### Task 1: Workspace manifests and lockfile

**Files:**
- Modify: `package.json`, `apps/backend/package.json`
- Create: `pnpm-workspace.yaml`, `.npmrc`, `pnpm-lock.yaml`
- Delete: `package-lock.json`
- Modify: `tools/ci/prune-backend-manifest.mjs`, `tools/ci/deployment-build.test.mjs`

**Interfaces:**
- Produces: `pnpm-lock.yaml` consumed by every later task; `pnpm-workspace.yaml` + `.npmrc` copied into Docker; `apps/backend/dist/{package.json,pnpm-lock.yaml,pnpm-workspace.yaml}` consumed by Docker runtime-deps.

- [ ] **Step 1: Switch root manifest to pnpm**

In `package.json`: set `"packageManager": "pnpm@10.34.9"`, delete the `workspaces` array; keep `postinstall: patch-package` and all dependency ranges byte-identical.

- [ ] **Step 2: Add workspace config**

Create `pnpm-workspace.yaml`:
```yaml
packages:
  - apps/*
  - libs/*
```
Create `.npmrc`:
```ini
node-linker=hoisted
```

- [ ] **Step 3: Generate the lockfile from scratch**

Run `corepack enable; corepack prepare pnpm@10.34.9 --activate; pnpm install --lockfile-only`.
Expected: `pnpm-lock.yaml` created; no dependency version changes; `@emnapi/*` transitive deps present. Then delete `package-lock.json`.

- [ ] **Step 4: Verify clean frozen install and patch application**

Remove `node_modules` (PowerShell: `Remove-Item -Recurse -Force node_modules`) and run `pnpm install --frozen-lockfile`.
Expected: exit 0; `postinstall` ran; `git diff --exit-code pnpm-lock.yaml` clean.

- [ ] **Step 5: Make backend prune pnpm-aware**

In `apps/backend/package.json` change `prune-lockfile` outputs to `{workspaceRoot}/apps/backend/dist/package.json`, `dist/pnpm-lock.yaml`, `dist/pnpm-workspace.yaml` and any `dist/patches/**` Nx emits. Rewrite `tools/ci/prune-backend-manifest.mjs` to strip only the `nx` key from the generated `dist/package.json` (Nx already prunes deps and writes the pnpm artifacts) — do not hand-edit the pnpm lockfile.

- [ ] **Step 6: Verify prune output**

Run `pnpm nx run backend:prune`. Inspect `apps/backend/dist`: must contain `main.js`, `package.json`, `pnpm-lock.yaml`, `pnpm-workspace.yaml`, `workspace_modules/@sewer-net/types`. Update `tools/ci/deployment-build.test.mjs` to assert these paths and that pruned `pnpm-lock.yaml` has no dev-only packages. Run `node --test tools/ci/deployment-build.test.mjs` (post-build step — expected to fail on landing assertions until the gate runs; run focused test name only).

- [ ] **Step 7: Commit**

```bash
git add package.json pnpm-workspace.yaml .npmrc pnpm-lock.yaml apps/backend/package.json tools/ci/prune-backend-manifest.mjs tools/ci/deployment-build.test.mjs
git rm package-lock.json
git commit -m "chore: migrate workspace to pnpm 10.34.9"
```

### Task 2: CI workflows and workflow policy

**Files:**
- Modify: `.github/workflows/checks.yml`, `deploy.yml`, `release-desktop.yml`, `tools/ci/workflow-policy.test.mjs`

**Interfaces:**
- Consumes: Task 1's `pnpm-lock.yaml`.
- Produces: all CI installs use `pnpm install --frozen-lockfile`; gate command `pnpm nx run-many -t typecheck,lint,test,build`.

- [ ] **Step 1: Update policy test first**

In `tools/ci/workflow-policy.test.mjs`: `REQUIRED_NPM_VERSION` → `REQUIRED_PNPM_VERSION = '10.34.9'`; `FULL_GATE_COMMAND` → `pnpm nx run-many -t typecheck,lint,test,build`; assert `runs.includes('pnpm install --frozen-lockfile')`, `runs.every(run => !/npm ci|\bnpx nx\b/.test(run))`, pin assertion on `pnpm@${REQUIRED_PNPM_VERSION}`, cache keys include pnpm version and `hashFiles('pnpm-lock.yaml')`, and `installIndex` matches the pnpm install step. Rename cache-path constant to pnpm store (`~/.local/share/pnpm/store` or `~/.pnpm-store` — pick the actual path used in the workflow) plus `.nx/cache`.

- [ ] **Step 2: Run it to verify it fails**

`node --test tools/ci/workflow-policy.test.mjs` → FAIL on old npm assertions.

- [ ] **Step 3: Rewrite workflows**

`checks.yml`: rename "Restore npm download cache" → pnpm store cache with path aligned to the test; key `pnpm-${{ runner.os }}-node-24.11.0-pnpm-10.34.9-${{ hashFiles('pnpm-lock.yaml') }}`; replace "Pin npm" with "Activate pnpm" running `corepack enable; corepack prepare pnpm@10.34.9 --activate; pnpm --version`; Nx cache key pnpm version + `hashFiles('pnpm-lock.yaml', 'nx.json', ...)`; `npm ci` → `pnpm install --frozen-lockfile` (all three jobs); `npx nx` → `pnpm nx`; `npm run desktop:test --workspace=...` → `pnpm --filter @sewer-net/desktop run desktop:test`. Keep `desktop-native` `if:` byte-identical.

`deploy.yml`: add corepack activation step; `cache: npm` → manual pnpm store cache or remove (policy does not cover deploy) — prefer explicit `actions/cache@SHA` if added; `npm ci` → `pnpm install --frozen-lockfile`; four `npx nx` → `pnpm nx`. Keep `master` trigger and dispatch ref.

`release-desktop.yml`: add corepack activation before install in `signed_windows`; `npm ci` → `pnpm install --frozen-lockfile`; `npx nx run desktop:bundle` → `pnpm nx run desktop:bundle` (both occurrences incl. workflow-policy assertion); keep `npx --yes conventional-changelog-cli@5.0.0` and `npm view` unchanged.

- [ ] **Step 4: Verify policy passes**

`node --test tools/ci/workflow-policy.test.mjs` → PASS. Also `node --test tools/ci/desktop-policy.test.mjs` expected to fail until Task 4.

- [ ] **Step 5: Commit**

```bash
git add .github/workflows tools/ci/workflow-policy.test.mjs
git commit -m "ci: use pnpm with frozen lockfile in workflows"
```

### Task 3: Docker images and docker policy

**Files:**
- Modify: `deploy/Dockerfile.backend`, `deploy/Dockerfile.router`, `deploy/Dockerfile.landing`, `tools/ci/docker-policy.test.mjs`, possibly `.dockerignore`

**Interfaces:**
- Consumes: Task 1's `pnpm-lock.yaml`, `pnpm-workspace.yaml`, `.npmrc` and pruned backend dist.
- Produces: images install with `pnpm install --frozen-lockfile`; backend runtime uses pruned pnpm output.

- [ ] **Step 1: Update docker policy test first**

`runtime_has_no_dev_dependencies` asserts `pnpm install --frozen-lockfile --prod`; add assertions that all three Dockerfiles copy `pnpm-lock.yaml`, `pnpm-workspace.yaml`, `.npmrc` and contain no `npm ci` / `npx nx`; backend runtime copies `dist/pnpm-lock.yaml`. Run `node --test tools/ci/docker-policy.test.mjs` → FAIL.

- [ ] **Step 2: Resolve partial-workspace frozen install**

Test empirically in a temp dir: root `package.json`, `pnpm-workspace.yaml`, `.npmrc`, `pnpm-lock.yaml` plus only `apps/backend/package.json` and `libs/types/package.json`, then `pnpm install --frozen-lockfile --lockfile-only`. If pnpm rejects missing importers, copy all nine workspace `package.json` files in every builder stage and keep `.dockerignore` from excluding `apps/desktop/package.json` (narrow that rule instead of dropping desktop wholesale). Record the chosen approach in the commit message.

- [ ] **Step 3: Rewrite Dockerfiles**

Each builder: after `WORKDIR`, `RUN corepack enable && corepack prepare pnpm@10.34.9 --activate`; `COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc ./`; copy the workspace manifests required by Step 2; `RUN pnpm install --frozen-lockfile`; `pnpm nx sync`, `pnpm nx build ...`. Backend also `pnpm nx run backend:prune`; runtime-deps copies `dist/package.json`, `dist/pnpm-lock.yaml`, `dist/pnpm-workspace.yaml` (+ `dist/patches`, `dist/workspace_modules` are already shipped in `dist/`), then `pnpm install --frozen-lockfile --prod`.

- [ ] **Step 4: Verify policy and Docker smoke**

`node --test tools/ci/docker-policy.test.mjs` → PASS. If Docker daemon available: `docker compose -f compose.yaml -f deploy/compose.smoke.yaml build` and `config`; otherwise state that GitHub Docker job is the smoke and do not claim local pass.

- [ ] **Step 5: Commit**

```bash
git add deploy tools/ci/docker-policy.test.mjs .dockerignore
git commit -m "ci: build Docker images with pnpm"
```

### Task 4: Desktop scripts and desktop policy

**Files:**
- Modify: `apps/desktop/project.json`, `apps/desktop/src-tauri/tauri.conf.json`, `tools/ci/desktop-policy.test.mjs`

**Interfaces:**
- Consumes: pnpm workspace; produces `pnpm run desktop:*` commands invoked by Nx and Tauri.

- [ ] **Step 1: Update desktop policy test first**

Change assertions at lines 154–155, 174, 178 from `npm run desktop:*` → `pnpm run desktop:*` and `npx nx run desktop:bundle --skip-nx-cache` → `pnpm nx run desktop:bundle --skip-nx-cache`. Keep the `beforeBuildCommand` regex `/desktop:build/`. Run `node --test tools/ci/desktop-policy.test.mjs` → FAIL.

- [ ] **Step 2: Update scripts**

`apps/desktop/project.json`: all five `command` values `npm run ...` → `pnpm run ...` (`bundle` keeps trailing ` --`).
`apps/desktop/src-tauri/tauri.conf.json`: `beforeDevCommand: "npx nx run web:serve"` → `"pnpm nx run web:serve"`; `beforeBuildCommand: "npm run desktop:build"` → `"pnpm run desktop:build"`.

- [ ] **Step 3: Verify and commit**

`node --test tools/ci/desktop-policy.test.mjs` → PASS.
```bash
git add apps/desktop tools/ci/desktop-policy.test.mjs
git commit -m "chore(desktop): invoke scripts through pnpm"
```

### Task 5: Live documentation

**Files:** `README.md`, `AGENTS.md`, `ARCHITECTURE.md`, `apps/desktop/README.md`, `docs/superpowers/architecture/ARHITECTURE.md`

- [ ] **Step 1:** Replace `npm install` → `pnpm install`, `npx nx ...` → `pnpm nx ...`, `npm ci` → `pnpm install --frozen-lockfile`, and add a line noting pnpm is pinned in `packageManager` and activated via corepack.
- [ ] **Step 2:** `grep -rn "npm ci\|npx nx\|npm install\|package-lock.json" README.md AGENTS.md ARCHITECTURE.md apps/desktop/README.md docs/superpowers/architecture/ARHITECTURE.md` → no live-command matches (historical plans/specs untouched).
- [ ] **Step 3:** `git add <docs>; git commit -m "docs: switch commands to pnpm"`

### Task 6: Full verification gate

- [ ] `pnpm install --frozen-lockfile` (already clean from Task 1).
- [ ] `node --test "tools/ci/workspace-policy.test.mjs" "tools/ci/workflow-policy.test.mjs" "tools/ci/docker-policy.test.mjs" "tools/ci/compose-policy.test.mjs" "tools/ci/desktop-policy.test.mjs" "tools/ci/matrix-widget-api-freeze.test.mjs"` → PASS.
- [ ] `pnpm nx run-many -t typecheck,lint,test,build` → all 25/25 targets PASS.
- [ ] `node --test "tools/ci/deployment-build.test.mjs" "tools/release/*.test.mjs"` → PASS.
- [ ] `git diff --check` → clean.
- [ ] Report actual commands/results; do not claim GitHub CI green until a real run exists.
