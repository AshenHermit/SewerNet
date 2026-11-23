#![cfg(windows)]

use sewernet_desktop_lib::storage::credential_backend::CredentialBackend;
use sewernet_desktop_lib::storage::{MemoryBackend, RecordStore, StorageError};

fn assert_roundtrip(size: usize) {
    let backend = MemoryBackend::new();
    let store = RecordStore::new(backend.clone());
    let payload = vec![7u8; size];
    store.write("account:synthetic", &payload).unwrap();
    assert_eq!(store.read("account:synthetic").unwrap(), Some(payload));
}

#[test]
fn roundtrip_boundaries_2048_2560_and_256k() {
    assert_roundtrip(2048);
    assert_roundtrip(2560);
    assert_roundtrip(256 * 1024);
}

#[test]
fn chunks_never_exceed_2048() {
    let backend = MemoryBackend::new();
    let store = RecordStore::new(backend.clone());
    store.write("account:synthetic", &vec![7u8; 3000]).unwrap();
    assert!(
        backend
            .writes()
            .iter()
            .all(|(_, bytes)| bytes.len() <= 2048)
    );
}

#[test]
#[ignore = "explicit Windows Credential Manager smoke; uses only the SewerNet test namespace"]
fn native_roundtrip_is_scoped_and_cleaned() {
    let backend = sewernet_desktop_lib::storage::WindowsCredentialBackend;
    let store = RecordStore::new(backend);
    let id = "__sewernet_task2_native_smoke__";
    let payload = vec![23u8; 3000];
    store.write(id, &payload).unwrap();
    assert_eq!(store.read(id).unwrap(), Some(payload));
    store.delete(id).unwrap();
    assert_eq!(store.read(id).unwrap(), None);
}

#[test]
fn reject_corrupt_hash_schema_missing_chunk() {
    let backend = MemoryBackend::new();
    let store = RecordStore::new(backend.clone());
    store.write("account:synthetic", &vec![7u8; 3000]).unwrap();
    // Delete a real chunk; the root remains intact, so corruption must be reported.
    let owns = backend.writes();
    let chunk_target = owns
        .into_iter()
        .find(|(target, _)| target.contains(":chunk:"))
        .map(|(target, _)| target)
        .unwrap();
    backend.delete(&chunk_target).unwrap();
    assert!(matches!(
        store.read("account:synthetic"),
        Err(StorageError::Corrupt(_))
    ));
}
