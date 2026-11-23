use crate::storage::error::StorageError;
use keyring_core::Entry;
use std::collections::{BTreeMap, HashMap};
use std::sync::{Arc, Mutex, OnceLock};

pub const NAMESPACE: &str = "org.sewernet.desktop:v1";

pub trait CredentialBackend: Send + Sync {
    fn read(&self, target: &str) -> Result<Option<Vec<u8>>, StorageError>;
    fn write(&self, target: &str, bytes: &[u8]) -> Result<(), StorageError>;
    fn delete(&self, target: &str) -> Result<(), StorageError>;
    fn list_owned(&self, prefix: &str) -> Result<Vec<String>, StorageError>;
}

#[derive(Clone, Default)]
pub struct MemoryBackend {
    map: Arc<Mutex<BTreeMap<String, Vec<u8>>>>,
}

impl MemoryBackend {
    pub fn new() -> Self {
        Self::default()
    }
    pub fn writes(&self) -> Vec<(String, Vec<u8>)> {
        self.map
            .lock()
            .unwrap()
            .iter()
            .map(|(k, v)| (k.clone(), v.clone()))
            .collect()
    }
}

impl CredentialBackend for MemoryBackend {
    fn read(&self, target: &str) -> Result<Option<Vec<u8>>, StorageError> {
        Ok(self.map.lock().unwrap().get(target).cloned())
    }
    fn write(&self, target: &str, bytes: &[u8]) -> Result<(), StorageError> {
        self.map
            .lock()
            .unwrap()
            .insert(target.to_string(), bytes.to_vec());
        Ok(())
    }
    fn delete(&self, target: &str) -> Result<(), StorageError> {
        self.map.lock().unwrap().remove(target);
        Ok(())
    }
    fn list_owned(&self, prefix: &str) -> Result<Vec<String>, StorageError> {
        Ok(self
            .map
            .lock()
            .unwrap()
            .keys()
            .filter(|k| k.starts_with(prefix))
            .cloned()
            .collect())
    }
}

pub struct WindowsCredentialBackend;

impl WindowsCredentialBackend {
    fn initialize() -> Result<(), StorageError> {
        static STORE: OnceLock<Result<(), ()>> = OnceLock::new();
        match STORE.get_or_init(|| {
            let config = HashMap::from([
                ("prefix", "org.sewernet.desktop:v1:"),
                ("divider", ":"),
                ("suffix", ""),
                ("service_no_divider", "true"),
            ]);
            let store = windows_native_keyring_store::Store::new_with_configuration(&config)
                .map_err(|_| ())?;
            keyring_core::set_default_store(store);
            Ok(())
        }) {
            Ok(()) => Ok(()),
            Err(()) => Err(StorageError::Keyring),
        }
    }
}

impl CredentialBackend for WindowsCredentialBackend {
    fn read(&self, target: &str) -> Result<Option<Vec<u8>>, StorageError> {
        Self::initialize()?;
        let modifiers = HashMap::from([("target", target)]);
        let entry = Entry::new_with_modifiers(NAMESPACE, target, &modifiers)
            .map_err(|_| StorageError::Keyring)?;
        match entry.get_secret() {
            Ok(value) => Ok(Some(value)),
            Err(keyring_core::Error::NoEntry) => Ok(None),
            Err(_) => Err(StorageError::Keyring),
        }
    }
    fn write(&self, target: &str, bytes: &[u8]) -> Result<(), StorageError> {
        Self::initialize()?;
        let modifiers = HashMap::from([("target", target), ("persistence", "Local")]);
        Entry::new_with_modifiers(NAMESPACE, target, &modifiers)
            .map_err(|_| StorageError::Keyring)?
            .set_secret(bytes)
            .map_err(|_| StorageError::Keyring)
    }
    fn delete(&self, target: &str) -> Result<(), StorageError> {
        Self::initialize()?;
        let modifiers = HashMap::from([("target", target)]);
        match Entry::new_with_modifiers(NAMESPACE, target, &modifiers)
            .map_err(|_| StorageError::Keyring)?
            .delete_credential()
        {
            Ok(()) => Ok(()),
            Err(keyring_core::Error::NoEntry) => Ok(()),
            Err(_) => Err(StorageError::Keyring),
        }
    }
    fn list_owned(&self, prefix: &str) -> Result<Vec<String>, StorageError> {
        Self::initialize()?;
        let pattern = format!("^{}:.*", regex_escape(prefix));
        let spec = HashMap::from([("pattern", pattern.as_str())]);
        let entries = keyring_core::Entry::search(&spec).map_err(|_| StorageError::Keyring)?;
        let mut targets = Vec::new();
        for entry in entries {
            if let Ok(attributes) = entry.get_attributes()
                && let Some(target) = attributes.get("target_name")
                && target.starts_with(prefix)
            {
                targets.push(target.clone());
            }
        }
        Ok(targets)
    }
}

fn regex_escape(value: &str) -> String {
    value
        .chars()
        .map(|c| {
            if "\\.+*?()|[]{}^$".contains(c) {
                format!("\\{c}")
            } else {
                c.to_string()
            }
        })
        .collect()
}
