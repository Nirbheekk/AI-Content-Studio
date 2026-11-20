import { randomBytes, scrypt as scryptCallback, timingSafeEqual } from 'node:crypto';

const SCRYPT_KEYLEN = 64;
const SCRYPT_N = 16384;
const SCRYPT_R = 8;
const SCRYPT_P = 1;
const SALT_BYTES = 16;

function deriveKey(password: string, salt: Buffer, N: number, r: number, p: number): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scryptCallback(
      password,
      salt,
      SCRYPT_KEYLEN,
      { N, r, p, maxmem: 64 * 1024 * 1024 },
      (err, derivedKey) => {
        if (err) {
          reject(err);
        } else {
          resolve(derivedKey);
        }
      },
    );
  });
}

/**
 * Hashes a user password with memory-hard scrypt (N=16384, r=8, p=1, 64-byte key)
 * and a 128-bit cryptographic salt.
 * Output format: `scrypt$16384$8$1$<saltHex>$<hashHex>`
 */
export async function hashPassword(password: string): Promise<string> {
  if (!password || password.length < 8) {
    throw new Error('Password must be at least 8 characters long');
  }
  const salt = randomBytes(SALT_BYTES);
  const derived = await deriveKey(password, salt, SCRYPT_N, SCRYPT_R, SCRYPT_P);
  return `scrypt$${SCRYPT_N}$${SCRYPT_R}$${SCRYPT_P}$${salt.toString('hex')}$${derived.toString('hex')}`;
}

/**
 * Verifies a plaintext password against a stored password hash in constant time.
 */
export async function verifyPassword(password: string, storedHash: string): Promise<boolean> {
  if (!password || !storedHash) {
    return false;
  }
  const parts = storedHash.split('$');
  if (parts.length !== 6 || parts[0] !== 'scrypt') {
    return false;
  }

  const N = Number(parts[1]);
  const r = Number(parts[2]);
  const p = Number(parts[3]);
  const saltHex = parts[4];
  const hashHex = parts[5];

  if (!N || !r || !p || !saltHex || !hashHex) {
    return false;
  }

  const salt = Buffer.from(saltHex, 'hex');
  const expected = Buffer.from(hashHex, 'hex');
  if (expected.byteLength !== SCRYPT_KEYLEN) {
    return false;
  }

  const actual = await deriveKey(password, salt, N, r, p);
  return timingSafeEqual(actual, expected);
}
