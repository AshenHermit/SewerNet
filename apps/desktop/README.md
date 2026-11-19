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

## Security boundary

The privileged `main` webview only loads the bundled local frontend. Its sole capability is `core:default`; no remote origins, remote IPC, broad filesystem scope, HTTP plugin, or shell plugin are enabled. External navigation and protocol handling are not implemented in this bootstrap shell. The CSP permits only local scripts plus narrowly needed Matrix HTTPS/WSS connections, WebAssembly, media blobs, and hosted fonts. Asset protocol is disabled. No remote page should be loaded in the privileged window.
