/**
 * Desktop OIDC loopback redirect URI.
 * MAS masterservers reject custom schemes (sewernet://), but accept loopback HTTP.
 * Port 4201 is dedicated for OIDC callback (4200 = web dev server).
 */
export const DESKTOP_OIDC_REDIRECT_URI = 'http://127.0.0.1:4201/oidc/callback';
