#!/usr/bin/env node
// HTTP smoke for the Caddy router. Pure HTTP + Host headers: no Docker API,
// no credentials, no dependence on the owner's real domain or ports.
// Designed for GitHub Actions: runs inside the backend container on the
// shared Docker network, using service names (not localhost).
// Example:
//   node deploy/smoke.mjs --base-url http://reverse-proxy:80 --domain example.test
import assert from 'node:assert/strict';
import http from 'node:http';
import https from 'node:https';

function parseArgs(argv) {
  const options = {
    baseUrl: 'http://reverse-proxy:80',
    domain: 'example.test',
    siteSubdomain: 'sewer-net',
    appSubdomain: 'sewer-net-app',
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--base-url') options.baseUrl = argv[++index];
    else if (arg === '--domain') options.domain = argv[++index];
    else if (arg === '--site-subdomain') options.siteSubdomain = argv[++index];
    else if (arg === '--app-subdomain') options.appSubdomain = argv[++index];
    else throw new Error(`Unknown argument: ${arg}`);
  }

  for (const [name, value] of Object.entries(options)) {
    if (!value) throw new Error(`Missing value for ${name}`);
  }

  return options;
}

const RETRY_MAX = 20;
const RETRY_DELAY_MS = 1000;
async function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function request(baseUrl, host, pathname) {
  const url = new URL(pathname, baseUrl);
  const transport = url.protocol === 'https:' ? https : http;
  let lastError;
  for (let attempt = 0; attempt < RETRY_MAX; attempt += 1) {
    try {
      return await new Promise((resolve, reject) => {
        const req = transport.request(
          url,
          { method: 'GET', headers: { Host: host }, setHost: false },
          (res) => {
            const chunks = [];
            res.on('data', (chunk) => chunks.push(chunk));
            res.on('end', () => {
              resolve({
                status: res.statusCode ?? 0,
                headers: { get: (name) => res.headers[name.toLowerCase()] },
                body: Buffer.concat(chunks).toString('utf8'),
              });
            });
          },
        );
        req.on('error', reject);
        req.end();
      });
    } catch (err) {
      lastError = err;
      if (attempt < RETRY_MAX - 1) {
        await sleep(RETRY_DELAY_MS);
      }
    }
  }
  throw lastError;
}

function assertOkNoHttpsRedirect(result, label) {
  assert.equal(result.status, 200, `${label}: expected 200, got ${result.status}`);
  const location = result.headers.get('location');
  assert.ok(
    !location || !/^https:/i.test(location),
    `${label}: must not redirect to HTTPS (got ${location})`,
  );
}

const options = parseArgs(process.argv.slice(2));
const siteHost = `${options.siteSubdomain}.${options.domain}`;
const appHost = `${options.appSubdomain}.${options.domain}`;
const unknownHost = `unknown.${options.domain}`;
const get = (host, pathname) => request(options.baseUrl, host, pathname);

// --- Pre-flight: verify reverse-proxy is reachable ---
console.log(`[smoke] baseUrl=${options.baseUrl} site=${siteHost} app=${appHost}`);
const probe = await request(options.baseUrl, siteHost, '/');
console.log(`[smoke] probe status=${probe.status} content-type=${probe.headers.get('content-type')}`);

// Site: static landing behind the reverse proxy.
const site = await get(siteHost, '/');
assertOkNoHttpsRedirect(site, `site ${siteHost}/`);
assert.match(site.headers.get('content-type') ?? '', /text\/html/, 'site / must be HTML');
assert.match(site.body, /Sewer/, 'site / must render the landing page');

// App: SPA fallback for deep links served by file_server.
for (const route of ['/welcome', '/oidc/callback']) {
  const result = await get(appHost, route);
  assertOkNoHttpsRedirect(result, `app ${appHost}${route}`);
  assert.match(result.headers.get('content-type') ?? '', /text\/html/, `${route} must be HTML`);
  assert.match(result.body, /<div id="root">/, `${route} must serve the app shell`);
  assert.match(
    result.headers.get('cache-control') ?? '',
    /no-store|no-cache|max-age=0/,
    `${route} must not be cached`,
  );
}

// Service worker: script MIME, no-cache.
const sw = await get(appHost, '/sw.js');
assertOkNoHttpsRedirect(sw, `app ${appHost}/sw.js`);
assert.match(
  sw.headers.get('content-type') ?? '',
  /javascript/,
  `${appHost}/sw.js must be JavaScript`,
);
assert.match(
  sw.headers.get('cache-control') ?? '',
  /no-store|no-cache|max-age=0/,
  `${appHost}/sw.js must not be cached`,
);

// Unknown host: must 404, must not leak site/app content.
const unknown = await get(unknownHost, '/');
assert.equal(unknown.status, 404, `unknown host must 404 (got ${unknown.status})`);
assert.doesNotMatch(unknown.body, /Sewer/, 'unknown host must not leak landing content');

// API on public hostnames: must 404, must not be JSON.
for (const host of [siteHost, appHost]) {
  const api = await get(host, '/api/matrix/login');
  assert.equal(api.status, 404, `${host}/api/matrix/login must 404 (got ${api.status})`);
  assert.doesNotMatch(
    api.headers.get('content-type') ?? '',
    /application\/json/,
    `${host}/api/matrix/login must not be JSON`,
  );
}

// Crawl app assets: every hashed JS chunk must be served with correct MIME.
const indexHtml = (await get(appHost, '/')).body;
const assetUrls = new Set();
for (const match of indexHtml.matchAll(/(?:src|href)="(\/assets\/[^"]+)"/g)) {
  assetUrls.add(match[1]);
}
for (const match of indexHtml.matchAll(/"(\/assets\/[^"]+\.js)"/g)) {
  assetUrls.add(match[1]);
}

const jsAssets = [...assetUrls].filter((u) => u.endsWith('.js'));
const wasmAssets = [...assetUrls].filter((u) => u.endsWith('.wasm'));

for (const url of jsAssets) {
  const result = await get(appHost, url);
  assert.equal(result.status, 200, `${url} must be served`);
  assert.match(
    result.headers.get('content-type') ?? '',
    /javascript/,
    `${url} must be JavaScript`,
  );
}

for (const url of wasmAssets) {
  const result = await get(appHost, url);
  assert.equal(result.status, 200, `${url} must be served`);
  assert.match(
    result.headers.get('content-type') ?? '',
    /application\/wasm/,
    `${url} must be application/wasm`,
  );
  assert.match(result.headers.get('cache-control') ?? '', /immutable/, `${url} must be immutable`);
}

console.log(
  `smoke OK: site=${siteHost} app=${appHost} js=${jsAssets.length} wasm=${wasmAssets.length}`,
);
