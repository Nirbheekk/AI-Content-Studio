import { describe, expect, it } from 'vitest';
import { decryptSecret, encryptSecret, maskSecret } from '../encryption.js';
import { hashPassword, verifyPassword } from '../password.js';

const TEST_MASTER_KEY = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';

describe('@ai-content-os/database AES-256-GCM encryption', () => {
  it('encrypts and decrypts OAuth credentials with randomized IV', () => {
    const token = 'postiz_live_token_secret_987654321';
    const encryptedA = encryptSecret(token, TEST_MASTER_KEY);
    const encryptedB = encryptSecret(token, TEST_MASTER_KEY);

    expect(encryptedA).not.toBe(encryptedB);
    expect(encryptedA.startsWith('v1:')).toBe(true);
    expect(decryptSecret(encryptedA, TEST_MASTER_KEY)).toBe(token);
    expect(decryptSecret(encryptedB, TEST_MASTER_KEY)).toBe(token);
  });

  it('rejects tampered ciphertexts or auth tags', () => {
    const encrypted = encryptSecret('sensitive_refresh_token', TEST_MASTER_KEY);
    const parts = encrypted.split(':');
    const tamperedTag = `${parts[0]}:${parts[1]}:${'0'.repeat(32)}:${parts[3]}`;

    expect(() => decryptSecret(tamperedTag, TEST_MASTER_KEY)).toThrow();
  });

  it('rejects invalid master key length', () => {
    expect(() => encryptSecret('token', 'short_key')).toThrow(/ENCRYPTION_MASTER_KEY/);
  });

  it('masks secret strings safely', () => {
    expect(maskSecret('sk-proj-1234567890abcdef')).toBe('****cdef');
    expect(maskSecret('abc')).toBe('****');
  });

  it('hashes and verifies user passwords with memory-hard scrypt', async () => {
    const hash = await hashPassword('SuperSecureStudioPass!2026');
    expect(hash.startsWith('scrypt$16384$8$1$')).toBe(true);
    expect(await verifyPassword('SuperSecureStudioPass!2026', hash)).toBe(true);
    expect(await verifyPassword('WrongPassword!2026', hash)).toBe(false);
  });
});
