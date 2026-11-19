use sewernet_desktop_lib::lifecycle;

#[test]
fn empty_updater_pubkey_is_unavailable() {
    let config: serde_json::Value =
        serde_json::from_str(include_str!("../tauri.conf.json")).expect("valid config");
    let pubkey = config
        .pointer("/plugins/updater/pubkey")
        .and_then(serde_json::Value::as_str)
        .unwrap_or("");
    assert!(pubkey.trim().is_empty());
    assert!(include_str!("../src/lifecycle.rs").contains("pub fn updater_available() -> bool"));
}

#[test]
fn close_hides_exit_keeps_account() {
    assert_eq!(lifecycle::close_action(), lifecycle::CloseAction::Hide);
    assert_eq!(
        lifecycle::exit_action(),
        lifecycle::ExitAction::RequestCoordinator
    );
}

#[test]
fn exit_flushes_storage_before_exit_and_rejects_flush_failure() {
    let source = include_str!("../src/lifecycle.rs");
    let flush = source.find("store.flush()").expect("exit flush exists");
    let exit = source.find("app.exit(0)").expect("controlled exit exists");
    assert!(
        flush < exit,
        "credential persistence must flush before exit"
    );
    assert!(source.contains("map_err(|error| error.to_string())?;"));
}

#[test]
fn updater_plugin_registered_with_official_builder() {
    let source = include_str!("../src/lib.rs");
    assert!(source.contains("tauri_plugin_updater::Builder::new().build()"));
}

#[test]
fn updater_exit_transition_is_narrow_and_registered() {
    let source = include_str!("../src/lifecycle.rs");
    let transition = source
        .find("pub fn begin_update_exit")
        .expect("updater transition command exists");
    let exit_handler = source.find("pub async fn exit_desktop").unwrap();
    let guard_store = source[transition..exit_handler]
        .find("UPDATE_EXIT_IN_PROGRESS.store(true, Ordering::SeqCst)")
        .expect("transition enables the close-handler guard");
    assert!(source[transition..].contains("#[tauri::command]"));
    assert!(guard_store < exit_handler - transition);

    let lib = include_str!("../src/lib.rs");
    assert!(lib.contains("lifecycle::begin_update_exit"));
}

#[test]
fn update_shutdown_bypasses_close_hide() {
    assert!(lifecycle::update_shutdown_bypasses_close_hide());
}

#[test]
fn update_check_tray_action_is_not_exit_or_logout() {
    assert_eq!(lifecycle::tray_actions()[1], "Check updates");
    assert_eq!(
        lifecycle::exit_action(),
        lifecycle::ExitAction::RequestCoordinator
    );
}

#[test]
fn native_tray_has_required_actions() {
    assert_eq!(
        lifecycle::tray_actions(),
        &["Open", "Check updates", "Exit"]
    );
}
