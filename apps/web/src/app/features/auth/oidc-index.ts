import { DESKTOP_OIDC_REDIRECT_URI } from './desktop-oidc-consts';

export {
  clearPendingOidcFlow,
  completeOidcLogin,
  discoverAuthCapabilities,
  getOrRegisterClientId,
  getOidcRedirectUri,
  getPendingOidcFlow,
  resolveBaseUrl,
  revokeOidcSession,
  startOidcLogin,
  type AuthCapabilities,
  type OidcAction,
  type OidcClientConfig,
  type OidcRegistrationClientMetadata,
  type OidcResponseMode,
  type PendingOidcFlow,
} from './oidc';

/** Desktop OIDC loopback redirect URI for MAS compatibility. */
export const DESKTOP_OIDC_CALLBACK = DESKTOP_OIDC_REDIRECT_URI;
