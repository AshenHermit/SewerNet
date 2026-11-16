import { HttpException, Injectable, Logger } from '@nestjs/common';
import type {
  MasOidcMetadata,
  OauthTokenRequest,
  OauthTokenResponse,
} from '@sewer-net/types';

interface RawOidcDocument {
  issuer?: string;
  authorization_endpoint?: string;
  token_endpoint?: string;
  registration_endpoint?: string;
  response_modes_supported?: string[];
  prompt_values_supported?: string[];
}

interface RawTokenResponse {
  access_token?: unknown;
  refresh_token?: unknown;
  expires_in?: unknown;
  scope?: unknown;
}

/**
 * Stateless proxy to a Matrix Authentication Service (MAS):
 * OIDC discovery, RFC7591 dynamic client registration and the
 * authorization-code / refresh-token grants. No state is kept.
 */
@Injectable()
export class OauthService {
  private readonly logger = new Logger(OauthService.name);

  private issuerBase(issuer: string): string {
    const trimmed = issuer?.replace(/\/+$/, '');
    if (!trimmed || !/^https?:\/\//.test(trimmed)) {
      throw new HttpException(
        { error: 'invalid_issuer', error_description: 'Invalid OIDC issuer URL' },
        400,
      );
    }
    return `${trimmed}/`;
  }

  private async json(response: Response): Promise<Record<string, unknown>> {
    return (await response.json().catch(() => ({}))) as Record<string, unknown>;
  }

  /** Resolves the OIDC discovery document of the issuer on every call. */
  private async oidcMetadata(issuer: string): Promise<MasOidcMetadata> {
    const url = `${this.issuerBase(issuer)}.well-known/openid-configuration`;
    const response = await fetch(url);
    const doc = (await this.json(response)) as RawOidcDocument;
    if (
      !response.ok ||
      !doc.authorization_endpoint ||
      !doc.token_endpoint ||
      !doc.registration_endpoint
    ) {
      this.logger.warn(`OIDC discovery ${issuer} -> ${response.status}`);
      throw new HttpException(doc, response.ok ? 502 : response.status);
    }
    return {
      issuer: doc.issuer ?? issuer,
      authorizationEndpoint: doc.authorization_endpoint,
      tokenEndpoint: doc.token_endpoint,
      registrationEndpoint: doc.registration_endpoint,
      responseModesSupported: doc.response_modes_supported ?? [],
      ...(doc.prompt_values_supported
        ? { promptValuesSupported: doc.prompt_values_supported }
        : {}),
    };
  }

  async discoverOidc(issuer: string): Promise<MasOidcMetadata> {
    return this.oidcMetadata(issuer);
  }

  /** RFC7591 dynamic client registration; the redirect URI defines the client. */
  async register(issuer: string, redirectUri: string): Promise<{ clientId: string }> {
    const metadata = await this.oidcMetadata(issuer);
    const clientMetadata = {
      client_name: 'SewerNet',
      client_uri: new URL(redirectUri).origin,
      redirect_uris: [redirectUri],
      response_types: ['code'],
      grant_types: ['authorization_code', 'refresh_token'],
      token_endpoint_auth_method: 'none',
      application_type: 'web',
    };
    const response = await fetch(metadata.registrationEndpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(clientMetadata),
    });
    const payload = await this.json(response);
    if (!response.ok || !payload['client_id']) {
      this.logger.warn(`client registration ${issuer} -> ${response.status}`);
      throw new HttpException(payload, response.status);
    }
    return { clientId: String(payload['client_id']) };
  }

  async token(request: OauthTokenRequest): Promise<OauthTokenResponse> {
    const metadata = await this.oidcMetadata(request.issuer);
    const form = new URLSearchParams();
    form.set('grant_type', request.grantType);
    form.set('client_id', request.clientId);
    if (request.grantType === 'authorization_code') {
      form.set('code', request.code ?? '');
      if (request.redirectUri) form.set('redirect_uri', request.redirectUri);
      if (request.codeVerifier) form.set('code_verifier', request.codeVerifier);
    } else if (request.refreshToken) {
      form.set('refresh_token', request.refreshToken);
    }

    const response = await fetch(metadata.tokenEndpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: form.toString(),
    });
    const payload = (await this.json(response)) as RawTokenResponse;
    if (!response.ok) {
      this.logger.warn(`token ${request.grantType} -> ${response.status}`);
      throw new HttpException(payload, response.status);
    }
    return {
      accessToken: String(payload['access_token'] ?? ''),
      ...(payload['refresh_token'] !== undefined
        ? { refreshToken: String(payload['refresh_token']) }
        : {}),
      ...(payload['expires_in'] !== undefined
        ? { expiresIn: Number(payload['expires_in']) }
        : {}),
      ...(payload['scope'] !== undefined ? { scope: String(payload['scope']) } : {}),
    };
  }
}
