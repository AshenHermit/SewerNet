import { describe, expect, it } from 'vitest';
import fixture from '../../tests/fixtures/encrypted-attachment-v2.json';
import { decryptAttachment, encryptAttachment } from './attachment-crypto';
import type { MatrixEncryptedFile } from './attachment-crypto';

interface Fixture {
  plaintext: string;
  ciphertext: string;
  key: string;
  iv: string;
  sha256: string;
}

const knownVector = fixture as Fixture;

function fromBase64(value: string): Uint8Array {
  const normalized = value.replace(/-/g, '+').replace(/_/g, '/');
  const decoded = atob(normalized + '='.repeat((4 - (normalized.length % 4)) % 4));
  return Uint8Array.from(decoded, (char) => char.charCodeAt(0));
}

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
}

function fileDescriptor(): MatrixEncryptedFile {
  return {
    v: 'v2',
    url: 'mxc://example.test/file',
    key: { kty: 'oct', alg: 'A256CTR', ext: true, key_ops: ['encrypt', 'decrypt'], k: knownVector.key },
    iv: knownVector.iv,
    hashes: { sha256: knownVector.sha256 },
  };
}

describe('attachment crypto', () => {
  it('v2_known_vector_roundtrip', async () => {
    const plaintext = toArrayBuffer(fromBase64(knownVector.plaintext));
    const descriptor = fileDescriptor();
    const ciphertext = toArrayBuffer(fromBase64(knownVector.ciphertext));

    expect(await decryptAttachment(ciphertext, descriptor)).toEqual(plaintext);
    const encrypted = await encryptAttachment(plaintext);
    expect(new Uint8Array(encrypted.ciphertext)).not.toEqual(new Uint8Array(plaintext));
    expect(await decryptAttachment(encrypted.ciphertext, {
      ...encrypted.descriptor,
      url: 'mxc://example.test/roundtrip',
    })).toEqual(plaintext);
  });

  it('fresh_key_and_iv_per_file', async () => {
    const plaintext = new TextEncoder().encode('nonempty synthetic fixture').buffer;
    const first = await encryptAttachment(plaintext);
    const second = await encryptAttachment(plaintext);

    expect(first.descriptor.key.k).not.toBe(second.descriptor.key.k);
    expect(first.descriptor.iv).not.toBe(second.descriptor.iv);
    expect(first.descriptor.key).toMatchObject({
      kty: 'oct', alg: 'A256CTR', ext: true, key_ops: ['encrypt', 'decrypt'],
    });
    expect(fromBase64(first.descriptor.key.k ?? '')).toHaveLength(32);
    expect(fromBase64(first.descriptor.iv)).toHaveLength(16);
    expect(fromBase64(first.descriptor.iv).slice(8)).toEqual(new Uint8Array(8));
    expect(new Uint8Array(first.ciphertext)).not.toEqual(new Uint8Array(plaintext));
  });

  it('tampered_ciphertext_rejected_before_decrypt', async () => {
    const plaintext = toArrayBuffer(fromBase64(knownVector.plaintext));
    const encrypted = await encryptAttachment(plaintext);
    const tampered = new Uint8Array(encrypted.ciphertext.slice(0));
    tampered[0] = (tampered[0] ?? 0) ^ 1;

    await expect(decryptAttachment(tampered.buffer, { ...encrypted.descriptor, url: 'mxc://example.test/file' })).rejects.toThrow('hash mismatch');
  });

  it('invalid_v_key_iv_hash_rejected', async () => {
    const ciphertext = toArrayBuffer(fromBase64(knownVector.ciphertext));
    const descriptor = fileDescriptor();
    await expect(decryptAttachment(ciphertext, { ...descriptor, v: 'v1' } as unknown as MatrixEncryptedFile)).rejects.toThrow();
    await expect(decryptAttachment(ciphertext, { ...descriptor, key: { ...descriptor.key, k: 'x' } })).rejects.toThrow();
    await expect(decryptAttachment(ciphertext, { ...descriptor, iv: 'bad' })).rejects.toThrow();
    await expect(decryptAttachment(ciphertext, { ...descriptor, hashes: { sha256: 'bad' } })).rejects.toThrow();
  });

  it('roundtrips empty and binary files', async () => {
    for (const bytes of [new Uint8Array(), new Uint8Array([0, 255, 1, 128, 42])]) {
      const encrypted = await encryptAttachment(toArrayBuffer(bytes));
      const decrypted = await decryptAttachment(encrypted.ciphertext, {
        ...encrypted.descriptor,
        url: 'mxc://example.test/file',
      });
      expect(new Uint8Array(decrypted)).toEqual(bytes);
    }
  });
});
