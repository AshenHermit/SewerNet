pub mod callback;
pub mod pending;

pub use pending::{ClaimedOidcCallback, PendingStore, StoredOidcFlow};

use serde::Serialize;
use tauri::State;

#[derive(Clone, Serialize)]
pub struct OidcIpcError {
    pub message: &'static str,
}

pub struct OidcState {
    pub pending: PendingStore,
    pub deep_links: crate::deep_links::DeepLinkQueue,
}

#[tauri::command]
pub fn oidc_pending_save(
    state: State<'_, OidcState>,
    flow: StoredOidcFlow,
) -> Result<(), OidcIpcError> {
    state.pending.save(flow).map_err(|_| OidcIpcError {
        message: "storage_error",
    })
}

#[tauri::command]
pub fn oidc_pending_clear(
    state: State<'_, OidcState>,
    state_value: Option<String>,
) -> Result<(), OidcIpcError> {
    state.pending.clear(state_value).map_err(|_| OidcIpcError {
        message: "storage_error",
    })
}

#[tauri::command]
pub fn oidc_callback_claim(
    state: State<'_, OidcState>,
    url: String,
) -> Result<ClaimedOidcCallback, OidcIpcError> {
    let now = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map_err(|_| OidcIpcError { message: "expired" })?
        .as_millis() as i64;
    state
        .pending
        .claim(&url, now)
        .map_err(|message| OidcIpcError { message })
}
