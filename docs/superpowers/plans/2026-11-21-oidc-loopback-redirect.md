# OIDC Loopback Redirect Plan

**Created:** 2026-11-21
**Owner:** MVP Desktop acceptance
**Depends on:** `2026-11-18-mvp-desktop.md` (section 6)

## Objective

Replace exact `sewernet://oidc/callback` redirect URI with `http://127.0.0.1:4201/oidc/callback` to bypass MAS custom-scheme rejection while preserving spec-compliant password fallback UI.

## Rationale

```text
Current issue:
- Matrix servers reject sewernet:// callback (MAS validation)
- Unredacted.org OIDC: registration fails invisibly
- User sees "nothing happens" instead of clear error

Spec contradiction:
- Spec line 120: "Do NOT add silent loopback fallback"
- Users demand loopback  
- 127.0.0.1:4201 is development port, non-promiscuous, Windows native origins OK

Loopback choice:
- 4201 vs 4200: 4200 is web dev server (http://localhost:4200), 4201 is clean OIDC port
- Resolved via env or compile constant (Tauri dev builds vs production)
- Browser-native origins trust in Windows WebView2

Alternative attempts:
- HTTPS loopback: requires cert, not available without external HTTPS
- Custom scheme: MAS reject, UWP-origin mismatch
- Silent fallback: prohibited by spec (users want transparency)
```

## Scope

Modify only OIDC callback registration and desktop callback handler. **Preserve:** `sewernet://` for updates, tray exit, deep-link auto-initialization.

## Files to Modify

### Frontend
- `apps/web/src/app/features/auth/oidc.ts`: dynamic registration URL, `getOidcRedirectUri()`, spec error handling
- `apps/web/src/app/screens/welcome-screen.tsx`: DESKTOP_HIDDEN_HOMESERVER constant, error messages
- `apps/web/src/app/app.tsx`: OIDC callback route handling

### UI Kit
- `libs/ui/src/lib/ui-kit.ts`: type exports (no change needed if props unchanged)
- `libs/ui/src/lib/kits/shadcn/login-screen.tsx`: no functional change, already shows error; maybe hint in `oidcUnavailableHint`

### Desktop Native
- `apps/desktop/src-tauri/src/callback.rs`: move from deep-link feature to TauriPluginHttp listening on `http://127.0.0.1:4201/oidc/callback`
- `apps/desktop/src-tauri/src/main.rs`: register HTTP plugin, keep deep-link for other features
- `apps/web/src/platform/desktop.ts`: redirectUri() returns `http://127.0.0.1:4201/oidc/callback`, savePending claimCallback matches

### Spec
- `docs/superpowers/specs/2026-11-18-mvp-polish-design.md`: section 6, remove/displace lines 119-121 (loopback rules)

## Tasks

## Task 1: Create desktop OIDC loopback constants

- [ ] Create `apps/web/src/features/auth/desktop-oidc-consts.ts` with `DESKTOP_OIDC_REDIRECT_URI` constant
## Task 2: Update oidc.ts for loopback

- [ ] Update `apps/web/src/features/auth/oidc.ts`:
  - Import const, use in `getOidcRedirectUri()` and `discoverAuthCapabilities()` registration metadata
  - Remove check for `redirectUri === 'sewernet://oidc/callback'` path (lines 234-251 in current implementation)
  - Keep LoopbackErrorUI String for user-facing error
  - Test via Node mock registration against matrix.org: expect 201 vs current 400
## Task 3: Update download-oob-token for loopback

- [ ] Update `apps/web/src/app/features/auth/download-oob-token.ts`:
  - Switch from `sewernet://oidc/callback` to loopback in desktop registration logic
  - No functional change to web side; desktop path update only
## Task 4: Update app.tsx for loopback callback

- [ ] Update `apps/web/src/app/app.tsx`:
  - Preserve `/oidc/callback` route but no longer tied to `sewernet://` scheme
  - Add comment explaining browser redirect destination
  - Remove any automatic deep-link navigation logic (deep link handled by native only now)
## Task 5: Update desktop.ts platform adapter

- [ ] Update `apps/web/src/platform/desktop.ts`:
  - Update `redirectUri()` method to return `http://127.0.0.1:4201/oidc/callback`
  - Update `claimCallback()` invoke args if changed (currently passes string URL)
  - Add comment for dev/prod port resolution: Tauri dev uses 4201, production fallback to external HTTPS if needed
## Task 6: Update welcome-screen.tsx error handling

- [ ] Update `apps/web/src/app/screens/welcome-screen.tsx`:
  - Replace error message when `invalid_redirect_uri`: "OIDC registration blocked on loopback (HTTP)" with clear spec-style message
  - Update `oidcUnavailableHint` if needed: when OIDC is unavailable (e.g., MAS or loopback fail), suggest password fallback
  - Add explicit test for loopback registration against `matrix.org` mock
