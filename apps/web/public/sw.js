/* SewerNet media proxy: injects the Matrix bearer token into authenticated
 * media requests (images cannot send an Authorization header). */

/* eslint-disable no-restricted-globals -- in a service worker `self` is the worker global */

const MEDIA_PATHS = [
  '/_matrix/client/v1/media/download',
  '/_matrix/client/v1/media/thumbnail',
];

const sessions = new Map();
/**
 * The session most recently handed to the worker. `event.clientId` on a fetch
 * and `event.source.id` on a message are different identifiers for the same
 * page (and a page is uncontrolled until after the first load), so a per-id
 * map alone silently drops the token. The fallback keeps media authenticated
 * across reloads and from sub-frames.
 */
let latestSession = null;

function mediaPath(url) {
  try {
    const { pathname } = new URL(url);
    return MEDIA_PATHS.some((p) => pathname.startsWith(p));
  } catch {
    return false;
  }
}

function validMediaRequest(url, baseUrl) {
  try {
    const target = new URL(url);
    const base = new URL(baseUrl);
    if (target.protocol !== 'https:' || target.origin !== base.origin || target.username || target.password || target.hash) return false;
    const prefix = base.pathname.replace(/\/+$/, '') || '';
    if (prefix && !target.pathname.startsWith(`${prefix}/`)) return false;
    const relative = prefix ? target.pathname.slice(prefix.length) : target.pathname;
    return MEDIA_PATHS.some((p) => relative.startsWith(`${p}/`) && !relative.includes('/../'));
  } catch {
    return false;
  }
}

function cleanMediaUrl(url) {
  try {
    const parsed = new URL(url);
    parsed.searchParams.delete('allow_redirect');
    return parsed.href;
  } catch {
    return url;
  }
}

function uncacheable(res) {
  try {
    const headers = new Headers(res.headers);
    headers.set('Cache-Control', 'no-store');
    return new Response(res.body, {
      status: res.status,
      statusText: res.statusText,
      headers,
    });
  } catch {
    return new Response(null, { status: res.status, headers: { 'Cache-Control': 'no-store' } });
  }
}

self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('message', (event) => {
  const { type, accessToken, baseUrl } = event.data || {};
  // `event.source.id` is absent for an uncontrolled page: key it under the
  // shared slot so the lookup below still finds it.
  const key = event.source?.id ?? 'default';
  if (type === 'setSession' && accessToken && baseUrl) {
    const session = { accessToken, baseUrl };
    sessions.set(key, session);
    latestSession = session;
  } else if (type === 'clearSession') {
    // Logout must not leave any copy behind under another client id.
    sessions.clear();
    latestSession = null;
  } else if (type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

self.addEventListener('fetch', (event) => {
  const { url, method, headers } = event.request;
  if (method !== 'GET' || !mediaPath(url) || headers.get('Authorization')) {
    return;
  }

  // Blocker #3: the frame id used for a fetch is not the client id used for
  // the message that stored the token, so fall back through every id.
  const session =
    sessions.get(event.clientId) ?? sessions.get('default') ?? latestSession;
  const target = cleanMediaUrl(url);

  event.respondWith(
    (async () => {
      if (session && validMediaRequest(target, session.baseUrl)) {
        try {
          const res = await fetch(target, {
            headers: { Authorization: 'Bearer ' + session.accessToken },
            cache: 'no-store',
            redirect: 'error',
          });
          if (res.ok) {
            return res;
          }
        } catch {
          // fall through to an unauthenticated passthrough
        }
      }

      try {
        const res = await fetch(target, { cache: 'no-store', redirect: 'error' });
        return res.ok ? res : uncacheable(res);
      } catch {
        return new Response('Service unavailable', {
          status: 502,
          headers: { 'Cache-Control': 'no-store' },
        });
      }
    })(),
  );
});
