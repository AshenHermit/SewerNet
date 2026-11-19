export interface MatrixEncryptedFile {
  v: 'v2';
  url: string;
  key: JsonWebKey;
  iv: string;
  hashes: { sha256: string };
}

export interface EncryptedAttachment {
  ciphertext: ArrayBuffer;
  descriptor: Omit<MatrixEncryptedFile, 'url'>;
}

const MAX_CIPHERTEXT_BYTES = 100 * 1024 * 1024;
const MAX_DESCRIPTOR_FIELD_LENGTH = 256;

function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  for (let offset = 0; offset < bytes.length; offset += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(offset, Math.min(offset + 0x8000, bytes.length)));
  }
  return btoa(binary);
}

function base64ToBytes(value: string, urlSafe: boolean): Uint8Array {
  if (value.length > MAX_DESCRIPTOR_FIELD_LENGTH || !value || /\s/.test(value)) {
    throw new Error('Invalid encrypted attachment descriptor');
  }
  const normalized = urlSafe ? value.replace(/-/g, '+').replace(/_/g, '/') : value;
  if (!/^[A-Za-z0-9+/]*={0,2}$/.test(normalized) || /=/.test(normalized.slice(0, -2))) {
    throw new Error('Invalid encrypted attachment encoding');
  }
  const unpadded = normalized.replace(/=+$/, '');
  if (unpadded.length % 4 === 1) throw new Error('Invalid encrypted attachment encoding');
  const decoded = atob(unpadded + '='.repeat((4 - (unpadded.length % 4)) % 4));
  const bytes = Uint8Array.from(decoded, (char) => char.charCodeAt(0));
  if (bytesToBase64(bytes).replace(/=+$/, '') !== unpadded) {
    throw new Error('Invalid encrypted attachment encoding');
  }
  return bytes;
}

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
}

function validateDescriptor(ciphertext: ArrayBuffer, descriptor: MatrixEncryptedFile): Uint8Array {
  if (Object.prototype.toString.call(ciphertext) !== '[object ArrayBuffer]' || ciphertext.byteLength > MAX_CIPHERTEXT_BYTES) {
    throw new Error('Invalid encrypted attachment size');
  }
  if (!descriptor || descriptor.v !== 'v2' || typeof descriptor.url !== 'string' || descriptor.url.length > MAX_DESCRIPTOR_FIELD_LENGTH) {
    throw new Error('Invalid encrypted attachment version or URL');
  }
  if (!descriptor.url.startsWith('mxc://')) throw new Error('Invalid encrypted attachment URL');
  const jwk = descriptor.key;
  if (
    !jwk || jwk.kty !== 'oct' || jwk.alg !== 'A256CTR' || jwk.ext !== true ||
    !Array.isArray(jwk.key_ops) || jwk.key_ops.length !== 2 ||
    !jwk.key_ops.includes('encrypt') || !jwk.key_ops.includes('decrypt') || typeof jwk.k !== 'string'
  ) throw new Error('Invalid encrypted attachment key');
  const rawKey = base64ToBytes(jwk.k, true);
  if (rawKey.byteLength !== 32) throw new Error('Invalid encrypted attachment key length');
  const iv = base64ToBytes(descriptor.iv, false);
  if (iv.byteLength !== 16 || iv.slice(8).some((byte) => byte !== 0)) throw new Error('Invalid encrypted attachment IV');
  const hash = base64ToBytes(descriptor.hashes?.sha256, false);
  if (hash.byteLength !== 32) throw new Error('Invalid encrypted attachment hash');
  return iv;
}

export async function encryptAttachment(bytes: ArrayBuffer): Promise<EncryptedAttachment> {
  if (Object.prototype.toString.call(bytes) !== '[object ArrayBuffer]' || bytes.byteLength > MAX_CIPHERTEXT_BYTES) {
    throw new Error('Invalid attachment size');
  }
  const subtle = globalThis.crypto?.subtle;
  if (!subtle) throw new Error('WebCrypto is unavailable');
  const key = await subtle.generateKey({ name: 'AES-CTR', length: 256 }, true, ['encrypt', 'decrypt']);
  const jwk = await subtle.exportKey('jwk', key);
  const iv = new Uint8Array(16);
  globalThis.crypto.getRandomValues(iv.subarray(0, 8));
  const ciphertext = await subtle.encrypt({ name: 'AES-CTR', counter: iv, length: 64 }, key, bytes);
  const digest = new Uint8Array(await subtle.digest('SHA-256', ciphertext));
  return {
    ciphertext,
    descriptor: {
      v: 'v2',
      key: jwk,
      iv: bytesToBase64(iv).replace(/=+$/, ''),
      hashes: { sha256: bytesToBase64(digest).replace(/=+$/, '') },
    },
  };
}

export async function decryptAttachment(
  ciphertext: ArrayBuffer,
  descriptor: MatrixEncryptedFile,
): Promise<ArrayBuffer> {
  const iv = validateDescriptor(ciphertext, descriptor);
  const expectedHash = base64ToBytes(descriptor.hashes.sha256, false);
  const actualHash = new Uint8Array(await globalThis.crypto.subtle.digest('SHA-256', ciphertext));
  if (actualHash.length !== expectedHash.length || actualHash.some((byte, index) => byte !== expectedHash[index])) {
    throw new Error('Encrypted attachment hash mismatch');
  }
  const jwk = descriptor.key;
  const key = await globalThis.crypto.subtle.importKey('jwk', jwk, { name: 'AES-CTR', length: 256 }, false, ['decrypt']);
  return globalThis.crypto.subtle.decrypt(
    { name: 'AES-CTR', counter: toArrayBuffer(iv), length: 64 },
    key,
    ciphertext,
  );
}