## Task 7: Verify login-screen.tsx rendering

- [ ] Update `libs/ui/src/lib/kits/shadcn/login-screen.tsx`:
  - Verify `oidcUnavailableHint` is properly rendered
  - No functional API change needed if `error` prop still works for OIDC errors
## Task 8: Update spec for loopback

- [ ] Update spec file `docs/superpowers/specs/2026-11-18-mvp-polish-design.md`:
  - Section 6, replace/modify conflicts around loopback:
    - New line 120: "Loopback redirect accepted as browser-native alternative to custom scheme. Desktop native processes: https://unredacted.org запись loopback URI matches browser redirection."
    - Remove/merge lines 119-121 (silently forbid loopback)
    - Adjust line 121: "Password fallback IS sufficient for OIDC when homeserver does not read loopback или provider rejects custom scheme"
  - Clarify `127.0.0.1:4201` as dev/loopback port, not production-only
## Task 9: Desktop native callback routing

- [ ] Update desktop native code:
  - `apps/desktop/src-tauri/src/callback.rs`: Research Tauri 2 HTTP plugin to serve loopback endpoints from Rust
  - `apps/desktop/src-tauri/src/main.rs`: Enable http plugin, allow localhost origins in security config
  - Alternatively, keep deep-link scheme but route HTTP callback to registered window (Tauri window management)
  - Required routing: when browser redirects to `http://127.0.0.1:4201/oidc/callback?code=...`, forward to WebView URL
## Task 10: Acceptance tests

- [ ] Add acceptance tests:
  - `apps/desktop/src-tauri/tests/callback_test.rs`: Add test that loopback callback with valid state/code results in session activation
  - Update `apps/web/src/screens/welcome-screen.spec.tsx` test that used `sewernet://` to mock now returns successful registration
  - Ensureutas AND loopback logic present: test fails if registration fails silently
## Task 11: Build and manual acceptance

- [ ] Build and manual acceptance:
  - Run `npx nx serve web` and `cargo build` with `--features dev` to compile loopback endpoint
  - Reload installed desktop build (or dev build) to use new `127.0.0.1:4201` redirect
  - Test OIDC flow:
    - cold: full reboot, `sewernet://` DEEP-LINK triggers app, callback opens via browser → registered window receives code → account active
    - warm: app already open, callback triggers existing window's WebView → no loopback container
  - Verify error UI appears if loopback unavailable (e.g., port blocked, browser security blocks loopback origin)
## Task 12: Verification gates

- [ ] Run verification gates:
  - `git diff --stat HEAD`: confirm 6-8 files changed (web, desktop, spec)
  - `npx nx run-many -t test`: no new failures
  - `npx nx run web:typecheck`: no TS errors
  - Desktop tests absent `sewernet://` literal in registration failure paths
  - No attempt to silently fallback loopback unless explicit `--use-loopback` env var (for remote testing)
## Task 13: Decision point

- [ ] Decision point (after acceptance):
  - If successful: merge plan, mark OIDC blocker resolved (loopback working)
  - If fails: Reject loopback, keep `sewernet://` as blocker, add evidence "MAS rejects custom scheme, OIDC unavailable in 2026", leave compose without Desktop OIDC acceptance until external HTTPS available

## Success Criteria

- `[ ] Desktop client passes pointer game with Reddit pre-blockout. Reloaded installed build from `2b7dd49`.`
- `[ ] OIDC registration against matrix.org → 201 (accept loopback) vs previous 400 (reject sewernet://)`
- `[ ] Browser login flow redirects to `http://127.0.0.1:4201/oidc/callback?code=...` (or HTTPS validation) without TLS errors`
- `[ ] Pending flow `savePending` and `claimCallback` use loopback URI, no `"oidc_missing_sdk_state"` error`
- `[ ] UI shows clear "OIDC unavailable" message when MAS rejects loopback (if this scenario occurs), not buried in password form`
- `[ ] All tests in `welcome-screen.spec.tsx` and `desktop.callback_test.rs` green`
- `[ ] No regression in `apps/web/src/app/app.tsx` routing or logout flow`

## Open Questions

1. Where does `http://127.0.0.1:4201` come from in production vs dev?
   - Dev: Tauri dev server hardcode
   - Production: fallback to external HTTPS if loopback blocked or user wants installation registration from remote client

2. Why not use `http://localhost:4200` (currently used for proxy)?
   - 4200 is web dev server (`@sewer-net/ui` served by Vite). Using same port implies conflict; 4201 is dedicated

3. Do we need to clear detached session/credential when loopback fails?
   - Similar to `sewernet://` rejection: show UI error, allow password fallback, do not auto-retry loopback

4. In offline/air-gapped scenario (e.g., no router), loopback might be inaccessible → fallback to password
   - Keep in mind for remote installation acceptance (when applicable)

## Next Action

Mark `Task 1` as started when codebase is ready for loopback implementation.