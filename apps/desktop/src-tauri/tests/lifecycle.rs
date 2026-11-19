use sewernet_desktop_lib::lifecycle;

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
