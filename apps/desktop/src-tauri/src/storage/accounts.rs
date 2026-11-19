use crate::storage::credential_backend::CredentialBackend;
use crate::storage::{RecordStore, StorageError};
use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;
use std::sync::{Arc, Mutex};

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MatrixCredentials {
    pub user_id: String,
    pub access_token: String,
    pub device_id: String,
    pub homeserver_url: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub refresh_token: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub expires_in_ms: Option<i64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub oidc: Option<serde_json::Value>,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BlockedEntry {
    pub device_id: String,
    pub reason: String,
}

#[derive(Clone, Debug, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AccountSnapshot {
    pub accounts: BTreeMap<String, MatrixCredentials>,
    pub active_user_id: Option<String>,
    pub blocked_accounts: BTreeMap<String, BlockedEntry>,
}

#[derive(Clone, Debug, Default, Serialize, Deserialize)]
struct AccountIndex {
    user_ids: Vec<String>,
    active_user_id: Option<String>,
    blocked_accounts: BTreeMap<String, BlockedEntry>,
}

pub struct AccountStore {
    records: RecordStore,
    mutex: Mutex<()>,
}

impl AccountStore {
    pub fn new<B: CredentialBackend + 'static>(backend: B) -> Self {
        Self {
            records: RecordStore::new(backend),
            mutex: Mutex::new(()),
        }
    }
    pub fn with_backend(backend: Arc<dyn CredentialBackend>) -> Self {
        Self {
            records: RecordStore::from_shared(backend),
            mutex: Mutex::new(()),
        }
    }

    pub fn load(&self) -> Result<AccountSnapshot, StorageError> {
        let _guard = self.mutex.lock().unwrap();
        let index = match self.records.read("account:index")? {
            Some(bytes) => serde_json::from_slice::<AccountIndex>(&bytes)
                .map_err(|_| StorageError::Corrupt("index"))?,
            None => AccountIndex::default(),
        };
        let mut accounts = BTreeMap::new();
        for user_id in &index.user_ids {
            let id = format!("account:{}", lower_key(user_id));
            if let Some(bytes) = self.records.read(&id)? {
                let account: MatrixCredentials =
                    serde_json::from_slice(&bytes).map_err(|_| StorageError::Corrupt("account"))?;
                accounts.insert(user_id.clone(), account);
            }
        }
        Ok(AccountSnapshot {
            accounts,
            active_user_id: index.active_user_id,
            blocked_accounts: index.blocked_accounts,
        })
    }

    pub fn migrate_legacy(
        &self,
        credentials: Vec<MatrixCredentials>,
        active_user_id: Option<String>,
    ) -> Result<(), StorageError> {
        let _guard = self.mutex.lock().unwrap();
        let mut index = match self.records.read("account:index")? {
            Some(bytes) => serde_json::from_slice::<AccountIndex>(&bytes)
                .map_err(|_| StorageError::Corrupt("index"))?,
            None => AccountIndex::default(),
        };
        for account in credentials {
            let key = format!("account:{}", lower_key(&account.user_id));
            let account_bytes =
                serde_json::to_vec(&account).map_err(|_| StorageError::Transaction)?;
            self.records.write(&key, &account_bytes)?;
            if !index
                .user_ids
                .iter()
                .any(|id| id.eq_ignore_ascii_case(&account.user_id))
            {
                index.user_ids.push(account.user_id);
            }
        }
        if let Some(active) = active_user_id.filter(|id| {
            index
                .user_ids
                .iter()
                .any(|known| known.eq_ignore_ascii_case(id))
        }) {
            index.active_user_id = Some(active);
        }
        let index_bytes = serde_json::to_vec(&index).map_err(|_| StorageError::Transaction)?;
        self.records.write("account:index", &index_bytes)
    }

    pub fn upsert(&self, credentials: MatrixCredentials) -> Result<(), StorageError> {
        let _guard = self.mutex.lock().unwrap();
        let mut index = self.load_index()?;
        if !index.user_ids.iter().any(|id| id == &credentials.user_id) {
            index.user_ids.push(credentials.user_id.clone());
        }
        index.blocked_accounts.remove(&credentials.user_id);
        let account_bytes =
            serde_json::to_vec(&credentials).map_err(|_| StorageError::Transaction)?;
        self.records.write(
            &format!("account:{}", lower_key(&credentials.user_id)),
            &account_bytes,
        )?;
        let index_bytes = serde_json::to_vec(&index).map_err(|_| StorageError::Transaction)?;
        self.records.write("account:index", &index_bytes)
    }

    pub fn begin_operation(
        &self,
        user_id: &str,
        device_id: &str,
        reason: &str,
    ) -> Result<(), StorageError> {
        if reason != "refresh" && reason != "delete" {
            return Err(StorageError::Bounds);
        }
        let _guard = self.mutex.lock().unwrap();
        let mut index = self.load_index()?;
        let key = index
            .user_ids
            .iter()
            .find(|id| id.eq_ignore_ascii_case(user_id))
            .cloned()
            .unwrap_or_else(|| user_id.to_string());
        index.blocked_accounts.insert(
            key,
            BlockedEntry {
                device_id: device_id.to_string(),
                reason: reason.to_string(),
            },
        );
        let bytes = serde_json::to_vec(&index).map_err(|_| StorageError::Transaction)?;
        self.records.write("account:index", &bytes)
    }

    pub fn remove(&self, user_id: &str) -> Result<(), StorageError> {
        let _guard = self.mutex.lock().unwrap();
        let mut index = self.load_index()?;
        if let Some(key) = index
            .user_ids
            .iter()
            .find(|id| id.eq_ignore_ascii_case(user_id))
            .cloned()
        {
            index
                .user_ids
                .retain(|id| !id.eq_ignore_ascii_case(user_id));
            index.blocked_accounts.remove(&key);
            if index
                .active_user_id
                .as_deref()
                .is_some_and(|id| id.eq_ignore_ascii_case(user_id))
            {
                index.active_user_id = None;
            }
            let bytes = serde_json::to_vec(&index).map_err(|_| StorageError::Transaction)?;
            self.records.write("account:index", &bytes)?;
            self.records.delete(&format!("account:{}", lower_key(&key)))
        } else {
            Ok(())
        }
    }

    pub fn set_active(&self, user_id: Option<String>) -> Result<(), StorageError> {
        let _guard = self.mutex.lock().unwrap();
        let mut index = self.load_index()?;
        if let Some(id) = &user_id {
            if !index
                .user_ids
                .iter()
                .any(|existing| existing.eq_ignore_ascii_case(id))
            {
                return Err(StorageError::Bounds);
            }
            index.active_user_id = index
                .user_ids
                .iter()
                .find(|existing| existing.eq_ignore_ascii_case(id))
                .cloned();
        } else {
            index.active_user_id = None;
        }
        let bytes = serde_json::to_vec(&index).map_err(|_| StorageError::Transaction)?;
        self.records.write("account:index", &bytes)
    }

    pub fn clear(&self) -> Result<(), StorageError> {
        let _guard = self.mutex.lock().unwrap();
        let index = self.load_index()?;
        for user_id in index.user_ids {
            self.records
                .delete(&format!("account:{}", lower_key(&user_id)))?;
        }
        self.records.delete("account:index")
    }

    pub fn flush(&self) -> Result<(), StorageError> {
        let _guard = self.mutex.lock().unwrap();
        self.records.flush()
    }

    fn load_index(&self) -> Result<AccountIndex, StorageError> {
        match self.records.read("account:index")? {
            Some(bytes) => {
                serde_json::from_slice(&bytes).map_err(|_| StorageError::Corrupt("index"))
            }
            None => Ok(AccountIndex::default()),
        }
    }
}

