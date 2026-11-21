# OIDC Loopback Redirect - Desktop Adapter Update

**Created:** 2026-11-21
**Owner:** MVP Desktop acceptance
**Depends on:** Task 1 desktop-oidc-consts.ts

## Objective

Update desktop platform adapter to use loopback redirect URI instead of `sewernet://` custom scheme, enabling MAS masterserver OIDC compatibility.

## Current State

```typescript
// apps/web/src/platform/desktop.ts
const NATIVE_REDIRECT_URI = 'sewernet://oidc/callback';
const NATIVE_CLIENT_URI = 'https://github.com/AshenHermit/SewerNet';

class DesktopOidcPlatform implements OidcPlatform {
  redirectUri(): string { return NATIVE_REDIRECT_URI; }
  applicationType(): 'native' { return 'native'; }
  clientUri(): string { return NATIVE_CLIENT_URI; }
  // ...
}
```

**Problem:** MAS masterservers (matrix.org, unredacted.org) reject `sewernet://` as invalid redirect URI (HTTP 400). Loopback HTTP `http://127.0.0.1:4201/oidc/callback` is accepted.

## Changes Required

### 1. Update redirect URI constant

```typescript
import { DESKTOP_OIDC_REDIRECT_URI } from '../app/features/auth/desktop-oidc-consts';

const NATIVE_REDIRECT_URI = DESKTOP_OIDC_REDIRECT_URI; // http://127.0.0.1:4201/oidc/callback
const NATIVE_CLIENT_URI = 'https://github.com/AshenHermit/SewerNet';
```

### 2. Preserve deep-link registration for tray/update

`sewernet://` remains for:
- Tray menu exit
- Auto-update deep links
- Desktop app initialization

Only OIDC callback changes to loopback.

### 3. Update callback claim logic

```typescript
claimCallback(url: string): Promise<ClaimedOidcCallback> {
  // url will be http://127.0.0.1:4201/oidc/callback?code=...&state=...
  return invoke<ClaimedOidcCallback>('oidc_callback_claim', { url });
}
```

No change needed - Rust side already handles arbitrary URL strings.

### 4. Update savePending flow

```typescript
savePending(flow: StoredOidcFlow): Promise<void> {
  // flow.redirectUri now contains loopback URI
  return savePendingOidcFlow(flow);
}
```

No change needed - stores whatever URI is passed.

## Testing

- Node mock registration: `http://127.0.0.1:4201/oidc/callback` → HTTP 201 (accepted)
- Browser flow: redirects to loopback, Tauri HTTP plugin captures, forwards to WebView
- Cold/warm callback: both must work (loopback is browser-native, not deep-link)

## Files Modified

- `apps/web/src/platform/desktop.ts`: import constant, update NATIVE_REDIRECT_URI
- `apps/web/src/platform/desktop.spec.ts`: update tests to expect loopback URI

## Success Criteria

- [ ] `redirectUri()` returns `http://127.0.0.1:4201/oidc/callback`
- [ ] `applicationType()` still returns `'native'` (for MAS native client registration)
- [ ] Desktop tests pass with loopback URI
- [ ] No regression in tray/update deep-link functionality

## Next Action

Execute Task 2 to update oidc.ts, then Task 5 for desktop.ts adapter.