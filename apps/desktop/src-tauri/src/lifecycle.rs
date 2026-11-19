use std::sync::atomic::{AtomicBool, Ordering};
use tauri::menu::{Menu, MenuItem};
use tauri::tray::TrayIconBuilder;
use tauri::{AppHandle, Emitter, Manager, Runtime, WindowEvent};

static UPDATE_EXIT_IN_PROGRESS: AtomicBool = AtomicBool::new(false);

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum CloseAction {
    Hide,
}
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ExitAction {
    RequestCoordinator,
}

pub fn close_action() -> CloseAction {
    CloseAction::Hide
}
pub fn exit_action() -> ExitAction {
    ExitAction::RequestCoordinator
}
pub fn tray_actions() -> &'static [&'static str; 3] {
    &["Open", "Check updates", "Exit"]
}
pub fn update_shutdown_bypasses_close_hide() -> bool {
    true
}

#[tauri::command]
pub fn updater_available() -> bool {
    let config: serde_json::Value = serde_json::from_str(include_str!("../tauri.conf.json")).unwrap_or_default();
    config
        .pointer("/plugins/updater/pubkey")
        .and_then(serde_json::Value::as_str)
        .is_some_and(|pubkey| !pubkey.trim().is_empty())
}

#[tauri::command]
pub fn begin_update_exit() {
    UPDATE_EXIT_IN_PROGRESS.store(true, Ordering::SeqCst);
}

pub fn setup_tray<R: Runtime>(app: &mut tauri::App<R>) -> tauri::Result<()> {
    let app_handle = app.handle().clone();
    let open = MenuItem::with_id(&app_handle, "open", "Open", true, None::<&str>)?;
    let check = MenuItem::with_id(
        &app_handle,
        "check-updates",
        "Check updates",
        true,
        None::<&str>,
    )?;
    let exit = MenuItem::with_id(&app_handle, "exit", "Exit", true, None::<&str>)?;
    let menu = Menu::with_items(&app_handle, &[&open, &check, &exit])?;
    let handle = app_handle.clone();
    TrayIconBuilder::new()
        .menu(&menu)
        .on_menu_event(move |_tray, event| match event.id().as_ref() {
            "open" => {
                let _ = handle
                    .get_webview_window("main")
                    .map(show_main_window_handle);
            }
            "check-updates" => {
                if let Some(window) = handle.get_webview_window("main") {
                    let _ = window.show();
                    let _ = window.emit("update-check-requested", true);
                }
            }
            "exit" => {
                if let Some(window) = handle.get_webview_window("main") {
                    let _ = window.emit("app-exit-requested", true);
                }
            }
            _ => {}
        })
        .build(&app_handle)?;
    Ok(())
}

pub fn show_main_window_handle<R: Runtime>(window: tauri::WebviewWindow<R>) {
    let _ = window.show();
    let _ = window.set_focus();
}

pub fn hide_on_close<R: Runtime>(window: &tauri::WebviewWindow<R>, event: &WindowEvent) {
    if let WindowEvent::CloseRequested { api } = event {
        if UPDATE_EXIT_IN_PROGRESS.load(Ordering::SeqCst) {
            return;
        }
        api.prevent_close();
        let _ = window.hide();
    }
}

#[tauri::command]
pub fn show_main_window(app: AppHandle) -> Result<(), String> {
    if let Some(window) = app.get_webview_window("main") {
        show_main_window_handle(window);
        Ok(())
    } else {
        Err("main window unavailable".into())
    }
}

#[tauri::command]
pub fn request_app_exit(app: AppHandle) -> Result<(), String> {
    if let Some(window) = app.get_webview_window("main") {
        window
            .emit("app-exit-requested", true)
            .map_err(|error| error.to_string())
    } else {
        Err("main window unavailable".into())
    }
}

#[tauri::command]
pub async fn exit_desktop(
    app: AppHandle,
    state: tauri::State<'_, crate::storage::StorageState>,
) -> Result<(), String> {
    let store = state.0.clone();
    tauri::async_runtime::spawn_blocking(move || store.flush())
        .await
        .map_err(|error| error.to_string())?
        .map_err(|error| error.to_string())?;
    UPDATE_EXIT_IN_PROGRESS.store(true, Ordering::SeqCst);
    app.exit(0);
    Ok(())
}
