pub mod deep_links;
pub mod lifecycle;
pub mod media;
pub mod navigation;
pub mod oidc;
pub mod storage;

use tauri::{Emitter, Manager};
#[cfg(debug_assertions)]
use tauri_plugin_deep_link::DeepLinkExt;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let builder = tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|app, argv, _cwd| {
            if let Some(deep_link) = app.try_state::<tauri_plugin_deep_link::DeepLink<tauri::Wry>>()
            {
                deep_link.handle_cli_arguments(argv.iter());
            }
            for arg in &argv {
                if crate::deep_links::is_trusted_callback(arg) {
                    let _ = app.emit("sewernet://oidc-callback", arg.clone());
                }
            }
            if let Some(window) = app.get_webview_window("main") {
                crate::lifecycle::show_main_window_handle(window);
            }
        }))
        .plugin(tauri_plugin_deep_link::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(navigation::plugin())
        .on_window_event(lifecycle::hide_on_close)
        .setup(|app| {
            lifecycle::setup_tray(app)?;
            use tauri_plugin_deep_link::DeepLinkExt;
            let handle = app.handle().clone();
            app.deep_link().on_open_url(move |event| {
                for url in event.urls() {
                    if crate::deep_links::is_trusted_callback(url.as_str()) {
                        let _ = handle.emit("sewernet://oidc-callback", url.as_str());
                    }
                }
            });
            if let Some(urls) = app.deep_link().get_current().ok().flatten() {
                for url in urls {
                    let raw = url.as_str();
                    if crate::deep_links::is_trusted_callback(raw) {
                        use tauri::Emitter;
                        let _ = app.emit("sewernet://oidc-callback", raw);
                    }
                }
            }
            crate::oidc::loopback::start_loopback_listener(app.handle().clone());
            Ok(())
        });
    #[cfg(debug_assertions)]
    let builder = if crate::deep_links::dev_registration_enabled() {
        builder.setup(|app| {
            app.deep_link()
                .register("sewernet")
                .map_err(std::io::Error::other)?;
            Ok(())
        })
    } else {
        builder
    };
    builder
        .manage(storage::production_state())
        .manage(oidc::OidcState {
            pending: oidc::PendingStore::new(std::sync::Arc::new(
                storage::WindowsCredentialBackend,
            )),
            deep_links: crate::deep_links::DeepLinkQueue::default(),
        })
        .invoke_handler(tauri::generate_handler![
            oidc::oidc_pending_save,
            oidc::oidc_pending_clear,
            oidc::oidc_callback_claim,
            storage::accounts_load,
            storage::accounts_migrate_legacy,
            storage::account_upsert,
            storage::account_begin_operation,
            storage::account_remove,
            storage::account_set_active,
            storage::accounts_clear,
            storage::storage_flush,
            media::media_download,
            navigation::open_external_url,
            lifecycle::show_main_window,
            lifecycle::request_app_exit,
            lifecycle::updater_available,
            lifecycle::begin_update_exit,
            lifecycle::reset_update_exit,
            lifecycle::exit_desktop,
        ])
        .run(tauri::generate_context!())
        .expect("failed to run SewerNet desktop application");
}
