/* SewerNet media proxy: injects the Matrix bearer token into authenticated
 * media requests (images cannot send an Authorization header). */

/* eslint-disable no-restricted-globals -- in a service worker `self` is the worker global */

const MEDIA_PATHS = [
  '/_matrix/client/v1/media/download',
  '/_matrix/client/v1/media/thumbnail',
];

const sessions = new Map();

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
    return MEDIA_PATHS.some((p) => url.startsWith(new URL(p, baseUrl).href));
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
  const key = event.source?.id ?? 'default';
  if (type === 'setSession' && accessToken && baseUrl) {
    sessions.set(key, { accessToken, baseUrl });
  } else if (type === 'clearSession') {
    sessions.delete(key);
  } else if (type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

self.addEventListener('fetch', (event) => {
  const { url, method, headers } = event.request;
  if (method !== 'GET' || !mediaPath(url) || headers.get('Authorization')) {
    return;
  }

  const session = sessions.get(event.clientId) ?? sessions.get('default');
  const target = cleanMediaUrl(url);

  event.respondWith(
    (async () => {
      if (session && validMediaRequest(target, session.baseUrl)) {
        try {
          const res = await fetch(target, {
            headers: { Authorization: 'Bearer ' + session.accessToken },
            cache: 'default',
          });
          if (res.ok) {
            return res;
          }
        } catch {
          // fall through to an unauthenticated passthrough
        }
      }

      try {
        const res = await fetch(target, { cache: 'no-store' });
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
