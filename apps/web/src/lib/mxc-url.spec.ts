import { describe, expect, it, vi } from 'vitest';
import { mxcUrlToHttp } from './mxc-url';

function fakeClient(resolve?: (mxcUrl: string) => string | null) {
  return {
    mxcUrlToHttp: vi.fn((mxcUrl: string) =>
      resolve ? resolve(mxcUrl) : `https://hs.example${resolveUrl(mxcUrl)}`,
    ),
  };
}

function resolveUrl(mxcUrl: string): string {
  const [, domain, mediaId] = mxcUrl.split('/');
  return `/_matrix/media/v3/thumbnail/${domain}/${mediaId}?width=800&height=600&method=scale&allow_redirect=true`;
}

describe('mxcUrlToHttp', () => {
  it('delegates to client.mxcUrlToHttp with the given dimensions', () => {
    const client = fakeClient();
    mxcUrlToHttp(client as never, 'mxc://hs.example/abc', 48, 48, true);
    expect(client.mxcUrlToHttp).toHaveBeenCalledWith(
      'mxc://hs.example/abc',
      48,
      48,
      'scale',
      false,
      undefined,
      true,
    );
  });

  it('squares the dimensions when only one is given', () => {
    const client = fakeClient();
    const url = mxcUrlToHttp(client as never, 'mxc://hs.example/abc', 64);
    expect(url).toContain('width=64');
    expect(url).toContain('height=64');
  });

  it('drops dimensions and switches to download for full-size urls', () => {
    const client = fakeClient();
    const url = mxcUrlToHttp(client as never, 'mxc://hs.example/abc');
    expect(url).toContain('/download/');
    expect(url).not.toContain('width=');
    expect(url).not.toContain('height=');
    expect(url).not.toContain('method=');
    expect(url).not.toContain('allow_redirect');
  });

  it('removes allow_redirect for thumbnails', () => {
    const client = fakeClient();
    const url = mxcUrlToHttp(client as never, 'mxc://hs.example/abc', 48, 48);
    expect(url).toContain('width=48');
    expect(url).not.toContain('allow_redirect');
  });

  it('returns null for empty mxc urls', () => {
    const client = fakeClient();
    expect(mxcUrlToHttp(client as never, '')).toBeNull();
    expect(mxcUrlToHttp(client as never, undefined)).toBeNull();
    expect(client.mxcUrlToHttp).not.toHaveBeenCalled();
  });

  it('returns null when the client cannot resolve the url', () => {
    const client = fakeClient(() => null);
    expect(mxcUrlToHttp(client as never, 'mxc://hs.example/abc', 32, 32)).toBeNull();
  });
});
