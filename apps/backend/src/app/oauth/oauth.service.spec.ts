import { HttpException } from '@nestjs/common';
import { OauthService } from './oauth.service';

const OIDC_DOC = {
  issuer: 'https://account.matrix.org/',
  authorization_endpoint: 'https://account.matrix.org/authorize',
  token_endpoint: 'https://account.matrix.org/oauth2/token',
  registration_endpoint: 'https://account.matrix.org/oauth2/registration',
  response_modes_supported: ['form_post', 'query', 'fragment'],
  prompt_values_supported: ['login', 'create'],
};

interface FetchCall {
  url: string;
  init: RequestInit;
}

describe('OauthService', () => {
  let service: OauthService;

  beforeEach(() => {
    service = new OauthService();
  });

  function mockFetch(handler: (url: string, init: RequestInit) => Response): {
    calls: FetchCall[];
    restore: () => void;
  } {
    const calls: FetchCall[] = [];
    const original = global.fetch;
    global.fetch = (async (url: string, init: RequestInit) => {
      calls.push({ url: String(url), init });
      return handler(String(url), init);
    }) as unknown as typeof fetch;
    return {
      calls,
      restore: () => {
        global.fetch = original;
      },
    };
  }

  function oidcResponder(url: string): Response {
    if (url === 'https://account.matrix.org/.well-known/openid-configuration') {
      return new Response(JSON.stringify(OIDC_DOC), { status: 200 });
    }
    return new Response(JSON.stringify({ error: 'unexpected_url', url }), {
      status: 404,
    });
  }

  describe('discoverOidc', () => {
    it('fetches the issuer well-known document and maps it to camelCase', async () => {
      const { calls, restore } = mockFetch(oidcResponder);
      try {
        const meta = await service.discoverOidc('https://account.matrix.org');
        expect(calls[0]?.url).toBe(
          'https://account.matrix.org/.well-known/openid-configuration',
        );
        expect(meta).toEqual({
          issuer: 'https://account.matrix.org/',
          authorizationEndpoint: 'https://account.matrix.org/authorize',
          tokenEndpoint: 'https://account.matrix.org/oauth2/token',
          registrationEndpoint: 'https://account.matrix.org/oauth2/registration',
          responseModesSupported: ['form_post', 'query', 'fragment'],
          promptValuesSupported: ['login', 'create'],
        });
      } finally {
        restore();
      }
    });

    it('rejects an invalid issuer URL', async () => {
      await expect(service.discoverOidc('not-a-url')).rejects.toThrow(
        HttpException,
      );
    });

    it('propagates discovery failures with the upstream status', async () => {
      const { restore } = mockFetch(() =>
        new Response(JSON.stringify({ error: 'server_error' }), { status: 500 }),
      );
      try {
        await expect(
          service.discoverOidc('https://account.matrix.org'),
        ).rejects.toMatchObject({ status: 500, response: { error: 'server_error' } });
      } finally {
        restore();
      }
    });
  });

  describe('register', () => {
    it('posts RFC7591 client metadata built from the redirect URI', async () => {
      const { calls, restore } = mockFetch((url) => {
        if (url === 'https://account.matrix.org/oauth2/registration') {
          return new Response(JSON.stringify({ client_id: 'cid_123' }), {
            status: 201,
          });
        }
        return oidcResponder(url);
      });
      try {
        const result = await service.register(
          'https://account.matrix.org',
          'https://app.example/callback',
        );
        expect(result).toEqual({ clientId: 'cid_123' });
        const registration = calls.find(
          (call) => call.url === 'https://account.matrix.org/oauth2/registration',
        );
        expect(registration?.init.method).toBe('POST');
        expect(JSON.parse(String(registration?.init.body))).toEqual({
          client_name: 'SewerNet',
          client_uri: 'https://app.example',
          redirect_uris: ['https://app.example/callback'],
          response_types: ['code'],
          grant_types: ['authorization_code', 'refresh_token'],
          token_endpoint_auth_method: 'none',
          application_type: 'web',
        });
      } finally {
        restore();
      }
    });
  });

  describe('token', () => {
    it('exchanges an authorization code with a form-encoded request', async () => {
      const { calls, restore } = mockFetch((url) => {
        if (url === 'https://account.matrix.org/oauth2/token') {
          return new Response(
            JSON.stringify({
              access_token: 'at',
              refresh_token: 'rt',
              expires_in: 3600,
              scope: 'openid',
            }),
            { status: 200 },
          );
        }
        return oidcResponder(url);
      });
      try {
        const result = await service.token({
          issuer: 'https://account.matrix.org',
          clientId: 'cid',
          redirectUri: 'https://app.example/callback',
          code: 'abc',
          codeVerifier: 'ver',
          grantType: 'authorization_code',
        });
        expect(result).toEqual({
          accessToken: 'at',
          refreshToken: 'rt',
          expiresIn: 3600,
          scope: 'openid',
        });
        const tokenCall = calls.find(
          (call) => call.url === 'https://account.matrix.org/oauth2/token',
        );
        const headers = tokenCall?.init.headers as Record<string, string>;
        expect(headers['Content-Type']).toBe('application/x-www-form-urlencoded');
        expect(Object.fromEntries(new URLSearchParams(String(tokenCall?.init.body)))).toEqual({
          grant_type: 'authorization_code',
          code: 'abc',
          redirect_uri: 'https://app.example/callback',
          client_id: 'cid',
          code_verifier: 'ver',
        });
      } finally {
        restore();
      }
    });

    it('refreshes tokens with only grant_type, refresh_token and client_id', async () => {
      const { calls, restore } = mockFetch((url) => {
        if (url === 'https://account.matrix.org/oauth2/token') {
          return new Response(JSON.stringify({ access_token: 'at2' }), {
            status: 200,
          });
        }
        return oidcResponder(url);
      });
      try {
        const result = await service.token({
          issuer: 'https://account.matrix.org',
          clientId: 'cid',
          grantType: 'refresh_token',
          refreshToken: 'rt_old',
        });
        expect(result).toEqual({ accessToken: 'at2' });
        const tokenCall = calls.find(
          (call) => call.url === 'https://account.matrix.org/oauth2/token',
        );
        expect(Object.fromEntries(new URLSearchParams(String(tokenCall?.init.body)))).toEqual({
          grant_type: 'refresh_token',
          refresh_token: 'rt_old',
          client_id: 'cid',
        });
      } finally {
        restore();
      }
    });

    it('propagates upstream token errors with the upstream status', async () => {
      const { restore } = mockFetch((url) => {
        if (url === 'https://account.matrix.org/oauth2/token') {
          return new Response(
            JSON.stringify({ error: 'invalid_grant', error_description: 'bad code' }),
            { status: 400 },
          );
        }
        return oidcResponder(url);
      });
      try {
        await expect(
          service.token({
            issuer: 'https://account.matrix.org',
            clientId: 'cid',
            redirectUri: 'https://app.example/callback',
            code: 'bad',
            codeVerifier: 'ver',
            grantType: 'authorization_code',
          }),
        ).rejects.toMatchObject({
          status: 400,
          response: { error: 'invalid_grant' },
        });
      } finally {
        restore();
      }
    });
  });
});
