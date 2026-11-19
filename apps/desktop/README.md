# SewerNet Desktop

Windows desktop shell using Tauri 2 and the shared `apps/web` Vite application. No second JavaScript app is generated. Product identifier `org.sewernet.desktop`; initial release version `0.1.0`. Rust toolchain follows the `stable-x86_64-pc-windows-msvc` channel, currently reporting version `1.100.0` (floating stable channel, not an exact-version pin).

## Development

From repository root:

```powershell
npx nx run desktop:dev
```

This starts the existing web Vite dev server on `http://localhost:4200` and opens Tauri's local `main` window. To build just the shared desktop-mode frontend:

```powershell
npx nx run desktop:build
```

The frontend output is `apps/desktop/dist`, separate from browser `apps/web/dist`. Native Rust code and packaging run on Windows with the Rust stable toolchain (currently 1.100.0), the MSVC C++ build tools, Windows SDK, and WebView2 installed:

```powershell
npx nx run desktop:native-test
npx nx run desktop:bundle --skip-nx-cache
```

The bundle target creates an unsigned NSIS package. It does not configure production updater metadata, signing keys, or release secrets. Web typecheck and lint remain on the existing `web` project.

## Signed Windows releases

Stable `vX.Y.Z` tags must match root npm, Cargo, and Tauri versions and point to a commit reachable from `master`. Configure GitHub `desktop-release` environment with required release-owner approval and private signing secrets `TAURI_SIGNING_PRIVATE_KEY` plus `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`. Configure repository variable `TAURI_UPDATER_PUBLIC_KEY` with matching public key; missing key fails Windows build. Release tags must be created only by authorized release owners and protected by repository tag rulesets; workflow checks do not replace tag protection or environment approval. The workflow revalidates official repository, stable tag, version, and `master` ancestry in both preflight and publish jobs. `contents: write` stays limited to publish job. No PR/fork run receives signing secrets.

Windows build creates updater config from public key, then generates manifest, notes, and installer SHA-256 metadata once in protected signed job. Publish transfers and checks exact notes and digest, allows only installer, `.sig`, and `latest.json` as GitHub release assets, rejects symlinks/non-files and foreign assets, and rechecks draft identity before publishing. Release identity, canonical URL, signature, manifest, and uploaded installer bytes must match. Existing public releases are never overwritten. Windows/landing/web archives are not included in release.

Generate the updater key pair on a trusted offline machine using the Tauri CLI (`npx tauri signer generate -w <secure-private-key-path>`). Store private key and password in a separately secured backup; add private key/password only as protected GitHub environment secrets and public key only as repository variable. Never commit generated keys, generated release config, signed installers, or signatures. Rotate keys only with an explicit client migration plan. Triggering a tag/manual rerun is not proof of a real release: protected environment approval, owner-supplied keys, live GitHub publication, and installed A→B updater acceptance remain owner-operated gates. Tauri updater signing is not Windows Authenticode signing and does not prevent SmartScreen warnings.

## Security boundary

The privileged `main` webview only loads the bundled local frontend. Its sole capability is `core:default`; no remote origins, remote IPC, broad filesystem scope, HTTP plugin, or shell plugin are enabled. External `http(s)` links use the system opener; remote popups and blob/data/javascript/file navigation stay out of the privileged webview. Blob downloads remain non-executable and are not granted privileged navigation or filesystem scope.

## Media/WASM evidence

Desktop media uses the shared `MediaTransport.fetchBlob` with a same-origin, no-redirect, no-store authenticated WebView fetch. The optional Rust fallback accepts only Matrix MXC metadata plus `user_id`; Rust loads active account credentials from account storage, derives the SDK-style homeserver URL, rejects redirects/traversal/deleted or inactive accounts, caps thumbnail dimensions at 4096 px, and applies a fetch timeout. It never receives caller bearer or arbitrary URL. Desktop never registers `/sw.js`; service-worker behavior is browser-only evidence.

CSP keeps `script-src 'self' 'wasm-unsafe-eval'` for verified WebAssembly, IndexedDB-compatible local storage, blob/data media only for rendering, and Matrix HTTPS/WSS connections. CSP was not broadened beyond existing packaged needs.

Packaged NSIS and manual evidence are separate from Vite/mock tests: successful Vitest, Cargo, and policy gates prove code/config only. WASM initialization, IndexedDB restart, E2EE avatars/files/images, tampered-media rejection, account-switch/logout cleanup, and manual SewerNet↔Element smoke remain blocked until an installed Windows build and account/home-server environment are available. Do not read this README as proof of those manual smoke results.
