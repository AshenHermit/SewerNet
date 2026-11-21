pub mod callback;
pub mod loopback;
pub mod pending;

use tauri::State;
use url::Url;

// Re-export all public types from submodules (also makes them available in this module)
pub use callback::CallbackParams;
pub use pending::PendingOidcFlow;
pub use pending::StoredStatus;
pub use pending::PendingStore;
pub use pending::StoredOidcFlow;
pub use pending::ClaimedOidcCallback;
pub use pending::ClaimedOidcCallbackParams;
pub use pending::parse_claimed_callback;
pub use pending::is_trusted_oidc_redirect_uri;

pub fn is_oidc_callback(uri: &str) -> bool {
    match Url::parse(uri) {
        Ok(url) => {
            let path_ok = match url.scheme() {
                "sewernet" => url.path() == "/callback",
                "http" => url.path() == "/oidc/callback",
                _ => false,
            };
            path_ok
                && url.username().is_empty()
                && url.password().is_none()
                && url.fragment().is_none()
                && !url.cannot_be_a_base()
                && (url.scheme() == "sewernet"
                    && url.host_str() == Some("oidc")
                    && url.port().is_none()
                    || url.scheme() == "http"
                        && url.host_str() == Some("127.0.0.1")
                        && url.port() == Some(4201))
        }
        Err(_) => false,
    }
}

#[derive(Clone)]
pub struct OidcState {
    pub pending: PendingStore,
    pub deep_links: crate::deep_links::DeepLinkQueue,
}

// Tauri commands
#[tauri::command]
pub async fn oidc_pending_save(
    state: State<'_, crate::oidc::OidcState>,
    flow: StoredOidcFlow,
) -> Result<(), String> {
    let pending = state.pending.clone();
    tauri::async_runtime::spawn_blocking(move || {
        pending.save_pending(flow).map_err(|e| e.to_string())
    })
    .await
    .map_err(|_| "task join error")?
}

#[tauri::command]
pub async fn oidc_pending_clear(
    state: State<'_, crate::oidc::OidcState>,
    expected_state: Option<String>,
) -> Result<(), String> {
    let pending = state.pending.clone();
    tauri::async_runtime::spawn_blocking(move || {
        pending.clear(expected_state).map_err(|e| e.to_string())
    })
    .await
    .map_err(|_| "task join error")?
}

#[tauri::command]
pub async fn oidc_callback_claim(
    state: State<'_, crate::oidc::OidcState>,
    redirect_target: String,
    ttl_ms: i64,
) -> Result<Option<ClaimedOidcCallbackParams>, String> {
    let pending = state.pending.clone();
    let result = tauri::async_runtime::spawn_blocking(move || {
        pending.claim_pending(redirect_target, ttl_ms).map_err(|e| e.to_string())
    })
    .await
    .map_err(|_| "task join error".to_string())??;

    Ok(result.map(|c| ClaimedOidcCallbackParams { callback: c.callback }))
}