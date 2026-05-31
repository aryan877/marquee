import { Redacted } from 'effect';
import jwt from 'jsonwebtoken';

export interface JobToken {
  sub: string;
  job_id: string;
  iat: number;
  exp: number;
}

export interface WorkerActionToken {
  sub: string;
  scope: string;
  iat: number;
  exp: number;
}

export function getSecret(configured: Redacted.Redacted<string>): string {
  return Redacted.value(configured);
}

export function verifyJobToken(token: string | null, secret: string): JobToken | null {
  if (!token) return null;
  try {
    const decoded = jwt.verify(token, secret) as JobToken;
    if (typeof decoded !== 'object' || !decoded.job_id || !decoded.sub) return null;
    return decoded;
  } catch {
    return null;
  }
}

export function verifyWorkerActionToken(
  token: string | null,
  secret: string,
  scope: string,
): WorkerActionToken | null {
  if (!token) return null;
  try {
    const decoded = jwt.verify(token, secret) as WorkerActionToken;
    if (typeof decoded !== 'object' || decoded.scope !== scope || !decoded.sub) return null;
    return decoded;
  } catch {
    return null;
  }
}

export function signJobToken(
  args: { userId: string; jobId: string; ttlSeconds?: number },
  secret: string,
): string {
  return jwt.sign(
    { sub: args.userId, job_id: args.jobId },
    secret,
    { expiresIn: args.ttlSeconds ?? 3600 },
  );
}
