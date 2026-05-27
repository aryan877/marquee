import 'server-only';
import jwt from 'jsonwebtoken';

function secret(): string {
  const value = process.env.JWT_SECRET;
  if (!value) throw new Error('JWT_SECRET missing');
  return value;
}

export function mintJobToken(args: { userId: string; jobId: string; ttlSeconds?: number }): string {
  return jwt.sign(
    { sub: args.userId, job_id: args.jobId },
    secret(),
    { expiresIn: args.ttlSeconds ?? 3600 },
  );
}

export function workerWsUrl(jobId: string, token: string): string {
  const base = process.env.NEXT_PUBLIC_WORKER_WS_URL ?? 'ws://localhost:4001';
  return `${base}/ws/jobs/${encodeURIComponent(jobId)}?token=${encodeURIComponent(token)}`;
}
