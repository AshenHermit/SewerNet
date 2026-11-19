use crate::storage::credential_backend::{CredentialBackend, MemoryBackend};
use crate::storage::{RecordStore, StorageError};
use serde::{Deserialize, Serialize};
use std::sync::{Arc, Mutex};

const PENDING_KEY: &str = "oidc:pending:v1";
const TTL_MS: i64 = 15 * 60 * 1000;

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct PendingOidcFlow {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub homeserver_url: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub nonce: Option<String>,
    pub response_mode: Option<String>,
    pub action: Option<String>,
    pub revocation_endpoint: Option<String>,
    pub redirect_uri: Option<String>,
}

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct StoredOidcFlow {
    pub schema: u8,
    pub state: String,
    pub issuer: String,
    pub redirect_uri: String,
    pub sdk_state_key: String,
    pub sdk_state: String,
    pub created_at: i64,
    pub context: PendingOidcFlow,
    pub status: StoredStatus,
}

#[derive(Clone, Copy, Debug, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum StoredStatus {
    Pending,
    Processing,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ClaimedOidcCallback {
    pub flow: StoredOidcFlow,
    pub callback: super::callback::CallbackParams,
}

pub struct PendingStore {
    records: RecordStore,
    lock: Arc<Mutex<()>>,
}

impl PendingStore {
    pub fn new(backend: Arc<dyn CredentialBackend>) -> Self {
        Self {
            records: RecordStore::from_shared(backend),
            lock: Arc::new(Mutex::new(())),
        }
    }

    pub fn memory() -> Self {
        Self::new(Arc::new(MemoryBackend::new()))
    }

    pub fn save(&self, mut flow: StoredOidcFlow) -> Result<(), StorageError> {
        let _guard = self.lock.lock().unwrap();
        if flow.schema != 1
            || flow.state.is_empty()
            || flow.state.len() > 512
            || flow.sdk_state_key != format!("mx_oidc_{}", flow.state)
            || flow.sdk_state.len() > 48 * 1024
            || flow.redirect_uri != "sewernet://oidc/callback"
            || flow.context.redirect_uri.as_deref() != Some("sewernet://oidc/callback")
            || url::Url::parse(&flow.issuer).is_err()
            || !flow.issuer.starts_with("https://")
        {
            return Err(StorageError::Corrupt("oidc pending"));
        }
        flow.status = StoredStatus::Pending;
        let bytes = serde_json::to_vec(&flow).map_err(|_| StorageError::Transaction)?;
        self.records.write(PENDING_KEY, &bytes)
    }

    pub fn clear(&self, expected_state: Option<String>) -> Result<(), StorageError> {
        let _guard = self.lock.lock().unwrap();
        if let Some(expected) = expected_state {
            let current = self.read_unlocked()?;
            if current.is_some_and(|flow| flow.state == expected) {
                self.records.delete(PENDING_KEY)?;
            }
        } else {
            self.records.delete(PENDING_KEY)?;
        }
        Ok(())
    }

    pub fn claim(&self, raw: &str, now_ms: i64) -> Result<ClaimedOidcCallback, &'static str> {
        let callback = super::callback::parse_callback(raw)?;
        let _guard = self.lock.lock().unwrap();
        let mut flow = self
            .read_unlocked()
            .map_err(|_| "storage_error")?
            .ok_or("no_pending")?;

        if flow.status == StoredStatus::Processing {
            return Err("already_processing");
        }
        if flow.created_at > now_ms.saturating_add(60_000)
            || now_ms.saturating_sub(flow.created_at) >= TTL_MS
        {
            return Err("expired");
        }
        if callback.state != flow.state {
            return Err("state_mismatch");
        }

        flow.status = StoredStatus::Processing;
        let bytes = serde_json::to_vec(&flow).map_err(|_| "storage_error")?;
        self.records
            .write(PENDING_KEY, &bytes)
            .map_err(|_| "storage_error")?;

