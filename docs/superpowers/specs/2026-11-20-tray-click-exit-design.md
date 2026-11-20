# Tray Click and Exit Reliability

## Goal

Make Windows tray interaction conventional and make Tray Exit visibly enter the existing safe JS shutdown flow.

## Observed behavior

- User reports desktop app now works, but selecting tray Exit appears to do nothing.
- Current `TrayIconBuilder` attaches a menu and leaves `show_menu_on_left_click` at its default (`true`); there is no tray-icon click handler.
- Current Exit handler emits `app-exit-requested` to the main webview without first showing/focusing it. The JS coordinator may ask for unsaved-draft confirmation, flush credentials, then invoke native exit; any prompt/state is hidden while the window remains hidden.

## Selected design

- Set `show_menu_on_left_click(false)`, preserving the native context menu for right-click.
- Handle tray `Click` only for left-button release (`button_state == Up`) and show/focus the main window. Do not treat right-click as an open action.
- For menu `Exit`, show/focus the main window before emitting `app-exit-requested`; preserve `JS coordinator → credential flush → exit_desktop → Rust storage flush → app.exit(0)`.
- Do not add a direct native-exit shortcut. Keep updater exit/close semantics unchanged.
- Add regression coverage for left-click dispatch, right-click menu configuration, Exit reveal-before-event ordering, and safe coordinator flush ordering.

## Platform note

Tauri documents tray click events as unsupported on Linux, while native right-click context menus still work. The left-click behavior can therefore be guaranteed on supported platforms such as Windows, not Linux via this click-event API.

## Acceptance

- On Windows, left-clicking tray icon opens/focuses the app; right-click opens options menu.
- Selecting Exit reveals/focuses the app and runs existing draft confirmation/credential coordinator flow; process exits only after successful credential and native store flush.
- Regression/policy tests and desktop build pass.
