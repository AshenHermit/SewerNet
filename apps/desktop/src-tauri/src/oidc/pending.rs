use crate::log_error;
use crate::log_oidc;
use crate::storage::credential_backend::CredentialBackend;
use crate::storage::{RecordStore, StorageError};
use serde::{Deserialize, Serialize};
use std::sync::{Arc, Mutex};
use std::time::{SystemTime, UNIX_EPOCH};
use url::Url;

const PENDING_KEY: &str = "oidc:pending:v1";

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
    pub schema: u32,
    pub state: String,
    pub issuer: String,
    pub redirect_uri: String,
    pub sdk_state_key: String,
    pub sdk_state: String,
    pub created_at: i64,
    pub context: PendingOidcFlow,
    pub status: StoredStatus,
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum StoredStatus {
    Pending,
    Processing,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct ClaimedOidcCallback {
    pub flow: StoredOidcFlow,
    pub callback: crate::oidc::callback::CallbackParams,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct ClaimedOidcCallbackParams {
    pub callback: crate::oidc::callback::CallbackParams,
}

pub fn parse_claimed_callback(url: &str) -> Result<ClaimedOidcCallbackParams, &str> {
    let params = crate::oidc::callback::parse_callback(url)?;
    Ok(ClaimedOidcCallbackParams { callback: params })
}

#[derive(Clone)]
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

    pub fn save(&self, mut flow: StoredOidcFlow) -> Result<(), StorageError> {
        let _guard = self.lock.lock().unwrap();
        log_oidc!(
            "save pending: state={}, issuer={}, redirect_uri={}, sdk_state_key={}, context_redirect_uri={:?}",
            flow.state,
            flow.issuer,
            flow.redirect_uri,
            flow.sdk_state_key,
            flow.context.redirect_uri
        );
        if flow.schema != 1
            || flow.state.is_empty()
            || flow.state.len() > 512
            || flow.sdk_state_key != format!("mx_oidc_{}", flow.state)
            || flow.sdk_state.len() > 48 * 1024
            || !is_trusted_oidc_redirect_uri(&flow.redirect_uri)
            || flow
                .context
                .redirect_uri
                .as_deref()
                .is_some_and(|u| !is_trusted_oidc_redirect_uri(u))
            || Url::parse(&flow.issuer).is_err()
            || !flow.issuer.starts_with("https://")
        {
            log_error!(
                "save pending rejected (corrupt): state={}, issuer={}, redirect_uri={}, sdk_state_key={}, context_redirect_uri={:?}",
                flow.state,
                flow.issuer,
                flow.redirect_uri,
                flow.sdk_state_key,
                flow.context.redirect_uri
            );
            return Err(StorageError::Corrupt("oidc pending"));
        }
        flow.status = StoredStatus::Pending;
        let bytes = serde_json::to_vec(&flow).map_err(|_| StorageError::Transaction)?;
        log_oidc!("save pending OK: state={}", flow.state);
        self.records.write(PENDING_KEY, &bytes)
    }

    pub fn read(&self) -> Result<Option<StoredOidcFlow>, StorageError> {
        let _guard = self.lock.lock().unwrap();
        let Some(bytes) = self.records.read(PENDING_KEY)? else {
            log_oidc!("read pending: none found");
            return Ok(None);
        };
        if bytes.len() > 64 * 1024 {
            return Err(StorageError::Bounds);
        }
        match serde_json::from_slice::<StoredOidcFlow>(&bytes) {
            Ok(flow) => {
                log_oidc!(
                    "read pending OK: state={}, status={:?}",
                    flow.state,
                    flow.status
                );
                Ok(Some(flow))
            }
            Err(e) => {
                log_error!("read pending deserialization failed: {}", e);
                Err(StorageError::Corrupt("oidc pending"))
            }
        }
    }

    pub fn clear(&self, expected_state: Option<String>) -> Result<(), StorageError> {
        let _guard = self.lock.lock().unwrap();
        log_oidc!("clear pending: expected_state={:?}", expected_state);
        if let Some(expected) = expected_state {
            let current = self.read_unlocked()?;
            if let Some(current) = current && current.state != expected {
                log_error!(
                    "clear pending state mismatch: expected={}, found={}",
                    expected,
                    current.state
                );
                return Err(StorageError::Corrupt("oidc pending"));
            }
        }
        let _ = self.records.delete(PENDING_KEY);
        log_oidc!("clear pending OK");
        Ok(())
    }

    fn read_unlocked(&self) -> Result<Option<StoredOidcFlow>, StorageError> {
        self.records.read(PENDING_KEY).and_then(|bytes| {
            if let Some(bytes) = bytes {
                if bytes.len() > 64 * 1024 {
                    return Err(StorageError::Bounds);
                }
                serde_json::from_slice(&bytes).map_err(|_| StorageError::Corrupt("oidc pending"))
            } else {
                Ok(None)
            }
        })
    }

    pub fn claim(
        &self,
        redirect_target: &str,
        ttl_ms: i64,
    ) -> Result<Option<ClaimedOidcCallback>, StorageError> {
        let _guard = self.lock.lock().unwrap();
        log_oidc!(
            "claim pending: redirect_target={}, ttl_ms={}",
            redirect_target,
            ttl_ms
        );
        let Some(mut flow) = self.read_unlocked()? else {
            log_oidc!("claim pending: no flow found");
            return Ok(None);
        };
        log_oidc!(
            "claim pending: found flow state={}, redirect_uri={}, created_at={}",
            flow.state,
            flow.redirect_uri,
            flow.created_at
        );
        let params = crate::oidc::callback::parse_callback(redirect_target).map_err(|e| {
            log_error!("claim pending: parse_callback failed: {}", e);
            StorageError::Corrupt("oidc pending")
        })?;
        if params.state != flow.state {
            log_error!(
                "claim pending: state mismatch: expected={}, got={}",
                flow.state,
                params.state
            );
            return Err(StorageError::Corrupt("oidc pending"));
        }
        if let Some(ttl) = pnet_timestamp_offset() {
            let age = get_current_time() - flow.created_at;
            if age > ttl + ttl_ms {
                log_error!(
                    "claim pending: TTL expired: age={}, ttl={}, ttl_ms={}",
                    age,
                    ttl,
                    ttl_ms
                );
                self.clear(Some(flow.state.clone()))?;
                return Err(StorageError::Corrupt("oidc pending"));
            }
        }
        flow.status = StoredStatus::Processing;
        let bytes = serde_json::to_vec(&flow).map_err(|_| StorageError::Transaction)?;
        let _ = self.records.write(PENDING_KEY, &bytes);

        log_oidc!(
            "claim pending OK: state={}, code={:?}, error={:?}",
            flow.state,
            params.code.is_some(),
            params.error
        );
        Ok(Some(ClaimedOidcCallback {
            flow,
            callback: params,
        }))
    }

    pub fn save_pending(&self, flow: StoredOidcFlow) -> Result<(), StorageError> {
        let mut stored = flow.clone();
        stored.status = StoredStatus::Pending;
        stored.created_at = get_current_time();
        self.save(stored)
    }

    pub fn claim_pending(
        &self,
        redirect_target: String,
        ttl_ms: i64,
    ) -> Result<Option<ClaimedOidcCallback>, StorageError> {
        self.claim(&redirect_target, ttl_ms)
    }
}

fn pnet_timestamp_offset() -> Option<i64> {
    Some(0)
}

fn get_current_time() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis() as i64)
        .unwrap_or(0)
}

pub fn is_trusted_oidc_redirect_uri(uri: &str) -> bool {
    Url::parse(uri).is_ok_and(|url| {
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
    })
}
