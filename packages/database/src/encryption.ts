import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

const ALGORITHM = 'aes-256-gcm';
const IV_BYTE_LENGTH = 12;
const AUTH_TAG_BYTE_LENGTH = 16;
const KEY_HEX_LENGTH = 64; // 32 bytes = 256 bits
const VERSION_PREFIX = 'v1';

function parseMasterKey(masterKeyHex?: string): Buffer {
  const rawKey = masterKeyHex ?? process.env['ENCRYPTION_MASTER_KEY'];
  if (!rawKey || !/^[0-9a-fA-F]{64}$/.test(rawKey)) {
    throw new Error(
      `ENCRYPTION_MASTER_KEY must be a ${KEY_HEX_LENGTH}-character hexadecimal string (256-bit key)`,
    );
  }
  return Buffer.from(rawKey, 'hex');
}

/**
 * Encrypts a plaintext credential string using AES-256-GCM.
 * Output format: `v1:<ivHex>:<authTagHex>:<ciphertextHex>`
 */
export function encryptSecret(plaintext: string, masterKeyHex?: string): string {
  if (!plaintext) {
    throw new Error('Cannot encrypt empty secret plaintext');
  }
  const key = parseMasterKey(masterKeyHex);
  const iv = randomBytes(IV_BYTE_LENGTH);
  const cipher = createCipheriv(ALGORITHM, key, iv, {
    authTagLength: AUTH_TAG_BYTE_LENGTH,
  });

  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();

  return [
    VERSION_PREFIX,
    iv.toString('hex'),
    authTag.toString('hex'),
    encrypted.toString('hex'),
  ].join(':');
}

/**
 * Decrypts an AES-256-GCM payload formatted as `v1:<ivHex>:<authTagHex>:<ciphertextHex>`.
 */
export function decryptSecret(payload: string, masterKeyHex?: string): string {
  const parts = payload.split(':');
  if (parts.length !== 4 || parts[0] !== VERSION_PREFIX) {
    throw new Error('Invalid encrypted secret payload format');
  }

  const [, ivHex, authTagHex, ciphertextHex] = parts;
  if (!ivHex || !authTagHex || !ciphertextHex) {
    throw new Error('Malformed encrypted secret payload segments');
  }

  const key = parseMasterKey(masterKeyHex);
  const iv = Buffer.from(ivHex, 'hex');
  const authTag = Buffer.from(authTagHex, 'hex');
  const ciphertext = Buffer.from(ciphertextHex, 'hex');

  if (iv.byteLength !== IV_BYTE_LENGTH || authTag.byteLength !== AUTH_TAG_BYTE_LENGTH) {
    throw new Error('Invalid IV or AuthTag byte length in encrypted secret payload');
  }

  const decipher = createDecipheriv(ALGORITHM, key, iv, {
    authTagLength: AUTH_TAG_BYTE_LENGTH,
  });
  decipher.setAuthTag(authTag);

  const decrypted = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  return decrypted.toString('utf8');
}

/**
 * Redacts a secret string for safe UI display (e.g. `sk-live...9f2a` -> `****9f2a`).
 */
export function maskSecret(secret: string): string {
  if (secret.length <= 4) {
    return '****';
  }
  return `****${secret.slice(-4)}`;
}
