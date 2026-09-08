import { createCipheriv, createDecipheriv, randomBytes, timingSafeEqual } from 'node:crypto';
import { env } from '../config/env.js';

/**
 * Field-level encryption for health data at rest.
 *
 * Conditions, medications and allergies are the most sensitive values VitalAI
 * stores. Database-level encryption protects the disk; this protects the
 * documents themselves, so a leaked backup, a misconfigured Atlas network rule
 * or an over-broad read credential does not expose them in plaintext.
 *
 * AES-256-GCM: authenticated, so a modified ciphertext fails to decrypt rather
 * than yielding attacker-chosen plaintext. A fresh 96-bit IV per value.
 *
 * Format: enc.v1.<iv>.<authTag>.<ciphertext>, all base64url.
 *
 * The key comes from ENCRYPTION_KEY and never leaves the server. Losing it
 * means losing every encrypted field — there is no recovery path, by design.
 */

const PREFIX = 'enc.v1.';
const ALGORITHM = 'aes-256-gcm';
const IV_BYTES = 12;

let cachedKey: Buffer | null = null;

function key(): Buffer {
  cachedKey ??= Buffer.from(env.ENCRYPTION_KEY, 'hex');
  return cachedKey;
}

export function isEncrypted(value: unknown): boolean {
  return typeof value === 'string' && value.startsWith(PREFIX);
}

export function encryptString(plaintext: string): string {
  // Already-encrypted input is returned unchanged so a document that is saved
  // twice is not double-wrapped.
  if (isEncrypted(plaintext)) return plaintext;

  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv(ALGORITHM, key(), iv);

  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();

  return [
    PREFIX.slice(0, -1),
    iv.toString('base64url'),
    authTag.toString('base64url'),
    ciphertext.toString('base64url'),
  ].join('.');
}

/**
 * Decrypts a value produced by encryptString.
 *
 * Values that are not in the expected format are returned unchanged. That is
 * deliberate: it lets encrypted and not-yet-migrated plaintext coexist while
 * the backfill runs, rather than requiring a flag day.
 */
export function decryptString(value: string): string {
  if (!isEncrypted(value)) return value;

  const parts = value.split('.');
  if (parts.length !== 5) return value;

  const [, , ivPart, tagPart, dataPart] = parts;

  try {
    const decipher = createDecipheriv(ALGORITHM, key(), Buffer.from(ivPart, 'base64url'));
    decipher.setAuthTag(Buffer.from(tagPart, 'base64url'));

    return Buffer.concat([
      decipher.update(Buffer.from(dataPart, 'base64url')),
      decipher.final(),
    ]).toString('utf8');
  } catch (error) {
    // A failure here means the key is wrong or the ciphertext was tampered
    // with. Returning the raw value would leak ciphertext into a prompt or a
    // response, so this throws instead.
    throw new Error('Failed to decrypt a stored field: the encryption key may be wrong', {
      cause: error,
    });
  }
}

export function encryptArray(values: string[] | undefined): string[] | undefined {
  return values?.map(encryptString);
}

export function decryptArray(values: string[] | undefined): string[] | undefined {
  return values?.map(decryptString);
}

/** Constant-time comparison, for verifying a value without leaking timing. */
export function safeEquals(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}