fn lower_key(value: &str) -> String {
    use sha2::{Digest, Sha256};
    hex::encode(&Sha256::digest(value.as_bytes())[..16])
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::storage::MemoryBackend;

    fn credentials(user_id: &str) -> MatrixCredentials {
        MatrixCredentials {
            user_id: user_id.to_string(),
            access_token: "test-token".to_string(),
            device_id: "TEST".to_string(),
            homeserver_url: "https://example.org".to_string(),
            refresh_token: None,
            expires_in_ms: None,
            oidc: None,
        }
    }

    #[test]
    fn case_distinct_ids_do_not_collide_and_case_is_indexed_once() {
        let store = AccountStore::new(MemoryBackend::new());
        store.upsert(credentials("@Alice:Example.org")).unwrap();
        store.upsert(credentials("@alice:example.org")).unwrap();
        let snapshot = store.load().unwrap();
        assert_eq!(snapshot.accounts.len(), 2);
    }

    #[test]
    fn tombstone_prevents_account_resurrection() {
        let store = AccountStore::new(MemoryBackend::new());
        store.upsert(credentials("@alice:example.org")).unwrap();
        store.remove("@ALICE:EXAMPLE.ORG").unwrap();
        assert!(store.load().unwrap().accounts.is_empty());
    }

    #[test]
    fn blocked_flag_survives_until_upsert_commit() {
        let store = AccountStore::new(MemoryBackend::new());
        store.upsert(credentials("@alice:example.org")).unwrap();
        store
            .begin_operation("@alice:example.org", "DEVICE", "refresh")
            .unwrap();
        assert_eq!(store.load().unwrap().blocked_accounts.len(), 1);
        store.upsert(credentials("@alice:example.org")).unwrap();
        assert!(store.load().unwrap().blocked_accounts.is_empty());
    }
}
