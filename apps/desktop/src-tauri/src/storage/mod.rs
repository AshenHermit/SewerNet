pub mod accounts;
pub mod credential_backend;
pub mod error;
pub mod records;

pub use credential_backend::{CredentialBackend, MemoryBackend, WindowsCredentialBackend};
pub use error::{SafeIpcError, StorageError};
pub use records::RecordStore;

use accounts::{AccountSnapshot, AccountStore, MatrixCredentials};
use error::SafeIpcError as IpcError;
use std::sync::Arc;
use tauri::State;

pub struct StorageState(pub Arc<AccountStore>);

#[tauri::command]
pub async fn accounts_load(state: State<'_, StorageState>) -> Result<AccountSnapshot, IpcError> {
    let store = state.0.clone();
    tauri::async_runtime::spawn_blocking(move || {
        store.load().map_err(|e| IpcError::from_storage(&e))
    })
    .await
    .map_err(|_| IpcError {
        message: "secure storage operation failed",
    })?
}

#[tauri::command]
pub async fn accounts_migrate_legacy(
    state: State<'_, StorageState>,
    snapshot: AccountSnapshot,
) -> Result<(), IpcError> {
    let store = state.0.clone();
    tauri::async_runtime::spawn_blocking(move || {
        store
            .migrate_legacy(
                snapshot.accounts.into_values().collect(),
                snapshot.active_user_id,
            )
            .map_err(|e| IpcError::from_storage(&e))
    })
    .await
    .map_err(|_| IpcError {
        message: "secure storage operation failed",
    })?
}

#[tauri::command]
pub async fn account_upsert(
    state: State<'_, StorageState>,
    credentials: MatrixCredentials,
) -> Result<(), IpcError> {
    let store = state.0.clone();
    tauri::async_runtime::spawn_blocking(move || {
        store
            .upsert(credentials)
            .map_err(|e| IpcError::from_storage(&e))
    })
    .await
    .map_err(|_| IpcError {
        message: "secure storage operation failed",
    })?
}

#[tauri::command]
pub async fn account_begin_operation(
    state: State<'_, StorageState>,
    user_id: String,
    device_id: String,
    reason: String,
) -> Result<(), IpcError> {
    let store = state.0.clone();
    tauri::async_runtime::spawn_blocking(move || {
        store
            .begin_operation(&user_id, &device_id, &reason)
            .map_err(|e| IpcError::from_storage(&e))
    })
    .await
    .map_err(|_| IpcError {
        message: "secure storage operation failed",
    })?
}

#[tauri::command]
pub async fn account_remove(
    state: State<'_, StorageState>,
    user_id: String,
) -> Result<(), IpcError> {
    let store = state.0.clone();
    tauri::async_runtime::spawn_blocking(move || {
        store
            .remove(&user_id)
            .map_err(|e| IpcError::from_storage(&e))
    })
    .await
    .map_err(|_| IpcError {
        message: "secure storage operation failed",
    })?
}

#[tauri::command]
pub async fn account_set_active(
    state: State<'_, StorageState>,
    user_id: Option<String>,
) -> Result<(), IpcError> {
    let store = state.0.clone();
    tauri::async_runtime::spawn_blocking(move || {
        store
            .set_active(user_id)
            .map_err(|e| IpcError::from_storage(&e))
    })
    .await
    .map_err(|_| IpcError {
        message: "secure storage operation failed",
    })?
}

#[tauri::command]
pub async fn accounts_clear(state: State<'_, StorageState>) -> Result<(), IpcError> {
    let store = state.0.clone();
    tauri::async_runtime::spawn_blocking(move || {
        store.clear().map_err(|e| IpcError::from_storage(&e))
    })
    .await
    .map_err(|_| IpcError {
        message: "secure storage operation failed",
    })?
}

#[tauri::command]
pub async fn storage_flush(state: State<'_, StorageState>) -> Result<(), IpcError> {
    let store = state.0.clone();
    tauri::async_runtime::spawn_blocking(move || {
        store.flush().map_err(|e| IpcError::from_storage(&e))
    })
    .await
    .map_err(|_| IpcError {
        message: "secure storage operation failed",
    })?
}

pub fn production_state() -> StorageState {
    StorageState(Arc::new(AccountStore::with_backend(Arc::new(
        WindowsCredentialBackend,
    ))))
}
