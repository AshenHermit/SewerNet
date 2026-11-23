use thiserror::Error;

#[derive(Debug, Error)]
pub enum StorageError {
    #[error("secure storage unavailable")]
    Keyring,
    #[error("secure record exceeds supported bounds")]
    Bounds,
    #[error("secure record is corrupt")]
    Corrupt(&'static str),
    #[error("secure record operation failed")]
    Transaction,
}

#[derive(Debug, serde::Serialize)]
pub struct SafeIpcError {
    pub message: &'static str,
}

impl SafeIpcError {
    pub fn from_storage(_: &StorageError) -> Self {
        Self {
            message: "secure storage operation failed",
        }
    }
}
