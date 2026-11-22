# Tray Click and Exit Reliability Plan

> Execute inline in this session. Keep changes scoped to tray interaction and safe exit visibility.

**Goal:** Conventional Windows tray clicks and visible, working safe Exit coordinator.

**Spec:** `docs/superpowers/specs/2026-11-20-tray-click-exit-design.md`

## Tasks

### 1. Add red policy tests

- Modify `tools/ci/desktop-policy.test.mjs`.
- [x] Assert `setup_tray` calls `.show_menu_on_left_click(false).`
- [x] Assert tray click handler opens/focuses only on `MouseButton::Left` + `MouseButtonState::Up`; right/middle must not trigger open.
- [x] Assert Exit handler shows/focuses main window before emitting `app-exit-requested`.
- [x] Run `node --test tools/ci/desktop-policy.test.mjs`; expected failure against current lifecycle code.

### 2. Implement tray routing

- [x] Modify `apps/desktop/src-tauri/src/lifecycle.rs`.
- [x] Import Tauri tray click event/button enums.
- [x] Add `.show_menu_on_left_click(false)`.
- [x] Add `.on_tray_icon_event` handler matching only left-button release to show/focus main window.
- [x] For menu Exit, call same show/focus behavior before event emit; preserve coordinator and native flush sequence.
- [x] Run focused policy tests.

### 3. Verify and report

- [x] Run desktop policy and Matrix frozen-prototype regression tests.
- [x] Run `npx nx build desktop` and `git diff --check`.
- [x] Note Linux Tauri doesn't emit tray click events; native context menu still works.
- [ ] Manual verification pending Windows app interaction: left click opens window, right click opens menu; Exit brings window forward and then exits through credential/store flush.
