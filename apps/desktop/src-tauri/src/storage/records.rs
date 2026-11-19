use crate::storage::credential_backend::{CredentialBackend, NAMESPACE};
use crate::storage::error::StorageError;
use sha2::{Digest, Sha256};
use std::sync::{Arc, Mutex};

const CHUNK: usize = 2048;
const MAX_CHUNKS: usize = 128;
const MAX_RECORD: usize = 256 * 1024;

#[derive(serde::Serialize, serde::Deserialize)]
struct Root {
    schema: u8,
    generation: u64,
    count: u16,
    length: u32,
    hash: [u8; 32],
}

pub struct RecordStore {
    backend: Arc<dyn CredentialBackend>,
    mutex: Arc<Mutex<()>>,
}

impl RecordStore {
    pub fn new<B: CredentialBackend + 'static>(backend: B) -> Self {
        Self::from_shared(Arc::new(backend))
    }

    pub fn from_shared(backend: Arc<dyn CredentialBackend>) -> Self {
        Self {
            backend,
            mutex: Arc::new(Mutex::new(())),
        }
    }

    pub fn root_target(&self, id: &str) -> String {
        format!("{NAMESPACE}:root:{}", hash_id(id))
    }
    fn chunk_target(&self, id: &str, generation: u64, index: usize) -> String {
        format!(
            "{NAMESPACE}:chunk:{}:{:016x}:{:03}",
            hash_id(id),
            generation,
            index
        )
    }

    pub fn read(&self, id: &str) -> Result<Option<Vec<u8>>, StorageError> {
        let _guard = self.mutex.lock().unwrap();
        let root_bytes = self.backend.read(&self.root_target(id))?;
        let Some(root_bytes) = root_bytes else {
            return Ok(None);
        };
        let root: Root =
            serde_json::from_slice(&root_bytes).map_err(|_| StorageError::Corrupt("root"))?;
        if root.schema != 1 || root.count as usize > MAX_CHUNKS || root.length as usize > MAX_RECORD
        {
            return Err(StorageError::Corrupt("schema"));
        }
        let mut payload = Vec::with_capacity(root.length as usize);
        for index in 0..root.count as usize {
            let chunk = self
                .backend
                .read(&self.chunk_target(id, root.generation, index))?
                .ok_or(StorageError::Corrupt("missing chunk"))?;
            if chunk.len() > CHUNK {
                return Err(StorageError::Corrupt("chunk"));
            }
            payload.extend_from_slice(&chunk);
        }
        if payload.len() != root.length as usize {
            return Err(StorageError::Corrupt("length"));
        }
        let digest = Sha256::digest(&payload);
        if digest.as_slice() != root.hash {
            return Err(StorageError::Corrupt("hash"));
        }
        Ok(Some(payload))
    }

    pub fn write(&self, id: &str, bytes: &[u8]) -> Result<(), StorageError> {
        if bytes.len() > MAX_RECORD {
            return Err(StorageError::Bounds);
        }
        let _guard = self.mutex.lock().unwrap();
        let count = bytes.chunks(CHUNK).count();
        if count > MAX_CHUNKS {
            return Err(StorageError::Bounds);
        }
        let generation = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap_or_default()
            .as_nanos() as u64;
        for (index, chunk) in bytes.chunks(CHUNK).enumerate() {
            self.backend
                .write(&self.chunk_target(id, generation, index), chunk)?;
        }
        let digest = Sha256::digest(bytes);
        let root = Root {
            schema: 1,
            generation,
            count: count as u16,
            length: bytes.len() as u32,
            hash: digest.into(),
        };
        let root_bytes = serde_json::to_vec(&root).map_err(|_| StorageError::Transaction)?;
        let root_target = self.root_target(id);
        let old_root = self.backend.read(&root_target)?;
        self.backend.write(&root_target, &root_bytes)?;
        if let Some(old_bytes) = old_root
            && let Ok(old) = serde_json::from_slice::<Root>(&old_bytes)
        {
            for index in 0..old.count.min(MAX_CHUNKS as u16) as usize {
                let _ = self
                    .backend
                    .delete(&self.chunk_target(id, old.generation, index));
            }
        }
        Ok(())
    }

    pub fn flush(&self) -> Result<(), StorageError> {
        let _guard = self.mutex.lock().unwrap();
        let owned = self.backend.list_owned(NAMESPACE)?;
        for target in owned {
            if target.starts_with(NAMESPACE) {
                let _ = self.backend.read(&target)?;
            }
        }
        Ok(())
    }

    pub fn delete(&self, id: &str) -> Result<(), StorageError> {
        let _guard = self.mutex.lock().unwrap();
        if let Some(root_bytes) = self.backend.read(&self.root_target(id))?
            && let Ok(root) = serde_json::from_slice::<Root>(&root_bytes)
        {
            for index in 0..root.count as usize {
                let _ = self
                    .backend
                    .delete(&self.chunk_target(id, root.generation, index));
            }
        }
        self.backend.delete(&self.root_target(id))
    }
}

fn hash_id(id: &str) -> String {
    hex::encode(&Sha256::digest(id.as_bytes())[..16])
}
