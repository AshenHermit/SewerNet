# Matrix Widget API Prototype-Freeze Compatibility

## Intent

Restore the desktop UI and Tray Exit while preserving Tauri's `freezePrototype: true` protection and the existing JS-coordinated credential flush.

## Findings

`matrix-widget-api` 1.16.1, 1.19.0, and current 1.20.0 all emit `exports.toString = toString` in `lib/templating/url-template.js`. `matrix-js-sdk` 45.1.0 depends on `matrix-widget-api ^1.20.0`, so updating the SDK does not remove this incompatibility. With `Object.prototype` frozen, the CommonJS `exports` object cannot shadow inherited `toString` by assignment.

## Approaches

1. Update `matrix-js-sdk` / `matrix-widget-api`: rejected; inspected current releases retain the failing export statement.
2. Disable Tauri `freezePrototype`: rejected; removes a security hardening setting globally.
3. Keep the current compatible SDK API and replace the package's incompatible CommonJS export behavior with a small, repo-maintained npm patch: use `Object.defineProperty(exports, 'toString', ...)` instead of assignment. Selected: narrow change, retains the freeze setting, avoids SDK-wide upgrade risk.

## Design

- Apply the compatibility change reproducibly through a checked-in npm patch; do not edit `node_modules` manually.
- Remove the ineffective Vite `optimizeDeps.include` workaround and its policy test.
- Keep Tray Exit routed through `app-exit-requested` → JS coordinator → credential flush → `exit_desktop`; do not add a direct native-exit shortcut.
- Do not change the existing draft-confirmation or Rust storage-flush behavior unless integration testing proves another defect.

## Acceptance

- Regression test evaluates the affected CommonJS module with `Object.freeze(Object.prototype)` and confirms module load and exported `toString` work.
- Desktop dev WebView no longer reports the exception and renders the app.
- Tray Exit prompts for an unsaved draft when applicable, flushes credentials through the coordinator, and terminates only after successful flush.
- Desktop policy tests and `npx nx build desktop` pass; `git diff --check` is clean.

## Non-goals

- Updating the Matrix SDK major version.
- Disabling `freezePrototype`.
- Changing authentication, storage format, or exit semantics.
