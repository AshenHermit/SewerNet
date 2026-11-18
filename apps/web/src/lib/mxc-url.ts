import type { MatrixClient } from 'matrix-js-sdk';

/**
 * Resolves an `mxc://` URI into an HTTP media URL.
 *
 * - Both dimensions given → authenticated thumbnail (`method=scale`).
 * - Only one dimension → squared thumbnail.
 * - No dimensions → full-size download (no width/height/method).
 *
 * `allow_redirect` is always stripped: the service worker proxies media
 * itself and redirects would bypass the injected bearer token.
 */
export function mxcUrlToHttp(
  client: MatrixClient,
  mxcUrl: string | null | undefined,
  width?: number,
  height?: number,
  useAuthentication?: boolean,
): string | null {
  if (!mxcUrl) {
    return null;
  }

  let w = width;
  let h = height;
  if (w && !h) {
    h = w;
  }
  if (h && !w) {
    w = h;
  }
  const hasSize = Boolean(w && h);

  const original = client.mxcUrlToHttp(
    mxcUrl,
    w,
    h,
    hasSize ? 'scale' : undefined,
    false,
    undefined,
    useAuthentication,
  );
  if (!original) {
    return null;
  }

  try {
    const url = new URL(original);
    url.searchParams.delete('allow_redirect');

    if (w && h) {
      url.searchParams.set('width', String(Math.round(w)));
      url.searchParams.set('height', String(Math.round(h)));
      url.searchParams.set('method', 'scale');
    } else {
      url.searchParams.delete('width');
      url.searchParams.delete('height');
      url.searchParams.delete('method');
      url.pathname = url.pathname.replace('/thumbnail/', '/download/');
    }

    return url.href;
  } catch {
    return original.replace(/[?&]allow_redirect=[^&]+/g, '').replace(/[?&]$/, '');
  }
}