        Ok(ClaimedOidcCallback { flow, callback })
    }

    fn read_unlocked(&self) -> Result<Option<StoredOidcFlow>, StorageError> {
        let Some(bytes) = self.records.read(PENDING_KEY)? else {
            return Ok(None);
        };
        if bytes.len() > 64 * 1024 {
            return Err(StorageError::Bounds);
        }
        serde_json::from_slice(&bytes).map_err(|_| StorageError::Corrupt("oidc pending"))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn flow(created_at: i64) -> StoredOidcFlow {
        StoredOidcFlow {
            schema: 1,
            state: "right-state".into(),
            issuer: "https://mas.example".into(),
            redirect_uri: "sewernet://oidc/callback".into(),
            sdk_state_key: "mx_oidc_right-state".into(),
            sdk_state: "sdk-secret".into(),
            created_at,
            context: PendingOidcFlow {
                homeserver_url: Some("https://hs.example".into()),
                nonce: Some("nonce".into()),
                response_mode: Some("query".into()),
                action: None,
                revocation_endpoint: None,
                redirect_uri: Some("sewernet://oidc/callback".into()),
            },
            status: StoredStatus::Pending,
        }
    }

    #[test]
    fn wrong_state_preserves_valid_flow() {
        let store = PendingStore::memory();
        store.save(flow(1_000)).unwrap();
        assert!(matches!(
            store.claim("sewernet://oidc/callback?state=wrong&code=c", 1_001),
            Err("state_mismatch")
        ));
        assert_eq!(
            store
                .claim("sewernet://oidc/callback?state=right-state&code=c", 1_001)
                .unwrap()
                .flow
                .status,
            StoredStatus::Processing
        );
    }

    #[test]
    fn ttl_boundary_and_sixty_second_clock_tolerance() {
        let store = PendingStore::memory();
        store.save(flow(10_000)).unwrap();
        assert!(
            store
                .claim(
                    "sewernet://oidc/callback?state=right-state&code=c",
                    10_000 + TTL_MS - 1
                )
                .is_ok()
        );
        store.save(flow(10_000)).unwrap();
        assert!(matches!(
            store.claim(
                "sewernet://oidc/callback?state=right-state&code=c",
                10_000 + TTL_MS
            ),
            Err("expired")
        ));
        store.save(flow(10_000)).unwrap();
        assert!(matches!(
            store.claim(
                "sewernet://oidc/callback?state=right-state&code=c",
                10_000 + TTL_MS + 1
            ),
            Err("expired")
        ));
    }

    #[test]
    fn ttl_rejects_clock_rollback_and_expiry() {
        let store = PendingStore::memory();
        store.save(flow(100_000)).unwrap();
        assert!(matches!(
            store.claim("sewernet://oidc/callback?state=right-state&code=c", 39_999),
            Err("expired")
        ));
        assert!(matches!(
            store.claim(
                "sewernet://oidc/callback?state=right-state&code=c",
                100_000 + TTL_MS + 1
            ),
            Err("expired")
        ));
    }

    #[test]
    fn duplicate_claim_is_blocked_after_processing_commit() {
        let store = PendingStore::memory();
        store.save(flow(1_000)).unwrap();
        assert!(
            store
                .claim("sewernet://oidc/callback?state=right-state&code=c", 1_001)
                .is_ok()
        );
        assert!(matches!(
            store.claim("sewernet://oidc/callback?state=right-state&code=c", 1_002),
            Err("already_processing")
        ));
    }

    #[test]
    fn concurrency_has_one_successful_claim() {
        let store = Arc::new(PendingStore::memory());
        store.save(flow(1_000)).unwrap();
        let mut handles = Vec::new();
        for _ in 0..8 {
            let store = store.clone();
            handles.push(std::thread::spawn(move || {
                store.claim("sewernet://oidc/callback?state=right-state&code=c", 1_001)
            }));
        }
        let results = handles
            .into_iter()
            .map(|h| h.join().unwrap())
            .collect::<Vec<_>>();
        assert_eq!(results.iter().filter(|r| r.is_ok()).count(), 1);
    }

    #[test]
    fn processing_commit_failure_leaves_no_claimed_result() {
        use crate::storage::StorageError;
        use crate::storage::credential_backend::CredentialBackend;

        #[derive(Clone)]
        struct FailWriteBackend {
            inner: Arc<MemoryBackend>,
            fail: Arc<std::sync::atomic::AtomicBool>,
        }

        impl CredentialBackend for FailWriteBackend {
            fn read(&self, target: &str) -> Result<Option<Vec<u8>>, StorageError> {
                self.inner.read(target)
            }
            fn write(&self, _target: &str, _bytes: &[u8]) -> Result<(), StorageError> {
                if self.fail.load(std::sync::atomic::Ordering::SeqCst) {
                    Err(StorageError::Transaction)
                } else {
                    self.inner.write(_target, _bytes)
                }
            }
            fn delete(&self, target: &str) -> Result<(), StorageError> {
                self.inner.delete(target)
            }
            fn list_owned(&self, prefix: &str) -> Result<Vec<String>, StorageError> {
                self.inner.list_owned(prefix)
            }
        }

        let inner = Arc::new(MemoryBackend::new());
        let fail = Arc::new(std::sync::atomic::AtomicBool::new(false));
        let store = PendingStore::new(Arc::new(FailWriteBackend {
            inner: inner.clone(),
            fail: fail.clone(),
        }));
        store.save(flow(1_000)).unwrap();
        fail.store(true, std::sync::atomic::Ordering::SeqCst);
        assert!(matches!(
            store.claim("sewernet://oidc/callback?state=right-state&code=c", 1_001),
            Err("storage_error")
        ));
    }

    #[test]
    fn save_rejects_unexpected_redirect_or_sdk_key() {
        let store = PendingStore::memory();
        let mut bad = flow(1_000);
        bad.redirect_uri = "https://evil/callback".into();
        assert!(store.save(bad).is_err());
        let mut bad = flow(1_000);
        bad.sdk_state_key = "mx_oidc_other".into();
        assert!(store.save(bad).is_err());
    }

    #[test]
    fn clear_expected_state_does_not_delete_other_flow() {
        let store = PendingStore::memory();
        store.save(flow(1_000)).unwrap();
        store.clear(Some("other".into())).unwrap();
        assert_eq!(
            store
                .claim("sewernet://oidc/callback?state=right-state&code=c", 1_001)
                .unwrap()
                .callback
                .state,
            "right-state"
        );
    }
}
