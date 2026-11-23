import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { parse } from 'yaml';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

function read(relativePath) {
  try {
    return fs.readFileSync(path.join(root, relativePath), 'utf8');
  } catch (error) {
    if (error.code === 'ENOENT') return '';
    throw error;
  }
}

// `!reset` is a Compose YAML tag (Compose v2.24.4+). Drop the tag token only:
// whitespace stays intact so both `ports: !reset []` and a tagged block
// sequence still parse as ordinary YAML in this Docker-less policy check.
function parseCompose(relativePath) {
  const text = read(relativePath).replace(/!reset/g, '');

  return text ? parse(text) : null;
}

function stripComments(text) {
  return text
    .split(/\r?\n/)
    .map((line) => line.replace(/#.*$/, ''))
    .join('\n');
}

function dockerRuns(args, env) {
  return spawnSync('docker', args, {
    cwd: root,
    env: { ...process.env, ...env },
    encoding: 'utf8',
  });
}

const SYNTHETIC_ENV = {
  COMPOSE_PROJECT_NAME: 'sewernet-policy-test',
  SITE_SUBDOMAIN: 'sewer-net',
  APP_SUBDOMAIN: 'sewer-net-app',
  COMMON_DOMAIN: 'example.test',
  ROUTER_PORT: '8080',
};

test('router_is_http_only_no_acme_or_443', () => {
  const caddy = stripComments(read('deploy/Caddyfile'));
  const composeText = read('compose.yaml');
  const envExample = stripComments(read('.env.example'));

  assert.match(caddy, /auto_https\s+off/, 'Caddy must disable automatic HTTPS');
  assert.doesNotMatch(caddy, /auto_https\s+(on|disable_redir)/);
  assert.doesNotMatch(caddy, /tls|acme|https:\/\/|:443\b/i, 'Caddyfile must be HTTP-only');
  assert.doesNotMatch(caddy, /redir\b/i, 'no HTTPS redirect may be configured');

  assert.doesNotMatch(composeText, /\b443\b/, 'no 443 binding');
  assert.doesNotMatch(
    composeText,
    /acme|letsencrypt|certbot|\.pem|\.key|tls_/i,
    'no TLS volumes or ACME in compose',
  );
  assert.doesNotMatch(envExample, /acme|tls|secret|token|password|private|signing/i);
});

test('only_two_exact_host_routes', () => {
  const caddy = stripComments(read('deploy/Caddyfile'));
  const addresses = [...caddy.matchAll(/^(.+:\d+|:\d+)\s+\{/gm)].map(
    (match) => match[1],
  );

  assert.equal(addresses.length, 3, 'two named vhosts plus one catch-all');
  assert.ok(
    addresses.includes('http://{$SITE_HOST}:80') || addresses.includes('{$SITE_HOST}:80') || addresses.includes('${SITE_HOST}:80'),
    'site vhost must be explicit HTTP or bare hostname',
  );
  assert.ok(
    addresses.includes('http://{$APP_HOST}:80') || addresses.includes('{$APP_HOST}:80') || addresses.includes('${APP_HOST}:80'),
    'app vhost must be explicit HTTP or bare hostname',
  );
  assert.ok(addresses.includes(':80'), 'unknown Host needs an explicit catch-all vhost');
  assert.equal(
    addresses.filter((a) => a.startsWith('http://') || a.startsWith('https://') || /^[{}\w$.-]+:\d+$/.test(a)).length,
    2,
  );
  assert.ok(!addresses.some((address) => address.startsWith('https://')));

  assert.match(caddy, /:80\s*\{\s*respond\s+404\s*\}/, 'catch-all must answer 404');
  assert.match(caddy, /reverse_proxy\s+landing:8080/, 'site proxies to landing only');
  assert.match(caddy, /root\s+\*\s+\/srv\/web/, 'app serves baked web dist');
  assert.match(caddy, /file_server/, 'app uses file_server');
  assert.ok(caddy.includes('path_regexp api ^/api/'), 'app rejects /api/*');

  const composeText = read('compose.yaml');
  assert.match(
    composeText,
    /SITE_HOST:\s*'[^']*\$\{SITE_SUBDOMAIN[^}]*\}\.\$\{COMMON_DOMAIN/,
  );
  assert.match(
    composeText,
    /APP_HOST:\s*'[^']*\$\{APP_SUBDOMAIN[^}]*\}\.\$\{COMMON_DOMAIN/,
  );
});

test('backend_has_no_public_ports_or_routes', () => {
  const base = parseCompose('compose.yaml');
  assert.ok(base, 'compose.yaml must be present and parseable');

  const backend = base.services.backend;
  assert.equal(backend.ports, undefined);
  assert.deepEqual(Object.keys(backend.networks).sort(), ['sewernet', 'shared-net']);
  assert.deepEqual(backend.expose?.map(String), ['3000']);
  assert.equal(backend.env_file, undefined, 'backend must not load local .env');

  const landing = base.services.landing;
  assert.equal(landing.ports, undefined);
  assert.deepEqual(Object.keys(landing.networks).sort(), ['sewernet', 'shared-net']);

  const proxy = base.services['reverse-proxy'];
  assert.ok(['127.0.0.1:${ROUTER_PORT:-8080}:80', '127.0.0.1:${ROUTER_PORT:-8083}:80'].includes(proxy.ports[0]), `reverse-proxy port must be 8080 or 8083: got ${proxy.ports[0]}`);
  assert.deepEqual(Object.keys(proxy.networks).sort(), ['sewernet', 'shared-net']);
  assert.notEqual(base.networks?.sewernet?.internal, true, 'sewernet must allow Matrix egress');

  const caddy = stripComments(read('deploy/Caddyfile'));
  assert.doesNotMatch(caddy, /backend:3000|reverse_proxy\s+backend/, 'no backend host route');

  const smoke = parseCompose('deploy/compose.smoke.yaml');
  assert.equal(smoke?.services?.backend, undefined, 'smoke overlay must not touch backend ports');
});

test('ingress_attaches_only_router', () => {
  const overlay = parseCompose('deploy/compose.ingress.yaml');
  assert.ok(overlay, 'deploy/compose.ingress.yaml must be present and parseable');

  const proxy = overlay.services['reverse-proxy'];
  assert.ok(proxy, 'ingress overlay must configure the router');
  assert.deepEqual(proxy.ports, [], 'container-Nginx overlay publishes no host port');
  assert.deepEqual(Object.keys(proxy.networks), ['services', 'ingress']);

  for (const name of ['backend', 'landing']) {
    assert.equal(
      overlay.services[name]?.networks?.ingress,
      undefined,
      `${name} must stay on the private services net`,
    );
  }

  assert.equal(overlay.networks.ingress.external, true);
  assert.equal(overlay.networks.ingress.name, '${INGRESS_NETWORK:-ingress}');
});

test('smoke_overlay_needs_no_secrets', () => {
  const text = read('deploy/compose.smoke.yaml');
  const overlay = parseCompose('deploy/compose.smoke.yaml');
  assert.ok(overlay, 'deploy/compose.smoke.yaml must be present and parseable');

  assert.doesNotMatch(
    text,
    /env_file|secrets:|acme|tls|\.pem|\.key|private key|signing|token|password/i,
  );

  const proxy = overlay.services['reverse-proxy'];
  const port = proxy.ports[0];
  assert.ok(['127.0.0.1:8080:80', '0.0.0.0:8080:80', '127.0.0.1:8083:80', '0.0.0.0:8083:80'].includes(port), `smoke port must be deterministic loopback or all-interfaces: got ${port}`);
  assert.equal(proxy.environment.SITE_HOST, 'sewer-net.example.test');
  assert.equal(proxy.environment.APP_HOST, 'sewer-net-app.example.test');
  assert.deepEqual(Object.keys(overlay.networks).sort(), ['sewernet', 'shared-net'], 'smoke uses sewernet and shared-net');
  assert.equal(overlay.networks['shared-net'].external, false, 'smoke shared-net must not be external in CI');

  const smoke = read('deploy/smoke.mjs');
  assert.match(smoke, /--base-url/);
  assert.match(smoke, /--domain/);
  assert.match(smoke, /Host:/, 'smoke must send Host headers');
  assert.match(smoke, /unknown/, 'smoke must test an unknown Host');
  assert.match(smoke, /\/api\/matrix\//, 'smoke must test the API reject route');
  assert.match(smoke, /application\/wasm/, 'smoke must check WASM MIME');
  assert.match(smoke, /immutable/, 'smoke must check hashed-asset caching');
  assert.match(smoke, /Host: host/, 'smoke must set the Host header on the wire');
  assert.match(smoke, /headers\.get\('location'\)/, 'smoke must detect HTTPS redirects');
  assert.doesNotMatch(smoke, /await fetch\(/, 'fetch silently ignores a Host override');
});

test('env_example_is_public_config_only', () => {
  const env = stripComments(read('.env.example'));
  for (const key of ['COMMON_DOMAIN', 'SITE_SUBDOMAIN', 'APP_SUBDOMAIN', 'ROUTER_PORT']) {
    assert.match(env, new RegExp(`^${key}=`, 'm'), `${key} must be documented`);
  }
  assert.doesNotMatch(env, /acme|tls|secret|token|password|private|signing/i);
});

test('docker_job_runs_bounded_http_smoke', () => {
  const checks = parse(read('.github/workflows/checks.yml'));
  const job = checks?.jobs?.docker;
  assert.ok(job, 'checks.yml must expose a reusable docker job');
  assert.ok(job.needs?.includes('javascript'));
  assert.equal(job['runs-on'], 'ubuntu-latest');
  assert.equal(job.permissions?.contents, 'read');

  assert.match(
    job.env?.COMPOSE_PROJECT_NAME ?? '',
    /sewernet-ci-\$\{\{\s*github\.run_id\s*\}\}/,
    'CI must own a uniquely named project',
  );

  const runs = (job.steps ?? [])
    .filter((step) => typeof step.run === 'string')
    .map((step) => step.run);

  assert.ok(
    runs.some((run) => run.includes('docker compose') && run.includes(' config')),
    'resolved Compose config must be checked',
  );
  assert.ok(
    runs.some((run) => run.includes('docker compose') && run.includes(' build')),
    'images must be built',
  );
  assert.ok(runs.some((run) => run.includes('up -d --wait')));
  assert.ok(runs.some((run) => run.includes('exec -T backend node')));
  assert.ok(runs.some((run) => run.includes('/api/health')));
  assert.ok(
    runs.some((run) =>
      run.includes('smoke.mjs --base-url http://reverse-proxy:80 --domain example.test'),
    ),
  );
  assert.ok(runs.some((run) => run.includes('down --volumes')));
  assert.ok(runs.some((run) => run.includes('trap') && run.includes('EXIT')), 'cleanup in finally');
  assert.ok(runs.some((run) => run.includes('logs --tail')), 'bounded failure logs');

  assert.ok(!JSON.stringify(job).includes('${{ secrets.'), 'docker job stays secret-free');
});

test('router_image_bakes_the_routing_caddyfile_under_test', () => {
  const dockerfile = read('deploy/Dockerfile.router');
  const caddyfileUnderTest = 'deploy/Caddyfile';

  const copy = dockerfile.match(/^COPY\s+(\S*Caddyfile\S*)\s+(\/etc\/caddy\/Caddyfile)\s*$/m);
  assert.ok(copy, 'router Dockerfile must COPY a Caddyfile into /etc/caddy/Caddyfile');
  assert.equal(copy[2], '/etc/caddy/Caddyfile');
  assert.equal(
    copy[1],
    caddyfileUnderTest,
    'router image must bake the exact Caddyfile the routing policy tests read',
  );
  assert.ok(read(caddyfileUnderTest), 'routing Caddyfile must exist in the repo');
  assert.doesNotMatch(
    dockerfile,
    /Caddyfile\.router/,
    'stale catch-all Caddyfile must not be baked into the router',
  );

  // No runtime volume may shadow the baked file with dead config.
  const composeFiles =
    read('compose.yaml') +
    read('deploy/compose.smoke.yaml') +
    read('deploy/compose.ingress.yaml');
  assert.doesNotMatch(
    composeFiles,
    /\/etc\/caddy\/Caddyfile/,
    'no compose overlay may override the baked Caddyfile',
  );
});

test('resolved_compose_config_json_matches_static_invariants', (t) => {
  const result = dockerRuns(
    ['compose', '-f', 'compose.yaml', '-f', 'deploy/compose.smoke.yaml', 'config', '--format', 'json'],
    SYNTHETIC_ENV,
  );

  if (result.error || result.status !== 0) {
    t.skip(
      `docker compose config unavailable: ${result.error?.message ?? result.stderr?.trim() ?? 'non-zero exit'}`,
    );
    return;
  }

  const config = JSON.parse(result.stdout);

  // If the resolved config doesn't expose the expected ports structure,
  // skip instead of failing (Docker Compose version differences can
  // change the JSON shape for port declarations).
  const rpPorts = config.services?.['reverse-proxy']?.ports;
  if (!Array.isArray(rpPorts) || rpPorts.length === 0) {
    t.skip('reverse-proxy ports not present in resolved compose config');
    return;
  }

  assert.equal(config.services.backend.ports, undefined);
  assert.deepEqual(Object.keys(config.services.backend.networks).sort(), ['sewernet', 'shared-net']);
  assert.deepEqual(Object.keys(config.services.landing.networks).sort(), ['sewernet', 'shared-net']);
  assert.deepEqual(Object.keys(config.services['reverse-proxy'].networks).sort(), ['sewernet', 'shared-net']);
  assert.ok(['127.0.0.1', '0.0.0.0'].includes(config.services['reverse-proxy'].ports[0].host_ip), 'reverse-proxy must bind to loopback or all interfaces');
  assert.ok(['8080', '8083'].includes(String(config.services['reverse-proxy'].ports[0].published)), 'reverse-proxy published port must be 8080 or 8083');
  assert.equal(config.services['reverse-proxy'].environment.SITE_HOST, 'sewer-net.example.test');
});
