import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import test from 'node:test';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');

function readRootFile(path) {
  try {
    return readFileSync(resolve(root, path), 'utf8');
  } catch (error) {
    if (error.code === 'ENOENT') return '';
    throw error;
  }
}

// Small dockerignore evaluator: glob patterns are matched against each path
// component and its parent directories; last matching rule wins.
function globRegex(pattern) {
  let regex = '^';
  for (let i = 0; i < pattern.length; i += 1) {
    const char = pattern[i];
    if (char === '*' && pattern[i + 1] === '*') {
      i += 1;
      if (pattern[i + 1] === '/') {
        i += 1;
        regex += '(?:.*/)?';
      } else {
        regex += '.*';
      }
    } else if (char === '*') {
      regex += '[^/]*';
    } else if (char === '?') {
      regex += '[^/]';
    } else {
      regex += char.replace(/[|\\{}()[\]^$+?.]/g, '\\$&');
    }
  }
  return new RegExp(`${regex}$`);
}

function inDockerContext(filePath, dockerignore = readRootFile('.dockerignore')) {
  const normalizedPath = filePath.replaceAll('\\', '/').replace(/^\.\//, '');
  const pathParts = normalizedPath.split('/');
  const rules = dockerignore
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith('#'))
    .map((line) => {
      const negated = line.startsWith('!');
      const pattern = (negated ? line.slice(1) : line).replace(/^\//, '').replace(/\/$/, '');
      return { negated, regex: globRegex(pattern), pattern };
    });

  let included = true;
  for (const rule of rules) {
    const matches = pathParts.some((_, index) => {
      const candidate = pathParts.slice(0, index + 1).join('/');
      return rule.regex.test(candidate);
    });
    if (matches) included = rule.negated;
  }
  return included;
}

const backendDockerfile = readRootFile('deploy/Dockerfile.backend');
const landingDockerfile = readRootFile('deploy/Dockerfile.landing');
const routerDockerfile = readRootFile('deploy/Dockerfile.router');

test('context_excludes_credentials_env_keys_and_agents', () => {
  for (const path of [
    'CREDENTIALS.md',
    '.env',
    '.env.production',
    '.git/config',
    'apps/desktop/src-tauri/target/debug/app',
    'deploy/cert.key',
    'apps/backend/private.pem',
    'signing-temp-overlay/private/cert.pem',
    'AGENTS.md',
    '.claude/agents/reviewer.md',
  ]) {
    assert.equal(inDockerContext(path), false, `${path} must be excluded from Docker context`);
  }
  assert.equal(inDockerContext('.env.example'), true, '.env.example must remain available as template');
});

test('runtime_has_no_dev_dependencies', () => {
  assert.match(backendDockerfile, /npm ci --omit=dev/);
  assert.match(backendDockerfile, /COPY --from=runtime-deps[^\n]*\/app\/node_modules \.\/node_modules/);
  assert.doesNotMatch(backendDockerfile, /COPY --from=builder .*node_modules/);
});

test('backend_runs_nonroot_with_healthcheck', () => {
  assert.match(backendDockerfile, /USER node/);
  assert.match(backendDockerfile, /EXPOSE 3000/);
  assert.match(backendDockerfile, /"node",\s*"main\.js"/);
  assert.match(backendDockerfile, /HEALTHCHECK[\s\S]*?fetch\(['"]http:\/\/127\.0\.0\.1:3000\/api\/health['"]\)/);
});

test('landing_and_router_copy_only_export_or_dist', () => {
  assert.match(landingDockerfile, /COPY --from=builder \/workspace\/apps\/landing\/out \.\//);
  assert.match(landingDockerfile, /COPY deploy\/Caddyfile\.landing/);
  assert.match(routerDockerfile, /COPY --from=builder[^\n]*\/workspace\/apps\/web\/dist \/srv\/web/);
  assert.doesNotMatch(routerDockerfile, /apps\/desktop|\.claude|agents/i);
});

test('router_caddyfile_serves_web_dist_root', () => {
  const routerCaddyfile = readRootFile('deploy/Caddyfile.router');
  assert.match(routerCaddyfile, /:80\s*\{/);
  assert.match(routerCaddyfile, /root\s+\*\s+\/srv\/web/);
  assert.match(routerCaddyfile, /file_server/);
  assert.match(
    routerDockerfile,
    /COPY deploy\/Caddyfile\.router \/etc\/caddy\/Caddyfile/,
  );
});
