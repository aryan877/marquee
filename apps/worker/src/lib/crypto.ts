import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';

const ALG = 'aes-256-gcm';

function deriveKey(secret: string): Buffer {
  return createHash('sha256').update(`marquee::crypto::${secret}`).digest();
}

export function encryptWithSecret(plaintext: string, secret: string): Buffer {
  const iv = randomBytes(12);
  const cipher = createCipheriv(ALG, deriveKey(secret), iv);
  const enc = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), enc]);
}

export function decryptWithSecret(blob: Buffer, secret: string): string {
  if (blob.length < 28) throw new Error('ciphertext too short');
  const iv = blob.subarray(0, 12);
  const tag = blob.subarray(12, 28);
  const enc = blob.subarray(28);
  const decipher = createDecipheriv(ALG, deriveKey(secret), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(enc), decipher.final()]).toString('utf8');
}
