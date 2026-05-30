import { Effect, Redacted } from 'effect';
import { PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, extname, join } from 'node:path';
import { AppConfig } from '../config.js';

const MIME: Record<string, string> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
  '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav',
  '.json': 'application/json',
};

const clean = (value: string | undefined) => value?.trim() ?? '';
const publicKey = (key: string) => key.split('/').map(encodeURIComponent).join('/');
const contentTypeFor = (key: string, defaultType = 'application/octet-stream') =>
  MIME[extname(key).toLowerCase()] ?? defaultType;

export class Storage extends Effect.Service<Storage>()('Storage', {
  effect: Effect.gen(function* () {
    const cfg = yield* AppConfig;
    const r2AccessKeyId = cfg.r2AccessKeyId ? Redacted.value(cfg.r2AccessKeyId).trim() : '';
    const r2SecretAccessKey = cfg.r2SecretAccessKey ? Redacted.value(cfg.r2SecretAccessKey).trim() : '';
    const r2AccountId = clean(cfg.r2AccountId);
    const r2Bucket = clean(cfg.r2Bucket);
    const r2PublicUrl = clean(cfg.r2PublicUrl).replace(/\/+$/, '');
    const r2Ready = Boolean(r2AccountId && r2AccessKeyId && r2SecretAccessKey && r2Bucket && r2PublicUrl);
    const r2 = r2Ready
      ? new S3Client({
          region: 'auto',
          endpoint: `https://${r2AccountId}.r2.cloudflarestorage.com`,
          forcePathStyle: true,
          credentials: {
            accessKeyId: r2AccessKeyId,
            secretAccessKey: r2SecretAccessKey,
          },
        })
      : null;

    const ensureDir = (file: string) =>
      Effect.tryPromise(() => mkdir(dirname(file), { recursive: true }));

    const putObject = (key: string, bytes: Uint8Array, contentType?: string) =>
      r2
        ? Effect.tryPromise(() =>
            r2.send(new PutObjectCommand({
              Bucket: r2Bucket,
              Key: key,
              Body: bytes,
              ContentType: contentType ?? contentTypeFor(key),
            })),
          )
        : Effect.void;

    const urlFor = (relPath: string) =>
      r2 ? `${r2PublicUrl}/${publicKey(relPath)}` : `${cfg.workerHttpUrl}/outputs/${relPath}`;

    const saveBytes = (relPath: string, bytes: Uint8Array, contentType?: string) =>
      Effect.gen(function* () {
        const fullPath = join(cfg.outputsDir, relPath);
        yield* ensureDir(fullPath);
        yield* Effect.tryPromise(() => writeFile(fullPath, bytes));
        yield* putObject(relPath, bytes, contentType);
        const url = urlFor(relPath);
        return { path: fullPath, url, key: relPath };
      });

    const saveFile = (relPath: string, filePath: string, contentType?: string) =>
      Effect.gen(function* () {
        const bytes = yield* Effect.tryPromise(() => readFile(filePath));
        yield* putObject(relPath, new Uint8Array(bytes), contentType);
        return { path: filePath, url: urlFor(relPath), key: relPath };
      });

    return { saveBytes, saveFile, outputsDir: cfg.outputsDir, isR2Ready: r2Ready } as const;
  }),
  dependencies: [AppConfig.Default],
}) {}

export const StorageLive = Storage.Default;
