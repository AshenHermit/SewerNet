pub mod storage;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .manage(storage::production_state())
        .invoke_handler(tauri::generate_handler![
            storage::accounts_load,
            storage::account_upsert,
            storage::account_begin_operation,
            storage::account_remove,
            storage::account_set_active,
            storage::accounts_clear,
            storage::storage_flush,
        ])
        .run(tauri::generate_context!())
        .expect("failed to run SewerNet desktop application");
}
