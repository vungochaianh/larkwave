import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';

/**
 * Symmetric encryption for per-app secrets at rest (AES-256-GCM). The key is
 * derived from the server's JWT_SECRET so no extra env var is required. Format:
 * "v1:<iv b64>:<authTag b64>:<ciphertext b64>". Tamper-evident (GCM auth tag).
 */

function keyFrom(secret: string): Buffer {
  return createHash('sha256').update(`tw-secrets:${secret}`).digest(); // 32 bytes
}

export function encryptJson(obj: unknown, secret: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', keyFrom(secret), iv);
  const data = Buffer.concat([cipher.update(JSON.stringify(obj), 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `v1:${iv.toString('base64')}:${tag.toString('base64')}:${data.toString('base64')}`;
}

export function decryptJson<T>(blob: string | null | undefined, secret: string): T | null {
  if (!blob) return null;
  try {
    const [v, ivB, tagB, dataB] = blob.split(':');
    if (v !== 'v1' || !ivB || !tagB || !dataB) return null;
    const decipher = createDecipheriv('aes-256-gcm', keyFrom(secret), Buffer.from(ivB, 'base64'));
    decipher.setAuthTag(Buffer.from(tagB, 'base64'));
    const out = Buffer.concat([decipher.update(Buffer.from(dataB, 'base64')), decipher.final()]);
    return JSON.parse(out.toString('utf8')) as T;
  } catch {
    return null;
  }
}
