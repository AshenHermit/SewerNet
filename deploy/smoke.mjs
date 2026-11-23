#!/usr/bin/env node
// HTTP smoke for the Caddy router. Pure HTTP + Host headers: no Docker API,
// no credentials, no dependence on the owner's real domain or ports.
// Example:
//   node deploy/smoke.mjs --base-url http://127.0.0.1:8082 --domain example.test
import assert from 'node:assert/strict';
import http from 'node:http';
import https from 'node:https';

function parseArgs(argv) {
  const options = {
    baseUrl: 'http://127.0.0.1:8082',
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

const RETRY_MAX = 10;
const RETRY_DELAY_MS = 500;

async function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function request(baseUrl, host, pathname) {
  const url = new URL(pathname, baseUrl);
  const transport = url.protocol === 'https:' ? https : http;

  // `fetch` treats Host as a forbidden header and silently ignores an override.
  // node:http sets it on the wire, which is what actually exercises Caddy vhosts.
  let lastError;
  for (let attempt = 0; attempt < RETRY_MAX; attempt += 1) {
    try {
      return await new Promise((resolve, reject) => {
        const req = transport.request(url, { method: 'GET', headers: { Host: host }, setHost: false }, (res) => {
          const chunks = [];
          res.on('data', (chunk) => chunks.push(chunk));
          res.on('end', () => {
            resolve({
              status: res.statusCode ?? 0,
              headers: { get: (name) => res.headers[name.toLowerCase()] },
              body: Buffer.concat(chunks).toString('utf8'),
            });
          });
        });
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
const get = (host, pathname) => request(options.baseUrl, host, pathname);

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
  /(text|application)\/(javascript|ecmascript)/,
  '/sw.js must be JavaScript',
);
assert.match(
  sw.headers.get('cache-control') ?? '',
  /no-store|no-cache|max-age=0/,
  '/sw.js must not be cached',
);

// Unknown Host: explicit 404, never site or app content.
const unknown = await get(`unknown.${options.domain}`, '/');
assert.equal(unknown.status, 404, 'unknown Host must be rejected with 404');
assert.doesNotMatch(unknown.body, /Sewer/, 'unknown Host must not leak site content');

// /api/matrix/* is never proxied to the private backend from a public host.
for (const host of [siteHost, appHost]) {
  const api = await get(host, '/api/matrix/login');
  assert.equal(api.status, 404, `${host}: /api/matrix/login must be rejected`);
  assert.doesNotMatch(
    api.headers.get('content-type') ?? '',
    /application\/json/,
    `${host}: API route must not return backend JSON`,
  );
  assert.doesNotMatch(
    api.body,
    /"statusCode"|"message"\s*:/,
    `${host}: API route must not return a NestJS error body`,
  );
}

// Discover hashed assets from the served HTML and from the JS chunks it
// imports (Vite also uses relative lazy-chunk and WASM specifiers).
const assets = new Set();
const wasmAssets = new Set();
const addAsset = (url) => {
  if (url.endsWith('.wasm')) wasmAssets.add(url);
  else assets.add(url);
};
const collectAssets = (text) => {
  for (const match of text.matchAll(/\/assets\/[A-Za-z0-9_.@%()\-]+\.(?:js|wasm|css)/g)) {
    addAsset(match[0]);
  }
  for (const match of text.matchAll(/\.\/([A-Za-z0-9_.@%()\-]+\.(?:js|wasm))/g)) {
    addAsset(`/assets/${match[1]}`);
  }
  for (const match of text.matchAll(/\b([A-Za-z0-9_]+-[A-Za-z0-9_-]{8,}\.wasm)\b/g)) {
    addAsset(`/assets/${match[1]}`);
  }
};

const appIndex = await get(appHost, '/');
assertOkNoHttpsRedirect(appIndex, `app ${appHost}/`);
collectAssets(appIndex.body);

const queue = [...assets].filter((url) => url.endsWith('.js'));
const crawled = new Set();
while (queue.length) {
  const url = queue.shift();
  if (crawled.has(url)) continue;
  crawled.add(url);

  const result = await get(appHost, url);
  assert.equal(result.status, 200, `${url} must be served`);
  assert.match(
    result.headers.get('content-type') ?? '',
    /(text|application)\/(javascript|ecmascript)/,
    `${url} must be JavaScript`,
  );
  assert.match(result.headers.get('cache-control') ?? '', /immutable/, `${url} must be immutable`);

  collectAssets(result.body);
  for (const next of assets) {
    if (next.endsWith('.js') && !crawled.has(next)) queue.push(next);
  }
}

assert.ok(
  [...assets].some((url) => /\/assets\/[^/]+-[A-Za-z0-9_-]{8,}\.js$/.test(url)),
  'at least one hashed JS asset must be discovered',
);
assert.ok(wasmAssets.size > 0, 'a WASM asset must be discovered from the app bundle');

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
  `smoke OK: site=${siteHost} app=${appHost} js=${crawled.size} wasm=${wasmAssets.size}`,
);
